import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, MessageCircle, Plus, ArrowUpRight, Smartphone, X, Delete } from 'lucide-react';
import Tarazu from './components/Tarazu';
import EntryRow from './components/EntryRow';
import { catOf, dayLabel, monthName, monthShort, rs, shortDay, thisMonth } from './lib';

/* ---------------- Lock ---------------- */
export function Lock({ onLogin, people, error, busy }) {
  const [pin, setPin] = useState('');
  const press = (d) => {
    if (busy) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (next.length === 4) onLogin(next, () => setPin(''));
  };
  return (
    <div className="lock">
      <div className="lock-top">
        <img src="/icons/icon-192.png" alt="" className="lock-logo" />
        <h1>Dosti Khata</h1>
        <p>Aizaz aur Abdullah ka saanjha hisaab</p>
      </div>
      <motion.div className="pin-dots" animate={error ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} key={error || 'ok'}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </motion.div>
      <p className="lock-msg">{error || '4 hindson ka PIN likho'}</p>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
          k === '' ? <span key={i} /> : (
            <motion.button whileTap={{ scale: 0.9 }} key={i} className="key" onClick={() => (k === 'del' ? setPin(pin.slice(0, -1)) : press(k))} aria-label={k === 'del' ? 'Mitao' : k}>
              {k === 'del' ? <Delete size={22} /> : k}
            </motion.button>
          )
        )}
      </div>
    </div>
  );
}

