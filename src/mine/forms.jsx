// Mera Hisaab ke forms: len-den, account, banda, rates
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import { AmountInput, DeleteButton, DateRow } from '../components/Forms';
import { today, nowTime, LS } from '../lib';
import { idOf } from '../../server/money.js';
import { EXPENSE, INCOME, KINDS, PRESETS, CURRENCIES, money, catList, CUSTOM_ICONS } from './meta';

const LOAN_SUB = [
  { id: 'lend', t: 'Maine qarz diya', s: 'Woh mujhe wapas dega' },
  { id: 'got_back', t: 'Mujhe wapas mila', s: 'Diye hue mein se' },
  { id: 'borrow', t: 'Maine qarz liya', s: 'Main wapas dunga' },
  { id: 'paid_back', t: 'Maine wapas diya', s: 'Liye hue mein se' },
];
const MAIN = [
  { id: 'expense', t: 'Kharcha' },
  { id: 'income', t: 'Aamdani' },
  { id: 'transfer', t: 'Transfer' },
  { id: 'loan', t: 'Qarz' },
];
const isLoan = (t) => ['lend', 'got_back', 'borrow', 'paid_back'].includes(t);

function QuickAccount({ onCreate, onDone }) {
  const [p, setP] = useState(PRESETS[0]);
  const [name, setName] = useState(PRESETS[0].name);
  const [opening, setOpening] = useState('');
  return (
    <div className="quick-new">
      <div className="chips wrap">
        {PRESETS.map((x) => <button type="button" key={x.name} className={'chip' + (name === x.name ? ' on' : '')} onClick={() => { setP(x); setName(x.name); }}>{x.name}</button>)}
      </div>
      <input className="text-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Account ka naam" maxLength={40} />
      <label className="custom-one"><span>Abhi is mein kitne hain? ({p.currency})</span><input inputMode="decimal" value={opening} placeholder="0" onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ''))} /></label>
      <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => onDone(onCreate({ name: name.trim(), kind: p.kind, currency: p.currency, opening: Number(opening) || 0 }))}>Account banao</button>
    </div>
  );
}

function AccountPick({ accounts, balances, value, onChange, label, exclude, onCreate }) {
  const list = accounts.filter((a) => !a.archived && idOf(a) !== exclude);
  const [adding, setAdding] = useState(false);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="acc-pick">
        {list.map((a) => {
          const K = KINDS.find((k) => k.id === a.kind)?.icon || KINDS.at(-1).icon;
          const on = value === idOf(a);
          return (
            <motion.button type="button" key={idOf(a)} whileTap={{ scale: 0.96 }} className={'acc-opt k-' + (a.kind || 'other') + (on ? ' on' : '')} onClick={() => onChange(idOf(a))} aria-pressed={on}>
              <span className="ao-ic"><K size={17} /></span>
              <span className="ao-txt"><b>{a.name}</b><small>{money(balances[idOf(a)] || 0, a.currency)}</small></span>
              {on && <motion.span className="ao-check" initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={13} strokeWidth={3} /></motion.span>}
            </motion.button>
          );
        })}
        <button type="button" className={'acc-opt add' + (adding ? ' on' : '')} onClick={() => setAdding((v) => !v)}><span className="ao-ic"><Plus size={17} /></span><span className="ao-txt"><b>Naya account</b></span></button>
      </div>
      {adding && <QuickAccount onCreate={onCreate} onDone={(id) => { setAdding(false); onChange(id); }} />}
    </div>
  );
}

