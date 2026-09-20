import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VoiceController } from './components/VoiceController';
import { ConversationFeed } from './components/ConversationFeed';
import { BookingModal } from './components/BookingModal';
import { SettingsModal } from './components/SettingsModal';
import { voiceService } from './services/voiceService';
import { makeService } from './services/makeService';
import { checkHealth } from './services/api';
import { Message, ConversationState, Provider, Booking } from './types';

export function App() {
  const [sessionId, setSessionId] = useState<string>(makeService.getSessionId());
  const [isApiOnline, setIsApiOnline] = useState<boolean>(false);
  const [useSimulator, setUseSimulator] = useState<boolean>(false);
  const [webhookUrl, setWebhookUrl] = useState<string>('https://hook.eu1.make.com/d7tmacjwxzhxxrwqvo2nm71ozki238na');

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      sender: 'agent',
      text: "Hello! I am your AI home-service booking assistant. Describe your problem, like 'My AC is not cooling' or 'Kitchen tap is leaking', and I'll find and book the best verified technician for you.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [currentState, setCurrentState] = useState<ConversationState>({
    service: null,
    problem: null,
    pincode: null,
    date: null,
    time: null
  });

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [latestBooking, setLatestBooking] = useState<Booking | null>(null);
  const [showBookingModal, setShowBookingModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Periodic health check of the mock API
  useEffect(() => {
    const pingApi = async () => {
      const health = await checkHealth();
      setIsApiOnline(health.status === 'ok');
    };
    pingApi();
    const interval = setInterval(pingApi, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle Voice Recording Toggle
  const handleToggleRecord = async () => {
    if (isRecording) {
      // Stop Recording
      setIsRecording(false);
      setAnalyserNode(null);
      const audioBlob = await voiceService.stopRecording();
      
      if (audioBlob && audioBlob.size > 0) {
        setLiveTranscript('Transcribing...');
        const result = await voiceService.sendAudio(audioBlob);
        if (result.success && result.text) {
          setLiveTranscript(result.text);
          await handleSendUserMessage(result.text);
        } else {
          setLiveTranscript(result.text || 'Failed to transcribe audio.');
        }
      }
      setTimeout(() => setLiveTranscript(''), 2000);
    } else {
      // Start Recording
      try {
        setLiveTranscript('Listening...');
        await voiceService.startRecording(
          () => {
            // No longer used for real-time STT
          },
          (analyser) => {
            setAnalyserNode(analyser);
          }
        );
        setIsRecording(true);
      } catch (err) {
        // Error is handled inside voiceService
      }
    }
  };

  // Dispatch message to Make.com Webhook (or local simulator)
  const handleSendUserMessage = async (text: string) => {
    if (!text || isProcessing) return;

    const userMessage: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsProcessing(true);

    try {
      const response = await makeService.sendMessage(text, useSimulator);

      if (response.state) {
        setCurrentState((prev) => ({
          ...prev,
          ...response.state
        }));
      }

      if (response.booking) {
        setLatestBooking(response.booking);
        setShowBookingModal(true);
      }

      const agentMessage: Message = {
        id: `agt-${Date.now()}`,
        sender: 'agent',
        text: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        state: response.state,
        options: response.options,
        booking: response.booking
      };

      setMessages((prev) => [...prev, agentMessage]);

      // Vocalize response through Text-to-Speech
      await voiceService.speak(response.text);
    } catch (err: any) {
      console.error('Failed to communicate with service agent:', err);
      // Display the pipeline error directly in the chat feed
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        text: `\u26A0\uFE0F ${err.message}`, // Warning icon
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMessage]);
      
      // Fallback vocalization of the error
      await voiceService.speak("The Make Webhook pipeline is broken. Please check the logs.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Provider selected in card (Triggers pre-booking intent with the agent)
  const handleSelectProvider = async (provider: Provider) => {
    setSelectedProviderId(provider.provider_id);
    await handleSendUserMessage(`I would like to select ${provider.name} at ₹${provider.price}`);
  };

  // Reset Session
  const handleResetSession = () => {
    makeService.resetSession();
    setSessionId(makeService.getSessionId());
    setCurrentState({
      service: null,
      problem: null,
      pincode: null,
      date: null,
      time: null
    });
    setSelectedProviderId(null);
    setLatestBooking(null);
    setMessages([
      {
        id: `init-${Date.now()}`,
        sender: 'agent',
        text: "New session started! How can I assist you with your home services today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const handleSaveWebhookUrl = (url: string) => {
    setWebhookUrl(url);
    makeService.setWebhookUrl(url);
    if (!url) {
      setUseSimulator(true);
    }
  };

  return (
    <div className="app-layout">
      {/* Top Header */}
      <Header
        sessionId={sessionId}
        isApiOnline={isApiOnline}
        useSimulator={useSimulator}
        onToggleSimulator={() => setUseSimulator((prev) => !prev)}
        onResetSession={handleResetSession}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Main Split Content */}
      <main className="main-content">
        <div className="left-pane">
          <ConversationFeed
            messages={messages}
            currentState={currentState}
            onSelectProvider={handleSelectProvider}
            selectedProviderId={selectedProviderId}
            latestBooking={latestBooking}
            onViewBooking={() => setShowBookingModal(true)}
          />
        </div>

        <div className="right-pane">
          <VoiceController
            isRecording={isRecording}
            isProcessing={isProcessing}
            liveTranscript={liveTranscript}
            onToggleRecord={handleToggleRecord}
            onSendTextMessage={handleSendUserMessage}
            analyserNode={analyserNode}
          />
        </div>
      </main>

      {/* Confirmed Booking Modal Pass */}
      {showBookingModal && (
        <BookingModal
          booking={latestBooking}
          onClose={() => setShowBookingModal(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          webhookUrl={webhookUrl}
          onSaveWebhookUrl={handleSaveWebhookUrl}
          onResetSession={handleResetSession}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}

export default App;
