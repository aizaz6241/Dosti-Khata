import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home as HomeIcon, BookOpen, BarChart3, Plus, Receipt, ArrowUpRight, LogOut, KeyRound, Smartphone, HandCoins, Bell, BellOff, RefreshCw, History, Mic, ArrowDownLeft, ArrowLeftRight, CalendarDays, Landmark, Users, Undo2 } from 'lucide-react';
import { api, LS, thisMonth, haptic, nowTime } from './lib';
import { computeLedger, monthStats } from '../server/ledger.js';
import { useKhata, applyQueue, applyMine, newId } from './sync';
import { accountBalances, peopleLedger, netWorth, monthReport, toPKR, idOf, sharedSpend, khataFlows, effectiveRates, flowOf } from '../server/money.js';
import { MeraHome, MeraAccounts, MeraAnalytics, MeraPeople, AllTxns, AccountDetail, ContactDetail } from './mine/MeraScreen';
import AccountLink from './mine/AccountLink';
import ModeSwitch from './components/ModeSwitch';
import { TxnForm, AccountForm, ContactForm, RatesForm } from './mine/forms';
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
  const [meraMonth, setMeraMonth] = useState(thisMonth());

  // Mera Hisaab: phone par hi hisaab (offline bhi). Dosti khata bhi is mein gina jata hai.
  const mera = useMemo(() => {
    const mine = applyMine(sync.mine, sync.queue, me);
    const rates = effectiveRates(mine.prefs, live?.rates);
    const rows = data?.rows || [];
    const flows = khataFlows(mine.links, rows, me); // khate ki entries jo kisi account se judi hain
    const allTx = [...mine.ptx, ...flows];
    const spend = sharedSpend(rows, me); // khate mein mera hissa = mera kharcha
    const balances = accountBalances(mine.accounts, allTx);
    const people = peopleLedger(mine.contacts.filter((c) => !c.archived), mine.ptx, mine.accounts);
    const worth = netWorth(mine.accounts, balances, rates);
    let owedToMe = 0, iOwe = 0;
    for (const p of Object.values(people)) for (const [cur, v] of Object.entries(p.balance)) {
      const pk = toPKR(v, cur, rates) ?? 0;
      if (pk > 0) owedToMe += pk; else iOwe += -pk;
    }
    const b = data?.balance;
    if (b?.amount > 0) { if (b.from === me) iOwe += b.amount; else owedToMe += b.amount; }
    const linkOf = Object.fromEntries(mine.links.map((l) => [String(l.entryId), l.accountId]));
    const reportFor = (m) => monthReport(mine.ptx, mine.accounts, m, rates, spend);
    return { mine, rates, balances, people, worth, owedToMe, iOwe, allTx, spend, linkOf, reportFor, report: reportFor(meraMonth) };
  }, [sync.mine, sync.queue, me, meraMonth, live, data]);

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
    const key = 'lnk-' + entryKey;
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
  const pdf = async () => {
    say('PDF ban raha hai...');
    try {
      const { exportPdf } = await import('./mine/pdf.js');
      const r = await exportPdf({ name: names[me], mine: mera.mine, balances: mera.balances, people: mera.people, worth: mera.worth, shared: data, me, names, rates: mera.rates, spend: mera.spend, allTx: mera.allTx });
      if (r !== 'cancel') say(r === 'shared' ? 'PDF tayyar' : 'PDF download ho gaya');
    } catch (e) { say('PDF nahi bana: ' + e.message); }
  };
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
    home: <MeraHome {...mcommon} allTx={mera.allTx} balances={mera.balances} report={mera.report} worth={mera.worth} owedToMe={mera.owedToMe} iOwe={mera.iOwe}
      onOpenTxn={openTxn} onAll={() => setSheet({ kind: 'alltx' })} onGo={setTab} />,
    accounts: <MeraAccounts {...mcommon} balances={mera.balances} worth={mera.worth} />,
    analytics: <MeraAnalytics {...mcommon} report={mera.report} month={meraMonth} setMonth={setMeraMonth} reportFor={mera.reportFor} onPdf={pdf} />,
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
    sheetBody = <TxnForm key={s.row ? idOf(s.row) : 'new-' + (s.preset?.type || '')} {...mp} initial={s.row} preset={s.preset}
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
      onDelete={async () => { await mRemove('accounts', s.row); setSheet(null); doneMsg('Account hata diya'); }} />;
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
      onDelete={async () => { await mRemove('contacts', s.row); setSheet(null); doneMsg('Hata diya'); }} />;
  }
  if (s?.kind === 'rates') {
    sheetTitle = 'Currency rate';
    sheetBody = <RatesForm prefs={mera.mine.prefs} accounts={mera.mine.accounts} live={live} onSave={async (b) => { await sync.enqueue({ col: 'prefs', kind: 'create', key: 'prefs', body: b }); setSheet(null); doneMsg('Rate save ho gaya'); }} />;
  }
  if (s?.kind === 'alltx') { sheetTitle = 'Mere saare len-den'; sheetBody = <AllTxns mine={mera.mine} allTx={mera.allTx} otherName={otherName} onOpen={(t) => (t.synthetic ? openTxn(t) : setSheet({ kind: 'ptx', row: t, back: s }))} />; }

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

  const tabs = mode === 'dosti' ? [
    { id: 'home', label: 'Ghar', icon: HomeIcon },
    { id: 'khata', label: 'Khata', icon: BookOpen },
    { id: 'plus' },
    { id: 'mahina', label: 'Mahina', icon: CalendarDays },
    { id: 'activity', label: 'Badlav', icon: History, badge: unread },
  ] : [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
    { id: 'plus' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'people', label: 'Khate', icon: Users },
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
          <button key={mode + t.id} className={'tab' + (tab === t.id ? ' on' : '')} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {tab === t.id && <motion.span layoutId="tab-dot" className="tab-dot" />}
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