// Categories ka saaf grid + apni nayi category
const ICON_CHOICES = ['Tag', 'Gamepad2', 'Dumbbell', 'Baby', 'PawPrint', 'Wifi', 'Wrench', 'BookOpen', 'Music', 'Heart', 'Sparkles', 'Cigarette', 'Zap', 'Droplets', 'Bike', 'Gem', 'Camera', 'Gift', 'Plane', 'Coffee', 'Car', 'Laptop', 'Store', 'Dog'];
function CategoryGrid({ kind, value, onChange, onCreate }) {
  const list = catList(kind);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Tag');
  const save = () => {
    const label = name.trim(); if (!label) return;
    const id = 'c_' + label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) + Math.random().toString(36).slice(2, 6);
    onCreate({ id, label, icon, kind });
    onChange(id); setAdding(false); setName(''); setIcon('Tag');
  };
  return (
    <div className="field">
      <span className="field-label">{kind === 'income' ? 'Kahan se aaye?' : 'Kharche ki qisam'}</span>
      <div className="cat-grid" role="radiogroup" aria-label="Qisam">
        {list.map((c) => {
          const Icon = c.icon; const on = value === c.id;
          return (
            <motion.button type="button" key={c.id} whileTap={{ scale: 0.93 }} role="radio" aria-checked={on} className={'cat-opt' + (on ? ' on' : '') + (kind === 'income' ? ' inc' : '')} onClick={() => onChange(c.id)}>
              <span className="co-ic"><Icon size={19} /></span><span className="co-l">{c.label}</span>
            </motion.button>
          );
        })}
        {onCreate && <button type="button" className={'cat-opt add' + (adding ? ' on' : '')} onClick={() => setAdding((v) => !v)}><span className="co-ic"><Plus size={19} /></span><span className="co-l">Nayi</span></button>}
      </div>
      {adding && (
        <motion.div className="quick-new new-cat" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <input className="text-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'income' ? 'Naam (jaise YouTube, kiraya mila)' : 'Naam (jaise Gym, Cricket, Bike)'} maxLength={24} />
          <span className="field-label">Nishan chuno</span>
          <div className="icon-pick">
            {ICON_CHOICES.map((n) => { const I = CUSTOM_ICONS[n]; return <button type="button" key={n} className={icon === n ? 'on' : ''} onClick={() => setIcon(n)} aria-label={n}><I size={18} /></button>; })}
          </div>
          <button type="button" className="btn primary" disabled={!name.trim()} onClick={save}><Check size={17} /> Category banao</button>
        </motion.div>
      )}
    </div>
  );
}

