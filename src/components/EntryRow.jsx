import { motion } from 'framer-motion';
import { Check, Paperclip, CloudUpload, BadgeCheck } from 'lucide-react';
import { cap, catOf, num, rs, timeLabel, view } from '../lib';

export function StatusPill({ e }) {
  const c = e.calc;
  if (c.status === 'personal') return <span className="pill mute">Apna kharcha</span>;
  if (e.type === 'expense' || e.type === 'loan') {
    if (c.status === 'clear') return <span className="pill ok"><Check size={13} strokeWidth={3} /> Clear</span>;
    if (c.status === 'partial') return <span className="pill part">{rs(c.left)} baqi</span>;
    return <span className="pill due">Baqi</span>;
  }
  if (c.status === 'used') return <span className="pill ok"><Check size={13} strokeWidth={3} /> Lag gaye</span>;
  return <span className="pill adv">{rs(c.left)} advance</span>;
}

export default function EntryRow({ e, me, names, colors, onOpen, index = 0 }) {
  const needsMe = e.type !== 'expense' && !e.confirmedAt && e.to === me;
  const isPay = e.type !== 'expense';
  const cat = catOf(isPay ? e.type : e.category);
  const Icon = cat.icon;
  const v = view(e, me, names);
  const who = isPay ? e.from : e.paidBy;
  const title = cap(e.note) || cat.label;

  return (
    <motion.button
      layout
      className={'entry' + (isPay ? ' is-pay' : '') + (v.personal ? ' is-personal' : '')}
      onClick={() => onOpen(e)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.025 }}
    >
      <span className="entry-icon" style={{ '--c': colors[who] }}>
        <Icon size={19} />
      </span>
      <span className="entry-main">
        <span className="entry-title">{title}{(e.fileId || e.fileUrl) && <Paperclip size={13} className="clip" aria-label="Screenshot laga hai" />}{e.pending && <CloudUpload size={14} className="clip pending" aria-label="Abhi sync honi hai" />}{e.type !== 'expense' && e.confirmedAt && <BadgeCheck size={15} className="clip ok" aria-label="Mil gaye, tasdeeq shuda" />}{needsMe && <span className="edited-tag ask">tasdeeq karo</span>}{e.edits?.length > 0 && <span className="edited-tag">badli gayi</span>}</span>
        <span className="entry-sub"><span className="entry-time">{timeLabel(e)}</span>{v.line}</span>
      </span>
      <span className="entry-side">
        <span className={'entry-amt ' + (v.mine ? 'mine' : 'theirs')}>{num(v.amount)}</span>
        <StatusPill e={e} />
      </span>
    </motion.button>
  );
}
