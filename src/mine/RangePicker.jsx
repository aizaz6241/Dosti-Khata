// Khoobsurat calendar: pehle shuru ki tareekh, phir aakhri. Upar jaldi wale options.
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { today } from '../lib';
import { MONTHS, WD1, PRESETS, periodLabel, daysBetween, addDays, weekday } from './period';

const pad = (n) => String(n).padStart(2, '0');

export default function RangePicker({ value, onApply, applyLabel = 'Ye muddat dikhao' }) {
  const t = today();
  const [from, setFrom] = useState(value?.kind === 'all' ? null : value?.from || null);
  const [to, setTo] = useState(value?.kind === 'all' ? null : value?.to || null);
  const [view, setView] = useState(() => (value?.to && value.kind !== 'all' ? value.to : t).slice(0, 7));
  const [dir, setDir] = useState(0);
  const [y, m] = view.split('-').map(Number);
  const cells = useMemo(() => {
    const first = `${view}-01`;
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = weekday(first);
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${view}-${pad(i + 1)}`)];
  }, [view, y, m]);
  const move = (d) => { setDir(d); const x = new Date(Date.UTC(y, m - 1 + d, 1)); setView(x.toISOString().slice(0, 7)); };
  const tap = (d) => {
    if (!from || (from && to)) { setFrom(d); setTo(null); return; }
    if (d < from) { setTo(from); setFrom(d); } else setTo(d);
  };
  const end = to || from;
  const presets = PRESETS();
  const presetOn = (p) => from === p.from && end === p.to;
  const ready = from && end;
  const n = ready ? daysBetween(from, end) : 0;
  return (
    <div className="rp">
      <div className="rp-presets">
        {presets.map((x) => (
          <button key={x.id} type="button" className={'chip' + (presetOn(x.p) ? ' on' : '')} onClick={() => { setFrom(x.p.from); setTo(x.p.to); setView(x.p.to.slice(0, 7)); }}>{x.label}</button>
        ))}
      </div>
      <div className="rp-cal">
        <div className="rp-head">
          <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="Pichla mahina"><ChevronLeft size={20} /></button>
          <AnimatePresence mode="popLayout" initial={false}><motion.b key={view} initial={{ opacity: 0, x: dir * 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 20 }}>{MONTHS[m - 1]} {y}</motion.b></AnimatePresence>
          <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="Agla mahina"><ChevronRight size={20} /></button>
        </div>
        <div className="rp-grid rp-wd">{WD1.map((d, i) => <span key={i}>{d}</span>)}</div>
        <motion.div key={view} className="rp-grid" initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
          {cells.map((d, i) => {
            if (!d) return <span key={'x' + i} />;
            const inR = ready && d >= from && d <= end;
            const isS = d === from; const isE = d === end;
            const cls = ['rp-day', inR ? 'in' : '', isS ? 's' : '', isE ? 'e' : '', d === t ? 'today' : '', d > t ? 'future' : '', weekday(d) === 0 ? 'mon' : '', weekday(d) === 6 ? 'sun' : ''].join(' ');
            return <button type="button" key={d} className={cls} onClick={() => tap(d)}><span>{Number(d.slice(8))}</span></button>;
          })}
        </motion.div>
      </div>
      <p className="rp-sum">{!from ? 'Shuru ki tareekh chuno' : !to && from ? `${periodLabel({ kind: 'custom', from, to: from })}: ab aakhri tareekh chuno (ya isi din ka dekho)` : `${periodLabel({ kind: 'custom', from, to: end })}, ${n} din`}</p>
      <button type="button" className="btn primary wide" disabled={!ready} onClick={() => {
        const match = presets.find((x) => presetOn(x.p));
        onApply(match && match.p.kind !== 'custom' ? match.p : { kind: 'custom', from, to: end });
      }}><Check size={18} /> {applyLabel}</button>
    </div>
  );
}

export { addDays };