export function TxnForm({ initial, preset, accounts, contacts, balances, rates = {}, onSave, onDelete, onCreateAccount, onCreateContact, onCreateCategory }) {
  const [newPerson, setNewPerson] = useState(null);
  const startType = initial?.type || preset?.type || 'expense';
  const [type, setType] = useState(startType);
  const lastAcc = LS.get('khata.lastAcc');
  const firstAcc = accounts.find((a) => !a.archived && idOf(a) === lastAcc) || accounts.find((a) => !a.archived);
  const [accountId, setAccountId] = useState(initial?.accountId || preset?.accountId || (firstAcc ? idOf(firstAcc) : ''));
  const [toAccountId, setTo] = useState(initial?.toAccountId || '');
  const [amount, setAmount] = useState(initial ? String(Math.abs(initial.amount)) : '');
  const [adjSign, setAdjSign] = useState(initial?.type === 'adjust' && initial.amount < 0 ? -1 : 1);
  const [toAmount, setToAmount] = useState(initial?.toAmount != null ? String(initial.toAmount) : '');
  const [rate, setRate] = useState(initial?.rate ? String(initial.rate) : ''); // transfer ka apna rate
  const [category, setCategory] = useState(initial?.category || (startType === 'income' ? 'salary' : 'khana'));
  const [contactId, setContact] = useState(initial?.contactId || preset?.contactId || '');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || today());
  const [time, setTime] = useState(initial?.time || nowTime());
  // Purana qarz: pehle ka len-den, kisi account se paise nahi katenge
  const [old, setOld] = useState(initial ? isLoan(initial.type) && !initial.accountId : !accounts.some((a) => !a.archived));
  const [loanCur, setLoanCur] = useState(initial?.currency && !initial?.accountId ? initial.currency : 'PKR'); // bina account qarz: dollar waghera

  const acc = accounts.find((a) => idOf(a) === accountId);
  const toAcc = accounts.find((a) => idOf(a) === toAccountId);
  const cur = (isLoan(type) && old) ? loanCur : acc?.currency || 'PKR';
  const crossCur = type === 'transfer' && toAcc && toAcc.currency !== cur;
  // Rate hamesha "1 bahar wali currency = kitne PKR" (ya PKR na ho to 1 bhejne wali = kitni pohanchne wali)
  const toCur = toAcc?.currency || 'PKR';
  const fx = crossCur ? (cur !== 'PKR' ? cur : toCur) : null;
  const base = crossCur ? (cur === 'PKR' || toCur === 'PKR' ? 'PKR' : toCur) : null;
  const calcTo = (a, r) => { const A = Number(a) || 0, R = Number(r) || 0; if (!(A > 0 && R > 0)) return ''; const v = cur === fx ? A * R : A / R; return String(Math.round(v * 100) / 100); };
  const calcRate = (a, t) => { const A = Number(a) || 0, T = Number(t) || 0; if (!(A > 0 && T > 0)) return ''; const v = cur === fx ? T / A : A / T; return String(Math.round(v * 10000) / 10000); };
  const liveRate = fx && base === 'PKR' ? rates[fx] : null;
  const amt = Number(amount) || 0;
  const main = isLoan(type) ? 'loan' : type;
  const people = contacts.filter((c) => !c.archived);

  const problem = !(amt > 0) ? 'Raqam likho'
    : !accountId && !isLoan(type) ? 'Account chuno'
      : type === 'transfer' && !toAccountId ? 'Kis account mein? chuno'
        : crossCur && !(Number(toAmount) > 0) ? 'Pohanche kitne? likho'
          : isLoan(type) && !contactId ? 'Kis ke saath? chuno' : '';

  const submit = (e) => {
    e.preventDefault();
    if (problem) return;
    if (accountId && !(isLoan(type) && old)) LS.set('khata.lastAcc', accountId);
    const noAcc = isLoan(type) && old;
    const body = { type, amount: type === 'adjust' ? adjSign * amt : amt, accountId: noAcc ? '' : accountId, note, date, time };
    if (noAcc) { body.old = true; body.currency = loanCur; }
    if (type === 'expense' || type === 'income') body.category = category;
    if (type === 'transfer') { body.toAccountId = toAccountId; body.toAmount = crossCur ? Number(toAmount) : amt; if (crossCur && Number(rate) > 0) body.rate = Number(rate); }
    if (isLoan(type)) body.contactId = contactId;
    onSave(body);
  };

  const who = people.find((c) => idOf(c) === contactId)?.name || 'woh';

  return (
    <form className="form" onSubmit={submit}>
      {!initial && type !== 'adjust' && (
        <div className="type-tabs" role="tablist">
          {MAIN.map((m) => (
            <button type="button" key={m.id} role="tab" aria-selected={main === m.id} className={'tt' + (main === m.id ? ' on' : '')}
              onClick={() => { setType(m.id === 'loan' ? 'lend' : m.id); if (m.id === 'income') setCategory('salary'); if (m.id === 'expense') setCategory('khana'); }}>
              {m.t}
            </button>
          ))}
        </div>
      )}

      {isLoan(type) && (
        <div className="split-grid">
          {LOAN_SUB.map((o) => (
            <button type="button" key={o.id} className={'split-opt' + (type === o.id ? ' on' : '')} onClick={() => setType(o.id)} aria-pressed={type === o.id}>
              <strong>{o.t}</strong><small>{o.s}</small>
            </button>
          ))}
        </div>
      )}

      {type === 'adjust' && (
        <div className="seg two">
          <button type="button" className={'seg-opt' + (adjSign > 0 ? ' on plain' : '')} onClick={() => setAdjSign(1)}>Zyada nikle (+)</button>
          <button type="button" className={'seg-opt' + (adjSign < 0 ? ' on plain' : '')} onClick={() => setAdjSign(-1)}>Kam nikle (−)</button>
        </div>
      )}

      <AmountInput label={type === 'transfer' ? 'Kitne bheje?' : null} value={amount} onChange={(v) => { setAmount(v); if (crossCur && Number(rate) > 0) setToAmount(calcTo(v, rate)); }} autoFocus={!initial} cur={cur === 'PKR' ? 'Rs' : cur} />

      {isLoan(type) && (
        <div className="field">
          <span className="field-label">Kis ke saath?</span>
          <div className="person-pick">
            {people.map((c) => (
              <motion.button type="button" key={idOf(c)} whileTap={{ scale: 0.95 }} className={'person-opt' + (contactId === idOf(c) ? ' on' : '')} onClick={() => setContact(idOf(c))}>
                <span className="po-av">{c.name[0]}</span><span className="po-n">{c.name}</span>
              </motion.button>
            ))}
            <button type="button" className={'person-opt add chip ghost' + (newPerson != null ? ' on' : '')} onClick={() => setNewPerson(newPerson == null ? '' : null)}><span className="po-av"><Plus size={15} /></span><span className="po-n">Naya banda</span></button>
          </div>
          {newPerson != null && (
            <div className="quick-new row">
              <input className="text-field" autoFocus value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder="Naam (jaise Ali bhai)" maxLength={40} />
              <button type="button" className="btn primary" disabled={!newPerson.trim()} onClick={() => { const id = onCreateContact({ name: newPerson.trim() }); setContact(id); setNewPerson(null); }}>Jodo</button>
            </div>
          )}
        </div>
      )}

      {isLoan(type) && (
        <div className="field">
          <span className="field-label">Ye kab ka hai?</span>
          <div className="seg two" role="radiogroup">
            <button type="button" role="radio" aria-checked={!old} className={'seg-opt plain' + (!old ? ' on' : '')} onClick={() => setOld(false)}>Abhi ka</button>
            <button type="button" role="radio" aria-checked={old} className={'seg-opt plain' + (old ? ' on' : '')} onClick={() => setOld(true)}>Purana / bina account</button>
          </div>
          {old && <p className="hint">Kisi account se paise nahi katenge, sirf bande ke khate mein likha jayega. Asal tareekh neeche daal do (yaad na ho to aaj ki theek hai).</p>}
          {old && (
            <>
              <span className="field-label">Qarz kis currency mein?</span>
              <div className="chips wrap cur-pick">
                {CURRENCIES.map((c) => <button type="button" key={c} className={'chip' + (loanCur === c ? ' on' : '')} onClick={() => setLoanCur(c)}>{c === 'PKR' ? 'Rupay (PKR)' : c === 'USD' ? 'Dollar (USD)' : c}</button>)}
              </div>
            </>
          )}
        </div>
      )}

      {!(isLoan(type) && old) && <AccountPick accounts={accounts} balances={balances} value={accountId} onChange={setAccountId} onCreate={onCreateAccount}
        label={type === 'transfer' ? 'Kis account se?' : type === 'income' || type === 'got_back' || type === 'borrow' ? 'Kis account mein aaye?' : type === 'adjust' ? 'Kaunsa account?' : isLoan(type) ? 'Kis account se diye?' : 'Kis account se diye?'} />}

      {type === 'transfer' && (
        <AccountPick accounts={accounts} balances={balances} value={toAccountId} onChange={setTo} exclude={accountId} onCreate={onCreateAccount} label="Kis account mein?" />
      )}
      {crossCur && (
        <div className="fx-box">
          <label className="custom-one">
            <span>Kis rate par? 1 {fx} = kitne {base}</span>
            <input inputMode="decimal" value={rate} placeholder={liveRate ? String(liveRate) : '0'} onChange={(e) => { const r = e.target.value.replace(/[^\d.]/g, ''); setRate(r); setToAmount(calcTo(amount, r)); }} />
            {liveRate ? <button type="button" className="rate-note fx-live" onClick={() => { setRate(String(liveRate)); setToAmount(calcTo(amount, liveRate)); }}>Binance ka abhi ka rate: {liveRate} (lagao)</button> : null}
          </label>
          <label className="custom-one">
            <span>{toAcc.name} mein kitne pohanche? ({toCur})</span>
            <input inputMode="decimal" value={toAmount} placeholder="0" onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ''); setToAmount(t); setRate(calcRate(amount, t)); }} />
          </label>
          <small className="hint">Rate likho to raqam khud ban jayegi, ya pohanchi hui raqam likho to rate khud nikal aayega.</small>
        </div>
      )}

      {(type === 'expense' || type === 'income') && <CategoryGrid kind={type} value={category} onChange={setCategory} onCreate={onCreateCategory} />}

      <input className="text-field" placeholder={type === 'expense' ? 'Kis cheez par? (agar chaho)' : 'Note (agar chaho)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
      <DateRow date={date} setDate={setDate} time={time} setTime={setTime} />

      {amt > 0 && !problem && (
        <p className="preview live">
          {type === 'expense' && `${acc?.name} se ${money(amt, cur)} kharch`}
          {type === 'income' && `${acc?.name} mein ${money(amt, cur)} aaye`}
          {type === 'transfer' && `${acc?.name} se ${toAcc?.name} mein ${money(crossCur ? Number(toAmount) : amt, toAcc?.currency)}`}
          {isLoan(type) && old && cur !== 'PKR' && amt > 0 && (rates[cur] ? `≈ ${money(amt * rates[cur])} aaj ke rate par (1 ${cur} = ${money(rates[cur])}). ` : `${cur} ka rate abhi nahi mila, net aate hi rupay mein dikhega. `)}
          {isLoan(type) && old && 'Purana: '}
          {type === 'lend' && `${who} ne aap ko ${money(amt, cur)} wapas dene hain`}
          {type === 'got_back' && `${who} se ${money(amt, cur)} wapas mile`}
          {type === 'borrow' && `Aap ne ${who} ko ${money(amt, cur)} wapas dene hain`}
          {type === 'paid_back' && `Aap ne ${who} ko ${money(amt, cur)} wapas diye`}
          {type === 'adjust' && `${acc?.name} ka balance ${adjSign > 0 ? 'barhega' : 'ghatega'}: ${money(amt, cur)}`}
          {isLoan(type) && !old && acc && ` (${acc.name} ${type === 'lend' || type === 'paid_back' ? 'se katenge' : 'mein aayenge'})`}
        </p>
      )}

      <div className="form-actions">
        {initial && <DeleteButton onDelete={onDelete} />}
        <button className="btn primary" disabled={!!problem}>{problem || (initial ? 'Tabdeeli save karo' : 'Save karo')}</button>
      </div>
    </form>
  );
}

