import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarX2, Clock, MapPin, MessageSquare, Ticket } from 'lucide-react';
import type { Booking, TimeSlot } from '../types';
import { api, errorMessage } from '../lib/api';
import { STATUS_LABEL, formatDay, formatPrice, formatRange, localToday } from '../lib/format';
import { Avatar, CategoryIcon, CloseButton, Modal, Spinner } from '../components/common';
import { SlotPicker } from '../components/SlotPicker';

const ACTIVE = ['pending', 'confirmed', 'rescheduled'];

interface Props {
  customerId: string;
  version: number;
  onChanged: () => void;
  onView: (b: Booking) => void;
  onGoAssistant: () => void;
  notify: (m: string, tone?: 'info' | 'success' | 'error') => void;
}

export function BookingsView({ customerId, version, onChanged, onView, onGoAssistant, notify }: Props) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .bookings(customerId)
      .then(b => live && setBookings(b))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [customerId, version]);

  const today = localToday();
  const { upcoming, past } = useMemo(() => {
    const list = bookings || [];
    const up = list.filter(b => ACTIVE.includes(b.status) && b.date >= today).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
    const pa = list.filter(b => !up.includes(b)).sort((a, b) => (b.date + b.start_time).localeCompare(a.date + a.start_time));
    return { upcoming: up, past: pa };
  }, [bookings, today]);
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My bookings</h1>
          <p className="muted">Manage visits booked by voice or from the pros directory.</p>
        </div>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === 'upcoming'} className={tab === 'upcoming' ? 'is-active' : ''} onClick={() => setTab('upcoming')}>
            Upcoming <span className="count">{upcoming.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'is-active' : ''} onClick={() => setTab('past')}>
            History <span className="count">{past.length}</span>
          </button>
        </div>
      </div>

      {failed ? (
        <div className="empty"><p>Couldn't load bookings. Is the API running?</p></div>
      ) : bookings === null ? (
        <div className="empty"><Spinner /> Loading…</div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <CalendarX2 size={36} />
          <p>{tab === 'upcoming' ? 'No upcoming visits.' : 'No past bookings yet.'}</p>
          {tab === 'upcoming' && (
            <button className="btn btn-primary" onClick={onGoAssistant}><MessageSquare size={16} /> Book with your voice</button>
          )}
        </div>
      ) : (
        <div className="booking-list">
          {shown.map(b => {
            const active = ACTIVE.includes(b.status) && b.date >= today;
            return (
              <article key={b.booking_id} className={`booking-card ${active ? '' : 'is-past'}`}>
                <div className="booking-date">
                  <small>{formatDay(b.date).split(',')[0]}</small>
                  <strong>{Number(b.date.slice(8))}</strong>
                  <small>{new Date(`${b.date}T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' })}</small>
                </div>
                <div className="booking-main">
                  <div className="booking-top">
                    <span className={`status status-${b.status}`}>{STATUS_LABEL[b.status]}</span>
                    <code className="mono">{b.booking_id}</code>
                  </div>
                  <div className="booking-pro">
                    <Avatar id={b.provider_id} name={b.provider_name} size={36} />
                    <div>
                      <strong>{b.provider_name}</strong>
                      <span className="muted"><CategoryIcon category={b.service} size={13} /> {b.service} · {b.problem}</span>
                    </div>
                  </div>
                  <ul className="booking-meta">
                    <li><Clock size={14} /> {formatRange(b.start_time, b.end_time)}</li>
                    {b.location && <li><MapPin size={14} /> {b.location.area.split(' / ')[0]}</li>}
                    <li className="price">{formatPrice(b.price)}</li>
                  </ul>
                </div>
                <div className="booking-actions">
                  {active && <button className="btn btn-soft" onClick={() => onView(b)}><Ticket size={16} /> Pass</button>}
                  {active && <button className="btn btn-ghost" onClick={() => setRescheduling(b)}><CalendarClock size={16} /> Reschedule</button>}
                  {active && <button className="btn btn-ghost danger-text" onClick={() => setCancelling(b)}>Cancel</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CancelDialog
        booking={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => {
          notify(`Booking ${cancelling?.booking_id} cancelled`, 'success');
          setCancelling(null);
          onChanged();
        }}
        notify={notify}
      />
      <RescheduleSheet
        booking={rescheduling}
        onClose={() => setRescheduling(null)}
        onDone={b => {
          notify(`Moved to ${formatDay(b.date)}, ${formatRange(b.start_time, b.end_time)}`, 'success');
          setRescheduling(null);
          onChanged();
        }}
        notify={notify}
      />
    </div>
  );
}

function CancelDialog({ booking, onClose, onDone, notify }: { booking: Booking | null; onClose: () => void; onDone: () => void; notify: Props['notify'] }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!booking) return;
    setBusy(true);
    try {
      await api.cancelBooking(booking.booking_id, 'Cancelled from bookings page');
      onDone();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={Boolean(booking)} onClose={onClose} label="Cancel booking">
      {booking && (
        <div className="dialog">
          <CloseButton onClick={onClose} />
          <h2>Cancel this visit?</h2>
          <p className="muted">
            {booking.provider_name} · {formatDay(booking.date)}, {formatRange(booking.start_time, booking.end_time)}. The time slot will be released for other customers.
          </p>
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={onClose}>Keep booking</button>
            <button className="btn btn-danger" onClick={confirm} disabled={busy}>{busy ? <Spinner /> : 'Cancel booking'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RescheduleSheet({ booking, onClose, onDone, notify }: { booking: Booking | null; onClose: () => void; onDone: (b: Booking) => void; notify: Props['notify'] }) {
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSlot(null), [booking]);

  const confirm = async () => {
    if (!booking || !slot) return;
    setBusy(true);
    try {
      onDone(await api.rescheduleBooking(booking.booking_id, slot.date, slot.start));
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(booking)} onClose={onClose} label="Reschedule booking" variant="sheet">
      {booking && (
        <div className="sheet">
          <div className="sheet-head">
            <div>
              <h2>Reschedule</h2>
              <p className="muted">{booking.provider_name} · currently {formatDay(booking.date)}, {formatRange(booking.start_time, booking.end_time)}</p>
            </div>
            <CloseButton onClick={onClose} />
          </div>
          <SlotPicker providerId={booking.provider_id} initialDate={booking.date} value={slot} onChange={setSlot} current={{ date: booking.date, start: booking.start_time }} />
          <div className="sheet-foot">
            <span className="muted">{slot ? `New time: ${formatDay(slot.date)}, ${formatRange(slot.start, slot.end)}` : 'Pick a new slot'}</span>
            <button className="btn btn-primary" disabled={!slot || busy} onClick={confirm}>{busy ? <Spinner /> : 'Confirm new time'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
