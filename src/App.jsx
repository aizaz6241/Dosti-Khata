import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home as HomeIcon, BookOpen, BarChart3, Plus, UserRound, Receipt, ArrowUpRight, LogOut, KeyRound, Smartphone, HandCoins, Bell, BellOff, CloudOff, RefreshCw, History, Mic } from 'lucide-react';
import { api, LS, thisMonth, haptic } from './lib';
import { computeLedger, monthStats } from '../server/ledger.js';
import { useKhata, applyQueue, newId } from './sync';
import { usePush } from './push';
import { chime } from './chime';
import Sheet from './components/Sheet';
import EntryDetail from './components/EntryDetail';
import { ExpenseForm, PaymentForm, PinForm } from './components/Forms';
import { Home, Khata, Mahina, Lock, InstallGuide } from './screens';
import ActivityView, { relevant } from './components/Activity';
import SyncDot from './components/SyncDot';
import VoiceEntry from './components/VoiceEntry';

const COLORS = { aizaz: '#3D52D5', abdullah: '#D4931A' };
const DEFAULT_PEOPLE = [{ id: 'aizaz', name: 'Aizaz' }, { id: 'abdullah', name: 'Abdullah' }];

export default function App() {
  const [token, setToken] = useState(LS.get('khata.token'));
  const [me, setMe] = useState(LS.get('khata.me'));
  const [people, setPeople] = useState(LS.get('khata.people', DEFAULT_PEOPLE));
  const [month, setMonth] = useState(thisMonth());
  const [khataMonth, setKhataMonth] = useState(thisMonth());
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [installEvt, setInstallEvt] = useState(null);
  const [installHidden, setInstallHidden] = useState(LS.get('khata.installHidden', false));
  const toastT = useRef();

  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const otherId = people.map((p) => p.id).find((p) => p !== me);

  const say = (t) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2600); };

  const pushRef = useRef(null);
  const logout = useCallback(() => {
    pushRef.current?.disable?.().catch?.(() => {});
    ['khata.token', 'khata.rows', 'khata.me', 'khata.activity', 'khata.seenAct'].forEach(LS.del);
    setToken(null); setMe(null);
  }, []);

  const ids = useMemo(() => people.map((p) => p.id), [people]);
  const sync = useKhata({ token: token && me ? token : null, me, onError: (m) => say('Sync nahi hui: ' + m), onUnauthorized: logout, onRemote: () => { chime(); haptic([30, 40, 30]); } });
  const pushState = usePush({ token, me });
  pushRef.current = pushState;

  // Hisaab phone par hi banta hai (offline bhi)
  const data = useMemo(() => {
    if (!sync.rows || !me) return null;
    const rows = applyQueue(sync.rows, sync.queue, me, ids);
    const ledger = computeLedger(rows, ids);
    const months = [...new Set(rows.map((r) => String(r.date).slice(0, 7)))].sort().reverse();
    // Har entry ke saath us ki tabdeeliyon ki history
    const activity = (sync.activity || []).filter((a) => relevant(a, me, ids));
    const hist = {};
    for (const a of [...activity].reverse()) (hist[a.key] ||= []).push(a);
    const entries = ledger.entries.map((e) => {
      const h = hist[e.clientId || e._id] || [];
      return { ...e, history: h, edits: h.filter((a) => a.action === 'update') };
    });
    return { people, me, ...ledger, entries, activity, stats: monthStats(rows, ids, month), homeStats: monthStats(rows, ids, thisMonth()), months };
  }, [sync.rows, sync.activity, sync.queue, me, ids, people, month]);
  const [seenAct, setSeenAct] = useState(LS.get('khata.seenAct', 0));
  useEffect(() => { // naam server se (agar badle hon)
    api('/people').then((r) => { setPeople(r.people); LS.set('khata.people', r.people); }).catch(() => {});
  }, []);

  // App icon ko daba kar shortcut (Naya kharcha / Paise bheje)
  useEffect(() => {
    const add = new URLSearchParams(location.search).get('add');
    if (['expense', 'payment', 'loan'].includes(add)) { setSheet({ kind: add }); history.replaceState(null, '', '/'); }
  }, []);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);

  // Android/Chrome: seedha install. iPhone: Apple seedha install nahi karne deta, is liye tareeqa dikhao
  const install = async () => {
    if (installEvt) {
      installEvt.prompt();
      const r = await installEvt.userChoice.catch(() => null);
      setInstallEvt(null);
      setSheet(null);
      if (r?.outcome === 'accepted') say('App install ho rahi hai');
    } else setSheet({ kind: 'install' });
  };

  const login = async (user, pin, reset) => {
    setBusy(true); setLoginErr('');
    try {
      const r = await api('/login', { method: 'POST', body: { user, pin } });
      LS.set('khata.token', r.token); LS.set('khata.me', r.me); LS.set('khata.people', r.people);
      setPeople(r.people); setMe(r.me); setToken(r.token);
    } catch (e) { setLoginErr(e.message); reset(); haptic(60); }
    setBusy(false);
  };

  // Save foran phone par, phir server par (net na ho to baad mein khud)
  const keyOf = (e) => e.clientId || e._id;
  const save = async (body, entry) => {
    await sync.enqueue(entry ? { kind: 'update', key: keyOf(entry), body } : { kind: 'create', key: newId(), body });
    haptic(12);
    setSheet(null);
    const msg = entry ? 'Tabdeeli save ho gayi' : { payment: 'Payment save ho gayi', loan: 'Qarz save ho gaya', expense: 'Kharcha save ho gaya' }[body.type];
    say(navigator.onLine ? msg : msg + '. Net aate hi sync hogi');
  };
  const confirm = async (entry) => {
    await sync.enqueue({ kind: 'confirm', key: keyOf(entry) });
    haptic(15);
    setSheet(null);
    say('Shukriya. Tasdeeq ho gayi ✓');
  };
  const remove = async (entry) => {
    await sync.enqueue({ kind: 'delete', key: keyOf(entry) });
    setSheet(null);
    say(navigator.onLine ? 'Entry delete ho gayi' : 'Delete ho gayi. Net aate hi sync hogi');
  };
  const changePin = async (oldPin, newPin) => {
    setBusy(true);
    try {
      const r = await api('/pin', { method: 'POST', body: { oldPin, newPin } });
      LS.set('khata.token', r.token); setToken(r.token);
      setSheet(null); say('PIN badal gaya');
    } finally { setBusy(false); }
  };

  if (!token || !me) return <Lock people={people} colors={COLORS} onLogin={login} error={loginErr} busy={busy} />;
  if (!data && !sync.online) return <div className="boot"><p className="boot-msg">Pehli dafa ke liye internet chahiye. Net on kar ke dobara kholo.</p></div>;
  if (!data) return <div className="boot"><span className="spinner" /></div>;

  const byId = Object.fromEntries(data.entries.map((e) => [e._id, e]));
  const open = (e) => setSheet({ kind: 'detail', entry: byId[e._id] || e });
  const pending = sync.queue.length;
  const byKey = Object.fromEntries(data.entries.map((e) => [e.clientId || e._id, e]));
  const unread = data.activity.filter((a) => a.by !== me && new Date(a.at).getTime() > seenAct).length;
  const openActivity = () => { setTab('activity'); const t = Date.now(); setSeenAct(t); LS.set('khata.seenAct', t); };
  const add = (kind, opts = {}) => { haptic(); setSheet({ kind, ...opts }); };
  const balance = data.balance;
  const common = { me, otherId, names, colors: COLORS };

  const screens = {
    home: <Home data={data} {...common} onAdd={add} onOpen={open} goKhata={() => setTab('khata')}
      canInstall={!standalone && !installHidden} onInstall={install}
      onDismissInstall={() => { setInstallHidden(true); LS.set('khata.installHidden', true); }}
      onConfirm={confirm}
      canNotify={pushState.supported && !pushState.on && !LS.get('khata.notifyHidden')} onNotify={notifyToggle} />,
    khata: <Khata data={data} {...common} onOpen={open} month={khataMonth} setMonth={setKhataMonth} />,
    mahina: <Mahina data={data} {...common} setMonth={setMonth} />,
    activity: <ActivityView activity={data.activity} me={me} ids={ids} names={names} colors={COLORS} byKey={byKey} onOpen={open} />,
  };

  const s = sheet;
  const formProps = { ...common, busy };
  let sheetTitle = '', sheetBody = null;
  const aiProps = s?.prefill ? { prefill: s.prefill, ai: s.ai } : {};
  if (s?.kind === 'expense') { sheetTitle = 'Naya kharcha'; sheetBody = <ExpenseForm {...formProps} {...aiProps} onSave={(b) => save(b)} />; }
  if (s?.kind === 'loan') { sheetTitle = 'Qarz'; sheetBody = <PaymentForm {...formProps} {...aiProps} loan balance={balance} onSave={(b) => save(b)} />; }
  if (s?.kind === 'payment') { sheetTitle = 'Paise bheje'; sheetBody = <PaymentForm {...formProps} {...aiProps} balance={balance} prefillClear={s.clear} onSave={(b) => save(b)} />; }
  if (s?.kind === 'ai') {
    sheetTitle = 'Bol kar likho';
    sheetBody = <VoiceEntry otherName={names[otherId]} online={sync.online}
      onResult={(r) => setSheet({ kind: r.form.type, prefill: r.form, ai: { transcript: r.transcript, assumed: r.assumed, missing: r.missing, question: r.question } })} />;
  }
  if (s?.kind === 'detail') {
    sheetTitle = { payment: 'Payment', loan: 'Qarz', expense: 'Kharcha' }[s.entry.type];
    sheetBody = <EntryDetail e={s.entry} {...common} byId={byId} onOpen={open} onConfirm={confirm} onEdit={() => setSheet({ kind: 'edit', entry: s.entry })} />;
  }
  if (s?.kind === 'edit') {
    sheetTitle = 'Entry badlo';
    sheetBody = s.entry.type !== 'expense'
      ? <PaymentForm {...formProps} loan={s.entry.type === 'loan'} balance={balance} initial={s.entry} onSave={(b) => save(b, s.entry)} onDelete={() => remove(s.entry)} />
      : <ExpenseForm {...formProps} initial={s.entry} onSave={(b) => save(b, s.entry)} onDelete={() => remove(s.entry)} />;
  }
  if (s?.kind === 'chooser') {
    sheetTitle = 'Kya likhna hai?';
    sheetBody = (
      <div className="chooser">
        <motion.button className="ai-choice" whileTap={{ scale: 0.97 }} onClick={() => setSheet({ kind: 'ai' })}>
          <span className="ch-icon ai"><Mic size={22} /></span>
          <span><strong>Bol kar likho</strong><small>Apne andaz mein bolo ya likho, AI form bhar dega. Save aap karoge.</small></span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSheet({ kind: 'expense' })}>
          <span className="ch-icon"><Receipt size={22} /></span>
          <span><strong>Kharcha</strong><small>Kisi ne doosre ke liye paise diye: sabzi, khana, program, kuch bhi</small></span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSheet({ kind: 'payment' })}>
          <span className="ch-icon pay"><ArrowUpRight size={22} /></span>
          <span><strong>Paise bheje</strong><small>Hisaab clear karne ke liye ek ne doosre ko paise bheje</small></span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSheet({ kind: 'loan' })}>
          <span className="ch-icon loan"><HandCoins size={22} /></span>
          <span><strong>Qarz</strong><small>Ek ne doosre ko udhaar diya, jo wapas karna hai</small></span>
        </motion.button>
      </div>
    );
  }
  if (s?.kind === 'install') { sheetTitle = 'Phone par lagao'; sheetBody = <InstallGuide prompt={installEvt} onPrompt={install} />; }
  if (s?.kind === 'pin') { sheetTitle = 'PIN badlo'; sheetBody = <PinForm busy={busy} onSave={changePin} />; }
  if (s?.kind === 'settings') {
    sheetTitle = 'Mera account';
    sheetBody = (
      <div className="settings">
        <div className="me-card" style={{ '--c': COLORS[me] }}>
          <span className="who-av">{names[me][0]}</span>
          <div><strong>{names[me]}</strong><small>Aap ka apna account</small></div>
        </div>
        <button className="set-row" onClick={notifyToggle} disabled={pushState.busy}>
          {pushState.on ? <BellOff size={18} /> : <Bell size={18} />}
          <span className="set-text">{pushState.on ? 'Notifications band karo' : 'Notifications on karo'}<small>{pushState.on ? 'Is phone par aa rahi hain. Android par alag awaaz: Settings > Apps > Dosti Khata > Notifications' : 'Nayi entry, raat 10 baje, aur mahine ki 1 se 5 tareekh ki yaad-dihani'}</small></span>
        </button>
        {pushState.on && <button className="set-row" onClick={async () => { const n = await pushState.test(); say(n ? 'Test notification bheji' : 'Notification nahi gayi'); }}><Bell size={18} /> Test notification bhejo</button>}
        <button className="set-row" onClick={() => setSheet({ kind: 'pin' })}><KeyRound size={18} /> PIN badlo</button>
        {!standalone && <button className="set-row" onClick={install}><Smartphone size={18} /> {installEvt ? 'App install karo' : 'Phone par app lagao'}</button>}
        <button className="set-row" onClick={() => { sync.flush(); say('Sync ho raha hai'); }}><RefreshCw size={18} /> Abhi sync karo</button>
        <button className="set-row danger" onClick={() => { setSheet(null); logout(); }}><LogOut size={18} /> Log out</button>
      </div>
    );
  }

  async function notifyToggle() {
    const r = pushState.on ? await pushState.disable() : await pushState.enable();
    if (r) say(r);
  }

  const tabs = [
    { id: 'home', label: 'Ghar', icon: HomeIcon },
    { id: 'khata', label: 'Khata', icon: BookOpen },
    { id: 'plus' },
    { id: 'mahina', label: 'Mahina', icon: BarChart3 },
    { id: 'me', label: names[me], icon: UserRound },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="hello">Assalam o Alaikum</p>
          <p className="hello-name">{names[me]}</p>
        </div>
        <SyncDot online={sync.online} live={sync.live} pending={pending} syncing={sync.syncing} />
        <button className={'act-btn' + (tab === 'activity' ? ' on' : '')} onClick={openActivity} aria-label={unread ? `Activity, ${unread} nayi` : 'Activity'}>
          <History size={21} />
          {unread > 0 && <motion.span className="badge" initial={{ scale: 0 }} animate={{ scale: 1 }}>{unread > 9 ? '9+' : unread}</motion.span>}
        </button>
        <button className="avatar" style={{ '--c': COLORS[me] }} onClick={() => setSheet({ kind: 'settings' })} aria-label="Mera account">{names[me][0]}</button>
      </header>

      <main>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {screens[tab]}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => t.id === 'plus' ? (
          <motion.button key="plus" className="fab" whileTap={{ scale: 0.9, rotate: 90 }} onClick={() => { haptic(); setSheet({ kind: 'chooser' }); }} aria-label="Nayi entry">
            <Plus size={26} strokeWidth={2.4} />
          </motion.button>
        ) : (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => (t.id === 'me' ? setSheet({ kind: 'settings' }) : setTab(t.id))}>
            {tab === t.id && <motion.span layoutId="tab-dot" className="tab-dot" />}
            <t.icon size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <Sheet open={!!s} onClose={() => setSheet(null)} title={sheetTitle}>{sheetBody}</Sheet>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
