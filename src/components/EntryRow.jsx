import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cap, catOf, num, rs } from '../lib';

export function splitText(e, names) {
  if (e.split === 'half') return 'aadha-aadha';
  if (e.split === 'a') return `sirf ${names.aizaz} ka`;
  if (e.split === 'b') return `sirf ${names.abdullah} ka`;
  return 'apni marzi ka hissa';
}

export function StatusPill({ e }) {
  const c = e.calc;
  if (e.type === 'expense') {
    if (c.status === 'clear') return <span className="pill ok"><Check size={13} strokeWidth={3} /> Clear</span>;
    if (c.status === 'partial') return <span className="pill part">{rs(c.left)} baqi</span>;
    if (c.status === 'pending') return <span className="pill due">{rs(c.left)} baqi</span>;
    return <span className="pill mute">Apna kharcha</span>;
  }
  if (c.status === 'used') return <span className="pill ok"><Check size={13} strokeWidth={3} /> Adjust ho gaye</span>;
  return <span className="pill adv">{rs(c.left)} advance</span>;
}

export default function EntryRow({ e, names, colors, onOpen, index = 0 }) {
  const cat = catOf(e.type === 'payment' ? 'payment' : e.category);
  const Icon = cat.icon;
  const isPay = e.type === 'payment';
  const who = isPay ? e.from : e.paidBy;
  const title = cap(e.note) || (isPay ? `${names[e.from]} ne paise diye` : cat.label);
  const sub = isPay
    ? `${names[e.from]} se ${names[e.to]} ko`
    : `${names[e.paidBy]} ne diye, ${splitText(e, names)}`;

  return (
    <motion.button
      layout
      className={'entry' + (isPay ? ' is-pay' : '')}
      onClick={() => onOpen(e)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.025 }}
    >
      <span className="entry-icon" style={{ '--c': colors[who] }}>
        <Icon size={19} />
      </span>
      <span className="entry-main">
        <span className="entry-title">{title}</span>
        <span className="entry-sub">{sub}</span>
      </span>
      <span className="entry-side">
        <span className="entry-amt">{num(e.amount)}</span>
        <StatusPill e={e} />
      </span>
    </motion.button>
  );
}
