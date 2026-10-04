import { FormEvent, useState } from 'react';
import { Mic, SendHorizontal, Square } from 'lucide-react';
import type { Assistant } from '../hooks/useAssistant';

export function Composer({ assistant }: { assistant: Assistant }) {
  const { send, processing, voice, toggleListening, messages } = assistant;
  const [text, setText] = useState('');
  const lastAgent = [...messages].reverse().find(m => m.role === 'agent');
  const suggestions = lastAgent?.reply?.suggestions || [];
  const listening = voice === 'listening';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || processing) return;
    void send(text);
    setText('');
  };

  return (
    <div className="composer-wrap">
      {suggestions.length > 0 && !processing && (
        <div className="suggestions" role="list" aria-label="Suggested replies">
          {suggestions.map(s => (
            <button key={s} type="button" role="listitem" className="chip" onClick={() => send(s, { via: 'tap' })} disabled={listening}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <button
          type="button"
          className={`mic-btn ${listening ? 'is-live' : ''}`}
          onClick={toggleListening}
          disabled={processing || voice === 'transcribing'}
          aria-label={listening ? 'Stop listening' : 'Talk'}
        >
          {listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
        </button>
        <input
          className="composer-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={listening ? 'Listening… speak now' : 'Type a message or tap the mic'}
          aria-label="Message"
          maxLength={500}
          disabled={listening}
        />
        <button type="submit" className="send-btn" disabled={!text.trim() || processing} aria-label="Send">
          <SendHorizontal size={18} />
        </button>
      </form>
    </div>
  );
}
