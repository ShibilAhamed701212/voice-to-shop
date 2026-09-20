import React from 'react';
import { CheckCircle, Calendar, Clock, MapPin, User, Check, X } from 'lucide-react';
import { Booking } from '../types';

interface BookingModalProps {
  booking: Booking | null;
  onClose: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({ booking, onClose }) => {
  if (!booking) return null;

  return (
    <div className="modal-backdrop">
      <div className="booking-pass-card">
        <button className="modal-close-btn" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="pass-header">
          <div className="pass-badge-icon">
            <CheckCircle size={32} className="text-emerald" />
          </div>
          <h3 className="pass-title">BOOKING CONFIRMED</h3>
          <p className="pass-subtitle">Technician scheduled & time slot locked</p>
        </div>

        <div className="booking-id-ribbon">
          <span>BOOKING ID</span>
          <strong className="id-code">{booking.booking_id}</strong>
        </div>

        <div className="pass-details-grid">
          <div className="detail-box">
            <span className="detail-label"><User size={13} /> Technician</span>
            <span className="detail-value">{booking.provider_name}</span>
          </div>

          <div className="detail-box">
            <span className="detail-label">Service</span>
            <span className="detail-value">{booking.service}</span>
          </div>

          <div className="detail-box">
            <span className="detail-label"><Calendar size={13} /> Date</span>
            <span className="detail-value">{booking.date}</span>
          </div>

          <div className="detail-box">
            <span className="detail-label"><Clock size={13} /> Arrival Window</span>
            <span className="detail-value">{booking.start_time} - {booking.end_time}</span>
          </div>

          <div className="detail-box full-width">
            <span className="detail-label"><MapPin size={13} /> Service Area</span>
            <span className="detail-value">
              {booking.location ? `${booking.location.area}, Bengaluru (${booking.location.pincode})` : 'Bengaluru'}
            </span>
          </div>
        </div>

        <div className="pass-price-bar">
          <span>Estimated Total Cost</span>
          <strong className="cost">₹{booking.price}</strong>
        </div>

        <div className="pass-status-badge">
          <Check size={14} />
          <span>Atomic slot lock active • Double booking prevented</span>
        </div>

        <button className="done-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
};
