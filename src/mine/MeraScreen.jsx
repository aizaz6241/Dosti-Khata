// "Mera Hisaab": apna paisa, apna kharcha, logon ka khata. Sirf aap ko dikhta hai.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, HandCoins, ChevronRight, FileDown, TrendingDown, TrendingUp, Lock, Search, X, MessageCircle, PiggyBank, CalendarDays, Users, Flame } from 'lucide-react';
import { idOf, toPKR } from '../../server/money.js';
import { dayLabel, monthName, monthShort, shortDay, thisMonth, timeLabel } from '../lib';
import { catMeta, kindMeta, money, EXPENSE, INCOME, KINDS, TYPES } from './meta';

export function TxnRow({ t, accounts, contacts, onOpen, i = 0, otherName = 'Dost' }) {
  const m = catMeta(t);
  const Icon = m.icon;
  const acc = accounts.find((a) => idOf(a) === t.accountId);
  const to = accounts.find((a) => idOf(a) === t.toAccountId);
  const who = contacts.find((c) => idOf(c) === t.contactId);
  const cur = acc?.currency || 'PKR';
  const sign = t.type === 'transfer' ? 0 : t.type === 'adjust' ? Math.sign(t.amount) : TYPES[t.type]?.sign;
  const khataTitle = { expense: `${otherName} ke saath kharcha`, payment: t.type === 'khata_out' ? `${otherName} ko bheje` : `${otherName} se mile`, loan: t.type === 'khata_out' ? `${otherName} ko qarz` : `${otherName} se qarz` }[t.khataType];
  const title = t.note || (t.synthetic ? khataTitle : t.type === 'expense' || t.type === 'income' ? m.label : `${TYPES[t.type].label}${who ? `: ${who.name}` : ''}`);
  const sub = t.type === 'transfer' ? `${acc?.name || '?'} se ${to?.name || '?'}` : t.synthetic ? `Dosti khata, ${acc?.name || '?'}` : [who && t.note ? who.name : null, acc?.name, !acc && t.contactId ? 'Purana hisaab' : null].filter(Boolean).join(', ');
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

const ago = (at) => {
  if (!at) return '';
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? 'abhi' : m < 60 ? `${m} min pehle` : `${Math.round(m / 60)} ghante pehle`;
};

// Live rate ki line (sirf jab koi non-PKR account ho)
export function RateLine({ accounts, rates, live, prefs, onRates, light }) {
  const used = [...new Set(accounts.filter((a) => !a.archived && a.currency !== 'PKR').map((a) => a.currency))];
  if (!used.length) return null;
  return (
    <button className={'rate-line' + (light ? ' light' : '')} onClick={onRates}>
      {used.map((c) => {
        const manual = (prefs?.manual || []).includes(c);
        const r = rates[c];
        return (
          <span key={c}>
            {!manual && live?.rates?.[c] ? <i className="live-dot" /> : null}
            1 {c} = {r ? money(r) : '?'}
            <small>{r ? (manual ? 'aap ka likha' : live?.sources?.[c] ? `${live.sources[c]}, ${ago(live.at)}` : 'purana rate') : 'rate likho'}</small>
          </span>
        );
      })}
    </button>
  );
}

function AccCard({ a, b, rates, onOpen }) {
  const K = kindMeta(a.kind).icon;
  const pkr = a.currency !== 'PKR' ? toPKR(b, a.currency, rates) : null;
  return (
    <motion.button className="acc-card" whileTap={{ scale: 0.97 }} onClick={() => onOpen(a)}>
      <span className="acc-top"><K size={17} /> {a.name}</span>
      <b className={b < 0 ? 'neg' : ''}>{money(b, a.currency)}</b>
      <small>{pkr != null ? `≈ ${money(pkr)}` : a.currency !== 'PKR' ? 'rate nahi' : kindMeta(a.kind).label}</small>
    </motion.button>
  );
}

function EmptyMera({ onNewAccount, otherName }) {
  return (
    <div className="screen">
      <header className="page-head"><h1>Mera Hisaab</h1><p className="private"><Lock size={13} /> Sirf aap ko dikhta hai. {otherName} ko nahi.</p></header>
      <div className="empty mera-empty">
        <p><b>Apna pehla account banao.</b> Cash, bank, JazzCash, Easypaisa, Binance: jahan jahan paise hain.</p>
        <button className="btn primary" onClick={onNewAccount}><Plus size={18} /> Account banao</button>
      </div>
    </div>
  );
}

/* ---------------- Home ---------------- */
export function MeraHome({ mine, allTx, balances, report, worth, owedToMe, iOwe, rates, live, otherName, onAdd, onOpenAccount, onOpenTxn, onNewAccount, onRates, onAll, onGo }) {
  const accounts = mine.accounts.filter((a) => !a.archived);
  const recent = useMemo(() => [...allTx].sort(sortTx).slice(0, 8), [allTx]);
  if (!accounts.length) return <EmptyMera onNewAccount={onNewAccount} otherName={otherName} />;
  const needRate = Object.keys(worth.unconverted).length > 0;
  return (
    <div className="screen">
      <section className="hero mera-hero">
        <p className="private light"><Lock size={12} /> Sirf aap ko dikhta hai</p>
        <p className="hero-line">Kul paisa</p>
        <motion.p className="hero-amt" key={Math.round(worth.pkr)} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }}>{money(worth.pkr)}</motion.p>
        {needRate ? <button className="hero-link" onClick={onRates}>{Object.entries(worth.unconverted).map(([c, v]) => money(v, c)).join(', ')} alag hain: rate likho</button>
          : <RateLine accounts={accounts} rates={rates} live={live} prefs={mine.prefs} onRates={onRates} light />}
        <div className="worth-pills">
          <button onClick={() => onGo('people')}><span>Logon par</span><b>{money(owedToMe)}</b></button>
          <button onClick={() => onGo('people')}><span>Aap par</span><b>{money(iOwe)}</b></button>
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
        {accounts.map((a) => <AccCard key={idOf(a)} a={a} b={balances[idOf(a)] || 0} rates={rates} onOpen={onOpenAccount} />)}
        <button className="acc-card add" onClick={onNewAccount}><Plus size={20} /> Naya account</button>
      </div>

      <motion.button className="month-mini" whileTap={{ scale: 0.98 }} onClick={() => onGo('analytics')}>
        <span className="mm-head"><b>{monthName(report.month)}</b><span>Analytics <ChevronRight size={15} /></span></span>
        <span className="mm-stats">
          <span><small>Kharcha</small><b>{money(report.spent)}</b></span>
          <span><small>Aamdani</small><b className="pos">{money(report.income)}</b></span>
          <span><small>Bacha</small><b className={report.saved < 0 ? 'neg' : 'pos'}>{money(report.saved)}</b></span>
        </span>
        {report.khata > 0 && <span className="mm-note">Kharche mein {otherName} wale khate ka aap ka hissa {money(report.khata)} bhi shamil hai</span>}
      </motion.button>

      <section className="list-block">
        <header className="block-head">
          <h2>Taaza len-den</h2>
          {allTx.length > 0 && <button className="text-btn" onClick={onAll}>Sab dekho <ChevronRight size={16} /></button>}
        </header>
        {recent.length === 0 ? <div className="empty"><p>Abhi koi len-den nahi. Upar se kharcha ya aamdani likho.</p></div> : (
          <div className="entries">{recent.map((t, i) => <TxnRow key={idOf(t)} t={t} i={i} accounts={mine.accounts} contacts={mine.contacts} otherName={otherName} onOpen={onOpenTxn} />)}</div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Accounts ---------------- */
export function MeraAccounts({ mine, balances, worth, rates, live, otherName, onOpenAccount, onNewAccount, onRates, onAdd }) {
  const accounts = mine.accounts.filter((a) => !a.archived);
  if (!accounts.length) return <EmptyMera onNewAccount={onNewAccount} otherName={otherName} />;
  const groups = KINDS.map((k) => ({ k, list: accounts.filter((a) => (kindMeta(a.kind).id) === k.id) })).filter((g) => g.list.length);
  return (
    <div className="screen">
      <header className="page-head row">
        <div><h1>Accounts</h1><p className="muted">Kul {money(worth.pkr)}{Object.keys(worth.unconverted).length ? ' + ' + Object.entries(worth.unconverted).map(([c, v]) => money(v, c)).join(', ') : ''}</p></div>
        <button className="btn ghost small-g" onClick={() => onAdd('transfer')}><ArrowLeftRight size={16} /> Transfer</button>
      </header>
      <RateLine accounts={accounts} rates={rates} live={live} prefs={mine.prefs} onRates={onRates} />
      {groups.map(({ k, list }) => (
        <section key={k.id} className="acc-group">
          <h3>{k.label}</h3>
          <div className="entries">
            {list.map((a) => {
              const K = kindMeta(a.kind).icon; const b = balances[idOf(a)] || 0;
              const pkr = a.currency !== 'PKR' ? toPKR(b, a.currency, rates) : null;
              const share = worth.pkr > 0 ? Math.max(0, Math.min(100, ((pkr ?? (a.currency === 'PKR' ? b : 0)) / worth.pkr) * 100)) : 0;
              return (
                <motion.button key={idOf(a)} className="entry acc-line" whileTap={{ scale: 0.98 }} onClick={() => onOpenAccount(a)}>
                  <span className="entry-icon m-mv"><K size={18} /></span>
                  <span className="entry-main">
                    <span className="entry-title">{a.name}</span>
                    <span className="acc-share"><motion.i initial={{ width: 0 }} animate={{ width: share + '%' }} /></span>
                  </span>
                  <span className="entry-side">
                    <span className={'entry-amt' + (b < 0 ? ' theirs' : '')}>{money(b, a.currency)}</span>
                    {pkr != null && <span className="entry-sub">≈ {money(pkr)}</span>}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}
      <button className="btn ghost wide" onClick={onNewAccount}><Plus size={18} /> Naya account</button>
    </div>
  );
}

/* ---------------- Analytics ---------------- */
export function MeraAnalytics({ mine, report, month, setMonth, reportFor, otherName, onPdf }) {
  const months = useMemo(() => {
    const set = new Set([thisMonth(), ...mine.ptx.map((t) => String(t.date).slice(0, 7))]);
    return [...set].sort().reverse();
  }, [mine.ptx]);
  const cats = Object.entries(report.byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;
  const inc = Object.entries(report.inCat).sort((a, b) => b[1] - a[1]);
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysIn }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, '0')}`; return { d, v: report.byDay[d] || 0 }; });
  const maxDay = Math.max(1, ...days.map((d) => d.v));
  const trend = useMemo(() => {
    const out = []; const d = new Date(y, m - 1, 1);
    for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; const r = reportFor(k); out.push({ k, spent: r.spent, income: r.income }); }
    return out;
  }, [y, m, reportFor]);
  const maxT = Math.max(1, ...trend.flatMap((t) => [t.spent, t.income]));
  const rate = report.income > 0 ? Math.round((report.saved / report.income) * 100) : null;
  return (
    <div className="screen">
      <header className="page-head"><h1>Analytics</h1></header>
      <div className="scroller">
        {months.slice(0, 12).map((mm) => <button key={mm} className={'chip' + (mm === month ? ' on' : '')} onClick={() => setMonth(mm)}>{monthShort(mm)}</button>)}
      </div>

      <section className="panel">
        <header className="panel-head"><h2>{monthName(month)}</h2></header>
        <div className="mstats">
          <div><span>Kharcha</span><b>{money(report.spent)}</b></div>
          <div><span>Aamdani</span><b className="pos">{money(report.income)}</b></div>
          <div><span>Bacha</span><b className={report.saved < 0 ? 'neg' : 'pos'}>{money(report.saved)}</b></div>
        </div>
        <div className="insights">
          {rate != null && <p><PiggyBank size={16} /> Aamdani ka <b>{rate}%</b> {rate >= 0 ? 'bacha' : 'zyada kharch hua'}</p>}
          {report.change != null && (
            <p className={report.change > 0 ? 'up' : 'down'}>
              {report.change > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {monthName(report.prev.month).split(' ')[0]} se <b>{Math.abs(report.change)}%</b> {report.change > 0 ? 'zyada' : 'kam'} kharcha
            </p>
          )}
          {report.spent > 0 && <p><CalendarDays size={16} /> Roz ka average <b>{money(report.perDay)}</b></p>}
          {report.khata > 0 && <p><Users size={16} /> {otherName} wale khate ka aap ka hissa <b>{money(report.khata)}</b></p>}
          {report.biggest && <p><Flame size={16} /> Sab se bara: <b>{report.biggest.note || catMeta(report.biggest).label}, {money(report.biggest.pkr)}</b></p>}
        </div>
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
          </>
        )}
        {report.spent === 0 && report.income === 0 && <p className="muted">Is mahine abhi kuch nahi likha.</p>}
      </section>

      {cats.length > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Kis cheez par kharcha</h2></header>
          <div className="cats">
            {cats.map(([id, v]) => {
              const c = EXPENSE.find((x) => x.id === id) || EXPENSE.at(-1); const I = c.icon;
              return (
                <div key={id} className="cat-row">
                  <I size={17} /><span className="cat-name">{c.label}</span>
                  <span className="cat-bar"><motion.i className="mine" initial={{ width: 0 }} animate={{ width: (v / maxCat) * 100 + '%' }} /></span>
                  <b>{money(v)}</b><small className="cat-pct">{Math.round((v / report.spent) * 100)}%</small>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {inc.length > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Aamdani kahan se</h2></header>
          <div className="cats">
            {inc.map(([id, v]) => {
              const c = INCOME.find((x) => x.id === id) || INCOME.at(-1); const I = c.icon;
              return (
                <div key={id} className="cat-row">
                  <I size={17} /><span className="cat-name">{c.label}</span>
                  <span className="cat-bar"><motion.i className="inc" initial={{ width: 0 }} animate={{ width: (v / inc[0][1]) * 100 + '%' }} /></span>
                  <b>{money(v)}</b><small className="cat-pct">{Math.round((v / report.income) * 100)}%</small>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <header className="panel-head"><h2>6 mahine</h2><span className="legend"><i className="l-out" /> Kharcha <i className="l-in" /> Aamdani</span></header>
        <div className="trend">
          {trend.map((t) => (
            <button key={t.k} className={'trend-col' + (t.k === month ? ' on' : '')} onClick={() => setMonth(t.k)}>
              <span className="trend-bars">
                <motion.i className="t-out" initial={{ height: 0 }} animate={{ height: (t.spent / maxT) * 100 + '%' }} />
                <motion.i className="t-in" initial={{ height: 0 }} animate={{ height: (t.income / maxT) * 100 + '%' }} />
              </span>
              <small>{monthShort(t.k)}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="mera-foot">
        <button className="btn ghost wide" onClick={onPdf}><FileDown size={18} /> Poora hisaab PDF mein</button>
        <p className="hint center">PDF ko Claude ya ChatGPT ko de kar mashwara le sakte hain.</p>
      </div>
    </div>
  );
}

/* ---------------- Khate (log) ---------------- */
export function MeraPeople({ mine, people, shared, otherName, me, onOpenContact, onNewContact, onOpenShared }) {
  const contacts = mine.contacts.filter((c) => !c.archived);
  const b = shared?.balance || { amount: 0 };
  const sharedLine = !b.amount ? 'Hisaab barabar' : b.from === me ? `Aap ne ${money(b.amount)} dene hain` : `${otherName} ne aap ko ${money(b.amount)} dene hain`;
  return (
    <div className="screen">
      <header className="page-head row">
        <div><h1>Khate</h1><p className="muted">Kis ne kis ko kitna dena hai</p></div>
        <button className="btn ghost small-g" onClick={onNewContact}><Plus size={16} /> Banda</button>
      </header>
      <motion.button className="dosti-card" whileTap={{ scale: 0.98 }} onClick={onOpenShared}>
        <span className="who-av" style={{ '--c': '#D4931A' }}>{otherName[0]}</span>
        <span className="entry-main">
          <span className="entry-title">{otherName} <span className="pill mute">Dosti khata</span></span>
          <span className={'entry-sub ' + (!b.amount ? '' : b.from === me ? 'neg' : 'pos')}>{sharedLine}</span>
        </span>
        <ChevronRight size={18} className="muted-i" />
      </motion.button>
      {contacts.length === 0 ? (
        <div className="empty"><p>Kisi aur ko qarz diya ya liya? Banda jodo, phir har len-den tareekh ke saath yahan.</p><button className="btn primary" onClick={onNewContact}><Plus size={18} /> Banda jodo</button></div>
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
                  <span className={'entry-sub ' + (bal[0]?.[1] > 0 ? 'pos' : bal.length ? 'neg' : '')}>{bal.length === 0 ? 'Hisaab barabar' : bal.map(([cur, v]) => (v > 0 ? `Aap ko ${money(v, cur)} dene hain` : `Aap ne ${money(-v, cur)} dene hain`)).join(', ')}</span>
                </span>
                <ChevronRight size={18} className="muted-i" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Sab len-den (search + filter) ---------------- */
export function AllTxns({ mine, allTx, otherName, onOpen }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [acc, setAcc] = useState('all');
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return [...(allTx || mine.ptx)].sort(sortTx).filter((t) => {
      if (type === 'khata' ? !t.synthetic : type !== 'all' && !(type === 'loan' ? ['lend', 'borrow', 'got_back', 'paid_back'].includes(t.type) : t.type === type)) return false;
      if (acc !== 'all' && t.accountId !== acc && t.toAccountId !== acc) return false;
      if (!ql) return true;
      const who = mine.contacts.find((c) => idOf(c) === t.contactId)?.name || '';
      return [t.note, catMeta(t).label, who, String(Math.round(Math.abs(t.amount)))].join(' ').toLowerCase().includes(ql);
    });
  }, [mine, allTx, q, type, acc]);
  return (
    <div className="all-tx">
      <label className="search">
        <Search size={19} className="s-icon" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dhoondo: bijli, Ali, 5000..." />
        {q && <button className="icon-btn s-clear" onClick={() => setQ('')} aria-label="Saaf karo"><X size={17} /></button>}
      </label>
      <div className="scroller">
        {[['all', 'Sab'], ['expense', 'Kharche'], ['income', 'Aamdani'], ['transfer', 'Transfer'], ['loan', 'Qarz'], ['khata', otherName]].map(([id, l]) => (
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
          <div className="entries">{g.items.map((t, i) => <TxnRow key={idOf(t)} t={t} i={i} accounts={mine.accounts} contacts={mine.contacts} otherName={otherName} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Account ---------------- */
export function AccountDetail({ a, balance, mine, allTx, rates, otherName, onOpen, onAdjust, onEdit, onAdd }) {
  const key = idOf(a);
  const list = [...(allTx || mine.ptx)].filter((t) => t.accountId === key || t.toAccountId === key).sort(sortTx);
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
          <div className="entries">{g.items.map((t, i) => <TxnRow key={idOf(t)} t={t} i={i} accounts={mine.accounts} contacts={mine.contacts} otherName={otherName} onOpen={onOpen} />)}</div>
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
              <span>{TYPES[h.type].label}{!h.accountId ? <small>Purana</small> : null}{h.note ? <small>{h.note}</small> : null}</span>
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