export function AccountForm({ initial, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || '');
  const [kind, setKind] = useState(initial?.kind || 'cash');
  const [currency, setCurrency] = useState(initial?.currency || 'PKR');
  const [opening, setOpening] = useState(initial ? String(initial.opening ?? 0) : '');
  const submit = (e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), kind, currency, opening: Number(opening) || 0, archived: false }); };
  return (
    <form className="form" onSubmit={submit}>
      {!initial && (
        <div className="chips wrap">
          {PRESETS.map((p) => (
            <button type="button" key={p.name} className={'chip' + (name === p.name ? ' on' : '')} onClick={() => { setName(p.name); setKind(p.kind); setCurrency(p.currency); }}>{p.name}</button>
          ))}
        </div>
      )}
      <input className="text-field" placeholder="Account ka naam (jaise Meezan Bank)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      <div className="field">
        <span className="field-label">Qisam</span>
        <div className="chips wrap">
          {KINDS.map((k) => { const I = k.icon; return <button type="button" key={k.id} className={'chip' + (kind === k.id ? ' on' : '')} onClick={() => setKind(k.id)}><I size={15} /> {k.label}</button>; })}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Currency</span>
        {initial ? <p className="hint">{currency}: purane account ki currency nahi badal sakti (hisaab ghalat ho jayega). Doosri currency chahiye to naya account banao.</p> : (
          <div className="chips wrap">
            {CURRENCIES.map((c) => <button type="button" key={c} className={'chip' + (currency === c ? ' on' : '')} onClick={() => setCurrency(c)}>{c}</button>)}
          </div>
        )}
      </div>
      <label className="custom-one">
        <span>{initial ? 'Shuru ki raqam' : 'Abhi is mein kitne hain?'} ({currency})</span>
        <input inputMode="decimal" value={opening} placeholder="0" onChange={(e) => { const v = e.target.value.replace(/[^\d.-]/g, ''); setOpening((v.startsWith('-') ? '-' : '') + v.replace(/-/g, '')); }} />
      </label>
      {initial && <p className="hint">Balance theek karna ho to account khol kar "Balance theek karo" dabao, taake purana hisaab na badle.</p>}
      <div className="form-actions">
        {initial && <DeleteButton onDelete={onDelete} />}
        <button className="btn primary" disabled={!name.trim()}>{initial ? 'Tabdeeli save karo' : 'Account banao'}</button>
      </div>
    </form>
  );
}

