// Muddat (hafta / mahina / saal / apni tareekhein) ke helpers. Hafta Peer (Monday) se shuru.
import { today } from '../lib';
import { addDays, daysBetween } from '../../server/money.js';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WD = ['Peer', 'Mangal', 'Budh', 'Jumeraat', 'Juma', 'Hafta', 'Itwaar']; // Monday pehle
export const WD1 = ['P', 'M', 'B', 'J', 'J', 'H', 'I'];
export { addDays, daysBetween };

const wd = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Peer
export const weekday = wd;
export const startOfWeek = (d) => addDays(d, -wd(d));
const lastOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n) => String(n).padStart(2, '0');

export function periodOf(kind, anchor = today()) {
  const [y, m] = anchor.split('-').map(Number);
  if (kind === 'week') { const f = startOfWeek(anchor); return { kind, from: f, to: addDays(f, 6) }; }
  if (kind === 'month') return { kind, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastOfMonth(y, m))}` };
  if (kind === 'year') return { kind, from: `${y}-01-01`, to: `${y}-12-31` };
  if (kind === 'all') return { kind, from: '2000-01-01', to: '2100-12-31' };
  return { kind: 'custom', from: anchor, to: anchor };
}

export function shiftPeriod(p, dir) {
  if (p.kind === 'week') return periodOf('week', addDays(p.from, 7 * dir));
  if (p.kind === 'month') { const [y, m] = p.from.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); return periodOf('month', d.toISOString().slice(0, 10)); }
  if (p.kind === 'year') return periodOf('year', `${Number(p.from.slice(0, 4)) + dir}-01-01`);
  if (p.kind === 'custom') { const n = daysBetween(p.from, p.to); return { kind: 'custom', from: addDays(p.from, n * dir), to: addDays(p.to, n * dir) }; }
  return p;
}

export const fmtDay = (d, withYear) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${SHORT[m - 1]}${withYear ? ' ' + y : ''}`; };
export function periodLabel(p) {
  if (p.kind === 'all') return 'Shuru se ab tak';
  if (p.kind === 'month') { const [y, m] = p.from.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
  if (p.kind === 'year') return p.from.slice(0, 4);
  if (p.from === p.to) return fmtDay(p.from, true);
  const sameY = p.from.slice(0, 4) === p.to.slice(0, 4);
  const sameM = sameY && p.from.slice(5, 7) === p.to.slice(5, 7);
  if (sameM) return `${Number(p.from.slice(8))} – ${fmtDay(p.to, p.to.slice(0, 4) !== today().slice(0, 4))}`;
  return `${fmtDay(p.from, !sameY)} – ${fmtDay(p.to, !sameY || p.to.slice(0, 4) !== today().slice(0, 4))}`;
}
export const isCurrent = (p) => { const t = today(); return t >= p.from && t <= p.to; };

// Chart ke liye: muddat ko din / hafte / mahine ke khanon mein baanto
export function buckets(p, minDate) {
  let { from, to } = p;
  if (p.kind === 'all') { from = minDate || today(); to = today(); }
  if (to > today() && from <= today() && p.kind !== 'year' && p.kind !== 'month' && p.kind !== 'week') to = today();
  const n = daysBetween(from, to);
  if (n <= 62) return Array.from({ length: n }, (_, i) => { const d = addDays(from, i); return { key: d, from: d, to: d, label: n <= 7 ? WD[wd(d)] : String(Number(d.slice(8))) }; });
  if (n <= 400) {
    const out = []; let s = startOfWeek(from);
    while (s <= to) { const e = addDays(s, 6); out.push({ key: s, from: s < from ? from : s, to: e > to ? to : e, label: fmtDay(s) }); s = addDays(s, 7); }
    if (n > 120) { // mahine
      const months = []; let [y, m] = from.split('-').map(Number);
      while (`${y}-${pad(m)}` <= to.slice(0, 7)) { const pm = periodOf('month', `${y}-${pad(m)}-01`); months.push({ key: pm.from, from: pm.from < from ? from : pm.from, to: pm.to > to ? to : pm.to, label: SHORT[m - 1] }); m++; if (m > 12) { m = 1; y++; } }
      return months;
    }
    return out;
  }
  const months = []; let [y, m] = from.split('-').map(Number);
  while (`${y}-${pad(m)}` <= to.slice(0, 7)) { const pm = periodOf('month', `${y}-${pad(m)}-01`); months.push({ key: pm.from, from: pm.from, to: pm.to, label: `${SHORT[m - 1]}${m === 1 ? " '" + String(y).slice(2) : ''}` }); m++; if (m > 12) { m = 1; y++; } }
  return months;
}

export const PRESETS = () => {
  const t = today();
  const lw = periodOf('week', addDays(t, -7));
  const lm = shiftPeriod(periodOf('month', t), -1);
  return [
    { id: 'today', label: 'Aaj', p: { kind: 'custom', from: t, to: t } },
    { id: 'week', label: 'Ye hafta', p: periodOf('week', t) },
    { id: 'lweek', label: 'Pichla hafta', p: lw },
    { id: 'd30', label: 'Pichle 30 din', p: { kind: 'custom', from: addDays(t, -29), to: t } },
    { id: 'month', label: 'Ye mahina', p: periodOf('month', t) },
    { id: 'lmonth', label: 'Pichla mahina', p: lm },
    { id: 'm3', label: '3 mahine', p: { kind: 'custom', from: shiftPeriod(periodOf('month', t), -2).from, to: periodOf('month', t).to } },
    { id: 'year', label: 'Ye saal', p: periodOf('year', t) },
  ];
};
