import { API_BASE } from './api';

/**
 * Voice I/O.
 *  - Input: the browser's SpeechRecognition (live interim text, no key needed), or
 *    MediaRecorder + server-side ElevenLabs Scribe when the browser lacks it.
 *  - Output: browser speechSynthesis, or ElevenLabs via the server proxy.
 */

export interface ListenCallbacks {
  onInterim: (text: string) => void;
  onLevel: (level: number) => void;
  onTranscribing: () => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export interface ListenSession {
  /** Finish and submit what was heard. */
  stop: () => void;
  /** Discard without submitting. */
  abort: () => void;
}

type SpeechRecognitionCtor = new () => any;

function recognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export const isBrowserRecognitionSupported = () => Boolean(recognitionCtor());
export const isRecorderSupported = () => Boolean(navigator.mediaDevices && "getUserMedia" in navigator.mediaDevices && (window as any).MediaRecorder);
export const isSpeechSynthesisSupported = () => 'speechSynthesis' in window;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function micErrorMessage(err: any): string {
  switch (err?.name || err?.error) {
    case 'NotAllowedError':
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it from the address bar, then try again.';
    case 'NotFoundError':
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'NotReadableError':
      return 'The microphone is being used by another app.';
    case 'network':
      return 'Speech recognition needs an internet connection. You can type instead.';
    case 'no-speech':
      return "I didn't catch that. Tap the mic and try again.";
    case 'language-not-supported':
      return 'This speech language is not supported by your browser. Change it in Settings.';
    default:
      return 'Voice input failed. You can type your message instead.';
  }
}

/** RMS level meter on a mic stream, reported ~30 times per second as 0..1. */
class LevelMeter {
  private ctx?: AudioContext;
  private raf = 0;
  private last = 0;

  start(stream: MediaStream, onLevel: (level: number) => void) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    this.ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = (t: number) => {
      this.raf = requestAnimationFrame(tick);
      if (t - this.last < 33) return;
      this.last = t;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.ctx?.close().catch(() => {});
    this.ctx = undefined;
  }
}

export async function startBrowserListening(lang: string, cb: ListenCallbacks): Promise<ListenSession> {
  const Ctor = recognitionCtor();
  if (!Ctor) throw new Error('unsupported');

  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = '';
  let latest = '';
  let aborted = false;
  let errored = false;
  const meter = new LevelMeter();
  let stream: MediaStream | undefined;

  // A parallel mic stream only drives the visualiser; iOS can't share the mic with recognition.
  if (!isIOS() && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(s => {
        if (aborted) return s.getTracks().forEach(t => t.stop());
        stream = s;
        meter.start(s, cb.onLevel);
      })
      .catch(() => {});
  }

  const cleanup = () => {
    meter.stop();
    stream?.getTracks().forEach(t => t.stop());
  };

  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    latest = `${finalText} ${interim}`.trim();
    cb.onInterim(latest);
  };

  rec.onerror = (e: any) => {
    if (e.error === 'aborted') return;
    errored = true;
    cb.onError(micErrorMessage(e));
  };

  rec.onend = () => {
    cleanup();
    const text = (finalText || latest).trim();
    if (!aborted && !errored && text) cb.onFinal(text);
    else if (!aborted && !errored && !text) cb.onError(micErrorMessage({ error: 'no-speech' }));
    cb.onEnd();
  };

  try {
    rec.start();
  } catch (err) {
    cleanup();
    throw new Error(micErrorMessage(err));
  }

  return {
    stop: () => rec.stop(),
    abort: () => {
      aborted = true;
      rec.abort();
    }
  };
}

const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export async function startRecorderListening(lang: string, cb: ListenCallbacks): Promise<ListenSession> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    throw new Error(micErrorMessage(err));
  }

  const MR = (window as any).MediaRecorder;
  const mimeType = RECORDER_TYPES.find(t => MR.isTypeSupported?.(t));
  const recorder: MediaRecorder = new MR(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  let aborted = false;
  const meter = new LevelMeter();

  // Auto-stop after ~1.4s of silence once the user has started speaking (max 20s).
  let heard = false;
  let quietSince = 0;
  const maxTimer = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), 20000);
  meter.start(stream, level => {
    cb.onLevel(level);
    const now = performance.now();
    if (level > 0.12) {
      heard = true;
      quietSince = 0;
    } else if (heard) {
      quietSince ||= now;
      if (now - quietSince > 1400 && recorder.state === 'recording') recorder.stop();
    }
  });

  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    clearTimeout(maxTimer);
    meter.stop();
    stream.getTracks().forEach(t => t.stop());
    if (aborted) return cb.onEnd();

    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
    if (blob.size < 2000) {
      cb.onError(micErrorMessage({ error: 'no-speech' }));
      return cb.onEnd();
    }
    cb.onTranscribing();
    try {
      const res = await fetch(`${API_BASE}/api/voice/stt?language=${lang.split('-')[0]}`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.text) cb.onFinal(data.text);
      else cb.onError(micErrorMessage({ error: 'no-speech' }));
    } catch {
      cb.onError('Transcription failed. Please try again or type your message.');
    }
    cb.onEnd();
  };

  recorder.start(250);
  cb.onInterim('');

  return {
    stop: () => recorder.state === 'recording' && recorder.stop(),
    abort: () => {
      aborted = true;
      if (recorder.state === 'recording') recorder.stop();
    }
  };
}