export function ContactForm({ initial, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const submit = (e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), phone: phone.trim(), archived: false }); };
  return (
    <form className="form" onSubmit={submit}>
      <input className="text-field" placeholder="Naam (jaise Ali bhai)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
      <input className="text-field" placeholder="Phone (agar chaho, WhatsApp yaad-dihani ke liye)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      <div className="form-actions">
        {initial && <DeleteButton onDelete={onDelete} />}
        <button className="btn primary" disabled={!name.trim()}>{initial ? 'Tabdeeli save karo' : 'Banda jodo'}</button>
      </div>
    </form>
  );
}

export function RatesForm({ prefs, accounts, live, extra = [], onSave }) {
  const used = useMemo(() => [...new Set([...accounts.filter((a) => !a.archived && a.currency !== 'PKR').map((a) => a.currency), ...extra.filter((c) => c !== 'PKR')])], [accounts, extra]);
  const [rates, setRates] = useState(() => ({ ...(prefs?.rates || {}) }));
  const [manual, setManual] = useState(() => [...(prefs?.manual || [])]);
  if (!used.length) return <p className="hint">Abhi sab accounts rupay (PKR) mein hain. Rate ki zaroorat nahi.</p>;
  const ago = (at) => { if (!at) return ''; const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'abhi abhi' : m < 60 ? `${m} min pehle` : `${Math.round(m / 60)} ghante pehle`; };
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onSave({ rates, manual }); }}>
      {used.map((c) => {
        const lv = live?.rates?.[c]; const isManual = manual.includes(c) || !lv;
        return (
          <div key={c} className="rate-box">
            <div className="seg two" role="radiogroup">
              <button type="button" className={'seg-opt plain' + (!manual.includes(c) ? ' on' : '')} onClick={() => setManual(manual.filter((x) => x !== c))}>Live rate</button>
              <button type="button" className={'seg-opt plain' + (manual.includes(c) ? ' on' : '')} onClick={() => setManual([...new Set([...manual, c])])}>Khud likhunga</button>
            </div>
            {!manual.includes(c) && (lv ? (
              <>
                <p className="rate-big"><i className="live-dot" /> 1 {c} = Rs {lv.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</p>
                <p className="rate-src">{live.sources?.[c] === 'Binance P2P' ? 'Binance P2P par bechne (sell) ka rate' : live.sources?.[c]}, {ago(live.at)}. Har kuch minute baad khud badalta hai.</p>
              </>
            ) : <p className="rate-src">Live rate abhi nahi mila (net check karo). Tab tak neeche likha rate chalega.</p>)}
            {isManual && (
              <label className="custom-one">
                <span>1 {c} = kitne rupay?</span>
                <input inputMode="decimal" value={rates[c] ?? ''} placeholder={c === 'USDT' ? 'jaise 282' : '0'} onChange={(e) => setRates({ ...rates, [c]: e.target.value.replace(/[^\d.]/g, '') })} />
              </label>
            )}
          </div>
        );
      })}
      <button className="btn primary"><Check size={17} /> Save karo</button>
    </form>
  );
}
