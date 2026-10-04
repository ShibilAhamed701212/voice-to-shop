import { ReactNode, useEffect, useRef } from 'react';
import { AirVent, Droplets, Hammer, Refrigerator, Sparkles, Tv, WashingMachine, Wrench, X, Zap, type LucideProps } from 'lucide-react';
import { hueFor, initials } from '../lib/format';

const CATEGORY_ICONS: Record<string, (p: LucideProps) => JSX.Element> = {
  'AC Repair': p => <AirVent {...p} />,
  Plumbing: p => <Droplets {...p} />,
  Electrical: p => <Zap {...p} />,
  Cleaning: p => <Sparkles {...p} />,
  'Washing Machine Repair': p => <WashingMachine {...p} />,
  'Refrigerator Repair': p => <Refrigerator {...p} />,
  'TV Repair': p => <Tv {...p} />,
  Carpentry: p => <Hammer {...p} />
};

export function CategoryIcon({ category, ...props }: { category?: string | null } & LucideProps) {
  const Icon = (category && CATEGORY_ICONS[category]) || ((p: LucideProps) => <Wrench {...p} />);
  return <Icon {...props} />;
}

export function Avatar({ id, name, size = 44 }: { id: string; name: string; size?: number }) {
  const hue = hueFor(id);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, ['--hue' as string]: hue }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" role="img" aria-label={`Rated ${rating} out of 5`}>
      <span className="stars-fill" aria-hidden="true" style={{ width: `${(rating / 5) * 100}%` }}>★★★★★</span>
      <span className="stars-base" aria-hidden="true">★★★★★</span>
    </span>
  );
}

export function Modal({
  open,
  onClose,
  children,
  label,
  variant = 'center'
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  variant?: 'center' | 'drawer' | 'sheet';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={`overlay overlay-${variant}`} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`panel panel-${variant}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panelRef}>
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="icon-btn close-btn" onClick={onClick} aria-label={label}>
      <X size={18} />
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}
