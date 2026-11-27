import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home as HomeIcon, BookOpen, BarChart3, Plus, UserRound, Receipt, ArrowUpRight, LogOut, Repeat, Smartphone } from 'lucide-react';
import { api, LS, thisMonth, haptic } from './lib';
import Sheet from './components/Sheet';
import EntryDetail from './components/EntryDetail';
import { ExpenseForm, PaymentForm } from './components/Forms';
import { Home, Khata, Mahina, Lock, WhoAmI, InstallGuide } from './screens';

const COLORS = { aizaz: '#3D52D5', abdullah: '#D4931A' };

export default function App() {
  const [token, setToken] = useState(LS.get('khata.token'));
  const [me, setMe] = useState(LS.get('khata.me'));
  const [people, setPeople] = useState(LS.get('khata.people', [{ id: 'aizaz', name: 'Aizaz' }, { id: 'abdullah', name: 'Abdullah' }]));
  const [data, setData] = useState(LS.get('khata.cache'));
  const [month, setMonth] = useState(thisMonth());
  const [khataMonth, setKhataMonth] = useState(thisMonth());
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [offline, setOffline] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);
  const [installHidden, setInstallHidden] = useState(LS.get('khata.installHidden', false));
  const toastT = useRef();

  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const ids = people.map((p) => p.id);

  const say = (t) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2400); };

  const logout = useCallback(() => { LS.del('khata.token'); LS.del('khata.cache'); setToken(null); setData(null); }, []);

  const load = useCallback(async () => {
    if (!LS.get('khata.token')) return;
    try {
      const d = await api('/ledger?month=' + month);
      setData(d); setOffline(false);
      LS.set('khata.cache', d);
    } catch (e) {
      if (e.status === 401) logout(); else setOffline(true);
    }
  }, [month, logout]);

  useEffect(() => { load(); }, [load, token]);
  useEffect(() => {
    const t = setInterval(load, 20000);
    const v = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [load]);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);

  const login = async (pin, reset) => {
    setBusy(true); setLoginErr('');
    try {
      const r = await api('/login', { method: 'POST', body: { pin } });
      LS.set('khata.token', r.token); LS.set('khata.people', r.people);
      setPeople(r.people); setToken(r.token);
    } catch (e) { setLoginErr(e.message); reset(); haptic(60); }
    setBusy(false);
  };

  const save = async (body, entry) => {
    setBusy(true);
    try {
      if (entry) await api('/entries/' + entry._id, { method: 'PUT', body });
      else await api('/entries', { method: 'POST', body });
      haptic(12);
      setSheet(null);
      say(entry ? 'Tabdeeli save ho gayi' : body.type === 'payment' ? 'Payment save ho gayi' : 'Kharcha save ho gaya');
      await load();
    } catch (e) { say(e.message); }
    setBusy(false);
  };
  const remove = async (entry) => {
    setBusy(true);
    try { await api('/entries/' + entry._id, { method: 'DELETE' }); setSheet(null); say('Entry delete ho gayi'); await load(); }
    catch (e) { say(e.message); }
    setBusy(false);
  };

  if (!token) return <Lock onLogin={login} people={people} error={loginErr} busy={busy} />;
  if (!me || !ids.includes(me)) return <WhoAmI people={people} onPick={(id) => { LS.set('khata.me', id); setMe(id); }} />;
  if (!data) return <div className="boot"><span className="spinner" /></div>;

  const byId = Object.fromEntries(data.entries.map((e) => [e._id, e]));
  const open = (e) => setSheet({ kind: 'detail', entry: byId[e._id] || e });
  const add = (kind, opts = {}) => { haptic(); setSheet({ kind, ...opts }); };
  const balance = data.balance;
  const changeMonth = (m) => setMonth(m);
  const other = ids.find((p) => p !== me);

  const screens = {
    home: <Home data={data} me={me} names={names} colors={COLORS} onAdd={add} onOpen={open} goKhata={() => setTab('khata')}
      canInstall={!standalone && !installHidden} onInstall={() => setSheet({ kind: 'install' })}
      onDismissInstall={() => { setInstallHidden(true); LS.set('khata.installHidden', true); }} />,
    khata: <Khata data={data} names={names} colors={COLORS} onOpen={open} month={khataMonth} setMonth={setKhataMonth} />,
    mahina: <Mahina data={data} me={me} names={names} colors={COLORS} month={month} setMonth={changeMonth} />,
  };

  const s = sheet;
  const formProps = { me, people: ids, names, colors: COLORS, busy };
  let sheetTitle = '', sheetBody = null;
  if (s?.kind === 'expense') { sheetTitle = 'Naya kharcha'; sheetBody = <ExpenseForm {...formProps} onSave={(b) => save(b)} />; }
  if (s?.kind === 'payment') { sheetTitle = 'Paise diye'; sheetBody = <PaymentForm {...formProps} balance={balance} prefillClear={s.clear} onSave={(b) => save(b)} />; }
  if (s?.kind === 'detail') { sheetTitle = s.entry.type === 'payment' ? 'Payment' : 'Kharcha'; sheetBody = <EntryDetail e={s.entry} byId={byId} names={names} colors={COLORS} onOpen={open} onEdit={() => setSheet({ kind: 'edit', entry: s.entry })} />; }
  if (s?.kind === 'edit') {
    sheetTitle = 'Entry badlo';
    sheetBody = s.entry.type === 'payment'
      ? <PaymentForm {...formProps} balance={balance} initial={s.entry} onSave={(b) => save(b, s.entry)} onDelete={() => remove(s.entry)} />
      : <ExpenseForm {...formProps} initial={s.entry} onSave={(b) => save(b, s.entry)} onDelete={() => remove(s.entry)} />;
  }
  if (s?.kind === 'chooser') {
    sheetTitle = 'Kya likhna hai?';
    sheetBody = (
      <div className="chooser">
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSheet({ kind: 'expense' })}>
          <span className="ch-icon"><Receipt size={22} /></span>
          <span><strong>Kharcha</strong><small>Dukaan, khana, chai, kuch bhi jo kisi ne pay kiya</small></span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSheet({ kind: 'payment' })}>
          <span className="ch-icon pay"><ArrowUpRight size={22} /></span>
          <span><strong>Paise diye</strong><small>Ek ne doosre ko hisaab ke paise bheje</small></span>
        </motion.button>
      </div>
    );
  }
  if (s?.kind === 'install') { sheetTitle = 'Phone par lagao'; sheetBody = <InstallGuide prompt={installEvt} onPrompt={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); setSheet(null); }} />; }
  if (s?.kind === 'settings') {
    sheetTitle = 'Settings';
    sheetBody = (
      <div className="settings">
        <div className="me-card" style={{ '--c': COLORS[me] }}>
          <span className="who-av">{names[me][0]}</span>
          <div><strong>{names[me]}</strong><small>Is phone par aap ka naam</small></div>
        </div>
        <button className="set-row" onClick={() => { LS.set('khata.me', other); setMe(other); setSheet(null); say(`Ab app ${names[other]} ke naam se hai`); }}>
          <Repeat size={18} /> Main {names[other]} hoon, naam badlo
        </button>
        {!standalone && <button className="set-row" onClick={() => setSheet({ kind: 'install' })}><Smartphone size={18} /> Phone par app lagao</button>}
        <button className="set-row danger" onClick={() => { setSheet(null); logout(); }}><LogOut size={18} /> App lock karo</button>
      </div>
    );
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
        {offline && <span className="offline">Offline, purana data</span>}
        <button className="avatar" style={{ '--c': COLORS[me] }} onClick={() => setSheet({ kind: 'settings' })} aria-label="Settings">{names[me][0]}</button>
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
