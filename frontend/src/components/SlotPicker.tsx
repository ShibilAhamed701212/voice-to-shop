import { useEffect, useState } from 'react';
import type { TimeSlot } from '../types';
import { api } from '../lib/api';
import { addDays, dayNumber, formatDate, formatDay, formatRange, formatTime, localToday, weekdayShort } from '../lib/format';
import { Spinner } from './common';

interface Props {
  providerId: string;
  initialDate?: string;
  days?: number;
  value: TimeSlot | null;
  onChange: (slot: TimeSlot | null) => void;
  /** Slot to label as "current" (when rescheduling). */
  current?: { date: string; start: string };
}

export function SlotPicker({ providerId, initialDate, days = 7, value, onChange, current }: Props) {
  const start = localToday();
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const [date, setDate] = useState(initialDate && dates.includes(initialDate) ? initialDate : dates[0]);
  const [slots, setSlots] = useState<TimeSlot[] | null>(null);

  useEffect(() => {
    let live = true;
    setSlots(null);
    api.slots(providerId, date).then(s => live && setSlots(s)).catch(() => live && setSlots([]));
    return () => {
      live = false;
    };
  }, [providerId, date]);

  return (
    <div className="slot-picker">
      <div className="date-strip" role="tablist" aria-label="Choose a day">
        {dates.map(d => (
          <button
            key={d}
            role="tab"
            aria-selected={d === date}
            aria-label={formatDate(d)}
            className={`date-pill ${d === date ? 'is-active' : ''}`}
            onClick={() => {
              setDate(d);
              onChange(null);
            }}
          >
            <small>{d === start ? 'Today' : weekdayShort(d)}</small>
            <strong>{dayNumber(d)}</strong>
          </button>
        ))}
      </div>
      <div className="slot-grid">
        {slots === null ? (
          <div className="slot-loading"><Spinner /> Checking availability…</div>
        ) : slots.length === 0 ? (
          <p className="muted">No working hours {formatDay(date).toLowerCase()}.</p>
        ) : (
          slots.map(s => {
            const isCurrent = current && current.date === s.date && current.start === s.start;
            return (
              <button
                key={s.start}
                className={`slot slot-lg ${value?.start === s.start && value.date === s.date ? 'is-active' : ''}`}
                disabled={!s.available}
                onClick={() => onChange(s)}
                title={formatRange(s.start, s.end)}
              >
                {formatTime(s.start)}
                {isCurrent ? <small>current</small> : !s.available ? <small>taken</small> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
