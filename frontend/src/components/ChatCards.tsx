import { BadgeCheck, CalendarClock, CheckCircle2, Clock, MapPin, ShieldCheck, Ticket, Timer, XCircle } from 'lucide-react';
import type { Booking, Proposal, ProviderOption, TimeSlot } from '../types';
import { formatDay, formatPrice, formatRange, formatTime } from '../lib/format';
import { Avatar, CategoryIcon, Stars } from './common';

export function slotsForOption(o: ProviderOption, date: string | null): TimeSlot[] {
  if (o.slots?.length) return o.slots;
  const day = date || o.matched_slot?.date || o.availability?.find(s => s.available)?.date;
  return (o.availability || []).filter(s => s.date === day);
}

interface OptionProps {
  option: ProviderOption;
  date: string | null;
  interactive: boolean;
  selected: boolean;
  selectedSlot?: string;
  onSelect: (option: ProviderOption, slot: TimeSlot) => void;
}

export function ProviderOptionCard({ option, date, interactive, selected, selectedSlot, onSelect }: OptionProps) {
  const slots = slotsForOption(option, date);
  const recommended = option.recommended_slot || option.matched_slot || slots.find(s => s.available);
  const badges = option.badges || [];

  return (
    <article className={`option-card ${selected ? 'is-selected' : ''}`}>
      {badges.length > 0 && (
        <div className="badges">
          {badges.map(b => (
            <span key={b} className={`badge ${b === 'Recommended' ? 'badge-accent' : ''}`}>{b}</span>
          ))}
        </div>
      )}
      <header className="option-head">
        <Avatar id={option.provider_id} name={option.name} />
        <div className="option-title">
          <h4>{option.name}</h4>
          <div className="option-rating">
            <Stars rating={option.rating} />
            <strong>{option.rating.toFixed(1)}</strong>
            <span className="muted">({option.review_count})</span>
          </div>
        </div>
        <div className="option-price">
          <strong>{formatPrice(option.price)}</strong>
          <span className="muted">visit</span>
        </div>
      </header>

      <ul className="option-meta">
        <li><MapPin size={14} />{option.location.area.split(' / ')[0]}</li>
        <li><ShieldCheck size={14} />{option.experience_years} yrs exp</li>
        <li><Timer size={14} />~{option.eta_minutes} min away</li>
      </ul>

      {slots.length > 0 && (
        <div className="slot-row" role="group" aria-label={`Time slots for ${option.name}`}>
          {slots.map(s => {
            const isPick = selected ? selectedSlot === s.start : recommended?.start === s.start;
            return (
              <button
                key={s.start}
                type="button"
                className={`slot ${isPick ? 'is-active' : ''}`}
                disabled={!s.available || !interactive}
                onClick={() => onSelect(option, s)}
                title={s.available ? `Choose ${formatRange(s.start, s.end)}` : 'Already booked'}
              >
                {formatTime(s.start)}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className={`btn ${selected ? 'btn-soft' : 'btn-primary'} btn-block`}
        disabled={!interactive || !recommended}
        onClick={() => recommended && onSelect(option, recommended)}
      >
        {selected ? <><CheckCircle2 size={16} /> Selected</> : <>Choose {recommended ? `· ${formatTime(recommended.start)}` : ''}</>}
      </button>
    </article>
  );
}

interface ProposalProps {
  proposal: Proposal;
  interactive: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

const PROPOSAL_COPY = {
  booking: { title: 'Ready to book', confirm: 'Confirm booking', decline: 'Change' },
  reschedule: { title: 'Move booking', confirm: 'Confirm new time', decline: 'Keep current' },
  cancel: { title: 'Cancel booking', confirm: 'Yes, cancel it', decline: 'Keep booking' }
};

export function ProposalCard({ proposal, interactive, onConfirm, onDecline }: ProposalProps) {
  const copy = PROPOSAL_COPY[proposal.kind] || PROPOSAL_COPY.booking;
  return (
    <section className={`proposal-card proposal-${proposal.kind}`}>
      <div className="proposal-head">
        {proposal.kind === 'cancel' ? <XCircle size={18} /> : proposal.kind === 'reschedule' ? <CalendarClock size={18} /> : <BadgeCheck size={18} />}
        <span>{copy.title}</span>
        {proposal.booking_id && <code className="mono">{proposal.booking_id}</code>}
      </div>
      <dl className="proposal-grid">
        <div><dt>Professional</dt><dd>{proposal.provider_name}</dd></div>
        <div><dt>Service</dt><dd><CategoryIcon category={proposal.service} size={14} /> {proposal.service}</dd></div>
        <div><dt>When</dt><dd>{formatDay(proposal.date)} · {formatRange(proposal.start_time, proposal.end_time)}</dd></div>
        <div><dt>Price</dt><dd>{formatPrice(proposal.price)}</dd></div>
      </dl>
      {interactive ? (
        <>
          <div className="proposal-actions">
            <button type="button" className={`btn ${proposal.kind === 'cancel' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
              {copy.confirm}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onDecline}>{copy.decline}</button>
          </div>
          <p className="hint">Or just say “yes” or “no”. Nothing is booked until you confirm.</p>
        </>
      ) : null}
    </section>
  );
}

export function BookingResultCard({ booking, onView }: { booking: Booking; onView: () => void }) {
  const cancelled = booking.status === 'cancelled';
  return (
    <section className={`result-card ${cancelled ? 'is-cancelled' : ''}`}>
      <div className="result-icon">{cancelled ? <XCircle size={22} /> : <CheckCircle2 size={22} />}</div>
      <div className="result-body">
        <span className="result-tag">{cancelled ? 'Cancelled' : booking.status === 'rescheduled' ? 'Rescheduled' : 'Booked'}</span>
        <strong>{booking.provider_name}</strong>
        <span className="muted">
          <Clock size={13} /> {formatDay(booking.date)} · {formatRange(booking.start_time, booking.end_time)} · {formatPrice(booking.price)}
        </span>
      </div>
      {!cancelled && (
        <button type="button" className="btn btn-soft" onClick={onView}>
          <Ticket size={16} /> Pass
        </button>
      )}
    </section>
  );
}
