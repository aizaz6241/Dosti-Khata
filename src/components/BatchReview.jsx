// AI ne kai entries banayi: pehle list dekho, theek karo, phir sab ek saath save
import { motion } from 'framer-motion';
import { Sparkles, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { catOf, num, rs } from '../lib';

export function itemOk(f) {
  if (!f) return false;
  const payer = f.type === 'expense' ? f.paidBy : f.from;
  return !!payer && Number(f.amount) > 0;
}

function shareLine(f, me, otherId, names) {
  const other = names[otherId];
  const amt = Number(f.amount) || 0;
  if (f.type !== 'expense') {
    const verb = f.type === 'loan' ? 'qarz diya' : 'bheje';
    return f.from === me ? `Aap ne ${other} ko ${rs(amt)} ${verb}` : f.from ? `${other} ne aap ko ${rs(amt)} ${verb}` : 'Kis ne diye? chuno';
  }
  if (!f.paidBy) return 'Kis ne diye? chuno';
  const owed = f.split === 'half' ? amt / 2 : f.split === 'full' ? amt : f.split === 'self' ? 0 : Number(f.owed) || 0;
  if (owed <= 0) return `${f.paidBy === me ? 'Aap' : other} ka apna kharcha`;
  return f.paidBy === me ? `${other} ne aap ko ${rs(owed)} dene` : `Aap ne ${other} ko ${rs(owed)} dene`;
}

export default function BatchReview({ items, transcript, me, otherId, names, colors, onEdit, onRemove, onSaveAll }) {
  const good = items.filter((i) => itemOk(i.form));
  const total = good.reduce((a, i) => a + (Number(i.form.amount) || 0), 0);
  return (
    <div className="batch">
      <div className="ai-banner">
        <p className="ai-head"><Sparkles size={15} /> AI ne {items.length} entries banayi hain. Dekh kar save karo.</p>
        <p className="ai-said">Aap ne kaha: <q>{transcript}</q></p>
      </div>

      <div className="batch-list">
        {items.map((it, i) => {
          const f = it.form;
          const cat = catOf(f.type === 'expense' ? f.category : f.type);
          const Icon = cat.icon;
          const ok = itemOk(f);
          const who = f.type === 'expense' ? f.paidBy : f.from;
          return (
            <motion.div key={it.id} layout className={'batch-item' + (ok ? '' : ' bad')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }}>
              <span className="entry-icon" style={{ '--c': colors[who] || '#9AA39F' }}><Icon size={19} /></span>
              <div className="bi-main">
                <p className="bi-title">{f.note || cat.label} <small>{cat.label}</small></p>
                <p className="bi-sum">{f.parts?.length > 1 ? `${f.parts.map(num).join(' + ')} = ` : ''}<b>{f.amount ? rs(f.amount) : 'Raqam?'}</b></p>
                <p className="bi-share">{shareLine(f, me, otherId, names)}</p>
                {!ok && <p className="bi-warn"><AlertTriangle size={13} /> {it.missing?.includes('amount') ? 'Raqam samajh nahi aayi' : 'Kis ne diye, bataya nahi'}: badlo dabao</p>}
                {ok && it.assumed?.length > 0 && <p className="bi-check">Andaza lagaya: check kar lo</p>}
              </div>
              <div className="bi-actions">
                <button className="icon-btn" onClick={() => onEdit(i)} aria-label="Badlo"><Pencil size={17} /></button>
                <button className="icon-btn danger" onClick={() => onRemove(i)} aria-label="Hatao"><Trash2 size={17} /></button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="batch-foot">
        <p>{good.length} entries, kul {rs(total)}</p>
        <button className="btn primary wide" disabled={!items.length || good.length !== items.length} onClick={onSaveAll}>
          {good.length !== items.length ? 'Pehle laal wali entry theek karo' : `Sab ${items.length} save karo`}
        </button>
      </div>
    </div>
  );
}