export function WhoAmI({ people, onPick }) {
  return (
    <div className="lock who">
      <div className="lock-top">
        <h1>Aap kaun hain?</h1>
        <p>Is phone par app aap ke naam se chalegi. Baad mein badal sakte hain.</p>
      </div>
      <div className="who-grid">
        {people.map((p, i) => (
          <motion.button key={p.id} className="who-card" style={{ '--c': i === 0 ? 'var(--aizaz)' : 'var(--abdullah)' }}
            whileTap={{ scale: 0.96 }} onClick={() => onPick(p.id)}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
            <span className="who-av">{p.name[0]}</span>
            <span>Main {p.name} hoon</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Home ---------------- */
export function Home({ data, me, names, colors, onAdd, onOpen, goKhata, canInstall, onInstall, onDismissInstall }) {
  const { balance, stats, entries } = data;
  const other = data.people.map((p) => p.id).find((p) => p !== me);
  const owedToMe = balance.amount > 0 && balance.to === me;
  const iOwe = balance.amount > 0 && balance.from === me;
  const mag = balance.amount > 0 ? Math.min(13, 4 + 3 * Math.log10(balance.amount + 1)) : 0;
  const tilt = owedToMe ? -mag : iOwe ? mag : 0;

  const sentence = balance.amount === 0
    ? 'Hisaab bilkul barabar hai'
    : owedToMe ? `${names[other]} ne aap ko dene hain` : `Aap ne ${names[other]} ko dene hain`;

  const wa = () => {
    const text = `Assalam o Alaikum ${names[other]}! Dosti Khata ke hisaab se aap ne mujhe ${rs(balance.amount)} dene hain. ${location.origin}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };

  const paidTotal = stats.paid[me] + stats.paid[other];
  const myPct = paidTotal ? (stats.paid[me] / paidTotal) * 100 : 50;

  return (
    <div className="screen">
      <section className="hero">
        <Tarazu meName={names[me]} otherName={names[other]} meColor={colors[me]} otherColor={colors[other]} tilt={tilt} />
        <p className="hero-line">{sentence}</p>
        <AnimatePresence mode="popLayout">
          <motion.p key={balance.amount + (balance.from || '')} className={'hero-amt' + (owedToMe ? ' in' : iOwe ? ' out' : '')}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
            {rs(balance.amount)}
          </motion.p>
        </AnimatePresence>
        <div className="hero-actions">
          <motion.button whileTap={{ scale: 0.96 }} className="btn light" onClick={() => onAdd('expense')}><Plus size={18} /> Kharcha likho</motion.button>
          <motion.button whileTap={{ scale: 0.96 }} className="btn outline-light" onClick={() => onAdd('payment')}><ArrowUpRight size={18} /> Paise diye</motion.button>
        </div>
        {iOwe && (
          <button className="hero-link" onClick={() => onAdd('payment', { clear: true })}>Poora {rs(balance.amount)} ek saath clear karo</button>
        )}
        {owedToMe && (
          <button className="hero-link" onClick={wa}><MessageCircle size={15} /> WhatsApp par {names[other]} ko yaad dilao</button>
        )}
      </section>

      {canInstall && (
        <motion.div className="install-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Smartphone size={22} />
          <div>
            <strong>Phone par app ki tarah lagao</strong>
            <span>Home screen se ek tap mein khulega</span>
          </div>
          <button className="btn small" onClick={onInstall}>Lagao</button>
          <button className="icon-btn" aria-label="Chhupao" onClick={onDismissInstall}><X size={16} /></button>
        </motion.div>
      )}

      <section className="month-panel">
        <header>
          <h2>{monthName(stats.month)}</h2>
          <span>{stats.count} kharche</span>
        </header>
        <p className="month-total">{rs(stats.total)} <small>kul saanjha kharcha</small></p>
        <div className="paid-bar" aria-hidden="true">
          <motion.span style={{ background: colors[me] }} initial={{ width: '50%' }} animate={{ width: myPct + '%' }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
          <span style={{ background: colors[other], flex: 1 }} />
        </div>
        <div className="paid-legend">
          <span><i style={{ background: colors[me] }} />{names[me]} ne diye <b>{rs(stats.paid[me])}</b></span>
          <span><i style={{ background: colors[other] }} />{names[other]} ne diye <b>{rs(stats.paid[other])}</b></span>
        </div>
      </section>

      <section className="list-block">
        <header className="block-head">
          <h2>Taaza entries</h2>
          {entries.length > 0 && <button className="text-btn" onClick={goKhata}>Poora khata <ChevronRight size={16} /></button>}
        </header>
        {entries.length === 0 ? (
          <div className="empty">
            <p>Abhi koi entry nahi. Pehla kharcha likho, hisaab khud banta jayega.</p>
            <button className="btn primary" onClick={() => onAdd('expense')}><Plus size={18} /> Pehla kharcha likho</button>
          </div>
        ) : (
          <div className="entries">
            {entries.slice(0, 6).map((e, i) => <EntryRow key={e._id} e={e} index={i} names={names} colors={colors} onOpen={onOpen} />)}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Khata ---------------- */
const FILTERS = [
  { id: 'all', label: 'Sab' },
  { id: 'baqi', label: 'Baqi wale' },
  { id: 'expense', label: 'Kharche' },
  { id: 'payment', label: 'Payments' },
];

export function Khata({ data, names, colors, onOpen, month, setMonth }) {
  const [filter, setFilter] = useState('all');
  const months = useMemo(() => [...new Set([thisMonth(), ...data.months])].sort().reverse(), [data.months]);

  const list = data.entries.filter((e) => {
    if (month !== 'all' && e.date.slice(0, 7) !== month) return false;
    if (filter === 'baqi') return e.type === 'expense' && (e.calc.status === 'pending' || e.calc.status === 'partial');
    if (filter === 'expense' || filter === 'payment') return e.type === filter;
    return true;
  });
  const groups = [];
  for (const e of list) {
    const g = groups.at(-1);
    if (g && g.day === e.date) g.items.push(e); else groups.push({ day: e.date, items: [e] });
  }
  const baqiSum = list.filter((e) => e.type === 'expense').reduce((s, e) => s + e.calc.left, 0);

  return (
    <div className="screen">
      <header className="page-head">
        <h1>Khata</h1>
        <p>Har entry, aur kaunsi clear ho chuki hai</p>
      </header>

      <div className="scroller months" role="tablist" aria-label="Mahina">
        {[...months, 'all'].map((m) => (
          <button key={m} role="tab" aria-selected={month === m} className={'chip' + (month === m ? ' on' : '')} onClick={() => setMonth(m)}>
            {m === 'all' ? 'Shuru se' : monthShort(m)}
          </button>
        ))}
      </div>
      <div className="scroller" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={'chip ghost' + (filter === f.id ? ' on' : '')} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {filter === 'baqi' && list.length > 0 && (
        <p className="baqi-note">In kharchon ka kul baqi hissa {rs(baqiSum)} hai. Agli payment sab se purane se clear karegi.</p>
      )}

      {groups.length === 0 ? (
        <div className="empty"><p>{filter === 'baqi' ? 'Koi kharcha baqi nahi. Sab clear hai.' : 'Is mahine mein koi entry nahi.'}</p></div>
      ) : groups.map((g) => (
        <section key={g.day} className="day-group">
          <h3>{dayLabel(g.day)}</h3>
          <div className="entries">
            {g.items.map((e, i) => <EntryRow key={e._id} e={e} index={i} names={names} colors={colors} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Mahina ---------------- */
export function Mahina({ data, me, names, colors, month, setMonth }) {
  const ids = data.people.map((p) => p.id);
  const other = ids.find((p) => p !== me);
  const s = data.stats;
  const months = [...new Set([thisMonth(), ...data.months])].sort().reverse();

  const cats = Object.entries(s.categories).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;

  // din ke hisaab se chart
  const [y, m] = s.month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysIn }, (_, i) => {
    const d = `${s.month}-${String(i + 1).padStart(2, '0')}`;
    return { d, v: s.days[d] || 0 };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.v));
  const topDay = days.reduce((a, b) => (b.v > a.v ? b : a), days[0]);

  return (
    <div className="screen">
      <header className="page-head">
        <h1>{monthName(s.month)}</h1>
        <p>Is mahine ka poora hisaab ek nazar mein</p>
      </header>
      <div className="scroller months">
        {months.map((mm) => (
          <button key={mm} className={'chip' + (s.month === mm ? ' on' : '')} onClick={() => setMonth(mm)}>{monthShort(mm)}</button>
        ))}
      </div>

      <section className="big-stat">
        <p className="big-num">{rs(s.total)}</p>
        <p>{s.count} saanjhe kharche is mahine</p>
      </section>

      <section className="panel">
        <h2>Kis ne kitna</h2>
        <div className="compare">
          {[me, other].map((p) => (
            <div key={p} className="compare-col" style={{ '--c': colors[p] }}>
              <span className="compare-name">{names[p]}</span>
              <dl>
                <div><dt>Dukaan par diye</dt><dd>{rs(s.paid[p])}</dd></div>
                <div><dt>Apna hissa</dt><dd>{rs(s.share[p])}</dd></div>
                <div><dt>Payment bheji</dt><dd>{rs(s.sent[p])}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Roz ka kharcha</h2>
        {s.total === 0 ? <p className="muted">Is mahine abhi koi kharcha nahi.</p> : (
          <>
            <div className="day-chart" role="img" aria-label="Roz ka kharcha chart">
              {days.map((d, i) => (
                <motion.span key={d.d} className={d.v ? 'has' : ''} title={`${shortDay(d.d)}: ${rs(d.v)}`}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.012, type: 'spring', stiffness: 200, damping: 22 }}
                  style={{ height: Math.max(3, (d.v / maxDay) * 100) + '%' }} />
              ))}
            </div>
            <div className="chart-axis"><span>1</span><span>{Math.ceil(daysIn / 2)}</span><span>{daysIn}</span></div>
            <p className="muted">Sab se mehnga din {shortDay(topDay.d)} tha, {rs(topDay.v)}.</p>
          </>
        )}
      </section>

      {cats.length > 0 && (
        <section className="panel">
          <h2>Kis cheez par</h2>
          <div className="cats">
            {cats.map(([id, v]) => {
              const c = catOf(id); const Icon = c.icon;
              return (
                <div key={id} className="cat-row">
                  <Icon size={17} />
                  <span className="cat-name">{c.label}</span>
                  <span className="cat-bar"><motion.i initial={{ width: 0 }} animate={{ width: (v / maxCat) * 100 + '%' }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} /></span>
                  <b>{rs(v)}</b>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------- Install guide ---------------- */
export function InstallGuide({ prompt, onPrompt }) {
  return (
    <div className="guide">
      {prompt && (
        <button className="btn primary wide" onClick={onPrompt}><Smartphone size={18} /> Abhi install karo</button>
      )}
      <section>
        <h3>iPhone (Safari)</h3>
        <ol>
          <li>Ye page <b>Safari</b> mein kholo</li>
          <li>Neeche <b>Share</b> button dabao (dabba jis se teer upar ja raha hai)</li>
          <li><b>Add to Home Screen</b> chunein, phir <b>Add</b></li>
        </ol>
      </section>
      <section>
        <h3>Android (Chrome, jaise S23)</h3>
        <ol>
          <li>Upar daayein <b>3 dots</b> dabao</li>
          <li><b>Install app</b> ya <b>Add to Home screen</b> chunein</li>
          <li><b>Install</b> dabao</li>
        </ol>
      </section>
    </div>
  );
}
