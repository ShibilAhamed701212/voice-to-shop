import React from 'react';
import { Star, Clock, MapPin, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Provider } from '../types';

interface ProviderCardProps {
  provider: Provider;
  isSelected?: boolean;
  onSelect: (provider: Provider) => void;
  disabled?: boolean;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isSelected,
  onSelect,
  disabled
}) => {
  // Find prime evening slot or first available slot
  const slot = provider.availability?.find(s => s.available);
  const timeDisplay = slot ? `${slot.start} - ${slot.end}` : 'Slot available';

  return (
    <div className={`provider-card ${isSelected ? 'selected' : ''}`}>
      <div className="provider-header-row">
        <div>
          <h4 className="provider-name">{provider.name}</h4>
          <span className="provider-category">{provider.category}</span>
        </div>
        <div className="provider-price-tag">
          <span className="currency">₹</span>
          <span className="amount">{provider.price}</span>
        </div>
      </div>

      <div className="provider-meta-grid">
        <div className="meta-item">
          <Star size={14} className="star-icon" />
          <span><strong>{provider.rating}</strong> ({provider.review_count} reviews)</span>
        </div>
        <div className="meta-item">
          <Clock size={14} className="clock-icon" />
          <span>ETA: {provider.eta_minutes} min</span>
        </div>
        <div className="meta-item">
          <MapPin size={14} className="pin-icon" />
          <span>{provider.location.area} ({provider.location.pincode})</span>
        </div>
        <div className="meta-item">
          <ShieldCheck size={14} className="shield-icon" />
          <span>{provider.experience_years} yrs experience</span>
        </div>
      </div>

      <div className="provider-slot-badge">
        <span className="slot-dot"></span>
        <span>Available: {timeDisplay}</span>
      </div>

      <div className="card-action-row">
        <button
          className={`select-btn ${isSelected ? 'selected-btn' : ''}`}
          onClick={() => onSelect(provider)}
          disabled={disabled}
        >
          {isSelected ? (
            <>
              <CheckCircle2 size={16} />
              <span>Selected Option</span>
            </>
          ) : (
            <span>Select Provider</span>
          )}
        </button>
        <span className="disclaimer-text">
          Voice confirmation required before booking
        </span>
      </div>
    </div>
  );
};
