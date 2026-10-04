import { useCallback, useEffect, useState } from 'react';
import type { Booking, Customer, Meta, ServerConfig } from './types';
import { api, errorMessage } from './lib/api';
import { localToday, setReferenceToday } from './lib/format';
import { useSettings } from './lib/settings';
import { useAssistant } from './hooks/useAssistant';
import { TopBar, View } from './components/TopBar';
import { BookingPass } from './components/BookingPass';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Toasts, useToasts } from './components/Toasts';
import { AssistantView } from './views/AssistantView';
import { BookingsView } from './views/BookingsView';
import { ProvidersView } from './views/ProvidersView';

const VIEWS: View[] = ['assistant', 'bookings', 'pros'];
const viewFromHash = (): View => {
  const v = window.location.hash.replace('#', '') as View;
  return VIEWS.includes(v) ? v : 'assistant';
};

export default function App() {
  const [settings, updateSettings] = useSettings();
  const { toasts, notify, dismiss } = useToasts();
  const [view, setView] = useState<View>(viewFromHash);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [pass, setPass] = useState<Booking | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [upcoming, setUpcoming] = useState(0);

  const customer = customers.find(c => c.customer_id === settings.customerId);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  // Bootstrap + health polling.
  useEffect(() => {
    const load = () =>
      api
        .config()
        .then(c => {
          setReferenceToday(c.today);
          setConfig(c);
          setOnline(true);
        })
        .catch(() => setOnline(false));
    load();
    api.meta().then(setMeta).catch(() => {});
    api.customers().then(setCustomers).catch(() => {});
    const id = setInterval(() => api.health().then(() => setOnline(true)).catch(() => setOnline(false)), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (online && !config)
      api.config().then(c => {
        setReferenceToday(c.today);
        setConfig(c);
      }).catch(() => {});
    if (online && !meta) api.meta().then(setMeta).catch(() => {});
    if (online && !customers.length) api.customers().then(setCustomers).catch(() => {});
  }, [online, config, meta, customers.length]);

  useEffect(() => {
    const today = localToday();
    api
      .bookings(settings.customerId)
      .then(list => setUpcoming(list.filter(b => ['pending', 'confirmed', 'rescheduled'].includes(b.status) && b.date >= today).length))
      .catch(() => {});
  }, [settings.customerId, version, config]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: View) => {
    window.location.hash = v === 'assistant' ? '' : v;
    setView(v);
  };

  const assistant = useAssistant({
    settings,
    config,
    customerFirstName: customer?.name.split(' ')[0],
    notify,
    onBooking: b => {
      bump();
      if (b.status === 'cancelled') notify(`Booking ${b.booking_id} cancelled`, 'success');
      else {
        notify(b.status === 'rescheduled' ? `Booking ${b.booking_id} moved` : `Booked! ID ${b.booking_id}`, 'success');
        setPass(b);
      }
    }
  });

  // Space toggles the mic, Escape cancels listening — unless typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]');
      if (view !== 'assistant' || typing || pass || settingsOpen) return;
      if (e.code === 'Space' && !e.repeat && !el.closest('button')) {
        e.preventDefault();
        assistant.toggleListening();
      } else if (e.key === 'Escape') {
        assistant.cancelListening();
        assistant.stopSpeaking();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, assistant, pass, settingsOpen]);

  const resetData = async () => {
    if (!window.confirm('Restore the original demo providers and bookings? Bookings you made will be removed.')) return;
    try {
      await api.resetDemo();
      assistant.reset();
      bump();
      notify('Demo data restored', 'success');
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  };

  const usesClaude = settings.agentMode === 'claude' || (settings.agentMode === 'auto' && config?.claude_configured);
  const agentLabel = settings.agentMode === 'make' ? 'Make.com agent' : usesClaude ? 'Claude AI agent' : 'Offline agent';

  return (
    <div className={`app view-${view}`}>
      <TopBar
        view={view}
        onView={go}
        online={online}
        agentLabel={agentLabel}
        theme={settings.theme}
        onTheme={theme => updateSettings({ theme })}
        onSettings={() => setSettingsOpen(true)}
        upcoming={upcoming}
      />

      {online === false && (
        <div className="offline-banner" role="alert">
          Can’t reach the VoiceFix API. Start it with <code>npm run dev</code> from the project root.
        </div>
      )}

      <main className="main">
        {view === 'assistant' && <AssistantView assistant={assistant} settings={settings} updateSettings={updateSettings} onViewBooking={setPass} />}
        {view === 'bookings' && (
          <BookingsView customerId={settings.customerId} version={version} onChanged={bump} onView={setPass} onGoAssistant={() => go('assistant')} notify={notify} />
        )}
        {view === 'pros' && (
          <ProvidersView
            meta={meta}
            customerId={settings.customerId}
            defaultPincode={customer?.default_location?.pincode}
            version={version}
            notify={notify}
            onBooked={b => {
              bump();
              notify(`Booked! ID ${b.booking_id}`, 'success');
              setPass(b);
            }}
          />
        )}
      </main>

      <BookingPass booking={pass} onClose={() => setPass(null)} />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        update={updateSettings}
        customers={customers}
        config={config}
        onResetData={resetData}
        onNewConversation={() => {
          assistant.reset();
          setSettingsOpen(false);
          go('assistant');
        }}
      />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
