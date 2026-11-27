// "Mera Hisaab": apna paisa, apna kharcha, logon ka khata. Sirf aap ko dikhta hai.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, HandCoins, ChevronRight, FileDown, TrendingDown, TrendingUp, Lock, Search, X, MessageCircle, PiggyBank, Users, Flame, Gauge, Target, RefreshCw } from 'lucide-react';
import { idOf, toPKR } from '../../server/money.js';
import { dayLabel, monthName, monthShort, shortDay, thisMonth, timeLabel, today } from '../lib';
import PeriodBar from './PeriodBar';
import { Donut, Bars, PaceLine, CAT_COLORS, OTHER_COLOR } from './charts';
import { buckets, fmtDay, periodOf, isCurrent, addDays, daysBetween, weekday, WD } from './period';
import { catMeta, catInfo, kindMeta, money, EXPENSE, INCOME, KINDS, TYPES } from './meta';

export function TxnRow({ t, accounts, contacts, onOpen, i = 0, otherName = 'Dost' }) {
  const m = catMeta(t);
  const Icon = m.icon;
  const acc = accounts.find((a) => idOf(a) === t.accountId);
  const to = accounts.find((a) => idOf(a) === t.toAccountId);
  const who = contacts.find((c) => idOf(c) === t.contactId);
  const cur = acc?.currency || 'PKR';
  const sign = t.type === 'transfer' ? 0 : t.type === 'adjust' ? Math.sign(t.amount) : TYPES[t.type]?.sign;
  const khataTitle = { expense: `${otherName} ke saath kharcha`, payment: t.type === 'khata_out' ? `${otherName} ko bheje` : `${otherName} se mile`, loan: t.type === 'khata_out' ? `${otherName} ko qarz` : `${otherName} se qarz` }[t.khataType];
  const srcName = t.source && t.source !== 'payout' ? t.source.charAt(0).toUpperCase() + t.source.slice(1) : t.payoutId ? 'Payout' : '';
  const fm = t.forMonth ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(t.forMonth.slice(5)) - 1]} ka payout` : '';
  const title = t.note || (t.synthetic ? khataTitle : t.type === 'expense' || t.type === 'income' ? m.label : `${TYPES[t.type].label}${who ? `: ${who.name}` : ''}`);
  const sub = t.type === 'transfer' ? `${acc?.name || '?'} se ${to?.name || '?'}${t.rate ? `, rate ${t.rate}` : ''}` : t.synthetic ? `Dosti khata, ${acc?.name || '?'}` : [who && t.note ? who.name : null, acc?.name, !acc && t.contactId ? 'Purana hisaab' : null].filter(Boolean).join(', ');
  return (
    <motion.button className={'entry' + (t.reversed ? ' reversed' : '')} onClick={() => onOpen(t)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.02 }}>
      <span className={'entry-icon m-' + (['lend', 'borrow', 'got_back', 'paid_back'].includes(t.type) ? 'loan' : sign > 0 ? 'in' : sign < 0 ? 'out' : 'mv')}><Icon size={18} /></span>
      <span className="entry-main">
        <span className="entry-title"><span className="et-text">{title}</span>{srcName && <span className="src-badge">{srcName}</span>}{t.reversed && <span className="rev-badge">Wapas (reverse)</span>}{t.pending && <span className="edited-tag">sync baqi</span>}</span>
        <span className="entry-sub"><span className="entry-time">{timeLabel(t)}</span>{fm ? `${fm}, ` : ''}{sub}</span>
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

function AccCard({ a, b, rates, onOpen, i = 0 }) {
  const K = kindMeta(a.kind).icon;
  const pkr = a.currency !== 'PKR' ? toPKR(b, a.currency, rates) : null;
  return (
    <motion.button className={'acc-tile k-' + (a.kind || 'other')} whileTap={{ scale: 0.97 }} onClick={() => onOpen(a)}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <span className="acc-ic"><K size={18} /></span>
      <span className="acc-name">{a.name}</span>
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

/* ---------------- Budget ring + category budgets ---------------- */
const level = (spent, lim) => (spent > lim ? 'over' : spent > lim * 0.8 ? 'warn' : 'ok');
export function Ring({ pct, size = 112, stroke = 11, children, tone }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} className={'ring-fg ' + tone} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, pct)) }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}
export function CatBudgetList({ catBudgets, byCat, max = 99 }) {
  const rows = Object.entries(catBudgets || {}).map(([id, lim]) => ({ id, lim, spent: byCat[id] || 0, c: catInfo(id) }))
    .sort((a, b) => b.spent / b.lim - a.spent / a.lim).slice(0, max);
  if (!rows.length) return null;
  return (
    <div className="cbl">
      {rows.map(({ id, lim, spent, c }) => {
        const I = c.icon; const lv = level(spent, lim);
        return (
          <div key={id} className="cbl-row">
            <span className={'cbl-ic ' + lv}><I size={15} /></span>
            <span className="cbl-main">
              <span className="cbl-top"><b>{c.label}</b><small className={lv}>{spent > lim ? `${money(spent - lim)} upar` : `${money(lim - spent)} baqi`}</small></span>
              <span className="b-bar thin"><motion.i className={lv === 'ok' ? '' : lv} initial={{ width: 0 }} animate={{ width: Math.min(100, (spent / lim) * 100) + '%' }} /></span>
              <small className="cbl-sub">{money(spent)} / {money(lim)}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BudgetHome({ report, budget, catBudgets, otherName, onGo, onBudget }) {
  const t = today(); const [y, m] = report.month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate(); const day = Number(t.slice(8)); const left = Math.max(0, daysIn - day);
  const pct = budget > 0 ? report.spent / budget : 0; const lv = budget > 0 ? level(report.spent, budget) : 'ok';
  const hasCat = Object.keys(catBudgets || {}).length > 0;
  return (
    <section className="btrack">
      <header className="bt-head">
        <button className="bt-title" onClick={() => onGo('analytics')}><b>{monthName(report.month)}</b><ChevronRight size={16} /></button>
        <button className="text-btn" onClick={onBudget}><Target size={15} /> {budget > 0 || hasCat ? 'Budget badlo' : 'Budget rakho'}</button>
      </header>
      {budget > 0 ? (
        <div className="bt-main">
          <Ring pct={pct} tone={lv}>
            <b>{Math.round(pct * 100)}%</b><small>istemal</small>
          </Ring>
          <div className="bt-side">
            <span className="bt-l">Kharch hua</span>
            <b className="bt-big">{money(report.spent)}</b>
            <span className="bt-of">{money(budget)} ke budget mein se</span>
            <span className={'bt-left ' + lv}>{report.spent > budget ? `${money(report.spent - budget)} upar chala gaya` : `${money(budget - report.spent)} baqi`}</span>
            {report.spent <= budget && left > 0 && <span className="bt-day">Roz {money(Math.floor((budget - report.spent) / left))} tak, {left} din</span>}
          </div>
        </div>
      ) : null}
      <div className="bt-stats">
        <div><span><ArrowDownLeft size={13} /> Aaye</span><b className="pos">{money(report.income)}</b></div>
        <div><span><ArrowUpRight size={13} /> Gaye</span><b className="neg">{money(report.spent)}</b></div>
        <div><span>Bacha</span><b className={report.saved < 0 ? 'neg' : ''}>{money(report.saved)}</b></div>
      </div>
      {hasCat && <CatBudgetList catBudgets={catBudgets} byCat={report.byCat} max={3} />}
      {!budget && !hasCat && <button className="bt-cta" onClick={onBudget}><Target size={18} /><span><b>Mahine ka budget rakho</b><small>Kul had aur har category (khana, safar, family...) ki alag had</small></span><ChevronRight size={16} /></button>}
      {report.khata > 0 && <p className="mm-note">Kharche mein {otherName} wale khate ka aap ka hissa {money(report.khata)} bhi shamil hai</p>}
    </section>
  );
}

/* ---------------- Home ---------------- */
export function MeraHome({ mine, allTx, balances, report, worth, owedToMe, iOwe, rates, live, otherName, budget, catBudgets, onBudget, onRefresh, onAdd, onOpenAccount, onOpenTxn, onNewAccount, onRates, onAll, onGo }) {
  const accounts = mine.accounts.filter((a) => !a.archived);
  const recent = useMemo(() => [...allTx].sort(sortTx).slice(0, 8), [allTx]);
  const [spin, setSpin] = useState(false); // hooks hamesha return se pehle
  if (!accounts.length) return <EmptyMera onNewAccount={onNewAccount} otherName={otherName} />;
  const needRate = Object.keys(worth.unconverted).length > 0;
  const refresh = async () => { if (spin) return; setSpin(true); await onRefresh?.(); setTimeout(() => setSpin(false), 400); };
  return (
    <div className="screen">
      <section className="hero mera-hero">
        <motion.button className={'hero-refresh' + (spin ? ' spin' : '')} whileTap={{ scale: 0.88 }} onClick={refresh} aria-label="Sab refresh karo"><RefreshCw size={17} /></motion.button>
        <p className="private light"><Lock size={12} /> Sirf aap ko dikhta hai</p>
        <p className="hero-line">Kul paisa</p>
        <motion.p className="hero-amt" key={Math.round(worth.pkr)} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }}>{money(worth.pkr)}</motion.p>
        {needRate ? <button className="hero-link" onClick={onRates}>{Object.entries(worth.unconverted).map(([c, v]) => money(v, c)).join(', ')} alag hain: rate likho</button>
          : <RateLine accounts={accounts} rates={rates} live={live} prefs={mine.prefs} onRates={onRates} light />}
        <div className="worth-pills">
          <button onClick={() => onGo('people')}><span>Logon par</span><b>{money(owedToMe)}</b></button>
          <button onClick={() => onGo('people')}><span>Aap par</span><b>{money(iOwe)}</b></button>
        </div>
        <div className="quick4 colored">
          {[
            ['expense', 'Kharcha', ArrowUpRight, 'q-out'], ['income', 'Aamdani', ArrowDownLeft, 'q-in'], ['transfer', 'Transfer', ArrowLeftRight, 'q-mv'], ['lend', 'Qarz', HandCoins, 'q-loan'],
          ].map(([t, l, I, c]) => (
            <motion.button key={t} className={c} whileTap={{ scale: 0.94 }} onClick={() => onAdd(t)}><span><I size={20} strokeWidth={2.3} /></span>{l}</motion.button>
          ))}
        </div>
      </section>

      <section className="home-accs">
        <header className="block-head">
          <h2>Accounts</h2>
          <button className="text-btn" onClick={onNewAccount}><Plus size={16} /> Naya</button>
        </header>
        <div className="acc-grid">
          {accounts.map((a, i) => <AccCard key={idOf(a)} a={a} i={i} b={balances[idOf(a)] || 0} rates={rates} onOpen={onOpenAccount} />)}
        </div>
      </section>

      <BudgetHome report={report} budget={budget} catBudgets={catBudgets} otherName={otherName} onGo={onGo} onBudget={onBudget} />

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
                  <span className={'entry-icon acc-ic k-' + (a.kind || 'other')}><K size={18} /></span>
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
      <button className="btn ghost wide acc-new" onClick={onNewAccount}><Plus size={18} /> Naya account</button>
    </div>
  );
}

/* ---------------- Analytics ---------------- */
const inPKR = (t, accounts, rates) => toPKR(Math.abs(t.amount), accounts.find((a) => idOf(a) === t.accountId)?.currency || 'PKR', rates);
export function MeraAnalytics({ mine, period, setPeriod, onPick, reportRange, reportFor, budget, catBudgets = {}, onBudget, otherName, onPdf, minDate }) {
  const r = reportRange(period);
  const t = today();
  const bk = useMemo(() => buckets(period, minDate), [period, minDate]);
  const bars = bk.map((b) => {
    let v = 0; for (const [d, x] of Object.entries(r.byDay)) if (d >= b.from && d <= b.to) v += x;
    return { key: b.key, label: b.label, v: Math.round(v), title: b.from === b.to ? dayLabel(b.from) : `${fmtDay(b.from)} – ${fmtDay(b.to)}` };
  });
  const daily = bk.length && bk[0].from === bk[0].to;
  const cats = Object.entries(r.byCat).sort((a, b) => b[1] - a[1]);
  const donut = cats.slice(0, cats.length > 6 ? 5 : 6).map(([id, v], i) => ({ id, v, label: catInfo(id).label, color: CAT_COLORS[i] }));
  if (cats.length > 6) donut.push({ id: 'baqi', label: 'Baqi sab', v: cats.slice(5).reduce((a, [, v]) => a + v, 0), color: OTHER_COLOR });
  const inc = Object.entries(r.inCat).sort((a, b) => b[1] - a[1]);
  // Raftar: jama hota kharcha (din ba din)
  const pace = useMemo(() => {
    if (r.days > 62 || period.kind === 'all') return null;
    const now = []; const prev = []; let a = 0, b = 0;
    for (let i = 0; i < r.days; i++) {
      const d = addDays(r.from, i); const pd = addDays(r.prev.from, i);
      b += r.prev.byDay[pd] || 0; prev.push(Math.round(b));
      if (d <= t) { a += r.byDay[d] || 0; now.push(Math.round(a)); }
    }
    return { now, prev };
  }, [r, period.kind, t]);
  const wdays = useMemo(() => {
    const w = Array(7).fill(0);
    for (const [d, v] of Object.entries(r.byDay)) w[weekday(d)] += v;
    return WD.map((l, i) => ({ key: String(i), label: l, title: l, v: Math.round(w[i]) }));
  }, [r.byDay]);
  const isMonth = period.kind === 'month'; const cur = isCurrent(period);
  const dayIdx = cur ? daysBetween(r.from, t) : r.days; const left = r.days - dayIdx;
  const projection = cur && dayIdx > 2 ? Math.round((r.spent / dayIdx) * r.days) : null;
  const trend = useMemo(() => {
    const out = []; const base = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, 1);
    for (let i = 5; i >= 0; i--) { const x = new Date(base.getFullYear(), base.getMonth() - i, 1); const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; const rr = reportFor(k); out.push({ k, spent: rr.spent, income: rr.income }); }
    return out;
  }, [reportFor, t]);
  const maxT = Math.max(1, ...trend.flatMap((x) => [x.spent, x.income]));
  const topCat = cats[0];
  const loans = r.lent || r.gotBack || r.borrowed || r.paidBack;
  return (
    <div className="screen">
      <header className="page-head"><h1>Analytics</h1></header>
      <PeriodBar period={period} setPeriod={setPeriod} onPick={onPick} />

      <section className="panel a-sum">
        <div className="a-big">
          <span>Kharcha</span>
          <motion.b key={r.spent} initial={{ opacity: 0.3, y: 6 }} animate={{ opacity: 1, y: 0 }}>{money(r.spent)}</motion.b>
          {r.change != null && <em className={r.change > 0 ? 'up' : 'down'}>{r.change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {Math.abs(r.change)}% {r.change > 0 ? 'zyada' : 'kam'} pichli dafa se</em>}
        </div>
        <div className="mstats">
          <div><span>Aamdani</span><b className="pos">{money(r.income)}</b></div>
          <div><span>Bacha</span><b className={r.saved < 0 ? 'neg' : 'pos'}>{money(r.saved)}</b></div>
          <div><span>Roz ka avg</span><b>{money(r.perDay)}</b></div>
        </div>
        <div className="insights">
          {topCat && <p><Flame size={16} /> Sab se zyada <b>{catInfo(topCat[0]).label}</b> par: {Math.round((topCat[1] / r.spent) * 100)}%</p>}
          {r.income > 0 && <p><PiggyBank size={16} /> Aamdani ka <b>{Math.round((r.saved / r.income) * 100)}%</b> {r.saved >= 0 ? 'bacha' : 'zyada kharch hua'}</p>}
          {projection != null && <p><Gauge size={16} /> Is raftar se {isMonth ? 'mahina' : 'ye muddat'} <b>{money(projection)}</b> par khatam hogi</p>}
          {r.khata > 0 && <p><Users size={16} /> Is mein {otherName} wale khate ka hissa <b>{money(r.khata)}</b></p>}
        </div>
      </section>

      {isMonth && (
        budget > 0 || Object.keys(catBudgets).length ? (
          <section className="panel budget">
            <header className="panel-head row2"><h2>Budget</h2><button className="text-btn" onClick={onBudget}>Badlo</button></header>
            {budget > 0 && <><div className="b-bar"><motion.i className={r.spent > budget ? 'over' : r.spent > budget * 0.8 ? 'warn' : ''} initial={{ width: 0 }} animate={{ width: Math.min(100, (r.spent / budget) * 100) + '%' }} /></div>
            <p className="b-line"><b>{money(r.spent)}</b> / {money(budget)} ({Math.round((r.spent / budget) * 100)}%)</p></>}
            {!(budget > 0) ? null : r.spent > budget ? <p className="b-msg over">Budget se {money(r.spent - budget)} zyada ho gaya. Ab hath rok lo.</p>
              : cur ? <p className="b-msg">{money(budget - r.spent)} baqi. {left > 0 ? <>Agle {left} din mein roz <b>{money(Math.floor((budget - r.spent) / left))}</b> tak chala sakte ho.</> : null}</p>
                : <p className="b-msg">{money(budget - r.spent)} bach gaye. Shabash.</p>}
            {budget > 0 && projection != null && projection > budget && r.spent <= budget && <p className="b-msg warn">Dhyan: is raftar se mahina budget se {money(projection - budget)} upar jayega.</p>}
            {Object.keys(catBudgets).length > 0 && <><p className="cbl-h">Har category</p><CatBudgetList catBudgets={catBudgets} byCat={r.byCat} /></>}
          </section>
        ) : (
          <button className="panel budget-cta" onClick={onBudget}><Target size={20} /><span><b>Mahine ka budget rakho</b><small>Pata chalta rahega kitna baqi hai aur roz kitna chala sakte ho</small></span><ChevronRight size={18} /></button>
        )
      )}

      {r.spent === 0 && r.income === 0 ? <div className="empty"><p>Is muddat mein kuch nahi likha.</p></div> : null}

      {pace && r.spent > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Kharche ki raftar</h2><p className="muted">Din ba din jama hota kharcha, pichli dafa ke muqable</p></header>
          <PaceLine now={pace.now} prev={pace.prev} limit={isMonth ? budget : 0} labels={[fmtDay(r.from), fmtDay(r.to)]} />
        </section>
      )}

      {r.spent > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>{daily ? 'Roz ka kharcha' : bk.length && daysBetween(bk[0].from, bk[0].to) > 7 ? 'Har mahine ka kharcha' : 'Har hafte ka kharcha'}</h2></header>
          <Bars data={bars} avg={bars.length > 1 ? Math.round(bars.reduce((a, b) => a + b.v, 0) / bars.length) : 0} highlight={daily ? t : null} />
        </section>
      )}

      {donut.length > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Kis cheez par kharcha</h2></header>
          <Donut items={donut} total={r.spent} centerLabel="Kul kharcha" />
        </section>
      )}

      {r.days >= 7 && r.spent > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Kis din zyada kharcha</h2><p className="muted">Hafte ke har din ka jama</p></header>
          <Bars data={wdays} height={130} color="#E0A021" />
        </section>
      )}

      {r.top.length > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Sab se bare kharche</h2></header>
          <ol className="top-list">
            {r.top.map((x, i) => {
              const c = catInfo(x.category || 'other'); const I = c.icon;
              return <li key={i}><span className="entry-icon m-out"><I size={16} /></span><span className="tl-main"><b>{x.note || c.label}</b><small>{dayLabel(x.date)}{x.khata ? `, ${otherName} khata` : ''}</small></span><b>{money(x.pkr)}</b></li>;
            })}
          </ol>
        </section>
      )}

      {inc.length > 0 && (
        <section className="panel">
          <header className="panel-head"><h2>Aamdani kahan se</h2></header>
          <div className="cats">
            {inc.map(([id, v]) => {
              const c = catInfo(id, 'income'); const I = c.icon;
              return (
                <div key={id} className="cat-row">
                  <I size={17} /><span className="cat-name">{c.label}</span>
                  <span className="cat-bar"><motion.i className="inc" initial={{ width: 0 }} animate={{ width: (v / inc[0][1]) * 100 + '%' }} /></span>
                  <b>{money(v)}</b><small className="cat-pct">{Math.round((v / r.income) * 100)}%</small>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loans ? (
        <section className="panel">
          <header className="panel-head"><h2>Qarz is muddat mein</h2></header>
          <div className="mstats four">
            <div><span>Diya</span><b>{money(r.lent)}</b></div><div><span>Wapas mila</span><b className="pos">{money(r.gotBack)}</b></div>
            <div><span>Liya</span><b>{money(r.borrowed)}</b></div><div><span>Lautaya</span><b>{money(r.paidBack)}</b></div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <header className="panel-head row2"><h2>Pichle 6 mahine</h2><span className="legend"><i className="l-out" /> Kharcha <i className="l-in" /> Aamdani</span></header>
        <div className="trend">
          {trend.map((x) => (
            <button key={x.k} className={'trend-col' + (period.kind === 'month' && period.from.startsWith(x.k) ? ' on' : '')} onClick={() => setPeriod(periodOf('month', x.k + '-01'))}>
              <span className="trend-bars">
                <motion.i className="t-out" initial={{ height: 0 }} animate={{ height: (x.spent / maxT) * 100 + '%' }} />
                <motion.i className="t-in" initial={{ height: 0 }} animate={{ height: (x.income / maxT) * 100 + '%' }} />
              </span>
              <small>{monthShort(x.k)}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="mera-foot">
        <button className="btn ghost wide" onClick={() => onPdf(period)}><FileDown size={18} /> Is muddat ki PDF</button>
        <p className="hint center">PDF ko Claude ya ChatGPT ko de kar mashwara le sakte hain.</p>
      </div>
    </div>
  );
}

/* ---------------- Len-den (saare transactions) ---------------- */
const IN_T = ['income', 'borrow', 'got_back', 'khata_in'];
const OUT_T = ['expense', 'lend', 'paid_back', 'khata_out'];
export function MeraTxns({ mine, allTx, rates, period, setPeriod, onPick, onOpen, otherName, onPdf }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [acc, setAcc] = useState('all');
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return [...allTx].sort(sortTx).filter((t) => {
      if (t.date < period.from || t.date > period.to) return false;
      if (type === 'khata' ? !t.synthetic : type !== 'all' && !(type === 'loan' ? ['lend', 'borrow', 'got_back', 'paid_back'].includes(t.type) : t.type === type)) return false;
      if (acc !== 'all' && t.accountId !== acc && t.toAccountId !== acc) return false;
      if (!ql) return true;
      const who = mine.contacts.find((c) => idOf(c) === t.contactId)?.name || '';
      return [t.note, catMeta(t).label, who, String(Math.round(Math.abs(t.amount)))].join(' ').toLowerCase().includes(ql);
    });
  }, [allTx, mine.contacts, q, type, acc, period]);
  const tot = useMemo(() => {
    let i = 0, o = 0;
    for (const t of list) {
      if (t.reversed) continue;
      const v = inPKR(t, mine.accounts, rates) || 0;
      if (IN_T.includes(t.type) || (t.type === 'adjust' && t.amount > 0)) i += v;
      else if (OUT_T.includes(t.type) || (t.type === 'adjust' && t.amount < 0)) o += v;
    }
    return { i: Math.round(i), o: Math.round(o) };
  }, [list, mine.accounts, rates]);
  const dayNet = (items) => {
    let n = 0;
    for (const t of items) { if (t.reversed) continue; const v = inPKR(t, mine.accounts, rates) || 0; if (IN_T.includes(t.type)) n += v; else if (OUT_T.includes(t.type)) n -= v; else if (t.type === 'adjust') n += Math.sign(t.amount) * v; }
    return Math.round(n);
  };
  return (
    <div className="screen">
      <header className="page-head row">
        <div><h1>Len-den</h1><p className="muted">{list.length} entries</p></div>
        <button className="btn ghost small-g" onClick={() => onPdf(period)}><FileDown size={16} /> PDF</button>
      </header>
      <PeriodBar period={period} setPeriod={setPeriod} onPick={onPick} withAll />
      <div className="tx-tot">
        <div><span>Aaye</span><b className="pos">+{money(tot.i).replace('Rs ', 'Rs ')}</b></div>
        <div><span>Gaye</span><b className="neg">−{money(tot.o)}</b></div>
        <div><span>Farq</span><b className={tot.i - tot.o < 0 ? 'neg' : 'pos'}>{money(tot.i - tot.o)}</b></div>
      </div>
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
        {mine.accounts.filter((a) => !a.archived).map((a) => <button key={idOf(a)} className={'chip' + (acc === idOf(a) ? ' on' : '')} onClick={() => setAcc(idOf(a))}>{a.name}</button>)}
      </div>
      {list.length === 0 ? <div className="empty"><p>Is muddat mein kuch nahi mila.</p></div> : groupByDay(list).map((g) => {
        const n = dayNet(g.items);
        return (
          <section key={g.day} className="day-group">
            <h3><span>{dayLabel(g.day)}</span>{n !== 0 && <span className={n < 0 ? 'neg' : 'pos'}>{n > 0 ? '+' : '−'}{money(Math.abs(n)).replace('Rs ', '')}</span>}</h3>
            <div className="entries">{g.items.map((t, i) => <TxnRow key={idOf(t)} t={t} i={i} accounts={mine.accounts} contacts={mine.contacts} otherName={otherName} onOpen={onOpen} />)}</div>
          </section>
        );
      })}
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
