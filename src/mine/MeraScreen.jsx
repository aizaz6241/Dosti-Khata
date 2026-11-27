// "Mera Hisaab": apna paisa, apna kharcha, logon ka khata. Sirf aap ko dikhta hai.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, HandCoins, ChevronRight, FileDown, TrendingDown, TrendingUp, Lock, Search, X, MessageCircle } from 'lucide-react';
import { idOf, toPKR } from '../../server/money.js';
import { dayLabel, monthName, monthShort, shortDay, thisMonth, timeLabel } from '../lib';
import { catMeta, kindMeta, money, EXPENSE, TYPES } from './meta';

export function TxnRow({ t, accounts, contacts, onOpen, i = 0 }) {
  const m = catMeta(t);
  const Icon = m.icon;
  const acc = accounts.find((a) => idOf(a) === t.accountId);
  const to = accounts.find((a) => idOf(a) === t.toAccountId);
  const who = contacts.find((c) => idOf(c) === t.contactId);
  const cur = acc?.currency || 'PKR';
  const sign = t.type === 'transfer' ? 0 : t.type === 'adjust' ? Math.sign(t.amount) : TYPES[t.type]?.sign;
  const title = t.note || (t.type === 'expense' || t.type === 'income' ? m.label : `${TYPES[t.type].label}${who ? `: ${who.name}` : ''}`);
  const sub = t.type === 'transfer' ? `${acc?.name || '?'} se ${to?.name || '?'}` : [who && t.note ? who.name : null, acc?.name].filter(Boolean).join(', ');
  return (
    <motion.button className="entry" onClick={() => onOpen(t)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.02 }}>
      <span className={'entry-icon m-' + (sign > 0 ? 'in' : sign < 0 ? 'out' : 'mv')}><Icon size={18} /></span>
      <span className="entry-main">
        <span className="entry-title">{title}{t.pending && <span className="edited-tag">sync baqi</span>}</span>
        <span className="entry-sub"><span className="entry-time">{timeLabel(t)}</span>{sub}</span>
      </span>
      <span className="entry-side">
        <span className={'entry-amt ' + (sign > 0 ? 'mine' : sign < 0 ? 'theirs' : '')}>{sign > 0 ? '+' : sign < 0 ? '−' : ''}{money(Math.abs(t.amount), cur).replace('Rs ', '')}</span>
        {cur !== 'PKR' && <span className="pill mute">{cur}</span>}
      </span>
    </motion.button>
  );
}

