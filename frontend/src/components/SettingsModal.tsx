import React, { useState } from 'react';
import { X, Save, Key, Globe, Shield, RefreshCw } from 'lucide-react';

interface SettingsModalProps {
  webhookUrl: string;
  onSaveWebhookUrl: (url: string) => void;
  onResetSession: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  webhookUrl,
  onSaveWebhookUrl,
  onResetSession,
  onClose
}) => {
  const [url, setUrl] = useState(webhookUrl);
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveWebhookUrl(url);
    setSavedMessage('Settings updated successfully!');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  return (
    <div className="modal-backdrop">
      <div className="settings-card">
        <div className="settings-header">
          <h3 className="settings-title">Configuration & Integrations</h3>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="settings-form">
          <div className="form-group">
            <label className="form-label">
              <Globe size={14} className="text-cyan" />
              <span>Make.com Custom Webhook URL</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hook.eu1.make.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <span className="form-hint">
              Leave blank to automatically run in zero-friction Local Simulator mode.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">
              <Key size={14} className="text-amber" />
              <span>ElevenLabs API Key (Optional)</span>
            </label>
            <input
              type="password"
              className="form-input"
              value={elevenLabsKey}
              onChange={(e) => setElevenLabsKey(e.target.value)}
              placeholder="xi-api-key-..."
            />
            <span className="form-hint">
              If not provided, high-performance browser SpeechSynthesis (TTS) is used automatically.
            </span>
          </div>

          <div className="session-reset-row">
            <div>
              <strong>Reset Conversation Session</strong>
              <p className="subtext">Clears multi-turn state and generates a new session ID.</p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                onResetSession();
                setSavedMessage('Session reset with new ID.');
                setTimeout(() => setSavedMessage(''), 3000);
              }}
            >
              <RefreshCw size={14} />
              <span>Reset</span>
            </button>
          </div>

          {savedMessage && (
            <div className="saved-feedback">
              <Shield size={14} />
              <span>{savedMessage}</span>
            </div>
          )}

          <div className="modal-actions-row">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-btn">
              <Save size={16} />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
