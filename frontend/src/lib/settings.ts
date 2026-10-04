import { useCallback, useEffect, useState } from 'react';

export type AgentMode = 'auto' | 'claude' | 'local' | 'make';
export type Theme = 'system' | 'light' | 'dark';
export type InputEngine = 'auto' | 'browser' | 'elevenlabs';
export type OutputEngine = 'browser' | 'elevenlabs';

export interface Settings {
  customerId: string;
  agentMode: AgentMode;
  /** Optional Make webhook called directly from the browser (overrides the server's MAKE_WEBHOOK_URL). */
  customWebhook: string;
  autoSpeak: boolean;
  handsFree: boolean;
  language: string;
  inputEngine: InputEngine;
  outputEngine: OutputEngine;
  voiceName: string;
  speechRate: number;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  customerId: 'C001',
  agentMode: 'auto',
  customWebhook: '',
  autoSpeak: true,
  handsFree: false,
  language: 'en-IN',
  inputEngine: 'auto',
  outputEngine: 'browser',
  voiceName: '',
  speechRate: 1.05,
  theme: 'system'
};

const KEY = 'voicefix.settings.v3';
const LEGACY_KEY = 'voicefix.settings.v2';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    // v2 predates the Claude agent: keep preferences but move the agent to Auto.
    const legacy = localStorage.getItem(LEGACY_KEY);
    return legacy ? { ...DEFAULT_SETTINGS, ...JSON.parse(legacy), agentMode: 'auto', speechRate: DEFAULT_SETTINGS.speechRate } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable (private mode) — settings just won't persist */
    }
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => setSettings(prev => ({ ...prev, ...patch })), []);
  return [settings, update] as const;
}
