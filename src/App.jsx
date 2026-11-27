import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home as HomeIcon, BookOpen, BarChart3, Plus, Receipt, ArrowUpRight, LogOut, KeyRound, Smartphone, HandCoins, Bell, BellOff, RefreshCw, History, Mic, ArrowDownLeft, ArrowLeftRight, CalendarDays, Landmark, Users, Undo2, Grip, ListOrdered, FileDown, Target, Coins, UserRound, ShieldCheck, Link2, Download } from 'lucide-react';
import { api, LS, thisMonth, haptic, nowTime, today } from './lib';
import { computeLedger, monthStats } from '../server/ledger.js';
import { useKhata, applyQueue, applyMine, newId } from './sync';
import { accountBalances, peopleLedger, netWorth, monthReport, toPKR, idOf, sharedSpend, khataFlows, effectiveRates, flowOf, rangeReport } from '../server/money.js';
import { MeraHome, MeraAccounts, MeraAnalytics, MeraPeople, MeraTxns, AccountDetail, ContactDetail } from './mine/MeraScreen';
import RangePicker from './mine/RangePicker';
import { periodOf, periodLabel, shiftPeriod } from './mine/period';
import AccountLink from './mine/AccountLink';
import ModeSwitch from './components/ModeSwitch';
import { TxnForm, AccountForm, ContactForm, RatesForm } from './mine/forms';
import { setCustomCats } from './mine/meta';
import BudgetForm from './mine/BudgetForm';
import BackupSheet, { buildBackup, saveBackup, backupCfg, isIOS, BK } from './mine/Backup';
import PayoutSheet from './mine/Payout';
import { usePush } from './push';
import { chime } from './chime';
import Sheet from './components/Sheet';
import EntryDetail from './components/EntryDetail';
import { ExpenseForm, PaymentForm, PinForm } from './components/Forms';
import { Home, Khata, Mahina, Lock, InstallGuide } from './screens';
import ActivityView, { relevant } from './components/Activity';
import SyncDot from './components/SyncDot';
import VoiceEntry from './components/VoiceEntry';
import BatchReview, { itemOk } from './components/BatchReview';

const COLORS = { aizaz: '#3D52D5', abdullah: '#D4931A' };
const DEFAULT_PEOPLE = [{ id: 'aizaz', name: 'Aizaz' }, { id: 'abdullah', name: 'Abdullah' }];

