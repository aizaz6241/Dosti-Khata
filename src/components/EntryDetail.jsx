import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Lock } from 'lucide-react';
import { cap, catOf, dayLabel, shotUrl, rs, timeLabel, view } from '../lib';
import { StatusPill } from './EntryRow';

export default function EntryDetail({ e, me, byId, names, colors, onEdit, onOpen }) {
  const [zoom, setZoom] = useState(false);
  const c = e.calc;
  const isPay = e.type === 'payment';
  const isLoan = e.type === 'loan';
  const cat = catOf(e.type === 'expense' ? e.category : e.type);
  const shot = shotUrl(e);
  const Icon = cat.icon;
  const v = view(e, me, names);
  const otherId = Object.keys(names).find((p) => p !== me);
  const linkTitle = (x) => (x ? cap(x.note) || (x.type === 'payment' ? 'Payment' : catOf(x.category).label) : 'Entry');
  const links = isPay ? c.cleared : isLoan ? [...c.cleared, ...c.settledBy] : c.settledBy;
  const canEdit = !e.createdBy || e.createdBy === me;

  return (
    <div className="detail">
      <div className="detail-top">
        <span className="entry-icon big" style={{ '--c': colors[e.type === 'expense' ? e.paidBy : e.from] }}><Icon size={24} /></span>
        <div>
          <p className="detail-amt">{rs(v.amount)}</p>
          <p className="detail-title">{cap(e.note) || cat.label}</p>
          <p className="detail-date">{dayLabel(e.date)}, {timeLabel(e)}</p>
        </div>
      </div>

      <dl className="facts">
        <div><dt>Kya hua</dt><dd>{v.line}</dd></div>
        {isPay ? (
          <>
            <div><dt>Purane hisaab mein lage</dt><dd>{rs(c.owed - c.left)}</dd></div>
            {c.left > 0 && <div><dt>Advance</dt><dd>{rs(c.left)} {e.to === me ? 'aap' : names[e.to]} ke paas</dd></div>}
          </>
        ) : v.personal ? (
          <div><dt>Hisaab par asar</dt><dd>Koi nahi</dd></div>
        ) : (
          <div><dt>{isLoan ? 'Qarz abhi baqi' : 'Abhi baqi'}</dt><dd>{rs(c.left)}</dd></div>
        )}
        <div><dt>Haalat</dt><dd><StatusPill e={e} /></dd></div>
        {e.createdBy && <div><dt>Likha</dt><dd>{e.createdBy === me ? 'Aap ne' : `${names[e.createdBy]} ne`}</dd></div>}
      </dl>

      {shot && (
        <section className="shot">
          <h3>{isLoan ? 'Qarz ka screenshot' : 'Payment ka screenshot'}</h3>
          <button className="shot-thumb" onClick={() => setZoom(true)} aria-label="Screenshot bara karo">
            <img src={shot} alt="Screenshot" loading="lazy" />
          </button>
        </section>
      )}

      {links.length > 0 && (
        <section className="links">
          <h3>{isPay ? 'Is payment se ye clear hue' : isLoan ? 'Hisaab mein kahan laga' : 'Ye kis se clear hua'}</h3>
          {links.map((l) => {
            const x = byId[l.id];
            const how = isPay || isLoan ? '' : x?.type === 'payment' ? ', payment se' : x?.type === 'loan' ? ', qarz se adjust' : ', doosre kharche se adjust';
            return (
              <button key={l.id} className="link-row" onClick={() => x && onOpen(x)}>
                <span>{linkTitle(x)}<small>{x ? `${dayLabel(x.date)}, ${timeLabel(x)}${how}` : ''}</small></span>
                <b>{rs(l.amount)}</b>
              </button>
            );
          })}
        </section>
      )}

      {canEdit ? (
        <button className="btn ghost wide" onClick={onEdit}><Pencil size={16} /> Entry badlo</button>
      ) : (
        <p className="locked-note"><Lock size={14} /> Ye entry {names[otherId]} ne likhi hai, sirf wohi badal sakta hai.</p>
      )}

      {createPortal(<AnimatePresence>
        {zoom && (
          <motion.div className="viewer" onClick={() => setZoom(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.img src={shot} alt="Screenshot" initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }} />
            <span>Band karne ke liye tap karo</span>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}
