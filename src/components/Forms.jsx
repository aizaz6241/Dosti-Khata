import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { CATEGORIES, rs, today } from '../lib';

function AmountInput({ value, onChange, autoFocus }) {
  return (
    <label className="amount-field">
      <span className="amount-cur">Rs</span>
      <input
        inputMode="decimal"
        placeholder="0"
        value={value}
        autoFocus={autoFocus}
        style={{ width: `${Math.max(1, String(value || '0').length) + 0.6}ch` }}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        aria-label="Raqam"
      />
    </label>
  );
}

function Segmented({ options, value, onChange, name }) {
  return (
    <div className="seg" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={'seg-opt' + (value === o.value ? ' on' : '')}
          style={o.color ? { '--c': o.color } : undefined}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && <motion.span layoutId={'seg-' + name} className="seg-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function DeleteButton({ onDelete }) {
  const [sure, setSure] = useState(false);
  return (
    <button type="button" className={'btn danger' + (sure ? ' sure' : '')} onClick={() => (sure ? onDelete() : setSure(true))}>
      <Trash2 size={17} /> {sure ? 'Pakka? Dobara dabao' : 'Delete'}
    </button>
  );
}

export function ExpenseForm({ me, people, names, colors, initial, onSave, onDelete, busy }) {
  const [a, b] = people;
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [note, setNote] = useState(initial?.note || '');
  const [category, setCategory] = useState(initial?.category || 'khana');
  const [paidBy, setPaidBy] = useState(initial?.paidBy || me);
  const [split, setSplit] = useState(initial?.split || 'half');
  const [custom, setCustom] = useState(initial?.split === 'custom' ? String(initial.shares?.[a] ?? '') : '');
  const [date, setDate] = useState(initial?.date || today());

  const amt = Number(amount) || 0;
  const shares = useMemo(() => {
    if (split === 'half') return { [a]: amt / 2, [b]: amt - amt / 2 };
    if (split === 'a') return { [a]: amt, [b]: 0 };
    if (split === 'b') return { [a]: 0, [b]: amt };
    const s = Math.min(Number(custom) || 0, amt);
    return { [a]: s, [b]: amt - s };
  }, [amt, split, custom, a, b]);

  const debtor = paidBy === a ? b : a;
  const owes = shares[debtor];
  const preview = amt <= 0
    ? 'Raqam likho, hisaab yahan dikhega.'
    : owes > 0
      ? `${names[debtor]} ne ${names[paidBy]} ko ${rs(owes)} dene hain`
      : `Poora kharcha ${names[paidBy]} ka apna hai, kisi ko kuch nahi dena`;

  const submit = (ev) => {
    ev.preventDefault();
    if (amt <= 0) return;
    onSave({ type: 'expense', amount: amt, note, category, paidBy, split, shares, date });
  };

  return (
    <form className="form" onSubmit={submit} id="entry-form">
      <AmountInput value={amount} onChange={setAmount} autoFocus={!initial} />
      <input className="text-field" placeholder="Kis cheez ka? (jaise chai, sabzi)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />

      <div className="chips" role="radiogroup" aria-label="Qisam">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <button type="button" key={c.id} role="radio" aria-checked={category === c.id} className={'chip' + (category === c.id ? ' on' : '')} onClick={() => setCategory(c.id)}>
              <Icon size={15} /> {c.label}
            </button>
          );
        })}
      </div>

      <div className="field">
        <span className="field-label">Kis ne pay kiya?</span>
        <Segmented name="paidBy" value={paidBy} onChange={setPaidBy} options={people.map((p) => ({ value: p, label: names[p], color: colors[p] }))} />
      </div>

      <div className="field">
        <span className="field-label">Kharcha kis kis ka hai?</span>
        <div className="split-grid">
          {[
            { v: 'half', t: 'Aadha-aadha', s: amt ? `${rs(amt / 2)} har ek` : 'Dono ka barabar' },
            { v: 'a', t: `Sirf ${names[a]} ka`, s: 'Poori raqam' },
            { v: 'b', t: `Sirf ${names[b]} ka`, s: 'Poori raqam' },
            { v: 'custom', t: 'Apni marzi', s: 'Hissa khud likho' },
          ].map((o) => (
            <button type="button" key={o.v} className={'split-opt' + (split === o.v ? ' on' : '')} onClick={() => setSplit(o.v)} aria-pressed={split === o.v}>
              <strong>{o.t}</strong>
              <small>{o.s}</small>
            </button>
          ))}
        </div>
        {split === 'custom' && (
          <div className="custom-row">
            <label>
              <span style={{ color: colors[a] }}>{names[a]} ka hissa</span>
              <input inputMode="decimal" value={custom} placeholder="0" onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
            <label>
              <span style={{ color: colors[b] }}>{names[b]} ka hissa</span>
              <input value={Math.max(0, amt - (Number(custom) || 0)) || ''} readOnly placeholder="0" />
            </label>
          </div>
        )}
      </div>

      <div className="field row">
        <span className="field-label">Tareekh</span>
        <input type="date" className="date-field" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </div>

      <p className={'preview' + (amt > 0 && owes > 0 ? ' live' : '')}>{preview}</p>

      <div className="form-actions">
        {initial && <DeleteButton onDelete={onDelete} />}
        <button className="btn primary" disabled={busy || amt <= 0}>{initial ? 'Tabdeeli save karo' : 'Kharcha save karo'}</button>
      </div>
    </form>
  );
}