// ---------- Speech output ----------

/** Make text sound natural when read aloud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/₹\s?(\d[\d,]*)/g, '$1 rupees')
    .replace(/\b([A-Z]{2})(\d{4})\b/g, (_, letters: string, digits: string) => `${letters.split('').join(' ')} ${digits.split('').join(' ')}`)
    .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 to $2')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function listVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve([]);
  const voices = speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise(resolve => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

// macOS novelty/robotic voices that should never be auto-picked.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|hysterical|pipe organ)\b/i;
// Known natural-sounding voices across Edge, Chrome and Apple platforms.
const PREFERRED = /neerja|prabhat|aria|ava|jenny|guy|sonia|libby|natasha|google uk english female|google us english|samantha|rishi|veena|lekha|karen|daniel|moira|tessa/i;

/** Higher is better: neural/natural voices in the user's language first. */
export function voiceScore(v: SpeechSynthesisVoice, lang: string): number {
  if (NOVELTY.test(v.name)) return -100;
  let score = 0;
  if (v.lang.toLowerCase() === lang.toLowerCase()) score += 40;
  else if (v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase())) score += 20;
  if (/natural|neural|online/i.test(v.name)) score += 30;
  if (/premium|enhanced|siri/i.test(v.name)) score += 25;
  if (/google/i.test(v.name)) score += 15;
  if (PREFERRED.test(v.name)) score += 10;
  if (!v.localService) score += 3;
  return score;
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string, preferred: string): SpeechSynthesisVoice | undefined {
  if (preferred) {
    const exact = voices.find(v => v.name === preferred);
    if (exact) return exact;
  }
  return [...voices].sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang))[0];
}

/** Splits long text so Chrome doesn't cut utterances off after ~15 seconds. */
function chunk(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > 180 && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export interface SpeakOptions {
  engine: 'browser' | 'elevenlabs';
  lang: string;
  voiceName: string;
  rate: number;
}

export class Speaker {
  private audio?: HTMLAudioElement;
  private finish?: () => void;

  cancel() {
    if (isSpeechSynthesisSupported()) speechSynthesis.cancel();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = undefined;
    }
    this.finish?.();
    this.finish = undefined;
  }

  async speak(raw: string, opts: SpeakOptions): Promise<void> {
    this.cancel();
    const text = cleanForSpeech(raw);
    if (!text) return;
    if (opts.engine === 'elevenlabs' && (await this.speakElevenLabs(text))) return;
    await this.speakBrowser(text, opts);
  }

  private async speakElevenLabs(text: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok || !res.headers.get('content-type')?.includes('audio')) return false;
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      this.audio = audio;
      await new Promise<void>(resolve => {
        this.finish = resolve;
        audio.onended = audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  private async speakBrowser(text: string, opts: SpeakOptions): Promise<void> {
    if (!isSpeechSynthesisSupported()) return;
    const voice = pickVoice(await listVoices(), opts.lang, opts.voiceName);
    const parts = chunk(text);
    await new Promise<void>(resolve => {
      // Some browsers never fire onend (no audio device, background tab); don't hang the UI.
      const guard = window.setTimeout(resolve, Math.max(4000, (text.length * 85) / opts.rate));
      this.finish = () => {
        clearTimeout(guard);
        resolve();
      };
      parts.forEach((part, i) => {
        const u = new SpeechSynthesisUtterance(part);
        if (voice) u.voice = voice;
        u.lang = voice?.lang || opts.lang;
        u.rate = opts.rate;
        if (i === parts.length - 1) u.onend = u.onerror = () => this.finish?.();
        speechSynthesis.speak(u);
      });
    });
  }
}
