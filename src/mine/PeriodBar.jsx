// Hafta / Mahina / Saal / Apni tareekhein + aage peeche
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { periodOf, shiftPeriod, periodLabel, isCurrent } from './period';

const KINDS = [['week', 'Hafta'], ['month', 'Mahina'], ['year', 'Saal'], ['custom', 'Apni']];

export default function PeriodBar({ period, setPeriod, onPick, withAll }) {
  const kinds = withAll ? [...KINDS.slice(0, 3), ['all', 'Sab'], KINDS[3]] : KINDS;
  return (
    <div className="pbar">
      <div className="pseg" role="tablist">
        {kinds.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={period.kind === k} className={period.kind === k ? 'on' : ''}
            onClick={() => (k === 'custom' ? onPick() : setPeriod(periodOf(k)))}>
            {period.kind === k && <motion.span layoutId={'pseg-' + (withAll ? 'a' : 'b')} className="pseg-thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <span>{l}</span>
          </button>
        ))}
      </div>
      {period.kind !== 'all' && (
        <div className="pnav">
          <button className="icon-btn" onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Pichla"><ChevronLeft size={20} /></button>
          <button className="pnav-label" onClick={onPick}><CalendarRange size={16} /> {periodLabel(period)}</button>
          <button className="icon-btn" onClick={() => setPeriod(shiftPeriod(period, 1))} disabled={isCurrent(period) && period.kind !== 'custom'} aria-label="Agla"><ChevronRight size={20} /></button>
        </div>
      )}
    </div>
  );
}