export default function App() {
  const [token, setToken] = useState(LS.get('khata.token'));
  const [me, setMe] = useState(LS.get('khata.me'));
  const [people, setPeople] = useState(LS.get('khata.people', DEFAULT_PEOPLE));
  const [month, setMonth] = useState(thisMonth());
  const [khataMonth, setKhataMonth] = useState(thisMonth());
  const [mode, setModeRaw] = useState(LS.get('khata.mode', 'dosti')); // 'dosti' (saanjha khata) ya 'mera' (apna paisa)
  const [tabs2, setTabs2] = useState({ dosti: 'home', mera: 'home' });
  const tab = tabs2[mode];
  const setTab = (id) => setTabs2((t) => ({ ...t, [mode]: id }));
  const setMode = (m) => { if (m === mode) return; haptic(10); setModeRaw(m); LS.set('khata.mode', m); window.scrollTo({ top: 0 }); };
  const [live, setLive] = useState(LS.get('khata.rates', null)); // live currency rate
  useEffect(() => { // rang: Mera neela, Dosti hara
    document.body.dataset.mode = token ? mode : 'dosti';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', token && mode === 'mera' ? '#1E2878' : '#0F3D33');
  }, [mode, token]);
  const [sheet, setSheet] = useState(null);
  // Android ka "back" button: pehle sheet band ho, app band na ho
  const sheetOpen = !!sheet;
  const pushed = useRef(false); // humne history mein ek qadam joda hai?
  useEffect(() => {
    if (sheetOpen && !pushed.current) { pushed.current = true; history.pushState({ sheet: true }, ''); }
    else if (!sheetOpen && pushed.current) { pushed.current = false; history.back(); }
  }, [sheetOpen]);
  useEffect(() => {
    const pop = () => { if (pushed.current) { pushed.current = false; setSheet(null); } };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const [batch, setBatch] = useState(null); // AI ki kai entries, save se pehle
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
    ['khata.token', 'khata.rows', 'khata.me', 'khata.activity', 'khata.seenAct', 'khata.mine', 'khata.lastAcc'].forEach(LS.del);
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
    return { people, me, rows, ...ledger, entries, activity, stats: monthStats(rows, ids, month), homeStats: monthStats(rows, ids, thisMonth()), months };
  }, [sync.rows, sync.activity, sync.queue, me, ids, people, month]);
  const [seenAct, setSeenAct] = useState(LS.get('khata.seenAct', 0));
  // Din badalne par (raat 12 baje, ya app subah khule) hisaab khud naye din/mahine par
  const [dayKey, setDayKey] = useState(today());
  useEffect(() => {
    const check = () => setDayKey((d) => (d === today() ? d : today()));
    const t = setInterval(check, 60e3);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, []);
  const meraMonth = dayKey.slice(0, 7);
  const prevDay = useRef(dayKey);
  const [aPeriod, setAPeriod] = useState(() => periodOf('month')); // analytics ki muddat
  const [tPeriod, setTPeriod] = useState(() => periodOf('month')); // len-den ki muddat
  useEffect(() => { // purana "is hafte/is mahine" khula tha to naye wale par le jao
    const old = prevDay.current; prevDay.current = dayKey;
    if (old === dayKey) return;
    const roll = (p) => (['week', 'month', 'year'].includes(p.kind) && old >= p.from && old <= p.to ? periodOf(p.kind, dayKey) : p);
    setAPeriod(roll); setTPeriod(roll);
  }, [dayKey]);

  // Mera Hisaab: phone par hi hisaab (offline bhi). Dosti khata bhi is mein gina jata hai.
  const mera = useMemo(() => {
    const mine = applyMine(sync.mine, sync.queue, me);
    setCustomCats(mine.prefs?.customCats);
    const rates = effectiveRates(mine.prefs, live?.rates);
    const rows = data?.rows || [];
    const flows = khataFlows(mine.links, rows, me); // khate ki entries jo kisi account se judi hain
    const allTx = [...mine.ptx, ...flows];
    const spend = sharedSpend(rows, me); // khate mein mera hissa = mera kharcha
    const balances = accountBalances(mine.accounts, allTx);
    const people = peopleLedger(mine.contacts.filter((c) => !c.archived), mine.ptx, mine.accounts);
    const worth = netWorth(mine.accounts, balances, rates);
    let owedToMe = 0, iOwe = 0;
    for (const p of Object.values(people)) { // ek bande ke sab currency wale baqi rupay mein mila kar
      let net = 0;
      for (const [cur, v] of Object.entries(p.balance)) net += toPKR(v, cur, rates) ?? 0;
      if (net > 0) owedToMe += net; else iOwe += -net;
    }
    const b = data?.balance;
    if (b?.amount > 0) { if (b.from === me) iOwe += b.amount; else owedToMe += b.amount; }
    const linkOf = Object.fromEntries(mine.links.map((l) => [String(l.entryId), l.accountId]));
    const reportFor = (m) => monthReport(mine.ptx, mine.accounts, m, rates, spend);
    const reportRange = (p) => {
      const pw = ['week', 'month', 'year'].includes(p.kind) ? shiftPeriod(p, -1) : null; // pichla asal mahina/hafta/saal
      return rangeReport(mine.ptx, mine.accounts, p.kind === 'all' ? minDate : p.from, p.kind === 'all' ? today() : p.to, rates, spend, pw);
    };
    const minDate = [...allTx, ...spend].reduce((m, t) => (t.date && t.date < m ? t.date : m), today());
    const budget = Number(mine.prefs?.budget) || 0;
    const catBudgets = mine.prefs?.catBudgets || {};
    return { mine, rates, balances, people, worth, owedToMe, iOwe, allTx, spend, linkOf, reportFor, reportRange, minDate, budget, catBudgets, report: reportFor(meraMonth) };
  }, [sync.mine, sync.queue, me, meraMonth, live, data, dayKey]);

  // Khud backup: waqt ho gaya to Android par file khud save, iPhone par ek tap wala card
  const [backupDue, setBackupDue] = useState(false);
  const autoRan = useRef(false);
  const latest = useRef({}); latest.current = { data, mine: sync.mine, queue: sync.queue, people };
  const dataReady = !!data && !!sync.rows;
  useEffect(() => {
    if (!token || !me || !dataReady || autoRan.current) return;
    autoRan.current = true;
    const c = backupCfg();
    if (!c.last) { LS.set(BK, { ...c, last: Date.now() }); return; } // pehli dafa: aaj se ginti
    if (!c.every || Date.now() - c.last < c.every * 864e5) return;
    // Thora ruk kar (taake server se taza data aa jaye), phir save. Timer cancel nahi hota.
    setTimeout(async () => {
      const L = latest.current;
      const mineNow = applyMine(L.mine, L.queue, me);
      if ((mineNow.ptx.length + (L.data?.rows?.length || 0)) === 0) { LS.set(BK, { ...c, last: Date.now() }); return; }
      if (isIOS()) { setBackupDue(true); return; }
      try { await saveBackup(buildBackup({ me, names: Object.fromEntries(L.people.map((p) => [p.id, p.name])), mine: mineNow, rows: L.data.rows }), { share: false }); LS.set(BK, { ...c, last: Date.now() }); say('Backup khud phone mein save ho gaya (Downloads)'); }
      catch { setBackupDue(true); }
    }, 5000);
  }, [token, me, dataReady]);

  // PDF wala hissa pehle se load: phir net na ho tab bhi PDF ban jaye
  useEffect(() => {
    if (mode !== 'mera' || !navigator.onLine) return;
    const t = setTimeout(() => { import('./mine/pdf.js').then((m) => m.warm?.()).catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [mode]);

  // Live rate (USDT: Binance P2P) — jab koi doosri currency ka account ho
  const needLive = mera.mine.accounts.some((a) => !a.archived && a.currency && a.currency !== 'PKR');
  useEffect(() => {
    if (!token || !needLive) return;
    let stop = false;
    const get = () => { if (document.visibilityState !== 'visible' || !navigator.onLine) return; api('/rates').then((r) => { if (!stop && r?.rates) { setLive(r); LS.set('khata.rates', r); } }).catch(() => {}); };
    get();
    const t = setInterval(get, 3 * 60e3);
    const v = () => get();
    document.addEventListener('visibilitychange', v);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [token, needLive]);
  // Login token ki muddat khatam hone se pehle khud naya (dobara PIN na dalna pare)
  useEffect(() => {
    if (!token || !navigator.onLine) return;
    const p = token.split('.');
    if (p.length === 3 && Number(p[1]) - Date.now() / 1000 > 60 * 86400) return;
    api('/token', { method: 'POST' }).then((r) => { if (r?.token && r.token !== token) { LS.set('khata.token', r.token); setToken(r.token); } }).catch(() => {});
  }, [token]);
  useEffect(() => { // naam server se (agar badle hon)
    api('/people').then((r) => { setPeople(r.people); LS.set('khata.people', r.people); }).catch(() => {});
  }, []);

  // App icon ko daba kar shortcut (Naya kharcha / Paise bheje)
  useEffect(() => {
    const add = new URLSearchParams(location.search).get('add');
    if (['expense', 'payment', 'loan'].includes(add)) { setModeRaw('dosti'); setSheet({ kind: add }); history.replaceState(null, '', '/'); }
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
  // Khate ki entry ko mere account se jodo / alag karo (sirf mere liye)
  const setLink = async (entryKey, accountId) => {
    const old = mera.mine.links.find((l) => String(l.entryId) === String(entryKey));
    const key = old ? idOf(old) : `lnk-${me}-${entryKey}`; // har bande ki apni key (dono jod saken)
    if (accountId) { LS.set('khata.lastAcc', accountId); await sync.enqueue({ col: 'links', kind: 'create', key, body: { entryId: entryKey, accountId } }); }
    else if (mera.linkOf[entryKey]) await sync.enqueue({ col: 'links', kind: 'delete', key });
  };
  const save = async (raw, entry) => {
    const { _link, ...body } = raw;
    const key = entry ? keyOf(entry) : newId();
    await sync.enqueue(entry ? { kind: 'update', key, body } : { kind: 'create', key, body });
    if (_link !== undefined) await setLink(key, _link);
    haptic(12);
    setSheet(null);
    const msg = entry ? 'Tabdeeli save ho gayi' : { payment: 'Payment save ho gayi', loan: 'Qarz save ho gaya', expense: 'Kharcha save ho gaya' }[body.type];
    say(navigator.onLine ? msg : msg + '. Net aate hi sync hogi');
  };
  // Mera Hisaab: save / delete (pehle phone, phir server)
  const mSave = async (col, body, row) => {
    const key = row ? idOf(row) : newId();
    await sync.enqueue({ col, kind: row ? 'update' : 'create', key, body });
    return key;
  };
  const mRemove = async (col, row) => { await sync.enqueue({ col, kind: 'delete', key: idOf(row) }); };
  const quickAccount = (body) => { const key = newId(); sync.enqueue({ col: 'accounts', kind: 'create', key, body: { ...body, archived: false } }); return key; };
  const quickContact = (body) => { const key = newId(); sync.enqueue({ col: 'contacts', kind: 'create', key, body: { ...body, phone: '', archived: false } }); return key; };
  const doneMsg = (m) => say(navigator.onLine ? m : m + '. Net aate hi sync hoga');

  const confirm = async (entry) => {
    await sync.enqueue({ kind: 'confirm', key: keyOf(entry) });
    haptic(15);
    setSheet(null);
    say('Shukriya. Tasdeeq ho gayi ✓');
  };
  const remove = async (entry) => {
    await sync.enqueue({ kind: 'delete', key: keyOf(entry) });
    if (mera.linkOf[keyOf(entry)]) await setLink(keyOf(entry), '');
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

  const unread = data ? data.activity.filter((a) => a.by !== me && new Date(a.at).getTime() > seenAct).length : 0;
  useEffect(() => { // Badlav dekh liye
    if (mode === 'dosti' && tab === 'activity' && unread) { const t = Date.now(); setSeenAct(t); LS.set('khata.seenAct', t); }
  }, [mode, tab, unread]);

  if (!token || !me) return <Lock people={people} colors={COLORS} onLogin={login} error={loginErr} busy={busy} />;
  if (!data && !sync.online) return <div className="boot"><p className="boot-msg">Pehli dafa ke liye internet chahiye. Net on kar ke dobara kholo.</p></div>;
  if (!data) return <div className="boot"><span className="spinner" /></div>;

  const byId = Object.fromEntries(data.entries.map((e) => [e._id, e]));
  const open = (e) => setSheet({ kind: 'detail', entry: byId[e._id] || e });
  const pending = sync.queue.length;
  const byKey = Object.fromEntries(data.entries.map((e) => [e.clientId || e._id, e]));
  const add = (kind, opts = {}) => { haptic(); setSheet({ kind, ...opts }); };
  const balance = data.balance;
  const common = { me, otherId, names, colors: COLORS };

  const otherName = names[otherId];
  const goShared = () => { setMode('dosti'); setTabs2((t) => ({ ...t, dosti: 'khata' })); };
  const openTxn = (t) => (t.synthetic ? (byKey[t.entryId] ? open(byKey[t.entryId]) : null) : setSheet({ kind: 'ptx', row: t }));
  const pdf = async (period) => {
    say('PDF ban raha hai...');
    try {
      const { exportPdf } = await import('./mine/pdf.js');
      const range = period && period.kind !== 'all' ? { from: period.from, to: period.to, label: periodLabel(period) } : null;
      const r = await exportPdf({ name: names[me], mine: mera.mine, balances: mera.balances, people: mera.people, worth: mera.worth, shared: data, me, names, rates: mera.rates, spend: mera.spend, allTx: mera.allTx, range, reportRange: mera.reportRange });
      if (r !== 'cancel') say(r === 'shared' ? 'PDF tayyar' : 'PDF download ho gaya');
    } catch (e) { say('PDF nahi bana: ' + e.message); }
  };
  // Home ka refresh: server se sab dobara + naya rate
  const refreshAll = async () => {
    if (!navigator.onLine) { say('Net nahi hai. Jo phone mein hai woh dikh raha hai, net aate hi khud sync hoga.'); return false; }
    try {
      await sync.flush();
      if (!(await sync.pull())) throw new Error('pull');
      if (needLive) { const r = await api('/rates'); if (r?.rates) { setLive(r); LS.set('khata.rates', r); } }
      haptic([12, 40, 12]); say('Sab refresh ho gaya ✓'); return true;
    } catch { say('Refresh nahi hua, thori der baad dobara dabao'); return false; }
  };
  // ---- Backup ----
  const makeBackup = () => buildBackup({ me, names, mine: mera.mine, rows: data.rows });
  const restoreBackup = async (b) => {
    const have = (list) => new Set(list.flatMap((x) => [String(x.clientId || ''), String(x._id || '')]).filter(Boolean));
    let n = 0;
    for (const col of ['accounts', 'contacts', 'ptx', 'links']) {
      const cur = have(mera.mine[col] || []);
      for (const x of b.mine[col] || []) {
        const key = String(x.clientId || x._id || '');
        if (!key || cur.has(key)) continue; // pehle se hai: chhoro
        const { _id, clientId, owner, createdAt, updatedAt, __v, pending, ...body } = x;
        await sync.enqueue({ col, kind: 'create', key, body }); n++;
      }
    }
    const curE = have(data.rows);
    for (const e of b.shared || []) {
      const key = String(e.clientId || e._id || '');
      if (!key || curE.has(key) || e.createdBy !== me) continue;
      const { _id, clientId, createdBy, createdAt, updatedAt, __v, fileId, fileUrl, fileKey, confirmedAt, confirmedBy, ...body } = e;
      if (body.type === 'expense') body.owed = Number(body.shares?.[ids.find((p) => p !== body.paidBy)] || 0); // server ko hissa chahiye
      await sync.enqueue({ kind: 'create', key, body }); n++;
    }
    const p = b.mine.prefs || {};
    if (!mera.budget && p.budget || (p.customCats || []).some((c) => !prefsBase.customCats.some((x) => x.id === c.id))) {
      await sync.enqueue({ col: 'prefs', kind: 'create', key: 'prefs', body: { ...prefsBase, budget: prefsBase.budget || p.budget || 0, catBudgets: { ...(p.catBudgets || {}), ...prefsBase.catBudgets }, customCats: [...prefsBase.customCats, ...(p.customCats || []).filter((c) => !prefsBase.customCats.some((x) => x.id === c.id))], rates: { ...(p.rates || {}), ...prefsBase.rates } } }); n++;
    }
    return n;
  };
  const pickRange = (value, onApply) => setSheet({ kind: 'range', value, onApply });
  const prefsBase = { rates: mera.mine.prefs?.rates || {}, manual: mera.mine.prefs?.manual || [], budget: Number(mera.mine.prefs?.budget) || 0, customCats: mera.mine.prefs?.customCats || [], catBudgets: mera.mine.prefs?.catBudgets || {} };
  const addCategory = (c) => { sync.enqueue({ col: 'prefs', kind: 'create', key: 'prefs', body: { ...prefsBase, customCats: [...prefsBase.customCats, c] } }); haptic(10); say(`"${c.label}" category ban gayi`); };
  const savePrefs = async (b, msg) => { await sync.enqueue({ col: 'prefs', kind: 'create', key: 'prefs', body: { ...prefsBase, ...b } }); setSheet(null); doneMsg(msg); };
  const mcommon = { mine: mera.mine, otherName, rates: mera.rates, live, onRates: () => setSheet({ kind: 'rates' }), onNewAccount: () => setSheet({ kind: 'account-edit' }), onOpenAccount: (a) => setSheet({ kind: 'account', row: a }), onAdd: (type) => setSheet({ kind: 'ptx', preset: { type } }) };

  const screens = mode === 'dosti' ? {
    home: <Home data={data} {...common} onAdd={add} onOpen={open} goKhata={() => setTab('khata')}
      canInstall={!standalone && !installHidden} onInstall={install}
      onDismissInstall={() => { setInstallHidden(true); LS.set('khata.installHidden', true); }}
      onConfirm={confirm}
      canNotify={pushState.supported && !pushState.on && !LS.get('khata.notifyHidden')} onNotify={notifyToggle} />,
    khata: <Khata data={data} {...common} onOpen={open} month={khataMonth} setMonth={setKhataMonth} />,
    mahina: <Mahina data={data} {...common} setMonth={setMonth} />,
    activity: <ActivityView activity={data.activity} me={me} ids={ids} names={names} colors={COLORS} byKey={byKey} onOpen={open} />,
  } : {
    home: <MeraHome {...mcommon} allTx={mera.allTx} balances={mera.balances} report={mera.report} worth={mera.worth} owedToMe={mera.owedToMe} iOwe={mera.iOwe} budget={mera.budget} catBudgets={mera.catBudgets} onBudget={() => setSheet({ kind: 'budget' })}
      onOpenTxn={openTxn} onAll={() => setTab('txns')} onGo={setTab} onRefresh={refreshAll} />,
    txns: <MeraTxns {...mcommon} allTx={mera.allTx} period={tPeriod} setPeriod={setTPeriod} onPick={() => pickRange(tPeriod, setTPeriod)} onOpen={openTxn} onPdf={(p) => setSheet({ kind: 'pdf', period: p })} />,
    accounts: <MeraAccounts {...mcommon} balances={mera.balances} worth={mera.worth} />,
    analytics: <MeraAnalytics {...mcommon} period={aPeriod} setPeriod={setAPeriod} onPick={() => pickRange(aPeriod, setAPeriod)} reportRange={mera.reportRange} reportFor={mera.reportFor}
      budget={mera.budget} catBudgets={mera.catBudgets} onBudget={() => setSheet({ kind: 'budget' })} minDate={mera.minDate} onPdf={(p) => setSheet({ kind: 'pdf', period: p })} />,
    people: <MeraPeople {...mcommon} people={mera.people} shared={data} me={me} onOpenContact={(c) => setSheet({ kind: 'contact', row: c })} onNewContact={() => setSheet({ kind: 'contact-edit' })} onOpenShared={goShared} />,
  };

  const s = sheet;
  const linkAccounts = mera.mine.accounts.filter((a) => !a.archived && (a.currency || 'PKR') === 'PKR');
  const lastAcc = linkAccounts.some((a) => idOf(a) === LS.get('khata.lastAcc')) ? LS.get('khata.lastAcc') : '';
  const formProps = { ...common, busy, accounts: s?.batchIndex != null ? undefined : linkAccounts, linkInit: lastAcc };
  let sheetTitle = '', sheetBody = null;
  const aiProps = s?.prefill ? { prefill: s.prefill, ai: s.ai } : {};
  const inBatch = s?.batchIndex != null && batch;
  const backToBatch = (body) => {
    const items = batch.items.map((it, j) => (j === s.batchIndex ? { ...it, form: { ...it.form, ...body }, missing: [], assumed: [] } : it));
    setBatch({ ...batch, items }); setSheet({ kind: 'batch' });
  };
  const saveOrBatch = (b) => (inBatch ? backToBatch(b) : save(b));
  if (inBatch) aiProps.saveLabel = 'Theek hai, list mein wapas';
  if (s?.kind === 'expense') { sheetTitle = 'Naya kharcha'; sheetBody = <ExpenseForm {...formProps} {...aiProps} onSave={saveOrBatch} />; }
  if (s?.kind === 'loan') { sheetTitle = 'Qarz'; sheetBody = <PaymentForm {...formProps} {...aiProps} loan balance={balance} onSave={saveOrBatch} />; }
  if (s?.kind === 'payment') { sheetTitle = 'Paise bheje'; sheetBody = <PaymentForm {...formProps} {...aiProps} balance={balance} prefillClear={s.clear} onSave={saveOrBatch} />; }
  if (s?.kind === 'ai') {
    sheetTitle = 'Bol kar likho';
    sheetBody = <VoiceEntry otherName={names[otherId]} online={sync.online}
      onResult={(r) => {
        if (r.items.length > 1) {
          setBatch({ transcript: r.transcript, items: r.items.map((it, i) => ({ ...it, id: i + '-' + Date.now() })) });
          setSheet({ kind: 'batch' });
        } else {
          const it = r.items[0];
          setSheet({ kind: it.form.type, prefill: it.form, ai: { transcript: r.transcript, assumed: it.assumed, missing: it.missing, question: r.question } });
        }
      }} />;
  }
  if (s?.kind === 'batch' && batch) {
    sheetTitle = 'AI ki entries';
    sheetBody = <BatchReview items={batch.items} transcript={batch.transcript} {...common}
      onEdit={(i) => { const it = batch.items[i]; setSheet({ kind: it.form.type, prefill: it.form, ai: { transcript: batch.transcript, assumed: it.assumed, missing: it.missing, question: '' }, batchIndex: i }); }}
      onRemove={(i) => { const items = batch.items.filter((_, j) => j !== i); if (!items.length) { setBatch(null); setSheet(null); } else setBatch({ ...batch, items }); }}
      onSaveAll={async () => {
        const list = batch.items.filter((it) => itemOk(it.form));
        for (const it of list) await sync.enqueue({ kind: 'create', key: newId(), body: { ...it.form, time: it.form.time || nowTime() } });
        haptic(15); setBatch(null); setSheet(null);
        say(`${list.length} entries save ho gayi` + (navigator.onLine ? '' : '. Net aate hi sync hongi'));
      }} />;
  }
  if (s?.kind === 'detail') {
    sheetTitle = { payment: 'Payment', loan: 'Qarz', expense: 'Kharcha' }[s.entry.type];
    const k = keyOf(s.entry);
    sheetBody = <EntryDetail e={s.entry} {...common} byId={byId} onOpen={open} onConfirm={confirm} onEdit={() => setSheet({ kind: 'edit', entry: s.entry })}
      extra={<AccountLink accounts={linkAccounts} value={mera.linkOf[k] || ''} dir={flowOf(s.entry, me)} onChange={async (v) => { await setLink(k, v); haptic(10); doneMsg(v ? 'Account se jod diya' : 'Account se hata diya'); }} />} />;
  }
  if (s?.kind === 'edit') {
    sheetTitle = 'Entry badlo';
    sheetBody = s.entry.type !== 'expense'
      ? <PaymentForm {...formProps} linkInit={mera.linkOf[keyOf(s.entry)] || ''} loan={s.entry.type === 'loan'} balance={balance} initial={s.entry} onSave={(b) => save(b, s.entry)} onDelete={() => remove(s.entry)} />
      : <ExpenseForm {...formProps} linkInit={mera.linkOf[keyOf(s.entry)] || ''} initial={s.entry} onSave={(b) => save(b, s.entry)} onDelete={() => remove(s.entry)} />;
  }
  // ---- Mera Hisaab sheets ----
  const mp = { accounts: mera.mine.accounts, contacts: mera.mine.contacts, balances: mera.balances, onCreateAccount: quickAccount, onCreateContact: quickContact };
  if (s?.kind === 'ptx') {
    sheetTitle = s.row ? 'Len-den badlo' : 'Mera len-den';
    sheetBody = <TxnForm key={s.row ? idOf(s.row) : 'new-' + (s.preset?.type || '')} {...mp} rates={mera.rates} onCreateCategory={addCategory} initial={s.row} preset={s.preset}
      onSave={async (b) => { await mSave('ptx', b, s.row); haptic(12); setSheet(s.back || null); doneMsg(s.row ? 'Tabdeeli save ho gayi' : 'Save ho gaya'); }}
      onDelete={async () => { await mRemove('ptx', s.row); setSheet(s.back || null); doneMsg('Delete ho gaya'); }} />;
  }
  if (s?.kind === 'account') {
    const a = mera.mine.accounts.find((x) => idOf(x) === idOf(s.row)) || s.row;
    sheetTitle = a.name;
    sheetBody = <AccountDetail a={a} balance={mera.balances[idOf(a)] || 0} mine={mera.mine} allTx={mera.allTx} rates={mera.rates} otherName={otherName}
      onOpen={(t) => (t.synthetic ? openTxn(t) : setSheet({ kind: 'ptx', row: t, back: s }))} onAdd={(type) => setSheet({ kind: 'ptx', preset: { type, accountId: idOf(a) }, back: s })}
      onAdjust={() => setSheet({ kind: 'ptx', preset: { type: 'adjust', accountId: idOf(a) }, back: s })} onEdit={() => setSheet({ kind: 'account-edit', row: a })} />;
  }
  if (s?.kind === 'account-edit') {
    sheetTitle = s.row ? 'Account badlo' : 'Naya account';
    sheetBody = <AccountForm initial={s.row} onSave={async (b) => { await mSave('accounts', b, s.row); setSheet(null); doneMsg(s.row ? 'Account badal gaya' : 'Account ban gaya'); }}
      onDelete={async () => {
        const b = mera.balances[idOf(s.row)] || 0; // paise wala account hataya to kul paisa ghalat ho jayega
        if (Math.abs(b) >= 0.01) { say(`Is account mein abhi ${b.toLocaleString('en-PK')} ${s.row.currency || 'PKR'} hain. Pehle transfer ya "Balance theek karo" se 0 karo, phir hatao.`); return; }
        await mRemove('accounts', s.row); setSheet(null); doneMsg('Account hata diya');
      }} />;
  }
  if (s?.kind === 'contact') {
    const c = mera.mine.contacts.find((x) => idOf(x) === idOf(s.row)) || s.row;
    sheetTitle = c.name;
    sheetBody = <ContactDetail c={c} ledger={mera.people[idOf(c)]} mine={mera.mine}
      onOpen={(t) => setSheet({ kind: 'ptx', row: mera.mine.ptx.find((x) => idOf(x) === idOf(t)) || t, back: s })}
      onAdd={(type) => setSheet({ kind: 'ptx', preset: { type, contactId: idOf(c) }, back: s })} onEdit={() => setSheet({ kind: 'contact-edit', row: c })} />;
  }
  if (s?.kind === 'contact-edit') {
    sheetTitle = s.row ? 'Banda badlo' : 'Naya banda';
    sheetBody = <ContactForm initial={s.row} onSave={async (b) => { await mSave('contacts', b, s.row); setSheet(null); doneMsg('Save ho gaya'); }}
      onDelete={async () => {
        if (Object.keys(mera.people[idOf(s.row)]?.balance || {}).length) { say('Is bande ka hisaab abhi baqi hai. Pehle barabar karo, phir hatao.'); return; }
        await mRemove('contacts', s.row); setSheet(null); doneMsg('Hata diya');
      }} />;
  }
  if (s?.kind === 'rates') {
    sheetTitle = 'Currency rate';
    sheetBody = <RatesForm prefs={mera.mine.prefs} accounts={mera.mine.accounts} live={live} onSave={(b) => savePrefs(b, 'Rate save ho gaya')} />;
  }
  if (s?.kind === 'range') { sheetTitle = 'Muddat chuno'; sheetBody = <RangePicker value={s.value} onApply={(p) => { s.onApply(p); setSheet(null); }} />; }
  if (s?.kind === 'pdf') {
    sheetTitle = 'PDF report';
    const p = s.period || periodOf('month');
    sheetBody = (
      <div className="pdf-sheet">
        <div className="pdf-now"><FileDown size={22} /><span><b>{p.kind === 'all' ? 'Shuru se ab tak' : periodLabel(p)}</b><small>Is muddat ke saare len-den, kharche ka hisaab, accounts aur khate</small></span></div>
        <button className="btn primary wide" onClick={() => { setSheet(null); pdf(p); }}><FileDown size={18} /> PDF banao</button>
        <p className="chooser-sep">Ya doosri muddat chuno</p>
        <RangePicker value={p} applyLabel="Is muddat ki PDF banao" onApply={(np) => { setSheet(null); pdf(np); }} />
      </div>
    );
  }
  if (s?.kind === 'budget') {
    sheetTitle = 'Mahine ka budget';
    sheetBody = <BudgetForm budget={mera.budget} catBudgets={mera.catBudgets} report={mera.reportFor(thisMonth())} onSave={(b) => savePrefs(b, b.budget || Object.keys(b.catBudgets).length ? 'Budget save ho gaya' : 'Budget hata diya')} />;
  }
  if (s?.kind === 'backup') { sheetTitle = 'Backup'; sheetBody = <BackupSheet me={me} makeBackup={makeBackup} onRestore={restoreBackup} say={say} />; }
  if (s?.kind === 'payout') { sheetTitle = 'Business payout'; sheetBody = <PayoutSheet accounts={mera.mine.accounts} say={say} />; }
  if (s?.kind === 'more') {
    sheetTitle = 'Aur';
    const go = (t) => { setTab(t); setSheet(null); };
    sheetBody = (
      <div className="more-grid">
        {[
          ['Khate', 'Logon ka len-den', Users, () => go('people'), 'm-loan'],
          ['Analytics', 'Charts aur hisaab', BarChart3, () => go('analytics'), 'm-mv2'],
          ['PDF report', 'Kisi bhi muddat ki', FileDown, () => setSheet({ kind: 'pdf', period: tPeriod }), 'm-out'],
          ['Budget', mera.budget ? `Rs ${Math.round(mera.budget).toLocaleString('en-PK')} mahina` : 'Kharche ki had', Target, () => setSheet({ kind: 'budget' }), 'm-in'],
          ['Currency rate', 'USDT, dollar', Coins, () => setSheet({ kind: 'rates' }), 'm-mv'],
          ['Backup', 'Phone mein save', ShieldCheck, () => setSheet({ kind: 'backup' }), 'm-in'],
          ['Business payout', 'Khud aamdani', Link2, () => setSheet({ kind: 'payout' }), 'm-mv2'],
          ['Mera account', 'PIN, notifications', UserRound, () => setSheet({ kind: 'settings' }), 'm-gray'],
        ].map(([l, d, I, fn, c], i) => (
          <motion.button key={l} whileTap={{ scale: 0.95 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.035 }} onClick={fn}>
            <span className={'entry-icon ' + c}><I size={21} /></span><strong>{l}</strong><small>{d}</small>
          </motion.button>
        ))}
      </div>
    );
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
          <span><strong>Qarz</strong><small>{names[otherId]} ke saath udhaar, jo wapas karna hai</small></span>
        </motion.button>
      </div>
    );
  }
  if (s?.kind === 'mchooser') {
    sheetTitle = 'Mera len-den';
    sheetBody = (
      <div className="mchooser">
        {[
          ['expense', 'Kharcha', 'Paise kharch hue', ArrowUpRight, 'out'], ['income', 'Aamdani', 'Tankhwah, freelance, kuch bhi', ArrowDownLeft, 'in'],
          ['transfer', 'Transfer', 'Ek account se doosre mein', ArrowLeftRight, 'mv'], ['lend', 'Qarz diya', 'Kisi ko udhaar diya', HandCoins, 'out'],
          ['got_back', 'Wapas mila', 'Diya hua qarz wapas aaya', Undo2, 'in'], ['borrow', 'Qarz liya', 'Kisi se udhaar liya', HandCoins, 'in'],
        ].map(([t, l, d, I, c], i) => (
          <motion.button key={t} whileTap={{ scale: 0.96 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            onClick={() => setSheet({ kind: 'ptx', preset: { type: t } })}>
            <span className={'entry-icon m-' + c}><I size={20} /></span><strong>{l}</strong><small>{d}</small>
          </motion.button>
        ))}
        <button className="mchooser-link" onClick={() => { setMode('dosti'); setSheet({ kind: 'chooser' }); }}><Users size={16} /> {otherName} ke saath wala kharcha? Dosti khata mein likho</button>
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
        <button className="set-row" onClick={() => setSheet({ kind: 'backup' })}><ShieldCheck size={18} /> Backup (phone mein save / wapas lao)</button>
        {!standalone && <button className="set-row" onClick={install}><Smartphone size={18} /> {installEvt ? 'App install karo' : 'Phone par app lagao'}</button>}
        <button className="set-row" onClick={() => { sync.flush(); say('Sync ho raha hai'); }}><RefreshCw size={18} /> Abhi sync karo</button>
        <button className="set-row danger" onClick={async () => {
          // Jo kaam abhi server tak nahi gaya, woh log out se pehle bhej do
          if (sync.queue.length) {
            if (!navigator.onLine) { say(`${sync.queue.length} cheezein abhi sync nahi hui. Net on karo, sync hone do, phir log out karo.`); return; }
            await sync.flush();
          }
          setSheet(null); logout();
        }}><LogOut size={18} /> Log out</button>
      </div>
    );
  }

  async function notifyToggle() {
    const r = pushState.on ? await pushState.disable() : await pushState.enable();
    if (r) say(r);
  }

  const tabs = mode === 'dosti' ? [
    { id: 'home', label: 'Ghar', icon: HomeIcon },
    { id: 'khata', label: 'Khata', icon: BookOpen },
    { id: 'plus' },
    { id: 'mahina', label: 'Mahina', icon: CalendarDays },
    { id: 'activity', label: 'Badlav', icon: History, badge: unread },
  ] : [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'txns', label: 'Len-den', icon: ListOrdered },
    { id: 'plus' },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
    { id: 'more', label: 'More', icon: Grip, active: ['analytics', 'people'].includes(tab) },
  ];

  return (
    <div className={"app mode-" + mode}>
      <header className="topbar">
        <div className="hello-box">
          <p className="hello">Assalam o Alaikum</p>
          <p className="hello-name">{names[me]}</p>
        </div>
        <ModeSwitch mode={mode} onChange={setMode} otherName={otherName} dot={mode === 'mera' && unread > 0} />
        <SyncDot online={sync.online} live={sync.live} pending={pending} syncing={sync.syncing} />
        <button className="avatar" style={{ '--c': COLORS[me] }} onClick={() => setSheet({ kind: 'settings' })} aria-label="Mera account">{names[me][0]}</button>
      </header>

      <main>
        {backupDue && (
          <motion.div className="bk-due" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <ShieldCheck size={20} />
            <span><b>Backup ka waqt</b><small>Ek tap: file phone ke "Files" mein</small></span>
            <button className="btn small" onClick={async () => { const r = await saveBackup(makeBackup()); if (r !== 'cancel') { LS.set(BK, { ...backupCfg(), last: Date.now() }); setBackupDue(false); say('Backup save ho gaya'); } }}><Download size={15} /> Save</button>
            <button className="icon-btn" aria-label="Baad mein" onClick={() => { LS.set(BK, { ...backupCfg(), last: Date.now() - (backupCfg().every - 1) * 864e5 }); setBackupDue(false); }}>×</button>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={mode + tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {screens[tab] || screens.home}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => t.id === 'plus' ? (
          <motion.button key="plus" className="fab" whileTap={{ scale: 0.9, rotate: 90 }} onClick={() => { haptic(); setSheet({ kind: mode === 'mera' ? (mera.mine.accounts.some((a) => !a.archived) ? 'mchooser' : 'account-edit') : 'chooser' }); }} aria-label="Nayi entry">
            <Plus size={26} strokeWidth={2.4} />
          </motion.button>
        ) : (
          <button key={mode + t.id} className={'tab' + (tab === t.id || t.active ? ' on' : '')} aria-current={tab === t.id ? 'page' : undefined} onClick={() => (t.id === 'more' ? (haptic(), setSheet({ kind: 'more' })) : setTab(t.id))}>
            {(tab === t.id || t.active) && <motion.span layoutId="tab-dot" className="tab-dot" />}
            <span className="tab-ic"><t.icon size={22} />{t.badge > 0 && <motion.span className="badge" initial={{ scale: 0 }} animate={{ scale: 1 }}>{t.badge > 9 ? '9+' : t.badge}</motion.span>}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <Sheet open={!!s} onClose={() => (s?.batchIndex != null && batch ? setSheet({ kind: 'batch' }) : setSheet(null))} title={sheetTitle}>{sheetBody}</Sheet>

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
