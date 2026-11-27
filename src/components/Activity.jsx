import { useState } from 'react';
import { motion } from 'framer-motion';
import { FilePlus2, Pencil, Trash2, BadgeCheck } from 'lucide-react';
import { shareOf } from '../../server/activity.js';
import { cap, catOf, dayLabel, rs } from '../lib';

const ICONS = { create: FilePlus2, update: Pencil, delete: Trash2, confirm: BadgeCheck };

const clock = (iso) => {
  const d = new Date(iso);
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
};
const localDay = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const whenTxt = (v) => {
  if (!v) return '';
  const [date, time] = String(v).split(' ');
  if (!time) return dayLabel(date);
  let [h, m] = time.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${dayLabel(date)}, ${h}:${String(m).padStart(2, '0')} ${ap}`;
};

// Activity sirf us ko dikhe jis ka is se taalluq ho (doosre ka apna kharcha nahi)
export const relevant = (a, me, ids) => a.by === me || shareOf(a.before, ids) > 0 || shareOf(a.after, ids) > 0;

export function changeLines(a, me, names) {
  const who = (id) => (id === me ? 'Aap' : names[id]);
  const out = [];
  for (const c of a.changes || []) {
    if (c.f === 'share') out.push({ k: 'Raqam', from: rs(c.from), to: rs(c.to), main: true });
    else if (c.f === 'amount') { if (a.by === me) out.push({ k: 'Kul bill', from: rs(c.from), to: rs(c.to) }); }
    else if (c.f === 'paidBy' || c.f === 'from') out.push({ k: 'Kis ne diye', from: who(c.from), to: who(c.to) });
    else if (c.f === 'note') out.push({ k: 'Naam', from: c.from || '(khali)', to: c.to || '(khali)' });
    else if (c.f === 'category') out.push({ k: 'Qisam', from: catOf(c.from).label, to: catOf(c.to).label });
    else if (c.f === 'when') out.push({ k: 'Waqt', from: whenTxt(c.from), to: whenTxt(c.to) });
    else if (c.f === 'shot') out.push({ k: 'Screenshot', text: c.to ? 'Screenshot lagaya' : 'Screenshot hataya' });
  }
  return out;
}

export function ChangeList({ lines }) {
  if (!lines.length) return null;
  return (
    <ul className="changes">
      {lines.map((l, i) => (
        <li key={i} className={l.main ? 'main' : ''}>
          <span className="ck">{l.k}</span>
          {l.text ? <span>{l.text}</span> : <span><s>{l.from}</s><b>{l.to}</b></span>}
        </li>
      ))}
    </ul>
  );
}

export default function ActivityView({ activity, me, ids, names, colors, byKey, onOpen }) {
  const [only, setOnly] = useState('all');
  const otherId = ids.find((p) => p !== me);
  const list = activity.filter((a) => relevant(a, me, ids) && (only === 'all' || (only === 'edits' ? a.action !== 'create' : a.by === otherId)));
  const groups = [];
  for (const a of list) {
    const d = localDay(a.at);
    const g = groups.at(-1);
    if (g && g.day === d) g.items.push(a); else groups.push({ day: d, items: [a] });
  }
  const label = (a) => {
    const s = a.after || a.before;
    const title = cap(s?.note) || catOf(s?.type === 'expense' ? s?.category : s?.type).label;
    const verb = { create: 'nayi entry likhi', update: 'entry badli', delete: 'entry delete ki', confirm: 'tasdeeq ki: paise mil gaye ✓' }[a.action];
    return { who: a.by === me ? 'Aap' : names[a.by], verb, title, amount: shareOf(s, ids) };
  };

  return (
    <div className="screen">
      <header className="page-head">
        <h1>Activity</h1>
        <p>Kis ne kab kya likha, badla ya delete kiya</p>
      </header>
      <div className="scroller">
        {[{ id: 'all', t: 'Sab' }, { id: 'edits', t: 'Sirf tabdeeli aur delete' }, { id: 'other', t: `Sirf ${names[otherId]}` }].map((f) => (
          <button key={f.id} className={'chip ghost' + (only === f.id ? ' on' : '')} onClick={() => setOnly(f.id)}>{f.t}</button>
        ))}
      </div>
      {groups.length === 0 ? <div className="empty"><p>Abhi koi activity nahi.</p></div> : groups.map((g) => (
        <section key={g.day} className="day-group">
          <h3>{dayLabel(g.day)}</h3>
          <div className="entries">
            {g.items.map((a, i) => {
              const L = label(a); const Icon = ICONS[a.action];
              const exists = byKey[a.key];
              const lines = a.action === 'update' ? changeLines(a, me, names) : [];
              return (
                <motion.button key={a._id || i} className={'act act-' + a.action} disabled={!exists} onClick={() => exists && onOpen(exists)}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.02 }}>
                  <span className="act-icon" style={{ '--c': colors[a.by] }}><Icon size={17} /></span>
                  <span className="act-main">
                    <span className="act-title"><b>{L.who}</b> ne {L.verb}</span>
                    <span className="act-sub">{L.title}{a.action !== 'update' ? `, ${rs(L.amount)}` : ''}</span>
                    <ChangeList lines={lines} />
                  </span>
                  <span className="act-time">{clock(a.at)}</span>
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
