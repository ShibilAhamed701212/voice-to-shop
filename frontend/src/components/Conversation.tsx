import { useEffect, useRef } from 'react';
import { Bot, CircleAlert, Mic, Volume2 } from 'lucide-react';
import type { Booking, ChatMessage, ProviderOption, TimeSlot } from '../types';
import type { Assistant } from '../hooks/useAssistant';
import { clockTime, formatTime } from '../lib/format';
import { BookingResultCard, ProposalCard, ProviderOptionCard } from './ChatCards';

interface Props {
  assistant: Assistant;
  onViewBooking: (b: Booking) => void;
}

export function Conversation({ assistant, onViewBooking }: Props) {
  const { messages, processing, state, send, speak, voice, interim } = assistant;
  const endRef = useRef<HTMLDivElement>(null);
  const lastAgentIdx = messages.map(m => m.role).lastIndexOf('agent');

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, processing, interim]);

  const select = (o: ProviderOption, slot: TimeSlot) =>
    send(`I'll take ${o.name} at ${formatTime(slot.start)}`, {
      via: 'tap',
      action: { type: 'select', provider_id: o.provider_id, date: slot.date, start_time: slot.start }
    });

  return (
    <div className="thread" aria-live="polite">
      {messages.map((m, i) => (
        <MessageRow
          key={m.id}
          message={m}
          interactive={i === lastAgentIdx && !processing}
          date={state.date}
          proposalProvider={m.reply?.proposal?.provider_id}
          proposalSlot={m.reply?.proposal?.start_time}
          onSelect={select}
          onConfirm={() => send('Yes, go ahead', { via: 'tap', action: { type: 'confirm' } })}
          onDecline={() => send('No, not this one', { via: 'tap', action: { type: 'decline' } })}
          onReplay={() => speak(m.text)}
          onViewBooking={onViewBooking}
        />
      ))}

      {voice === 'listening' && interim && (
        <div className="row row-user">
          <div className="bubble bubble-user bubble-interim">
            <Mic size={14} /> {interim}
          </div>
        </div>
      )}

      {processing && (
        <div className="row row-agent">
          <span className="agent-avatar"><Bot size={18} /></span>
          <div className="bubble bubble-agent typing" aria-label="Agent is typing">
            <i /><i /><i />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

interface RowProps {
  message: ChatMessage;
  interactive: boolean;
  date: string | null;
  proposalProvider?: string;
  proposalSlot?: string;
  onSelect: (o: ProviderOption, s: TimeSlot) => void;
  onConfirm: () => void;
  onDecline: () => void;
  onReplay: () => void;
  onViewBooking: (b: Booking) => void;
}

function MessageRow({ message: m, interactive, date, proposalProvider, proposalSlot, onSelect, onConfirm, onDecline, onReplay, onViewBooking }: RowProps) {
  if (m.role === 'system') {
    return (
      <div className="row row-system">
        <div className="system-note"><CircleAlert size={15} /> {m.text}</div>
      </div>
    );
  }

  if (m.role === 'user') {
    return (
      <div className="row row-user">
        <div className="bubble bubble-user">
          {m.text}
          <span className="meta">
            {m.via === 'voice' && <Mic size={11} />} {clockTime(m.at)}
          </span>
        </div>
      </div>
    );
  }

  const r = m.reply;
  const options = r?.options || [];
  const optionDate = r?.proposal?.date || r?.state?.date || date;
  return (
    <div className="row row-agent">
      <span className="agent-avatar"><Bot size={18} /></span>
      <div className="agent-stack">
        <div className="bubble bubble-agent">
          {m.text}
          <span className="meta">
            {r?.source === 'make' && <span className="source-tag">Make.com</span>}
            {r?.source === 'claude' && <span className="source-tag source-claude">Claude</span>}
            {clockTime(m.at)}
            <button type="button" className="icon-btn replay" onClick={onReplay} aria-label="Read aloud">
              <Volume2 size={13} />
            </button>
          </span>
        </div>

        {options.length > 0 && (
          <div className="options-scroller">
            {options.map(o => (
              <ProviderOptionCard
                key={o.provider_id}
                option={o}
                date={optionDate}
                interactive={interactive}
                selected={proposalProvider === o.provider_id}
                selectedSlot={proposalSlot}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}

        {r?.proposal && <ProposalCard proposal={r.proposal} interactive={interactive} onConfirm={onConfirm} onDecline={onDecline} />}
        {r?.booking && <BookingResultCard booking={r.booking} onView={() => onViewBooking(r.booking!)} />}
      </div>
    </div>
  );
}
