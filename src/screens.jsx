import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, MessageCircle, Plus, ArrowUpRight, Smartphone, X, Delete, Bell, Share, SquarePlus, EllipsisVertical, Download, Search } from 'lucide-react';
import Tarazu from './components/Tarazu';
import EntryRow from './components/EntryRow';
import { catOf, dayLabel, monthName, monthShort, rs, shortDay, thisMonth, visible, view, LS } from './lib';

/* ---------------- Lock: account chuno, phir PIN ---------------- */
export function Lock({ people, colors, onLogin, error, busy }) {
  const [who, setWho] = useState(LS.get('khata.lastUser'));
  const [pin, setPin] = useState('');
  const person = people.find((p) => p.id === who);

  const press = (d) => {
    if (busy) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 4) onLogin(who, next, () => setPin(''));
  };

  if (!person) {
    return (
      <div className="lock">
        <div className="lock-top">
          <img src="/icons/icon-192.png" alt="" className="lock-logo" />
          <h1>Dosti Khata</h1>
          <p>Apna account chuno</p>
        </div>
        <div className="who-grid">
          {people.map((p, i) => (
            <motion.button key={p.id} className="who-card" style={{ '--c': colors[p.id] }}
              whileTap={{ scale: 0.96 }} onClick={() => { setWho(p.id); LS.set('khata.lastUser', p.id); }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
              <span className="who-av">{p.name[0]}</span>
              <span>{p.name}</span>
              <ChevronRight size={20} className="who-go" />
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lock">
      <button className="lock-back" onClick={() => { setWho(null); setPin(''); }}><ChevronLeft size={18} /> Account badlo</button>
      <div className="lock-top">
        <span className="who-av huge" style={{ '--c': colors[person.id] }}>{person.name[0]}</span>
        <h1>{person.name}</h1>
        <p>Apna PIN likho</p>
      </div>
      <motion.div className="pin-dots" animate={error ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} key={error || 'ok'}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </motion.div>
      <p className="lock-msg">{error || ' '}</p>
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

/* ---------------- Home ---------------- */
export function Home({ data, me, otherId, names, colors, onAdd, onOpen, goKhata, canInstall, onInstall, onDismissInstall, canNotify, onNotify, onConfirm }) {
  const [notifyHidden, setNotifyHidden] = useState(false);
  const { balance } = data;
  const stats = data.homeStats;
  const entries = data.entries.filter(visible(me));
  const other = names[otherId];
  const owedToMe = balance.amount > 0 && balance.to === me;
  const iOwe = balance.amount > 0 && balance.from === me;
  const mag = balance.amount > 0 ? Math.min(13, 4 + 3 * Math.log10(balance.amount + 1)) : 0;
  const tilt = owedToMe ? -mag : iOwe ? mag : 0;

  const sentence = balance.amount === 0 ? 'Hisaab bilkul barabar hai' : owedToMe ? `${other} ne aap ko dene hain` : `Aap ne ${other} ko dene hain`;

  const wa = () => {
    const text = `Assalam o Alaikum ${other}! Dosti Khata ke hisaab se aap ne mujhe ${rs(balance.amount)} dene hain. ${location.origin}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };

  const a = stats.forOther[me], b = stats.forOther[otherId];
  const myPct = a + b ? (a / (a + b)) * 100 : 50;

  return (
    <div className="screen">
      <section className="hero">
        <Tarazu meName="Aap" otherName={other} meColor={colors[me]} otherColor={colors[otherId]} tilt={tilt} />
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
          <motion.button whileTap={{ scale: 0.96 }} className="btn outline-light" onClick={() => onAdd('payment')}><ArrowUpRight size={18} /> Paise bheje</motion.button>
        </div>
        {iOwe && <button className="hero-link" onClick={() => onAdd('payment', { clear: true })}>Poora {rs(balance.amount)} ek saath clear karo</button>}
        {owedToMe && <button className="hero-link" onClick={wa}><MessageCircle size={15} /> WhatsApp par {other} ko yaad dilao</button>}
      </section>

      {entries.filter((e) => e.type !== 'expense' && e.to === me && !e.confirmedAt).slice(0, 3).map((e) => (
        <motion.div key={e._id} className="confirm-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <strong>{other} ne {rs(e.amount)} {e.type === 'loan' ? 'qarz diya' : 'bheje'}</strong>
            <span>{e.note ? `${e.note}, ` : ''}{dayLabel(e.date)}. Mil gaye?</span>
          </div>
          <button className="btn small ok" onClick={() => onConfirm(e)}>Haan, mil gaye</button>
          <button className="btn small ghost-s" onClick={() => onOpen(e)}>Dekho</button>
        </motion.div>
      ))}

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

      {canNotify && !notifyHidden && (
        <motion.div className="install-card notify" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Bell size={22} />
          <div>
            <strong>Notifications on karo</strong>
            <span>{other} kuch likhe to foran pata chale</span>
          </div>
          <button className="btn small" onClick={onNotify}>On karo</button>
          <button className="icon-btn" aria-label="Chhupao" onClick={() => { setNotifyHidden(true); LS.set('khata.notifyHidden', true); }}><X size={16} /></button>
        </motion.div>
      )}

      <section className="month-panel">
        <header>
          <h2>{monthName(stats.month)}</h2>
          <span>{stats.count} kharche</span>
        </header>
        <div className="paid-bar" aria-hidden="true">
          <motion.span style={{ background: colors[me] }} initial={{ width: '50%' }} animate={{ width: myPct + '%' }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
          <span style={{ background: colors[otherId], flex: 1 }} />
        </div>
        <div className="paid-legend stack">
          <span><i style={{ background: colors[me] }} />Aap ne {other} ke liye diye <b>{rs(a)}</b></span>
          <span><i style={{ background: colors[otherId] }} />{other} ne aap ke liye diye <b>{rs(b)}</b></span>
        </div>
      </section>

      <section className="list-block">
        <header className="block-head">
          <h2>Taaza len-den</h2>
          {entries.length > 0 && <button className="text-btn" onClick={goKhata}>Poora khata <ChevronRight size={16} /></button>}
        </header>
        {entries.length === 0 ? (
          <div className="empty">
            <p>Abhi koi entry nahi. Pehla kharcha likho, hisaab khud banta jayega.</p>
            <button className="btn primary" onClick={() => onAdd('expense')}><Plus size={18} /> Pehla kharcha likho</button>
          </div>
        ) : (
          <div className="entries">
            {entries.slice(0, 6).map((e, i) => <EntryRow key={e._id} e={e} me={me} index={i} names={names} colors={colors} onOpen={onOpen} />)}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Khata ---------------- */
export function Khata({ data, me, otherId, names, colors, onOpen, month, setMonth }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  // Dhoondo: naam, qisam, raqam, ya note
  const matches = (e) => {
    if (!query) return true;
    const v = view(e, me, names);
    const hay = [e.note, catOf(e.type === 'expense' ? e.category : e.type).label, v.line, String(Math.round(v.amount)), String(Math.round(e.amount))].join(' ').toLowerCase();
    return query.split(/\s+/).every((w) => hay.includes(w.replace(/,/g, '')));
  };
  const months = useMemo(() => [...new Set([thisMonth(), ...data.months])].sort().reverse(), [data.months]);
  const other = names[otherId];
  const FILTERS = [
    { id: 'all', label: 'Sab' },
    { id: 'baqi', label: 'Baqi wale' },
    { id: 'theirs', label: `${other} ne diye` },
    { id: 'mine', label: 'Main ne diye' },
    { id: 'payment', label: 'Payments' },
    { id: 'loan', label: 'Qarz' },
  ];

  const list = data.entries.filter(visible(me)).filter(matches).filter((e) => {
    if (!query && month !== 'all' && e.date.slice(0, 7) !== month) return false;
    if (filter === 'baqi') return e.type !== 'payment' && e.calc.left > 0;
    if (filter === 'theirs') return e.type === 'expense' && e.paidBy === otherId;
    if (filter === 'mine') return e.type === 'expense' && e.paidBy === me;
    if (filter === 'payment' || filter === 'loan') return e.type === filter;
    return true;
  });
  const groups = [];
  for (const e of list) {
    const g = groups.at(-1);
    if (g && g.day === e.date) g.items.push(e); else groups.push({ day: e.date, items: [e] });
  }
  const baqiSum = list.filter((e) => e.type !== 'payment').reduce((s, e) => s + e.calc.left, 0);

  return (
    <div className="screen">
      <header className="page-head">
        <h1>Khata</h1>
        <p>Aap aur {other} ka len-den, aur kya clear ho chuka hai</p>
      </header>

      <label className="search">
        <Search size={19} className="s-icon" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dhoondo: petrol, pizza, 850..." aria-label="Dhoondo" enterKeyHint="search" />
        {q && <button className="icon-btn s-clear" onClick={() => setQ('')} aria-label="Saaf karo"><X size={17} /></button>}
      </label>
      {query && <p className="search-note">{list.length} {list.length === 1 ? 'entry' : 'entries'} mili, saare mahinon mein</p>}

      {!query && <div className="scroller months" role="tablist" aria-label="Mahina">
        {[...months, 'all'].map((m) => (
          <button key={m} role="tab" aria-selected={month === m} className={'chip' + (month === m ? ' on' : '')} onClick={() => setMonth(m)}>
            {m === 'all' ? 'Shuru se' : monthShort(m)}
          </button>
        ))}
      </div>}
      <div className="scroller" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={'chip ghost' + (filter === f.id ? ' on' : '')} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {filter === 'baqi' && list.length > 0 && (
        <p className="baqi-note">In mein kul {rs(baqiSum)} baqi hain. Agli payment sab se purane se clear karegi.</p>
      )}

      {groups.length === 0 ? (
        <div className="empty"><p>{filter === 'baqi' ? 'Kuch baqi nahi. Sab clear hai.' : 'Yahan abhi koi entry nahi.'}</p></div>
      ) : groups.map((g) => (
        <section key={g.day} className="day-group">
          <h3>{dayLabel(g.day)}</h3>
          <div className="entries">
            {g.items.map((e, i) => <EntryRow key={e._id} e={e} me={me} index={i} names={names} colors={colors} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Mahina ---------------- */
export function Mahina({ data, me, otherId, names, colors, setMonth }) {
  const s = data.stats;
  const other = names[otherId];
  const months = [...new Set([thisMonth(), ...data.months])].sort().reverse();
  const cats = Object.entries(s.categories).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;

  const [y, m] = s.month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysIn }, (_, i) => {
    const d = `${s.month}-${String(i + 1).padStart(2, '0')}`;
    return { d, v: s.days[d] || 0 };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.v));
  const topDay = days.reduce((a, b) => (b.v > a.v ? b : a), days[0]);

  // Is mahine ka natija: kis ne kis ke liye zyada kiya
  const net = s.forOther[me] - s.forOther[otherId] + s.sent[me] - s.sent[otherId] + (s.lent?.[me] || 0) - (s.lent?.[otherId] || 0);

  return (
    <div className="screen">
      <header className="page-head">
        <h1>{monthName(s.month)}</h1>
        <p>Is mahine aap aur {other} ka len-den</p>
      </header>
      <div className="scroller months">
        {months.map((mm) => (
          <button key={mm} className={'chip' + (s.month === mm ? ' on' : '')} onClick={() => setMonth(mm)}>{monthShort(mm)}</button>
        ))}
      </div>

      <section className="panel">
        <h2>Kis ne kis ke liye kitna</h2>
        <div className="compare">
          <div className="compare-col" style={{ '--c': colors[me] }}>
            <span className="compare-name">Aap</span>
            <dl>
              <div><dt>{other} ke liye diye</dt><dd>{rs(s.forOther[me])}</dd></div>
              <div><dt>{other} ko bheje</dt><dd>{rs(s.sent[me])}</dd></div>
              {s.lent[me] > 0 && <div><dt>{other} ko qarz diya</dt><dd>{rs(s.lent[me])}</dd></div>}
            </dl>
          </div>
          <div className="compare-col" style={{ '--c': colors[otherId] }}>
            <span className="compare-name">{other}</span>
            <dl>
              <div><dt>Aap ke liye diye</dt><dd>{rs(s.forOther[otherId])}</dd></div>
              <div><dt>Aap ko bheje</dt><dd>{rs(s.sent[otherId])}</dd></div>
              {s.lent[otherId] > 0 && <div><dt>Aap ko qarz diya</dt><dd>{rs(s.lent[otherId])}</dd></div>}
            </dl>
          </div>
        </div>
        <p className="month-net">
          {Math.abs(net) < 1 ? 'Is mahine dono ne barabar kiya.'
            : net > 0 ? `Is mahine aap ne ${other} ke liye ${rs(net)} zyada kiya.`
            : `Is mahine ${other} ne aap ke liye ${rs(-net)} zyada kiya.`}
        </p>
      </section>

      <section className="panel">
        <h2>Roz ka len-den</h2>
        {s.total === 0 ? <p className="muted">Is mahine abhi koi kharcha nahi.</p> : (
          <>
            <div className="day-chart" role="img" aria-label="Roz ka len-den chart">
              {days.map((d, i) => (
                <motion.span key={d.d} className={d.v ? 'has' : ''} title={`${shortDay(d.d)}: ${rs(d.v)}`}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.012, type: 'spring', stiffness: 200, damping: 22 }}
                  style={{ height: Math.max(3, (d.v / maxDay) * 100) + '%' }} />
              ))}
            </div>
            <div className="chart-axis"><span>1</span><span>{Math.ceil(daysIn / 2)}</span><span>{daysIn}</span></div>
            <p className="muted">Sab se zyada {shortDay(topDay.d)} ko, {rs(topDay.v)}.</p>
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
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export function InstallGuide({ prompt, onPrompt }) {
  const iPhone = ios();
  const steps = iPhone
    ? [
        { icon: Share, t: 'Neeche Share button dabao', s: 'Safari mein, dabba jis se teer upar ja raha hai' },
        { icon: SquarePlus, t: '"Add to Home Screen" chuno', s: 'List thori neeche scroll karo' },
        { icon: Download, t: 'Upar "Add" dabao', s: 'Bas. Ab app Home Screen se khulegi' },
      ]
    : [
        { icon: EllipsisVertical, t: 'Upar 3 dots dabao', s: 'Chrome mein, daayein kone mein' },
        { icon: Download, t: '"Install app" ya "Add to Home screen"', s: 'Phir "Install" dabao' },
      ];
  return (
    <div className="guide">
      {prompt && (
        <button className="btn primary wide big" onClick={onPrompt}><Download size={19} /> Ek tap mein install karo</button>
      )}
      {iPhone && <p className="guide-note">iPhone par Apple seedha install button nahi deta, is liye sirf 3 qadam:</p>}
      {!iPhone && prompt && <p className="guide-note">Button kaam na kare to ye tareeqa:</p>}
      <ol className="steps">
        {steps.map((st, i) => (
          <li key={i}>
            <span className="step-icon"><st.icon size={20} /></span>
            <span><strong>{st.t}</strong><small>{st.s}</small></span>
          </li>
        ))}
      </ol>
      {iPhone && <div className="ios-arrow" aria-hidden="true"><span>Share button yahan neeche hai</span><i /></div>}
    </div>
  );
}
