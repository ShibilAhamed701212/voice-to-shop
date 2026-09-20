import React from 'react';
import { Cpu, Radio, Sparkles, RefreshCw, Settings } from 'lucide-react';

interface HeaderProps {
  sessionId: string;
  isApiOnline: boolean;
  useSimulator: boolean;
  onToggleSimulator: () => void;
  onResetSession: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  sessionId,
  isApiOnline,
  useSimulator,
  onToggleSimulator,
  onResetSession,
  onOpenSettings
}) => {
  return (
    <header className="header-glass">
      <div className="header-container">
        <div className="brand-section">
          <div className="brand-logo-icon">
            <Radio className="icon-pulse text-cyan" size={24} />
          </div>
          <div>
            <div className="brand-title-row">
              <h1 className="brand-title">VOICEFIX</h1>
              <span className="badge-ps06">PS-06</span>
            </div>
            <p className="brand-subtitle">Make.com AI Service Booking Concierge</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Make AI Credits Pill */}
          <div className="credits-pill">
            <Sparkles size={14} className="text-amber" />
            <span>25,000 Make AI Credits</span>
          </div>

          {/* Session ID Pill */}
          <div className="session-pill" title="Unique Session ID">
            <Cpu size={14} />
            <span>Session: {sessionId}</span>
            <button className="icon-btn-subtle" onClick={onResetSession} title="New Session">
              <RefreshCw size={12} />
            </button>
          </div>

          {/* API Health Pill */}
          <div className={`health-pill ${isApiOnline ? 'online' : 'offline'}`}>
            <span className="health-dot"></span>
            <span>{isApiOnline ? 'Mock API Online' : 'Connecting API...'}</span>
          </div>

          {/* Mode Switcher */}
          <button 
            className={`mode-toggle ${useSimulator ? 'mode-sim' : 'mode-live'}`}
            onClick={onToggleSimulator}
            title="Toggle between Live Make.com Webhook and Local Offline Simulator"
          >
            {useSimulator ? '⚡ Mode: Simulator' : '🌐 Mode: Live Webhook'}
          </button>

          {/* Settings Button */}
          <button className="icon-btn" onClick={onOpenSettings} title="Settings & Webhook Config">
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};