function groupByDay(list) {
  const g = [];
  for (const t of list) { const last = g.at(-1); if (last && last.day === t.date) last.items.push(t); else g.push({ day: t.date, items: [t] }); }
  return g;
}
const sortTx = (a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

export default function MeraScreen({ mine, balances, people, report, month, setMonth, worth, owedToMe, iOwe, onAdd, onOpenAccount, onOpenContact, onOpenTxn, onNewAccount, onNewContact, onRates, onPdf, onAll }) {
  const accounts = mine.accounts.filter((a) => !a.archived);
  const contacts = mine.contacts.filter((c) => !c.archived);
  const recent = useMemo(() => [...mine.ptx].sort(sortTx).slice(0, 12), [mine.ptx]);
  const months = useMemo(() => [...new Set([thisMonth(), ...mine.ptx.map((t) => String(t.date).slice(0, 7))])].sort().reverse(), [mine.ptx]);
  const rates = mine.prefs?.rates || {};
  const cats = Object.entries(report.byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysIn }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, '0')}`; return { d, v: report.byDay[d] || 0 }; });
  const maxDay = Math.max(1, ...days.map((d) => d.v));
  const needRate = Object.keys(worth.unconverted).length > 0;

  if (!accounts.length) {
    return (
      <div className="screen">
        <header className="page-head"><h1>Mera Hisaab</h1><p className="private"><Lock size={13} /> Sirf aap ko dikhta hai. Abdullah ko nahi.</p></header>
        <div className="empty mera-empty">
          <p><b>Apna pehla account banao.</b> Cash, bank, JazzCash, Easypaisa, Binance: jahan jahan paise hain.</p>
          <button className="btn primary" onClick={onNewAccount}><Plus size={18} /> Account banao</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <section className="hero mera-hero">
        <p className="private light"><Lock size={12} /> Sirf aap ko dikhta hai</p>
        <p className="hero-line">Kul paisa</p>
        <p className="hero-amt">{money(worth.pkr)}</p>
        {needRate && <button className="hero-link" onClick={onRates}>{Object.entries(worth.unconverted).map(([c, v]) => money(v, c)).join(', ')} alag hain: rate likho</button>}
        <div className="worth-pills">
          <button onClick={() => document.getElementById('log')?.scrollIntoView({ behavior: 'smooth' })}><span>Logon par</span><b>{money(owedToMe)}</b></button>
          <button onClick={() => document.getElementById('log')?.scrollIntoView({ behavior: 'smooth' })}><span>Aap par</span><b>{money(iOwe)}</b></button>
        </div>
        <div className="quick4">
          {[
            ['expense', 'Kharcha', ArrowUpRight], ['income', 'Aamdani', ArrowDownLeft], ['transfer', 'Transfer', ArrowLeftRight], ['lend', 'Qarz', HandCoins],
          ].map(([t, l, I]) => (
            <motion.button key={t} whileTap={{ scale: 0.94 }} onClick={() => onAdd(t)}><span><I size={19} /></span>{l}</motion.button>
          ))}
        </div>
      </section>

      <div className="acc-row">
        {accounts.map((a) => {
          const K = kindMeta(a.kind).icon;
          const b = balances[idOf(a)] || 0;
          const pkr = a.currency !== 'PKR' ? toPKR(b, a.currency, rates) : null;
          return (
            <motion.button key={idOf(a)} className="acc-card" whileTap={{ scale: 0.97 }} onClick={() => onOpenAccount(a)}>
              <span className="acc-top"><K size={17} /> {a.name}</span>
              <b className={b < 0 ? 'neg' : ''}>{money(b, a.currency)}</b>
              <small>{pkr != null ? `≈ ${money(pkr)}` : a.currency !== 'PKR' ? 'rate nahi' : kindMeta(a.kind).label}</small>
            </motion.button>
          );
        })}
        <button className="acc-card add" onClick={onNewAccount}><Plus size={20} /> Naya account</button>
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>{monthName(month)}</h2>
          <div className="scroller mini">
            {months.slice(0, 6).map((mm) => <button key={mm} className={'chip' + (mm === month ? ' on' : '')} onClick={() => setMonth(mm)}>{monthShort(mm)}</button>)}
          </div>
        </header>
        <div className="mstats">
          <div><span>Kharcha</span><b>{money(report.spent)}</b></div>
          <div><span>Aamdani</span><b className="pos">{money(report.income)}</b></div>
          <div><span>Bacha</span><b className={report.saved < 0 ? 'neg' : 'pos'}>{money(report.saved)}</b></div>
        </div>
        {report.change != null && (
          <p className={'mchange ' + (report.change > 0 ? 'up' : 'down')}>
            {report.change > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {monthName(report.prev.month).split(' ')[0]} se {Math.abs(report.change)}% {report.change > 0 ? 'zyada' : 'kam'} kharcha
          </p>
        )}
        {report.spent > 0 && (
          <>
            <div className="day-chart" role="img" aria-label="Roz ka kharcha">
              {days.map((d, i) => (
                <motion.span key={d.d} className={d.v ? 'has mine' : ''} title={`${shortDay(d.d)}: ${money(d.v)}`}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.01, type: 'spring', stiffness: 200, damping: 22 }}
                  style={{ height: Math.max(3, (d.v / maxDay) * 100) + '%' }} />
              ))}
            </div>
            <div className="chart-axis"><span>1</span><span>{Math.ceil(daysIn / 2)}</span><span>{daysIn}</span></div>
            <p className="muted">Roz ka average {money(report.perDay)}.{report.biggest ? ` Sab se bara: ${report.biggest.note || catMeta(report.biggest).label}, ${money(report.biggest.pkr)}.` : ''}</p>
            <div className="cats">
              {cats.slice(0, 8).map(([id, v]) => {
                const c = EXPENSE.find((x) => x.id === id) || EXPENSE.at(-1); const I = c.icon;
                return (
                  <div key={id} className="cat-row">
                    <I size={17} /><span className="cat-name">{c.label}</span>
                    <span className="cat-bar"><motion.i className="mine" initial={{ width: 0 }} animate={{ width: (v / maxCat) * 100 + '%' }} /></span>
                    <b>{money(v)}</b>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {report.spent === 0 && report.income === 0 && <p className="muted">Is mahine abhi kuch nahi likha.</p>}
      </section>

      <section className="list-block" id="log">
        <header className="block-head">
          <h2>Logon ka khata</h2>
          <button className="text-btn" onClick={onNewContact}><Plus size={16} /> Banda</button>
        </header>
        {contacts.length === 0 ? (
          <div className="empty"><p>Kisi ko qarz diya ya liya? Banda jodo, phir har len-den tareekh ke saath yahan.</p></div>
        ) : (
          <div className="entries">
            {contacts.map((c) => {
              const l = people[idOf(c)] || { balance: {} };
              const bal = Object.entries(l.balance);
              return (
                <button key={idOf(c)} className="entry" onClick={() => onOpenContact(c)}>
                  <span className="who-av sm" style={{ '--c': '#5B6BD8' }}>{c.name[0]}</span>
                  <span className="entry-main">
                    <span className="entry-title">{c.name}</span>
                    <span className="entry-sub">{bal.length === 0 ? 'Hisaab barabar' : bal.map(([cur, v]) => (v > 0 ? `Aap ko ${money(v, cur)} dene hain` : `Aap ne ${money(-v, cur)} dene hain`)).join(', ')}</span>
                  </span>
                  <ChevronRight size={18} className="muted-i" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="list-block">
        <header className="block-head">
          <h2>Taaza len-den</h2>
          {mine.ptx.length > 0 && <button className="text-btn" onClick={onAll}>Sab dekho <ChevronRight size={16} /></button>}
        </header>
        {recent.length === 0 ? <div className="empty"><p>Abhi koi len-den nahi. Upar se kharcha ya aamdani likho.</p></div> : (
          <div className="entries">{recent.map((t, i) => <TxnRow key={idOf(t)} t={t} i={i} accounts={mine.accounts} contacts={mine.contacts} onOpen={onOpenTxn} />)}</div>
        )}
      </section>

      <div className="mera-foot">
        <button className="btn ghost wide" onClick={onPdf}><FileDown size={18} /> Poora hisaab PDF mein</button>
        {Object.keys(rates).length > 0 || mine.accounts.some((a) => a.currency !== 'PKR') ? <button className="text-btn" onClick={onRates}>Currency rate badlo</button> : null}
      </div>
    </div>
  );
}

/* ---------------- Sab len-den (search + filter) ---------------- */
export function AllTxns({ mine, onOpen }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [acc, setAcc] = useState('all');
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return [...mine.ptx].sort(sortTx).filter((t) => {
      if (type !== 'all' && !(type === 'loan' ? ['lend', 'borrow', 'got_back', 'paid_back'].includes(t.type) : t.type === type)) return false;
      if (acc !== 'all' && t.accountId !== acc && t.toAccountId !== acc) return false;
      if (!ql) return true;
      const who = mine.contacts.find((c) => idOf(c) === t.contactId)?.name || '';
      return [t.note, catMeta(t).label, who, String(Math.round(Math.abs(t.amount)))].join(' ').toLowerCase().includes(ql);
    });
  }, [mine, q, type, acc]);
  return (
    <div className="all-tx">
      <label className="search">
        <Search size={19} className="s-icon" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dhoondo: bijli, Ali, 5000..." />
        {q && <button className="icon-btn s-clear" onClick={() => setQ('')} aria-label="Saaf karo"><X size={17} /></button>}
      </label>
      <div className="scroller">
        {[['all', 'Sab'], ['expense', 'Kharche'], ['income', 'Aamdani'], ['transfer', 'Transfer'], ['loan', 'Qarz']].map(([id, l]) => (
          <button key={id} className={'chip ghost' + (type === id ? ' on' : '')} onClick={() => setType(id)}>{l}</button>
        ))}
      </div>
      <div className="scroller">
        <button className={'chip' + (acc === 'all' ? ' on' : '')} onClick={() => setAcc('all')}>Sab accounts</button>
        {mine.accounts.map((a) => <button key={idOf(a)} className={'chip' + (acc === idOf(a) ? ' on' : '')} onClick={() => setAcc(idOf(a))}>{a.name}</button>)}
      </div>
      {list.length === 0 ? <div className="empty"><p>Kuch nahi mila.</p></div> : groupByDay(list).map((g) => (
        <section key={g.day} className="day-group">
          <h3>{dayLabel(g.day)}</h3>
          <div className="entries">{g.items.map((t, i) => <TxnRow key={idOf(t)} t={t} i={i} accounts={mine.accounts} contacts={mine.contacts} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Account ---------------- */
export function AccountDetail({ a, balance, mine, rates, onOpen, onAdjust, onEdit, onAdd }) {
  const key = idOf(a);
  const list = [...mine.ptx].filter((t) => t.accountId === key || t.toAccountId === key).sort(sortTx);
  const K = kindMeta(a.kind).icon;
  const pkr = a.currency !== 'PKR' ? toPKR(balance, a.currency, rates) : null;
  return (
    <div className="detail">
      <div className="detail-top">
        <span className="entry-icon big m-mv"><K size={24} /></span>
        <div>
          <p className="detail-amt">{money(balance, a.currency)}</p>
          <p className="detail-title">{a.name}</p>
          <p className="detail-date">{kindMeta(a.kind).label}{pkr != null ? `, ≈ ${money(pkr)}` : ''}</p>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={() => onAdd('expense')}>Kharcha</button>
        <button className="btn ghost" onClick={() => onAdd('income')}>Aamdani</button>
        <button className="btn ghost" onClick={onAdjust}>Balance theek karo</button>
      </div>
      {list.length === 0 ? <p className="muted center">Is account mein abhi koi len-den nahi.</p> : groupByDay(list).map((g) => (
        <section key={g.day} className="day-group">
          <h3>{dayLabel(g.day)}</h3>
          <div className="entries">{g.items.map((t, i) => <TxnRow key={idOf(t)} t={t} i={i} accounts={mine.accounts} contacts={mine.contacts} onOpen={onOpen} />)}</div>
        </section>
      ))}
      <button className="btn ghost wide" onClick={onEdit}>Account badlo</button>
    </div>
  );
}

/* ---------------- Banda ---------------- */
export function ContactDetail({ c, ledger, mine, onOpen, onAdd, onEdit }) {
  const bal = Object.entries(ledger?.balance || {});
  const hist = [...(ledger?.history || [])].reverse();
  const remind = () => {
    const [cur, v] = bal.find(([, x]) => x > 0) || [];
    if (!v) return;
    const text = `Assalam o Alaikum ${c.name}! Mere hisaab se aap ne ${money(v, cur)} wapas dene hain. Jab aasani ho, bhej dijiye. Shukriya!`;
    const phone = String(c.phone || '').replace(/\D/g, '').replace(/^0/, '92');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };
  return (
    <div className="detail">
      <div className="detail-top">
        <span className="who-av" style={{ '--c': '#5B6BD8', width: 54, height: 54, fontSize: 22 }}>{c.name[0]}</span>
        <div>
          <p className="detail-title big">{c.name}</p>
          {bal.length === 0 ? <p className="detail-date">Hisaab barabar hai</p> : bal.map(([cur, v]) => (
            <p key={cur} className={'contact-bal ' + (v > 0 ? 'pos' : 'neg')}>{v > 0 ? `Aap ko ${money(v, cur)} wapas dene hain` : `Aap ne ${money(-v, cur)} wapas dene hain`}</p>
          ))}
        </div>
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={() => onAdd('lend')}>Qarz diya</button>
        <button className="btn ghost" onClick={() => onAdd('got_back')}>Wapas mila</button>
        <button className="btn ghost" onClick={() => onAdd('borrow')}>Qarz liya</button>
        <button className="btn ghost" onClick={() => onAdd('paid_back')}>Wapas diya</button>
      </div>
      {bal.some(([, v]) => v > 0) && <button className="hero-link dark" onClick={remind}><MessageCircle size={15} /> WhatsApp par yaad dilao</button>}
      {hist.length === 0 ? <p className="muted center">Abhi koi len-den nahi.</p> : (
        <div className="ledger">
          <div className="ledger-head"><span>Tareekh</span><span>Kya hua</span><span>Raqam</span><span>Baqi</span></div>
          {hist.map((h) => (
            <button key={idOf(h)} className="ledger-row" onClick={() => onOpen(h)}>
              <span>{shortDay(h.date)}</span>
              <span>{TYPES[h.type].label}{h.note ? <small>{h.note}</small> : null}</span>
              <span className={h.delta > 0 ? 'pos' : 'neg'}>{h.delta > 0 ? '+' : '−'}{money(Math.abs(h.delta), h.currency).replace('Rs ', '')}</span>
              <span>{money(h.running, h.currency).replace('Rs ', '')}</span>
            </button>
          ))}
          <p className="hint">+ matlab {c.name} par aap ke paise barhe, − matlab ghate. "Baqi" us din ke baad ka hisaab.</p>
        </div>
      )}
      <button className="btn ghost wide" onClick={onEdit}>Naam / phone badlo</button>
    </div>
  );
}
