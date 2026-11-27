// Mahine ka budget: kul had + har category ki alag had
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { catList, money } from './meta';

const num = (v) => String(v || '').replace(/[^\d]/g, '');

export default function BudgetForm({ budget, catBudgets = {}, report, onSave }) {
  const [total, setTotal] = useState(budget ? String(budget) : '');
  const [cb, setCb] = useState(() => Object.fromEntries(Object.entries(catBudgets).map(([k, v]) => [k, String(v)])));
  const cats = catList('expense');
  const setOnes = cats.filter((c) => Number(cb[c.id]) > 0 || report.byCat[c.id]);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? cats : setOnes.length ? setOnes : cats.slice(0, 6);
  const sumCats = Object.values(cb).reduce((a, v) => a + (Number(v) || 0), 0);
  const T = Number(total) || 0;
  const submit = (e) => {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(cb).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    onSave({ budget: T, catBudgets: clean });
  };
  return (
    <form className="form budget-form" onSubmit={submit}>
      <p className="hint">Had rakho, phir app batata rahega kitna kharch hua, kitna baqi hai, aur roz kitna chala sakte ho. Had paar ho to laal ho jayega.</p>
      <label className="custom-one big">
        <span>Poore mahine ka budget (Rs)</span>
        <input inputMode="numeric" value={total} placeholder="jaise 40000" onChange={(e) => setTotal(num(e.target.value))} />
        {T > 0 && <small className="rate-note">Is mahine ab tak {money(report.spent)}: {report.spent > T ? `${money(report.spent - T)} upar` : `${money(T - report.spent)} baqi`}</small>}
      </label>

      <div className="field">
        <span className="field-label">Har category ki had (agar chaho)</span>
        <div className="cb-list">
          {shown.map((c) => {
            const I = c.icon; const spent = report.byCat[c.id] || 0; const lim = Number(cb[c.id]) || 0;
            return (
              <div key={c.id} className={'cb-row' + (lim ? ' set' : '')}>
                <span className="cb-ic"><I size={16} /></span>
                <span className="cb-name"><b>{c.label}</b><small>{spent ? `Is mahine ${money(spent)}` : 'Abhi kuch nahi'}</small>{lim > 0 && <span className="b-bar thin"><i className={spent > lim ? 'over' : spent > lim * 0.8 ? 'warn' : ''} style={{ width: Math.min(100, (spent / lim) * 100) + '%' }} /></span>}</span>
                <label className="cb-in"><span>Rs</span><input inputMode="numeric" value={cb[c.id] || ''} placeholder="had" onChange={(e) => setCb({ ...cb, [c.id]: num(e.target.value) })} aria-label={`${c.label} ka budget`} /></label>
              </div>
            );
          })}
        </div>
        {!showAll && <button type="button" className="text-btn cb-more" onClick={() => setShowAll(true)}>Saari categories <ChevronDown size={16} /></button>}
        {sumCats > 0 && <p className="hint">Categories ki had ka jor: {money(sumCats)}{T > 0 && sumCats > T ? ` (kul budget se ${money(sumCats - T)} zyada)` : ''}</p>}
      </div>

      <div className="form-actions">
        {(budget > 0 || Object.keys(catBudgets).length > 0) && <button type="button" className="btn ghost" onClick={() => onSave({ budget: 0, catBudgets: {} })}>Sab hatao</button>}
        <motion.button whileTap={{ scale: 0.97 }} className="btn primary"><Check size={17} /> Save karo</motion.button>
      </div>
    </form>
  );
}
