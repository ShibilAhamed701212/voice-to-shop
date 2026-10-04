import type { Assistant } from '../hooks/useAssistant';
import { VoiceOrb } from './VoiceOrb';

/** Full-screen listening sheet for small screens (hidden on desktop via CSS). */
export function ListeningOverlay({ assistant }: { assistant: Assistant }) {
  const { voice, level, interim, stopListening, cancelListening } = assistant;
  if (voice !== 'listening' && voice !== 'transcribing') return null;
  return (
    <div className="listen-overlay" role="dialog" aria-label="Listening">
      <div className="listen-inner">
        <p className="listen-title">{voice === 'listening' ? 'Listening…' : 'Transcribing…'}</p>
        <VoiceOrb voice={voice} level={level} onClick={stopListening} />
        <p className="listen-text">{interim || 'Describe your problem, area and a good time'}</p>
        <div className="listen-actions">
          <button className="btn btn-ghost" onClick={cancelListening}>Cancel</button>
          <button className="btn btn-primary" onClick={stopListening} disabled={voice !== 'listening'}>Done</button>
        </div>
      </div>
    </div>
  );
}
