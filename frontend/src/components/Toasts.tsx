import { useCallback, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

export type ToastTone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);
  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId++;
      setToasts(t => [...t.filter(x => x.message !== message).slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 4000);
    },
    [dismiss]
  );
  return { toasts, notify, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.tone === 'success' ? <CheckCircle2 size={18} /> : t.tone === 'error' ? <CircleAlert size={18} /> : <Info size={18} />}
          <span>{t.message}</span>
          <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
