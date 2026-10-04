import { CalendarDays, Check, Keyboard, MapPin, ReceiptText, UserRound, Wrench } from 'lucide-react';
import type { Assistant, VoiceStatus } from '../hooks/useAssistant';
import type { Settings } from '../lib/settings';
import { formatDay, formatPrice, formatTime } from '../lib/format';
import { VoiceOrb } from './VoiceOrb';

const STATUS: Record<VoiceStatus, [string, string]> = {
  idle: ['Tap to talk', 'or press Space'],
  listening: ['Listening…', 'Tap again when you’re done'],
  transcribing: ['Transcribing…', 'Turning your voice into text'],
  thinking: ['Working on it…', 'Checking live availability'],
  speaking: ['Speaking', 'Tap to interrupt'],
};

interface Props {
  assistant: Assistant;
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
}

export function VoicePanel({ assistant, settings, updateSettings }: Props) {
  const { voice, level, interim, toggleListening, stopSpeaking } = assistant;
  const [title, sub] = STATUS[voice];

  return (
    <aside className="voice-panel">
      <div className="voice-stage">
        <VoiceOrb voice={voice} level={level} onClick={voice === 'speaking' ? () => { stopSpeaking(); toggleListening(); } : toggleListening} />
        <div className="voice-status">
          <strong>{title}</strong>
          <span>{sub}</span>
        </div>
        <div className={`live-transcript ${interim && voice === 'listening' ? 'is-visible' : ''}`}>{interim || ' '}</div>
        <div className="voice-toggles">
          <Toggle label="Hands-free" hint="Mic re-opens after each reply" checked={settings.handsFree} onChange={v => updateSettings({ handsFree: v })} />
          <Toggle label="Speak replies" checked={settings.autoSpeak} onChange={v => updateSettings({ autoSpeak: v })} />
        </div>
      </div>
      <RequestTracker assistant={assistant} />
      <p className="kbd-hint"><Keyboard size={14} /> <kbd>Space</kbd> talk · <kbd>Esc</kbd> cancel</p>
    </aside>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </label>
  );
}

export function RequestTracker({ assistant, compact }: { assistant: Assistant; compact?: boolean }) {
  const { state, stage } = assistant;
  const booked = stage === 'booked' && Boolean(state.booking_id);
  const steps = [
    { key: 'problem', icon: Wrench, label: 'Problem', value: state.service ? `${state.service}${state.problem && state.problem !== state.service ? ` · ${state.problem}` : ''}` : null },
    { key: 'where', icon: MapPin, label: 'Location', value: state.pincode ? `${state.area ? `${state.area.split(' / ')[0]} · ` : ''}${state.pincode}` : null },
    { key: 'when', icon: CalendarDays, label: 'When', value: state.date ? `${formatDay(state.date)}${state.time ? ` · ${formatTime(state.time)}` : ''}` : null },
    { key: 'pro', icon: UserRound, label: 'Professional', value: state.provider_name ? `${state.provider_name}${state.price ? ` · ${formatPrice(state.price)}` : ''}` : null },
    { key: 'booked', icon: ReceiptText, label: 'Booking', value: booked ? state.booking_id! : null }
  ];
  const current = steps.findIndex(s => !s.value);

  if (compact) {
    return (
      <div className="tracker-compact" aria-label="Request progress">
        {steps.map((s, i) => (
          <span key={s.key} className={`tc-step ${s.value ? 'done' : i === current ? 'current' : ''}`} title={s.value || s.label}>
            <s.icon size={13} />
            <span>{s.value || s.label}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <section className="tracker" aria-label="Request progress">
      <h3>Your request</h3>
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className={s.value ? 'done' : i === current ? 'current' : ''}>
            <span className="tracker-dot">{s.value ? <Check size={12} strokeWidth={3} /> : <s.icon size={12} />}</span>
            <span className="tracker-text">
              <small>{s.label}</small>
              <span>{s.value || (i === current ? 'Waiting…' : '—')}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
