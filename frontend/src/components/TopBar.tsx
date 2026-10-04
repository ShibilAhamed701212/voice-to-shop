import { CalendarCheck, LayoutGrid, MessageSquare, Moon, Monitor, Settings2, Sun } from 'lucide-react';
import type { Theme } from '../lib/settings';

export type View = 'assistant' | 'bookings' | 'pros';

interface Props {
  view: View;
  onView: (v: View) => void;
  online: boolean | null;
  agentLabel: string;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onSettings: () => void;
  upcoming: number;
}

const NAV: { id: View; label: string; icon: typeof MessageSquare }[] = [
  { id: 'assistant', label: 'Assistant', icon: MessageSquare },
  { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
  { id: 'pros', label: 'Find pros', icon: LayoutGrid }
];

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

export function TopBar({ view, onView, online, agentLabel, theme, onTheme, onSettings, upcoming }: Props) {
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const nav = (cls: string) => (
    <nav className={cls} aria-label="Main">
      {NAV.map(n => (
        <button key={n.id} className={`nav-item ${view === n.id ? 'is-active' : ''}`} onClick={() => onView(n.id)} aria-current={view === n.id ? 'page' : undefined}>
          <n.icon size={18} />
          <span>{n.label}</span>
          {n.id === 'bookings' && upcoming > 0 && <span className="nav-count">{upcoming}</span>}
        </button>
      ))}
    </nav>
  );

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">VoiceFix</span>
        </div>
        {nav('nav nav-top')}
        <div className="topbar-actions">
          <span className={`status-pill ${online === false ? 'is-off' : online ? 'is-on' : ''}`} title={online === false ? 'API offline' : 'API online'}>
            <span className="dot" />
            <span className="status-text">{online === false ? 'Offline' : agentLabel}</span>
          </span>
          <button className="icon-btn" onClick={() => onTheme(NEXT_THEME[theme])} aria-label={`Theme: ${theme}. Switch theme`} title={`Theme: ${theme}`}>
            <ThemeIcon size={18} />
          </button>
          <button className="icon-btn" onClick={onSettings} aria-label="Settings">
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      {nav('nav nav-bottom')}
    </>
  );
}
