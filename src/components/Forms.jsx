import AccountLink from '../mine/AccountLink';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Calculator from './Calculator';
import { Trash2, ImagePlus, X, Sparkles, Calculator as CalcIcon, Minus, Plus as PlusIcon } from 'lucide-react';
import { CATEGORIES, compressImage, shotUrl, rs, num, today, nowTime } from '../lib';

export function AmountInput({ value, onChange, autoFocus, label, calc = true, parts, cur = 'Rs' }) {
  const [showCalc, setShowCalc] = useState(false);
  const [calcInit, setCalcInit] = useState('');
  const sum = parts?.length > 1 ? Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  const showParts = sum != null && Number(value) === sum;
  const len = String(value || '0').length;
  const size = len > 9 ? 30 : len > 7 ? 36 : 46; // lambi raqam: font khud chhota
  return (
    <div className="amount-wrap">
      <label className="amount-field">
        {label && <span className="amount-label">{label}</span>}
        <span className="amount-row" style={{ '--amt': size + 'px' }}>
          <span className="amount-cur">{cur}</span>
          {/* Chaurai chhupe hue text se, input us ke upar: kisi phone par nahi katega */}
          <span className="amount-box">
            <span className="amount-sizer" aria-hidden="true">{value || '0'}</span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={value}
              autoFocus={autoFocus}
              onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
              aria-label={label || 'Raqam'}
            />
          </span>
        </span>
      </label>
      {showParts && !showCalc && (
        <button type="button" className="parts-line" onClick={() => { setCalcInit(parts.join('+')); setShowCalc(true); }}>
          {parts.map((p) => num(p)).join(' + ')} = <b>{num(sum)}</b> <span>Calculator mein dekho</span>
        </button>
      )}
      {calc && (
        <button type="button" className={'calc-toggle' + (showCalc ? ' on' : '')} onClick={() => { if (!showCalc) setCalcInit(showParts ? parts.join('+') : ''); setShowCalc((v) => !v); }} aria-expanded={showCalc}>
          <CalcIcon size={17} /> {showCalc ? 'Calculator band karo' : 'Calculator'}
        </button>
      )}
      <AnimatePresence initial={false}>
        {showCalc && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <Calculator key={calcInit} initial={calcInit} onUse={(r) => { onChange(String(r)); setShowCalc(false); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Segmented({ options, value, onChange, name }) {
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

export function DeleteButton({ onDelete }) {
  const [sure, setSure] = useState(false);
  return (
    <button type="button" className={'btn danger' + (sure ? ' sure' : '')} onClick={() => (sure ? onDelete() : setSure(true))}>
      <Trash2 size={17} /> {sure ? 'Pakka? Dobara dabao' : 'Delete'}
    </button>
  );
}

export function DateRow({ date, setDate, time, setTime }) {
  return (
    <div className="field">
      <span className="field-label">Tareekh aur time</span>
      <div className="when-row">
        <input type="date" className="date-field" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Tareekh" />
        <input type="time" className="date-field" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
      </div>
    </div>
  );
}

/* ---------------- AI ne bhara: banner ---------------- */
const AI_LABEL = { payer: 'Kis ne diye', amount: 'Raqam', forWhom: 'Kis ka hissa', category: 'Qisam', date: 'Tareekh' };
function AiBanner({ ai }) {
  if (!ai) return null;
  const check = [...new Set([...(ai.missing || []), ...(ai.assumed || [])])];
  return (
    <div className="ai-banner">
      <p className="ai-head"><Sparkles size={15} /> AI ne bhara hai. Dekh kar khud Save karo.</p>
      <p className="ai-said">Aap ne kaha: <q>{ai.transcript}</q></p>
      {ai.question && <p className="ai-q">{ai.question}</p>}
      {check.length > 0 && <p className="ai-check-list">Peele khane zaroor dekho: {check.map((c) => AI_LABEL[c]).filter(Boolean).join(', ')}</p>}
    </div>
  );
}
const flag = (ai, ...f) => (ai && f.some((x) => ai.missing?.includes(x) || ai.assumed?.includes(x)) ? ' ai-check' : '');

/* ---------------- Kharcha ---------------- */
export function ExpenseForm({ me, otherId, names, colors, initial, prefill, ai, onSave, onDelete, busy, saveLabel, accounts, linkInit = '' }) {
  const [link, setLink] = useState(linkInit);
  const seed = initial || prefill;
  const initSplit = seed ? (['half', 'full', 'self', 'custom'].includes(seed.split) ? seed.split : 'custom') : 'half';
  const [paidBy, setPaidBy] = useState(initial ? initial.paidBy : prefill ? prefill.paidBy : me);
  const [amount, setAmount] = useState(seed?.amount ? String(seed.amount) : '');
  const [note, setNote] = useState(seed?.note || '');
  const [category, setCategory] = useState(seed?.category || 'sauda');
  const [split, setSplit] = useState(initSplit);
  const [custom, setCustom] = useState(seed && initSplit === 'custom' ? String(seed.calc?.owed ?? seed.owed ?? '') : '');
  const [date, setDate] = useState(seed?.date || today());
  const [time, setTime] = useState(seed?.time || nowTime());
  const [people, setPeople] = useState(seed?.people || 0);
  // N bandon mein barabar: doosre ka hissa = kul / N
  const splitAmong = (n) => { setPeople(n); const a = Number(amount) || 0; if (a > 0) setCustom(String(Math.round((a / n) * 100) / 100)); };
  useEffect(() => { if (people > 0) { const a = Number(amount) || 0; setCustom(a > 0 ? String(Math.round((a / people) * 100) / 100) : ''); } }, [amount]); // eslint-disable-line

  const other = names[otherId];
  const debtor = paidBy === me ? otherId : me;
  const amt = Number(amount) || 0;
  const owed = split === 'half' ? amt / 2 : split === 'full' ? amt : split === 'self' ? 0 : Math.min(Number(custom) || 0, amt);
  const debtorName = debtor === me ? 'mera' : `${other} ka`;
  const payerName = paidBy === me ? 'mera' : `${other} ka`;

  let preview = !paidBy ? 'Pehle chuno kis ne paise diye.' : 'Raqam likho, hisaab yahan dikhega.';
  if (!paidBy) { /* upar wala hi */ } else if (amt > 0 && split === 'self') {
    preview = `Ye poora ${payerName} apna kharcha hai, hisaab mein kuch nahi badlega.`;
  } else if (amt > 0 && owed > 0) {
    preview = debtor === me ? `Aap ne ${other} ko ${rs(owed)} dene hain` : `${other} ne aap ko ${rs(owed)} dene hain`;
  } else if (amt > 0) preview = 'Hissa likho.';

  const submit = (ev) => {
    ev.preventDefault();
    if (!paidBy || amt <= 0 || (owed <= 0 && split !== 'self')) return;
    onSave({ type: 'expense', amount: amt, note, category, paidBy, split, owed, date, time, people: split === 'custom' ? people || undefined : undefined, parts: prefill?.parts && Number(amount) === prefill.parts.reduce((a, b) => a + b, 0) ? prefill.parts : undefined, ...(accounts?.length ? { _link: paidBy === me ? link : '' } : {}) });
  };

  return (
    <form className="form" onSubmit={submit}>
      <AiBanner ai={ai} />
      <div className={'field' + flag(ai, 'payer')}>
        <span className="field-label">Kis ne paise diye?</span>
        <Segmented name="paidBy" value={paidBy} onChange={setPaidBy}
          options={[{ value: me, label: 'Main ne', color: colors[me] }, { value: otherId, label: `${other} ne`, color: colors[otherId] }]} />
      </div>

      <div className={flag(ai, 'amount').trim()}><AmountInput label="Kul kitne diye?" value={amount} onChange={setAmount} autoFocus={!initial && !prefill} parts={prefill?.parts} /></div>
      <input className="text-field" placeholder="Kis cheez par? (sabzi, chai, program, kuch bhi)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />

      <div className={'chips' + flag(ai, 'category')} role="radiogroup" aria-label="Qisam">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <button type="button" key={c.id} role="radio" aria-checked={category === c.id} className={'chip' + (category === c.id ? ' on' : '')} onClick={() => setCategory(c.id)}>
              <Icon size={15} /> {c.label}
            </button>
          );
        })}
      </div>

      <div className={'field' + flag(ai, 'forWhom')}>
        <span className="field-label">Ye kharcha kis ka tha?</span>
        <div className="split-grid">
          {[
            { v: 'half', t: 'Dono ka, aadha-aadha', s: amt ? `${rs(amt / 2)} har ek` : 'Barabar baant' },
            { v: 'full', t: `Sirf ${debtorName}`, s: amt ? `Poore ${rs(amt)}` : 'Poori raqam' },
            { v: 'self', t: `Sirf ${payerName}`, s: 'Hisaab par asar nahi' },
            { v: 'custom', t: 'Apni marzi', s: `${debtor === me ? 'Mera' : other + ' ka'} hissa likho` },
          ].map((o) => (
            <button type="button" key={o.v} className={'split-opt' + (split === o.v ? ' on' : '')} onClick={() => setSplit(o.v)} aria-pressed={split === o.v}>
              <strong>{o.t}</strong>
              <small>{o.s}</small>
            </button>
          ))}
        </div>
        {split === 'custom' && (
          <div className="custom-box">
            <label className="custom-one">
              <span>{debtor === me ? 'Mera' : `${other} ka`} hissa</span>
              <input inputMode="decimal" value={custom} placeholder="0" autoFocus={!prefill} onChange={(e) => { setPeople(0); setCustom(e.target.value.replace(/[^\d.]/g, '')); }} />
            </label>
            <div className="people-split">
              <span>Ya kitne bandon mein barabar?</span>
              <div className="stepper">
                <button type="button" onClick={() => splitAmong(Math.max(2, (people || 2) - 1))} aria-label="Kam"><Minus size={16} /></button>
                <b>{people || '?'}</b>
                <button type="button" onClick={() => splitAmong(Math.min(30, (people || 1) + 1))} aria-label="Zyada"><PlusIcon size={16} /></button>
              </div>
            </div>
            {people > 0 && amt > 0 && <p className="people-note">{rs(amt)} ÷ {people} bande = {rs(amt / people)} har ek ka</p>}
          </div>
        )}
      </div>

      <AccountLink accounts={accounts} value={link} onChange={setLink} dir={paidBy === me ? 'out' : null} />

      <div className={flag(ai, 'date').trim()}><DateRow date={date} setDate={setDate} time={time} setTime={setTime} /></div>

      <div className={'preview' + (amt > 0 && (owed > 0 || split === 'self') ? ' live' : '')}>
        <p>{preview}</p>
        {amt > 0 && owed > 0 && owed < amt && <small>Khata mein sirf {rs(owed)} likha jayega, poora bill nahi.</small>}
        {amt > 0 && split === 'self' && <small>Ye sirf aap ko dikhega, {other} ko nahi.</small>}
      </div>

      <div className="form-actions">
        {initial && <DeleteButton onDelete={onDelete} />}
        <button className="btn primary" disabled={busy || !paidBy || amt <= 0 || (owed <= 0 && split !== 'self')}>{saveLabel || (initial ? 'Tabdeeli save karo' : 'Kharcha save karo')}</button>
      </div>
    </form>
  );
}

/* ---------------- Payment ---------------- */
export function PaymentForm({ me, otherId, names, colors, balance, initial, prefill, ai, prefillClear, onSave, onDelete, busy, loan, saveLabel, accounts, linkInit = '' }) {
  const [link, setLink] = useState(linkInit);
  const other = names[otherId];
  const defaultFrom = initial?.from || (loan ? otherId : balance.amount > 0 ? balance.from : me);
  const [from, setFrom] = useState(prefill ? prefill.from : defaultFrom);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : prefill ? (prefill.amount ? String(prefill.amount) : '') : prefillClear && balance.amount > 0 ? String(Math.round(balance.amount)) : '');
  const [note, setNote] = useState(initial?.note || prefill?.note || '');
  const [date, setDate] = useState(initial?.date || prefill?.date || today());
  const [time, setTime] = useState(initial?.time || prefill?.time || nowTime());
  const [shot, setShot] = useState(null); // naya screenshot (dataUrl)
  const [keepOld, setKeepOld] = useState(!!(initial && shotUrl(initial)));
  const [shotErr, setShotErr] = useState('');
  const fileInput = useRef();
  const to = from === me ? otherId : me;
  const amt = Number(amount) || 0;

  const owedNow = balance.amount > 0 && balance.from === from ? balance.amount : 0;
  const creditNow = balance.amount > 0 && balance.from === to ? balance.amount : 0;
  let after = '';
  if (!initial && amt > 0) {
    const net = owedNow - creditNow - amt;
    const fromName = from === me ? 'Aap' : other;
    const toName = to === me ? 'aap' : other;
    const toCap = to === me ? 'Aap' : other;
    const fromLow = from === me ? 'aap' : other;
    if (loan) {
      const n = creditNow + amt - owedNow; // ab "to" ne kitna dena hai
      after = n > 0.5 ? `Is ke baad ${toCap} ne ${fromLow === 'aap' ? 'aap' : other} ko ${rs(n)} dene honge.` : 'Is ke baad hisaab barabar ho jayega.';
    } else if (Math.abs(net) < 0.5) after = 'Is ke baad hisaab bilkul barabar ho jayega.';
    else if (net > 0) after = `Is ke baad bhi ${fromName} ne ${rs(net)} aur dene honge.`;
    else after = `Is ke baad ${rs(-net)} ${toName} ke paas advance rahenge.`;
  }

  const pick = async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    setShotErr('');
    try { setShot(await compressImage(f)); } catch (e) { setShotErr(e.message); }
  };

  const submit = (ev) => {
    ev.preventDefault();
    if (amt <= 0 || !from) return;
    const body = { type: loan ? 'loan' : 'payment', amount: amt, from, note, date, time };
    if (accounts?.length) body._link = link;
    if (shot) body.screenshot = shot;
    else if (initial && shotUrl(initial) && !keepOld) body.removeScreenshot = true;
    onSave(body);
  };

  const preview = shot || (keepOld && initial ? shotUrl(initial) : null);

  return (
    <form className="form" onSubmit={submit}>
      <AiBanner ai={ai} />
      <div className={'field' + flag(ai, 'payer')}>
        <span className="field-label">{loan ? 'Kis ne qarz diya?' : 'Kis ne paise bheje?'}</span>
        <Segmented name="from" value={from} onChange={setFrom}
          options={[{ value: me, label: 'Main ne', color: colors[me] }, { value: otherId, label: `${other} ne`, color: colors[otherId] }]} />
        <p className="flow-line">{!from ? 'Chuno kis ne diye' : loan
          ? (from === me ? `Aap ne ${other} ko qarz diya, ab ${other} ne wapas dena hai` : `${other} ne aap ko qarz diya, ab aap ne wapas dena hai`)
          : (from === me ? `Aap ne ${other} ko bheje` : `${other} ne aap ko bheje`)}</p>
      </div>

      <div className={flag(ai, 'amount').trim()}><AmountInput value={amount} onChange={setAmount} autoFocus={!initial && !prefill} parts={prefill?.parts} /></div>

      {!initial && !prefill && !loan && owedNow > 0 && (
        <button type="button" className="quick-clear" onClick={() => setAmount(String(Math.round(owedNow)))}>
          Poora hisaab clear: <b>{rs(owedNow)}</b>
        </button>
      )}

      <input className="text-field" placeholder={loan ? 'Kis liye? (jaise fees, ghar bhejne ke liye)' : 'Note (jaise JazzCash, Easypaisa, cash)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />

      <div className="field">
        <span className="field-label">Screenshot (agar chaho)</span>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={pick} />
        {preview ? (
          <div className="shot-pick">
            <img src={preview} alt="Payment ka screenshot" />
            <div>
              <button type="button" className="btn ghost small-g" onClick={() => fileInput.current.click()}>Badlo</button>
              <button type="button" className="btn danger small-g" onClick={() => { setShot(null); setKeepOld(false); }}><X size={15} /> Hatao</button>
            </div>
          </div>
        ) : (
          <button type="button" className="shot-add" onClick={() => fileInput.current.click()}>
            <ImagePlus size={20} />
            <span><strong>Screenshot lagao</strong><small>Dono ke record mein saboot rahega</small></span>
          </button>
        )}
        {shotErr && <p className="err">{shotErr}</p>}
      </div>

      <AccountLink accounts={accounts} value={link} onChange={setLink} dir={from ? (from === me ? 'out' : 'in') : null} />

      <DateRow date={date} setDate={setDate} time={time} setTime={setTime} />

      {after && <p className="preview live">{after}</p>}
      {!loan && <p className="hint">Purane kharche, sab se purana pehle, khud tick ho jayenge.</p>}

      <div className="form-actions">
        {initial && <DeleteButton onDelete={onDelete} />}
        <button className="btn primary" disabled={busy || amt <= 0 || !from}>{busy ? 'Save ho raha hai...' : saveLabel || (initial ? 'Tabdeeli save karo' : loan ? 'Qarz save karo' : 'Payment save karo')}</button>
      </div>
    </form>
  );
}

/* ---------------- PIN badlo ---------------- */
export function PinForm({ onSave, busy }) {
  const [oldPin, setOld] = useState('');
  const [newPin, setNew] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const digits = (v) => v.replace(/\D/g, '').slice(0, 4);
  const submit = async (ev) => {
    ev.preventDefault();
    setErr('');
    if (newPin.length !== 4) return setErr('Naya PIN 4 hindson ka ho.');
    if (newPin !== again) return setErr('Naya PIN dono dafa ek jaisa likho.');
    try { await onSave(oldPin, newPin); } catch (e) { setErr(e.message); }
  };
  return (
    <form className="form" onSubmit={submit}>
      <label className="pin-field"><span>Purana PIN</span><input type="password" inputMode="numeric" autoComplete="current-password" value={oldPin} onChange={(e) => setOld(digits(e.target.value))} /></label>
      <label className="pin-field"><span>Naya PIN</span><input type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNew(digits(e.target.value))} /></label>
      <label className="pin-field"><span>Naya PIN dobara</span><input type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(digits(e.target.value))} /></label>
      {err && <p className="err">{err}</p>}
      <p className="hint">PIN badalne ke baad doosre phones par aap ka account khud log out ho jayega.</p>
      <button className="btn primary" disabled={busy || !oldPin || !newPin}>PIN badlo</button>
    </form>
  );
}
