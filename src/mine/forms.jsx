// Mera Hisaab ke forms: len-den, account, banda, rates
import { useMemo, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { AmountInput, DeleteButton, DateRow } from '../components/Forms';
import { today, nowTime, LS } from '../lib';
import { idOf } from '../../server/money.js';
import { EXPENSE, INCOME, KINDS, PRESETS, CURRENCIES, money } from './meta';

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
            <button type="button" key={idOf(a)} className={'acc-chip' + (on ? ' on' : '')} onClick={() => onChange(idOf(a))} aria-pressed={on}>
              <K size={16} />
              <span><b>{a.name}</b><small>{money(balances[idOf(a)] || 0, a.currency)}</small></span>
            </button>
          );
        })}
        <button type="button" className={'acc-chip add' + (adding ? ' on' : '')} onClick={() => setAdding((v) => !v)}><Plus size={16} /> Naya account</button>
      </div>
      {adding && <QuickAccount onCreate={onCreate} onDone={(id) => { setAdding(false); onChange(id); }} />}
    </div>
  );
}

export function TxnForm({ initial, preset, accounts, contacts, balances, onSave, onDelete, onCreateAccount, onCreateContact }) {
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
  const [category, setCategory] = useState(initial?.category || (startType === 'income' ? 'salary' : 'khana'));
  const [contactId, setContact] = useState(initial?.contactId || preset?.contactId || '');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || today());
  const [time, setTime] = useState(initial?.time || nowTime());

  const acc = accounts.find((a) => idOf(a) === accountId);
  const toAcc = accounts.find((a) => idOf(a) === toAccountId);
  const cur = acc?.currency || 'PKR';
  const crossCur = type === 'transfer' && toAcc && toAcc.currency !== cur;
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
    if (accountId) LS.set('khata.lastAcc', accountId);
    const body = { type, amount: type === 'adjust' ? adjSign * amt : amt, accountId, note, date, time };
    if (type === 'expense' || type === 'income') body.category = category;
    if (type === 'transfer') { body.toAccountId = toAccountId; body.toAmount = crossCur ? Number(toAmount) : amt; }
    if (isLoan(type)) body.contactId = contactId;
    onSave(body);
  };

  const cats = type === 'income' ? INCOME : EXPENSE;
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

      <AmountInput label={type === 'transfer' ? 'Kitne bheje?' : null} value={amount} onChange={setAmount} autoFocus={!initial} cur={cur === 'PKR' ? 'Rs' : cur} />

      {isLoan(type) && (
        <div className="field">
          <span className="field-label">Kis ke saath?</span>
          <div className="chips wrap">
            {people.map((c) => (
              <button type="button" key={idOf(c)} className={'chip' + (contactId === idOf(c) ? ' on' : '')} onClick={() => setContact(idOf(c))}>{c.name}</button>
            ))}
            <button type="button" className={'chip ghost' + (newPerson != null ? ' on' : '')} onClick={() => setNewPerson(newPerson == null ? '' : null)}><Plus size={15} /> Naya banda</button>
          </div>
          {newPerson != null && (
            <div className="quick-new row">
              <input className="text-field" autoFocus value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder="Naam (jaise Ali bhai)" maxLength={40} />
              <button type="button" className="btn primary" disabled={!newPerson.trim()} onClick={() => { const id = onCreateContact({ name: newPerson.trim() }); setContact(id); setNewPerson(null); }}>Jodo</button>
            </div>
          )}
        </div>
      )}

      <AccountPick accounts={accounts} balances={balances} value={accountId} onChange={setAccountId} onCreate={onCreateAccount}
        label={type === 'transfer' ? 'Kis account se?' : type === 'income' || type === 'got_back' || type === 'borrow' ? 'Kis account mein aaye?' : type === 'adjust' ? 'Kaunsa account?' : isLoan(type) ? 'Kis account se diye? (agar chaho)' : 'Kis account se diye?'} />

      {type === 'transfer' && (
        <AccountPick accounts={accounts} balances={balances} value={toAccountId} onChange={setTo} exclude={accountId} onCreate={onCreateAccount} label="Kis account mein?" />
      )}
      {crossCur && (
        <label className="custom-one">
          <span>{toAcc.name} mein kitne pohanche? ({toAcc.currency})</span>
          <input inputMode="decimal" value={toAmount} placeholder="0" onChange={(e) => setToAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          {amt > 0 && Number(toAmount) > 0 && <small className="rate-note">Rate: 1 {cur} = {(Number(toAmount) / amt).toLocaleString('en-PK', { maximumFractionDigits: 2 })} {toAcc.currency}</small>}
        </label>
      )}

      {(type === 'expense' || type === 'income') && (
        <div className="chips wrap" role="radiogroup" aria-label="Qisam">
          {cats.map((c) => {
            const Icon = c.icon;
            return (
              <button type="button" key={c.id} role="radio" aria-checked={category === c.id} className={'chip' + (category === c.id ? ' on' : '')} onClick={() => setCategory(c.id)}>
                <Icon size={15} /> {c.label}
              </button>
            );
          })}
        </div>
      )}

      <input className="text-field" placeholder={type === 'expense' ? 'Kis cheez par? (agar chaho)' : 'Note (agar chaho)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
      <DateRow date={date} setDate={setDate} time={time} setTime={setTime} />

      {amt > 0 && !problem && (
        <p className="preview live">
          {type === 'expense' && `${acc?.name} se ${money(amt, cur)} kharch`}
          {type === 'income' && `${acc?.name} mein ${money(amt, cur)} aaye`}
          {type === 'transfer' && `${acc?.name} se ${toAcc?.name} mein ${money(crossCur ? Number(toAmount) : amt, toAcc?.currency)}`}
          {type === 'lend' && `${who} ne aap ko ${money(amt, cur)} wapas dene hain`}
          {type === 'got_back' && `${who} se ${money(amt, cur)} wapas mile`}
          {type === 'borrow' && `Aap ne ${who} ko ${money(amt, cur)} wapas dene hain`}
          {type === 'paid_back' && `Aap ne ${who} ko ${money(amt, cur)} wapas diye`}
          {type === 'adjust' && `${acc?.name} ka balance ${adjSign > 0 ? 'barhega' : 'ghatega'}: ${money(amt, cur)}`}
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
        <div className="chips wrap">
          {CURRENCIES.map((c) => <button type="button" key={c} className={'chip' + (currency === c ? ' on' : '')} onClick={() => setCurrency(c)}>{c}</button>)}
        </div>
      </div>
      <label className="custom-one">
        <span>{initial ? 'Shuru ki raqam' : 'Abhi is mein kitne hain?'} ({currency})</span>
        <input inputMode="decimal" value={opening} placeholder="0" onChange={(e) => setOpening(e.target.value.replace(/[^\d.-]/g, ''))} />
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

export function RatesForm({ prefs, accounts, live, onSave }) {
  const used = useMemo(() => [...new Set(accounts.filter((a) => !a.archived && a.currency !== 'PKR').map((a) => a.currency))], [accounts]);
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
