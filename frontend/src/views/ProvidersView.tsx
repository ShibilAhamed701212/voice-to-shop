import { useEffect, useMemo, useState } from 'react';
import { MapPin, SearchX, ShieldCheck, Timer } from 'lucide-react';
import type { Booking, Meta, Provider, TimeSlot } from '../types';
import { api, errorMessage } from '../lib/api';
import { addDays, dayNumber, formatDate, formatDay, formatPrice, formatRange, formatTime, localToday, weekdayShort } from '../lib/format';
import { Avatar, CategoryIcon, CloseButton, Modal, Spinner, Stars } from '../components/common';
import { SlotPicker } from '../components/SlotPicker';

type Sort = 'value' | 'price' | 'rating';

interface Props {
  meta: Meta | null;
  customerId: string;
  defaultPincode?: string;
  version: number;
  onBooked: (b: Booking) => void;
  notify: (m: string, tone?: 'info' | 'success' | 'error') => void;
}

export function ProvidersView({ meta, customerId, defaultPincode, version, onBooked, notify }: Props) {
  const today = localToday();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [category, setCategory] = useState('');
  const [pincode, setPincode] = useState('');
  const [date, setDate] = useState(dates[1]);
  const [sort, setSort] = useState<Sort>('value');
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [booking, setBooking] = useState<{ provider: Provider; slot?: TimeSlot } | null>(null);

  useEffect(() => {
    if (defaultPincode) setPincode(p => p || defaultPincode);
  }, [defaultPincode]);

  useEffect(() => {
    let live = true;
    setProviders(null);
    api
      .providers({ category, pincode, date })
      .then(p => live && setProviders(p))
      .catch(() => live && setProviders([]));
    return () => {
      live = false;
    };
  }, [category, pincode, date, version]);

  const sorted = useMemo(() => {
    const list = [...(providers || [])];
    if (sort === 'price') list.sort((a, b) => a.price - b.price);
    else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating || b.review_count - a.review_count);
    else list.sort((a, b) => b.rating * 2 - b.price / 200 - (a.rating * 2 - a.price / 200));
    return list;
  }, [providers, sort]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Find a pro</h1>
          <p className="muted">Browse verified professionals and book a slot directly.</p>
        </div>
      </div>

      <div className="filters">
        <div className="cat-chips" role="tablist" aria-label="Category">
          <button className={`cat-chip ${category === '' ? 'is-active' : ''}`} onClick={() => setCategory('')}>All</button>
          {meta?.categories.map(c => (
            <button key={c.name} className={`cat-chip ${category === c.name ? 'is-active' : ''}`} onClick={() => setCategory(c.name)}>
              <CategoryIcon category={c.name} size={15} /> {c.name.replace(' Repair', '')}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label className="field field-inline">
            <span>Area</span>
            <select value={pincode} onChange={e => setPincode(e.target.value)}>
              <option value="">All areas</option>
              {meta?.areas.map(a => <option key={a.pincode} value={a.pincode}>{a.area.split(' / ')[0]} · {a.pincode}</option>)}
            </select>
          </label>
          <label className="field field-inline">
            <span>Sort</span>
            <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
              <option value="value">Best value</option>
              <option value="rating">Highest rated</option>
              <option value="price">Lowest price</option>
            </select>
          </label>
        </div>
        <div className="date-strip" role="tablist" aria-label="Day">
          {dates.map(d => (
            <button key={d} role="tab" aria-selected={d === date}
            aria-label={formatDate(d)} className={`date-pill ${d === date ? 'is-active' : ''}`} onClick={() => setDate(d)}>
              <small>{d === today ? 'Today' : weekdayShort(d)}</small>
              <strong>{dayNumber(d)}</strong>
            </button>
          ))}
        </div>
      </div>

      {providers === null ? (
        <div className="empty"><Spinner /> Finding professionals…</div>
      ) : sorted.length === 0 ? (
        <div className="empty">
          <SearchX size={36} />
          <p>Nobody free {formatDay(date).toLowerCase()} with these filters.</p>
          <button className="btn btn-ghost" onClick={() => { setPincode(''); setCategory(''); }}>Clear filters</button>
        </div>
      ) : (
        <div className="pro-grid">
          {sorted.map(p => {
            const free = p.availability.filter(s => s.available);
            return (
              <article key={p.provider_id} className="pro-card">
                <header className="option-head">
                  <Avatar id={p.provider_id} name={p.name} />
                  <div className="option-title">
                    <h4>{p.name}</h4>
                    <div className="option-rating">
                      <Stars rating={p.rating} />
                      <strong>{p.rating.toFixed(1)}</strong>
                      <span className="muted">({p.review_count})</span>
                    </div>
                  </div>
                  <div className="option-price">
                    <strong>{formatPrice(p.price)}</strong>
                    <span className="muted">visit</span>
                  </div>
                </header>
                <div className="pro-cat"><CategoryIcon category={p.category} size={14} /> {p.category}</div>
                <ul className="option-meta">
                  <li><MapPin size={14} />{p.location.area.split(' / ')[0]}</li>
                  <li><ShieldCheck size={14} />{p.experience_years} yrs</li>
                  <li><Timer size={14} />~{p.eta_minutes} min</li>
                </ul>
                <div className="tags">{p.services.slice(1, 4).map(s => <span key={s} className="tag">{s}</span>)}</div>
                <div className="slot-row">
                  {p.availability.map(s => (
                    <button key={s.start} className="slot" disabled={!s.available} onClick={() => setBooking({ provider: p, slot: s })} title={formatRange(s.start, s.end)}>
                      {formatTime(s.start)}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary btn-block" disabled={!free.length} onClick={() => setBooking({ provider: p, slot: free[0] })}>
                  Book {free.length ? `· ${free.length} slot${free.length > 1 ? 's' : ''} free` : ''}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <BookSheet
        target={booking}
        customerId={customerId}
        onClose={() => setBooking(null)}
        onBooked={b => {
          setBooking(null);
          onBooked(b);
        }}
        notify={notify}
      />
    </div>
  );
}

function BookSheet({
  target,
  customerId,
  onClose,
  onBooked,
  notify
}: {
  target: { provider: Provider; slot?: TimeSlot } | null;
  customerId: string;
  onClose: () => void;
  onBooked: (b: Booking) => void;
  notify: Props['notify'];
}) {
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSlot(target?.slot ?? null);
    setProblem('');
  }, [target]);

  const confirm = async () => {
    if (!target || !slot) return;
    setBusy(true);
    try {
      const b = await api.createBooking({
        customer_id: customerId,
        provider_id: target.provider.provider_id,
        date: slot.date,
        start_time: slot.start,
        service: target.provider.category,
        problem: problem.trim() || undefined
      });
      onBooked(b);
    } catch (err) {
      notify(errorMessage(err), 'error');
      setSlot(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(target)} onClose={onClose} label="Book a slot" variant="sheet">
      {target && (
        <div className="sheet">
          <div className="sheet-head">
            <div className="sheet-pro">
              <Avatar id={target.provider.provider_id} name={target.provider.name} />
              <div>
                <h2>{target.provider.name}</h2>
                <p className="muted">{target.provider.category} · {formatPrice(target.provider.price)} · ★ {target.provider.rating}</p>
              </div>
            </div>
            <CloseButton onClick={onClose} />
          </div>
          <SlotPicker providerId={target.provider.provider_id} initialDate={target.slot?.date} value={slot} onChange={setSlot} />
          <label className="field">
            <span>What's the problem? (optional)</span>
            <textarea rows={2} maxLength={200} value={problem} onChange={e => setProblem(e.target.value)} placeholder="e.g. AC is running but not cooling" />
          </label>
          <div className="sheet-foot">
            <span className="muted">{slot ? `${formatDay(slot.date)}, ${formatRange(slot.start, slot.end)}` : 'Pick a time slot'}</span>
            <button className="btn btn-primary" disabled={!slot || busy} onClick={confirm}>
              {busy ? <Spinner /> : `Confirm · ${formatPrice(target.provider.price)}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
