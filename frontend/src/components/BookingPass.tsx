import { CalendarPlus, Clock, MapPin, Phone, ShieldCheck, Wrench } from 'lucide-react';
import type { Booking } from '../types';
import { STATUS_LABEL, formatDate, formatPrice, formatRange } from '../lib/format';
import { Avatar, CategoryIcon, CloseButton, Modal } from './common';

function icsFor(b: Booking): string {
  const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VoiceFix//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${b.booking_id}@voicefix`,
    `DTSTART;TZID=Asia/Kolkata:${stamp(b.date, b.start_time)}`,
    `DTEND;TZID=Asia/Kolkata:${stamp(b.date, b.end_time)}`,
    `SUMMARY:${b.service} — ${b.provider_name}`,
    `DESCRIPTION:Booking ${b.booking_id}. ${b.problem}. Estimated cost ₹${b.price}.`,
    `LOCATION:${b.location ? `${b.location.area}, ${b.location.city} ${b.location.pincode}` : ''}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function downloadIcs(b: Booking) {
  const url = URL.createObjectURL(new Blob([icsFor(b)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `voicefix-${b.booking_id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BookingPass({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(booking)} onClose={onClose} label="Booking pass">
      {booking && (
        <div className="pass">
          <CloseButton onClick={onClose} />
          <div className="pass-top">
            <span className="pass-check"><ShieldCheck size={26} /></span>
            <h2>{booking.status === 'rescheduled' ? 'Booking rescheduled' : 'You’re booked!'}</h2>
            <p className="muted">Slot locked for you — nobody else can take it.</p>
          </div>

          <div className="pass-id">
            <small>Booking ID</small>
            <strong className="mono">{booking.booking_id}</strong>
            <span className={`status status-${booking.status}`}>{STATUS_LABEL[booking.status]}</span>
          </div>

          <div className="pass-perf" aria-hidden="true" />

          <div className="pass-pro">
            <Avatar id={booking.provider_id} name={booking.provider_name} size={48} />
            <div>
              <strong>{booking.provider_name}</strong>
              <span className="muted"><CategoryIcon category={booking.service} size={13} /> {booking.service}</span>
            </div>
          </div>

          <dl className="pass-grid">
            <div><dt><Clock size={13} /> Arrival window</dt><dd>{formatDate(booking.date)}<br />{formatRange(booking.start_time, booking.end_time)}</dd></div>
            <div><dt><MapPin size={13} /> Area</dt><dd>{booking.location ? `${booking.location.area.split(' / ')[0]}, ${booking.location.pincode}` : 'Bengaluru'}</dd></div>
            <div className="span-2"><dt><Wrench size={13} /> Issue</dt><dd>{booking.problem}</dd></div>
          </dl>

          <div className="pass-total">
            <span>Estimated cost</span>
            <strong>{formatPrice(booking.price)}</strong>
          </div>

          <div className="pass-actions">
            <button className="btn btn-ghost" onClick={() => downloadIcs(booking)}><CalendarPlus size={16} /> Add to calendar</button>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
          <p className="pass-foot"><Phone size={12} /> The professional will call before arriving.</p>
        </div>
      )}
    </Modal>
  );
}