export function PaymentForm({ me, people, names, colors, balance, initial, prefillClear, onSave, onDelete, busy }) {
  const [a, b] = people;
  const defaultFrom = initial?.from || (balance.amount > 0 ? balance.from : me);
  const [from, setFrom] = useState(defaultFrom);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : prefillClear && balance.amount > 0 ? String(Math.round(balance.amount)) : '');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || today());
  const to = from === a ? b : a;
  const amt = Number(amount) || 0;

  // Payment ke baad kya bachega (sirf nayi entry ke liye)
  const owedNow = balance.amount > 0 && balance.from === from ? balance.amount : 0;
  const creditNow = balance.amount > 0 && balance.from === to ? balance.amount : 0;
  let after = '';
  if (!initial && amt > 0) {
    const net = owedNow - creditNow - amt; // + : from abhi bhi dega, - : to dega
    if (Math.abs(net) < 0.5) after = 'Is ke baad hisaab bilkul barabar ho jayega.';
    else if (net > 0) after = `Is ke baad ${names[from]} ne ${rs(net)} aur dene honge.`;
    else after = `Is ke baad ${rs(-net)} ${names[to]} ke paas advance rahenge.`;
  }

  const submit = (ev) => {
    ev.preventDefault();
    if (amt <= 0) return;
    onSave({ type: 'payment', amount: amt, from, note, date });
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <span className="field-label">Kis ne paise diye?</span>
        <Segmented name="from" value={from} onChange={setFrom} options={people.map((p) => ({ value: p, label: names[p], color: colors[p] }))} />
        <p className="flow-line">
          <b style={{ color: colors[from] }}>{names[from]}</b> ne <b style={{ color: colors[to] }}>{names[to]}</b> ko diye
        </p>
      </div>

      <AmountInput value={amount} onChange={setAmount} autoFocus={!initial} />

      {!initial && owedNow > 0 && (
        <button type="button" className="quick-clear" onClick={() => setAmount(String(Math.round(owedNow)))}>
          Poora hisaab clear: <b>{rs(owedNow)}</b>
        </button>
      )}

      <input className="text-field" placeholder="Note (jaise JazzCash, cash)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />

      <div className="field row">
        <span className="field-label">Tareekh</span>
        <input type="date" className="date-field" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </div>

      {after && <p className="preview live">{after}</p>}
      <p className="hint">Purane kharche tareekh ke hisaab se, sab se purana pehle, khud tick ho jayenge.</p>

      <div className="form-actions">
        {initial && <DeleteButton onDelete={onDelete} />}
        <button className="btn primary" disabled={busy || amt <= 0}>{initial ? 'Tabdeeli save karo' : 'Payment save karo'}</button>
      </div>
    </form>
  );
}
