import { Pencil } from 'lucide-react';
import { cap, catOf, dayLabel, rs } from '../lib';
import { StatusPill, splitText } from './EntryRow';

export default function EntryDetail({ e, byId, names, colors, onEdit, onOpen }) {
  const c = e.calc;
  const isPay = e.type === 'payment';
  const cat = catOf(isPay ? 'payment' : e.category);
  const Icon = cat.icon;
  const linkTitle = (x) => x ? (cap(x.note) || (x.type === 'payment' ? 'Payment' : catOf(x.category).label)) : 'Entry';

  const links = isPay ? c.cleared : c.settledBy;

  return (
    <div className="detail">
      <div className="detail-top">
        <span className="entry-icon big" style={{ '--c': colors[isPay ? e.from : e.paidBy] }}><Icon size={24} /></span>
        <div>
          <p className="detail-amt">{rs(e.amount)}</p>
          <p className="detail-title">{cap(e.note) || cat.label}</p>
          <p className="detail-date">{dayLabel(e.date)}{e.createdBy ? `, ${names[e.createdBy]} ne likha` : ''}</p>
        </div>
      </div>

      <dl className="facts">
        {isPay ? (
          <>
            <div><dt>Diye</dt><dd><b style={{ color: colors[e.from] }}>{names[e.from]}</b> ne <b style={{ color: colors[e.to] }}>{names[e.to]}</b> ko</dd></div>
            <div><dt>Purane hisaab mein lage</dt><dd>{rs(c.owed - c.left)}</dd></div>
            {c.left > 0 && <div><dt>Advance</dt><dd>{rs(c.left)} {names[e.to]} ke paas</dd></div>}
          </>
        ) : (
          <>
            <div><dt>Pay kiya</dt><dd><b style={{ color: colors[e.paidBy] }}>{names[e.paidBy]}</b> ne</dd></div>
            <div><dt>Hissa</dt><dd>{splitText(e, names)}</dd></div>
            {Object.entries(e.shares || {}).map(([p, v]) => (
              <div key={p}><dt>{names[p]} ka hissa</dt><dd>{rs(v)}</dd></div>
            ))}
            {c.owed > 0 && <div><dt>{names[c.debtor]} ne dene the</dt><dd>{rs(c.owed)}</dd></div>}
            {c.owed > 0 && <div><dt>Abhi baqi</dt><dd>{rs(c.left)}</dd></div>}
          </>
        )}
        <div><dt>Haalat</dt><dd><StatusPill e={e} /></dd></div>
      </dl>

      {links.length > 0 && (
        <section className="links">
          <h3>{isPay ? 'Is payment se ye clear hue' : 'Ye kis se clear hua'}</h3>
          {links.map((l) => {
            const x = byId[l.id];
            return (
              <button key={l.id} className="link-row" onClick={() => x && onOpen(x)}>
                <span>{linkTitle(x)}<small>{x ? dayLabel(x.date) : ''}</small></span>
                <b>{rs(l.amount)}</b>
              </button>
            );
          })}
        </section>
      )}

      <button className="btn ghost wide" onClick={onEdit}><Pencil size={16} /> Entry badlo</button>
    </div>
  );
}
