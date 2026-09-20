import React, { useRef, useEffect } from 'react';
import { User, Bot, MapPin, Calendar, Clock, Wrench } from 'lucide-react';
import { Message, Provider, ConversationState, Booking } from '../types';
import { ProviderCard } from './ProviderCard';

interface ConversationFeedProps {
  messages: Message[];
  currentState: ConversationState;
  onSelectProvider: (provider: Provider) => void;
  selectedProviderId: string | null;
  latestBooking: Booking | null;
  onViewBooking: () => void;
}

export const ConversationFeed: React.FC<ConversationFeedProps> = ({
  messages,
  currentState,
  onSelectProvider,
  selectedProviderId,
  latestBooking: _latestBooking,
  onViewBooking
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="conversation-feed-container">
      {/* Active Context Chips */}
      <div className="state-chips-bar">
        <div className="chip-label">Identified Context:</div>
        <div className={`chip ${currentState.service ? 'active' : ''}`}>
          <Wrench size={12} />
          <span>{currentState.service || 'Service Needed'}</span>
        </div>
        <div className={`chip ${currentState.pincode ? 'active' : ''}`}>
          <MapPin size={12} />
          <span>{currentState.pincode ? `PIN: ${currentState.pincode}` : 'Location/PIN Missing'}</span>
        </div>
        <div className={`chip ${currentState.date ? 'active' : ''}`}>
          <Calendar size={12} />
          <span>{currentState.date || 'Date'}</span>
        </div>
        <div className={`chip ${currentState.time ? 'active' : ''}`}>
          <Clock size={12} />
          <span>{currentState.time || 'Time Slot'}</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="messages-list">
        {messages.map((msg) => (
          <div key={msg.id} className={`message-row ${msg.sender}`}>
            <div className="message-avatar">
              {msg.sender === 'user' ? (
                <User size={18} className="text-white" />
              ) : (
                <Bot size={18} className="text-cyan" />
              )}
            </div>

            <div className="message-content-wrapper">
              <div className="message-header">
                <span className="sender-name">
                  {msg.sender === 'user' ? 'You' : 'Make.com AI Agent'}
                </span>
                <span className="message-time">{msg.timestamp}</span>
              </div>

              <div className="message-bubble">
                <p>{msg.text}</p>
              </div>

              {/* Provider Options Grid */}
              {msg.options && msg.options.length > 0 && (
                <div className="options-container">
                  <div className="options-title">
                    Suitable Providers Found ({msg.options.length} options):
                  </div>
                  <div className="options-grid">
                    {msg.options.map((prov) => (
                      <ProviderCard
                        key={prov.provider_id}
                        provider={prov}
                        isSelected={selectedProviderId === prov.provider_id}
                        onSelect={onSelectProvider}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Confirmed Booking Banner */}
              {msg.booking && (
                <div className="confirmed-booking-banner">
                  <div className="banner-left">
                    <span className="banner-tag">CONFIRMED</span>
                    <strong className="banner-title">
                      {msg.booking.provider_name} • Booking ID: {msg.booking.booking_id}
                    </strong>
                    <span className="banner-sub">
                      Tomorrow, {msg.booking.start_time} - {msg.booking.end_time} • ₹{msg.booking.price}
                    </span>
                  </div>
                  <button className="view-ticket-btn" onClick={onViewBooking}>
                    View Pass
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
