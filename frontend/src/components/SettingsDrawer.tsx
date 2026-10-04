import { useEffect, useState } from 'react';
import { Bot, Database, Palette, UserRound, Volume2 } from 'lucide-react';
import type { Customer, ServerConfig } from '../types';
import type { Settings } from '../lib/settings';
import { isBrowserRecognitionSupported, isSpeechSynthesisSupported, listVoices, voiceScore } from '../lib/speech';
import { CloseButton, Modal } from './common';
import { Toggle } from './VoicePanel';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  customers: Customer[];
  config: ServerConfig | null;
  onResetData: () => void;
  onNewConversation: () => void;
}

const LANGUAGES = [
  ['en-IN', 'English (India)'],
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['hi-IN', 'Hindi / Hinglish'],
  ['kn-IN', 'Kannada']
];

export function SettingsDrawer({ open, onClose, settings, update, customers, config, onResetData, onNewConversation }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (open) listVoices().then(setVoices);
  }, [open]);

  const langVoices = voices
    .filter(v => v.lang.toLowerCase().startsWith(settings.language.split('-')[0]) && voiceScore(v, settings.language) > -100)
    .sort((a, b) => voiceScore(b, settings.language) - voiceScore(a, settings.language));
  const webhookInvalid = settings.customWebhook !== '' && !/^https:\/\/\S+$/.test(settings.customWebhook);

  return (
    <Modal open={open} onClose={onClose} label="Settings" variant="drawer">
      <div className="drawer-head">
        <h2>Settings</h2>
        <CloseButton onClick={onClose} />
      </div>
      <div className="drawer-body">
        <section className="setting-group">
          <h3><UserRound size={16} /> Profile</h3>
          <label className="field">
            <span>Booking as</span>
            <select value={settings.customerId} onChange={e => update({ customerId: e.target.value })}>
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.name} — {c.default_location?.area.split(' / ')[0]} ({c.customer_id})
                </option>
              ))}
            </select>
            <small>Demo profiles. Switching starts a new conversation.</small>
          </label>
        </section>

        <section className="setting-group">
          <h3><Bot size={16} /> Agent brain</h3>
          <label className="field">
            <span>Agent</span>
            <select value={settings.agentMode} onChange={e => update({ agentMode: e.target.value as Settings['agentMode'] })}>
              <option value="auto">Auto — Claude if available, else offline</option>
              <option value="claude" disabled={!config?.claude_configured}>Claude AI{config?.claude_configured ? '' : ' (server key missing)'}</option>
              <option value="local">Offline rule-based agent</option>
              <option value="make">Make.com AI Agent</option>
            </select>
          </label>
          {settings.agentMode === 'make' ? (
            <>
              <p className="note">
                Server webhook: <strong>{config?.make_webhook_configured ? 'configured' : 'not configured'}</strong>. If Make fails or isn’t set up, the built-in agent answers so the conversation never breaks.
              </p>
              <label className="field">
                <span>Custom webhook URL (optional)</span>
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://hook.eu1.make.com/…"
                  value={settings.customWebhook}
                  onChange={e => update({ customWebhook: e.target.value.trim() })}
                  aria-invalid={webhookInvalid}
                />
                <small>{webhookInvalid ? 'Must be an https:// URL.' : 'Called directly from your browser. Leave empty to use the server’s MAKE_WEBHOOK_URL.'}</small>
              </label>
            </>
          ) : settings.agentMode === 'local' || !config?.claude_configured ? (
            <p className="note">
              Offline agent: instant, no API key, understands English and Hinglish booking phrases.
              {!config?.claude_configured && <> Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> to enable the Claude AI agent for natural conversation.</>}
            </p>
          ) : (
            <p className="note">Claude ({config.claude_model}) holds the conversation and uses live booking tools. It never books without your yes. If it’s unreachable, the offline agent answers.</p>
          )}
        </section>

        <section className="setting-group">
          <h3><Volume2 size={16} /> Voice</h3>
          <label className="field">
            <span>Speech language</span>
            <select value={settings.language} onChange={e => update({ language: e.target.value, voiceName: '' })}>
              {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Voice input</span>
            <select value={settings.inputEngine} onChange={e => update({ inputEngine: e.target.value as Settings['inputEngine'] })}>
              <option value="auto">Automatic</option>
              <option value="browser" disabled={!isBrowserRecognitionSupported()}>Browser speech recognition{isBrowserRecognitionSupported() ? '' : ' (unsupported here)'}</option>
              <option value="elevenlabs" disabled={!config?.elevenlabs_configured}>ElevenLabs Scribe{config?.elevenlabs_configured ? '' : ' (server key missing)'}</option>
            </select>
          </label>
          <label className="field">
            <span>Voice output</span>
            <select value={settings.outputEngine} onChange={e => update({ outputEngine: e.target.value as Settings['outputEngine'] })}>
              <option value="browser" disabled={!isSpeechSynthesisSupported()}>Browser voice</option>
              <option value="elevenlabs" disabled={!config?.elevenlabs_configured}>ElevenLabs{config?.elevenlabs_configured ? '' : ' (server key missing)'}</option>
            </select>
          </label>
          {settings.outputEngine === 'browser' && langVoices.length > 0 && (
            <label className="field">
              <span>Browser voice</span>
              <select value={settings.voiceName} onChange={e => update({ voiceName: e.target.value })}>
                <option value="">Best available ({langVoices[0]?.name})</option>
                {langVoices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
              <small>Tip: Edge’s “Natural” voices and Apple’s “Enhanced/Premium” voices sound the most human.</small>
            </label>
          )}
          <label className="field">
            <span>Speaking rate · {settings.speechRate.toFixed(1)}×</span>
            <input type="range" min={0.7} max={1.4} step={0.1} value={settings.speechRate} onChange={e => update({ speechRate: Number(e.target.value) })} />
          </label>
          <Toggle label="Speak replies aloud" checked={settings.autoSpeak} onChange={v => update({ autoSpeak: v })} />
          <Toggle label="Hands-free conversation" hint="Re-opens the mic after each reply" checked={settings.handsFree} onChange={v => update({ handsFree: v })} />
        </section>

        <section className="setting-group">
          <h3><Palette size={16} /> Appearance</h3>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map(t => (
              <button key={t} role="radio" aria-checked={settings.theme === t} className={settings.theme === t ? 'is-active' : ''} onClick={() => update({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="setting-group">
          <h3><Database size={16} /> Data</h3>
          <div className="button-row">
            <button className="btn btn-ghost" onClick={onNewConversation}>New conversation</button>
            <button className="btn btn-ghost danger-text" onClick={onResetData}>Reset demo data</button>
          </div>
          <small className="muted">Reset restores the original providers and sample bookings.</small>
        </section>
      </div>
    </Modal>
  );
}
