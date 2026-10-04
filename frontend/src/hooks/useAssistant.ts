import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentAction, AgentReply, AgentState, Booking, ChatMessage, ServerConfig, Stage } from '../types';
import { sendTurn } from '../lib/agent';
import type { Settings } from '../lib/settings';
import { uid } from '../lib/format';
import {
  ListenSession,
  Speaker,
  isBrowserRecognitionSupported,
  isRecorderSupported,
  startBrowserListening,
  startRecorderListening
} from '../lib/speech';

export type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

const EMPTY_STATE: AgentState = { service: null, problem: null, pincode: null, area: null, date: null, time: null };

const welcome = (name?: string): ChatMessage => ({
  id: uid('m'),
  role: 'agent',
  at: Date.now(),
  text: `Hi${name ? ` ${name}` : ''}! I'm your VoiceFix concierge. Tell me what needs fixing — like "my AC isn't cooling" — and I'll compare verified pros near you and book one once you confirm.`,
  reply: {
    session_id: '',
    source: 'local',
    text: '',
    suggestions: ["My AC isn't cooling", 'Kitchen tap is leaking', 'Need a deep home cleaning', 'Fan stopped working']
  }
});

interface Options {
  settings: Settings;
  config: ServerConfig | null;
  customerFirstName?: string;
  onBooking: (booking: Booking) => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export function useAssistant({ settings, config, customerFirstName, onBooking, notify }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcome(customerFirstName)]);
  const [state, setState] = useState<AgentState>(EMPTY_STATE);
  const [stage, setStage] = useState<Stage>('gathering');
  const [processing, setProcessing] = useState(false);
  const [voice, setVoice] = useState<VoiceStatus>('idle');
  const [interim, setInterim] = useState('');
  const [level, setLevel] = useState(0);

  const sessionId = useRef(uid('sess'));
  const listenRef = useRef<ListenSession | null>(null);
  const busy = useRef(false);
  const speaker = useMemo(() => new Speaker(), []);
  const latest = useRef({ settings, config, onBooking, notify });
  latest.current = { settings, config, onBooking, notify };

  const push = (msg: Omit<ChatMessage, 'id' | 'at'>) =>
    setMessages(prev => [...prev, { ...msg, id: uid('m'), at: Date.now() }]);

  const speak = useCallback(
    async (text: string) => {
      const s = latest.current.settings;
      setVoice('speaking');
      await speaker.speak(text, {
        engine: s.outputEngine === 'elevenlabs' && latest.current.config?.elevenlabs_configured ? 'elevenlabs' : 'browser',
        lang: s.language,
        voiceName: s.voiceName,
        rate: s.speechRate
      });
      setVoice(v => (v === 'speaking' ? 'idle' : v));
    },
    [speaker]
  );

  const stopSpeaking = useCallback(() => {
    speaker.cancel();
    setVoice(v => (v === 'speaking' ? 'idle' : v));
  }, [speaker]);

  // Declared before send so hands-free mode can re-open the mic after a reply.
  const startListeningRef = useRef<() => void>(() => {});

  const send = useCallback(
    async (text: string, opts: { action?: AgentAction; via?: ChatMessage['via'] } = {}) => {
      const message = text.trim();
      if ((!message && !opts.action) || busy.current) return;
      busy.current = true;
      speaker.cancel();
      const { settings: s } = latest.current;

      if (message) push({ role: 'user', text: message, via: opts.via ?? 'text' });
      setProcessing(true);
      setVoice('thinking');
      setInterim('');

      let reply: AgentReply;
      try {
        reply = await sendTurn({
          sessionId: sessionId.current,
          customerId: s.customerId,
          message,
          action: opts.action,
          mode: s.agentMode,
          customWebhook: s.customWebhook,
          language: s.language
        });
      } catch (err: any) {
        push({ role: 'system', text: err.message || 'Something went wrong.' });
        setProcessing(false);
        setVoice('idle');
        busy.current = false;
        return;
      }

      if (reply.state) setState(prev => ({ ...prev, ...reply.state }));
      if (reply.stage) setStage(reply.stage);
      push({ role: 'agent', text: reply.text, reply });
      if (reply.notice) push({ role: 'system', text: reply.notice });
      if (reply.booking) latest.current.onBooking(reply.booking);

      setProcessing(false);
      busy.current = false;

      if (s.autoSpeak) await speak(reply.text);
      else setVoice('idle');

      const done = reply.stage === 'booked' && !/\?\s*$/.test(reply.text);
      if (latest.current.settings.handsFree && !done) startListeningRef.current();
    },
    [speak, speaker]
  );

  const startListening = useCallback(async () => {
    if (listenRef.current || busy.current) return;
    const { settings: s, config: c, notify: toast } = latest.current;
    const useBrowser = s.inputEngine === 'browser' || (s.inputEngine === 'auto' && isBrowserRecognitionSupported());
    const useRecorder = !useBrowser && c?.elevenlabs_configured && isRecorderSupported();

    if (useBrowser && !isBrowserRecognitionSupported()) {
      toast('Speech recognition is not available in this browser. Try Chrome, Edge or Safari, or type instead.', 'error');
      return;
    }
    if (!useBrowser && !useRecorder) {
      toast(
        c?.elevenlabs_configured
          ? 'This browser cannot record audio. Please type your message.'
          : 'Voice input needs Chrome, Edge or Safari (or an ElevenLabs key on the server). You can type instead.',
        'error'
      );
      return;
    }

    speaker.cancel();
    setInterim('');
    setVoice('listening');
    const start = useBrowser ? startBrowserListening : startRecorderListening;
    try {
      listenRef.current = await start(s.language, {
        onInterim: setInterim,
        onLevel: setLevel,
        onTranscribing: () => setVoice('transcribing'),
        onFinal: heard => {
          listenRef.current = null;
          void send(heard, { via: 'voice' });
        },
        onError: msg => toast(msg, 'error'),
        onEnd: () => {
          listenRef.current = null;
          setLevel(0);
          setVoice(v => (v === 'listening' || v === 'transcribing' ? 'idle' : v));
        }
      });
    } catch (err: any) {
      listenRef.current = null;
      setVoice('idle');
      toast(err.message || 'Could not start the microphone.', 'error');
    }
  }, [send, speaker]);
  startListeningRef.current = startListening;

  const stopListening = useCallback(() => listenRef.current?.stop(), []);
  const cancelListening = useCallback(() => {
    listenRef.current?.abort();
    listenRef.current = null;
    setInterim('');
    setLevel(0);
    setVoice(v => (v === 'listening' || v === 'transcribing' ? 'idle' : v));
  }, []);

  const toggleListening = useCallback(() => {
    if (voice === 'listening') stopListening();
    else if (voice === 'idle' || voice === 'speaking') void startListening();
  }, [voice, startListening, stopListening]);

  const reset = useCallback(() => {
    cancelListening();
    speaker.cancel();
    sessionId.current = uid('sess');
    busy.current = false;
    setProcessing(false);
    setVoice('idle');
    setState(EMPTY_STATE);
    setStage('gathering');
    setMessages([welcome(customerFirstName)]);
  }, [cancelListening, speaker, customerFirstName]);

  // The customer's name usually arrives after first render; refresh an untouched greeting.
  useEffect(() => {
    setMessages(prev => (prev.length === 1 && prev[0].role === 'agent' ? [welcome(customerFirstName)] : prev));
  }, [customerFirstName]);

  // New customer profile => new conversation.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.customerId]);

  useEffect(() => () => {
    listenRef.current?.abort();
    speaker.cancel();
  }, [speaker]);

  return {
    messages,
    state,
    stage,
    processing,
    voice,
    interim,
    level,
    sessionId: sessionId.current,
    send,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    cancelListening,
    toggleListening,
    reset
  };
}

export type Assistant = ReturnType<typeof useAssistant>;
