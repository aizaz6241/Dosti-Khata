// Chhota calculator: + − × ÷, aur jawab ek tap mein raqam ke dabbe mein
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Delete, ArrowDownToLine } from 'lucide-react';
import { num } from '../lib';

const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => (b === 0 ? NaN : a / b) };
const PREC = { '+': 1, '−': 1, '×': 2, '÷': 2 };

// Hisaab bina eval ke: pehle × ÷, phir + −
export function calc(expr) {
  const tokens = String(expr).match(/\d+(?:\.\d+)?|[+−×÷]/g) || [];
  if (!tokens.length) return null;
  const out = [], ops = [];
  const apply = () => { const b = out.pop(), a = out.pop(), o = ops.pop(); out.push(OPS[o](a, b)); };
  let expectNum = true;
  for (const t of tokens) {
    if (OPS[t]) {
      if (expectNum) return null;
      while (ops.length && PREC[ops.at(-1)] >= PREC[t]) apply();
      ops.push(t); expectNum = true;
    } else { out.push(Number(t)); expectNum = false; }
  }
  if (expectNum) { ops.pop(); } // aakhir mein akela nishan: chhor do
  while (ops.length) apply();
  const r = out[0];
  return Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
}

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', 'del', '+'];

export default function Calculator({ onUse, initial = '' }) {
  const [expr, setExpr] = useState(initial);
  const result = calc(expr);
  const press = (k) => {
    if (k === 'del') return setExpr((e) => e.slice(0, -1));
    setExpr((e) => {
      const last = e.slice(-1);
      if (OPS[k]) {
        if (!e) return e;
        if (OPS[last]) return e.slice(0, -1) + k; // nishan badlo
        return e + k;
      }
      if (k === '.') {
        const part = e.split(/[+−×÷]/).pop();
        if (part.includes('.')) return e;
        return e + (part === '' ? '0.' : '.');
      }
      return (e + k).slice(0, 40);
    });
  };
  const pretty = expr.replace(/\d+(?:\.\d+)?/g, (n) => (n.includes('.') ? n : Number(n).toLocaleString('en-PK'))).replace(/([+−×÷])/g, ' $1 ');
  return (
    <div className="calc">
      <div className="calc-screen" aria-live="polite">
        <span className="calc-expr">{pretty || '0'}</span>
        <span className="calc-res">{result != null && /[+−×÷]/.test(expr) ? `= ${num(result)}` : ' '}</span>
      </div>
      <div className="calc-keys">
        {KEYS.map((k) => (
          <motion.button type="button" key={k} whileTap={{ scale: 0.9 }} className={'ck' + (OPS[k] ? ' op' : '') + (k === 'del' ? ' del' : '')}
            onClick={() => press(k)} aria-label={k === 'del' ? 'Mitao' : k}>
            {k === 'del' ? <Delete size={20} /> : k}
          </motion.button>
        ))}
        <button type="button" className="ck clear" onClick={() => setExpr('')}>C</button>
        <button type="button" className="ck use" disabled={!(result > 0)} onClick={() => onUse(result)}>
          <ArrowDownToLine size={18} /> {result > 0 ? `Rs ${num(result)} raqam mein daalo` : 'Hisaab karo'}
        </button>
      </div>
    </div>
  );
}
