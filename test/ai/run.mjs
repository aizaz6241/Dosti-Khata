// AI test chalao: node test/ai/run.mjs  (GEMINI_API_KEY chahiye)
import cases from './cases.mjs';
import { createAI } from '../../server/ai.js';
const ai = createAI();
const names = { aizaz: 'Aizaz', abdullah: 'Abdullah' };
const P = { A: 'aizaz', B: 'abdullah' };
const today = '2026-11-27';
const addDays = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let pass = 0, wrong = 0, safe = 0; const fails = [];
async function one([raw, exp]) {
  const me = raw.startsWith('@abdullah:') ? 'abdullah' : 'aizaz';
  const text = raw.replace(/^@abdullah:/, '');
  const otherId = me === 'aizaz' ? 'abdullah' : 'aizaz';
  let r;
  for (let i = 0; i < 4; i++) { try { r = await ai.parse({ me, otherId, names, text, today }); break; } catch (e) { if (i === 3) { fails.push(['ERROR', raw, e.message]); return; } await new Promise((s) => setTimeout(s, 20000)); } }
  const f = r.form || {};
  const bad = [];
  const payer = f.type === 'expense' ? f.paidBy : f.from;
  if ('k' in exp && (r.kind || null) !== exp.k) bad.push(`kind ${r.kind} != ${exp.k}`);
  if ('p' in exp) { const want = exp.p === '?' ? null : P[exp.p]; if ((payer || null) !== want) bad.push(`payer ${payer} != ${want}`); }
  if ('a' in exp && (f.amount ?? null) !== exp.a) bad.push(`amount ${f.amount} != ${exp.a}`);
  if ('s' in exp && f.split !== exp.s) bad.push(`split ${f.split} != ${exp.s}`);
  if ('o' in exp && f.owed !== exp.o) bad.push(`owed ${f.owed} != ${exp.o}`);
  if ('c' in exp && f.category !== exp.c) bad.push(`cat ${f.category} != ${exp.c}`);
  if ('d' in exp && f.date !== addDays(exp.d)) bad.push(`date ${f.date} != ${addDays(exp.d)}`);
  if (exp.assumed && !r.assumed.includes(exp.assumed)) bad.push(`assumed missing ${exp.assumed}`);
  // "Mehfooz" ghalti: jo ghalat hai woh khali/peela chhora gaya (user ko dikhega), chupke se ghalat nahi
  const flagged = (field) => r.missing.includes(field) || r.assumed.includes(field);
  if (!bad.length) pass++;
  else {
    const onlyCat = bad.every((b) => b.startsWith('cat'));
    const isSafe = bad.every((b) => (b.startsWith('amount') && f.amount == null) || (b.startsWith('payer') && !payer) || (b.startsWith('split') && flagged('forWhom')));
    if (isSafe) safe++; else wrong++;
    fails.push([onlyCat ? 'QISAM' : isSafe ? 'MEHFOOZ' : 'GHALAT', raw, bad.join('; ')]);
  }
}
const list = process.argv[2] ? cases.slice(0, Number(process.argv[2])) : cases;
// Free key: ek minute mein ~15 sawal. Is liye ek ek kar ke, waqfe ke saath.
const gap = Number(process.env.GAP || 4200);
for (const c of list) { const t = Date.now(); await one(c); const w = gap - (Date.now() - t); if (w > 0) await new Promise((r) => setTimeout(r, w)); }
console.log(`\nKul ${list.length}: sahi ${pass}, mehfooz (khali/peela chhora) ${safe}, ghalat ${wrong}`);
for (const f of fails) console.log(f.join(' | '));
