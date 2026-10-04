import { RotateCcw } from 'lucide-react';
import type { Booking } from '../types';
import type { Assistant } from '../hooks/useAssistant';
import type { Settings } from '../lib/settings';
import { Conversation } from '../components/Conversation';
import { Composer } from '../components/Composer';
import { RequestTracker, VoicePanel } from '../components/VoicePanel';
import { ListeningOverlay } from '../components/ListeningOverlay';

interface Props {
  assistant: Assistant;
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
  onViewBooking: (b: Booking) => void;
}

export function AssistantView({ assistant, settings, updateSettings, onViewBooking }: Props) {
  return (
    <div className="assistant">
      <section className="chat-card" aria-label="Conversation">
        <div className="chat-head">
          <div>
            <h1>Book a home service</h1>
            <p className="muted">Speak or type — I’ll handle the rest.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={assistant.reset} title="Start a new conversation">
            <RotateCcw size={15} /> New
          </button>
        </div>
        <div className="chat-tracker">
          <RequestTracker assistant={assistant} compact />
        </div>
        <Conversation assistant={assistant} onViewBooking={onViewBooking} />
        <Composer assistant={assistant} />
      </section>
      <VoicePanel assistant={assistant} settings={settings} updateSettings={updateSettings} />
      <ListeningOverlay assistant={assistant} />
    </div>
  );
}
