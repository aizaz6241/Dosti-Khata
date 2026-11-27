// Poora hisaab PDF mein (Claude / ChatGPT ko de kar mashwara lene ke liye bhi)
import { idOf, monthReport, toPKR } from '../../server/money.js';
import { catMeta, kindMeta, TYPES, EXPENSE, INCOME } from './meta';
import { catOf, view, visible } from '../lib';

const fmt = (n, cur = 'PKR') => {
  const s = (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return cur === 'PKR' ? `Rs ${s}` : `${s} ${cur}`;
};
const lastMonths = (n) => {
  const out = []; const d = new Date();
  for (let i = 0; i < n; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); }
  return out;
};

export async function exportPdf({ name, mine, balances, people, worth, shared, me, names, rates: liveRates, spend = [], allTx, range, reportRange }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const pine = [15, 61, 51];
  const rates = liveRates || mine.prefs?.rates || {};
  const other = names[Object.keys(names).find((k) => k !== me)];
  const txAll = allTx || mine.ptx;
  let y = 0;
  const head = (t) => {
    y = (doc.lastAutoTable?.finalY || y) + 26;
    if (y > 760) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...pine); doc.text(t, 40, y);
    y += 8;
  };
  const table = (headRow, body, opts = {}) => {
    autoTable(doc, {
      startY: y + 4, head: [headRow], body, margin: { left: 40, right: 40 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, textColor: [23, 33, 29] },
      headStyles: { fillColor: pine, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [238, 242, 238] }, ...opts,
    });
  };

  // Sar-e-warq
  doc.setFillColor(...pine); doc.rect(0, 0, W, 86, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('Dosti Khata: Mera Hisaab', 40, 42);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(`${name}  |  ${range ? `Muddat: ${range.label} (${range.from} se ${range.to})  |  ` : ''}Bana: ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`, 40, 64);
  y = 110;
  doc.setTextColor(23, 33, 29); doc.setFontSize(11);
  const owe = Object.values(people).reduce((a, p) => a + Math.max(0, p.balance.PKR || 0), 0);
  const owed = Object.values(people).reduce((a, p) => a + Math.max(0, -(p.balance.PKR || 0)), 0);
  doc.setFont('helvetica', 'bold'); doc.text(`Kul paisa (sab accounts): ${fmt(worth.pkr)}`, 40, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Logon par mere: ${fmt(owe)}    Mujh par logon ke: ${fmt(owed)}`, 40, y + 16);
  if (shared?.balance?.amount) doc.text(`${other} ke saath khata: ${shared.balance.from === me ? `maine ${fmt(shared.balance.amount)} dene hain` : `mujhe ${fmt(shared.balance.amount)} milne hain`}`, 40, y + 32);
  if (Object.keys(rates).length) doc.text(`Rate: ${Object.entries(rates).map(([c, r]) => `1 ${c} = Rs ${r}`).join(', ')}`, 40, y + 48);
  y += 56;

  head('Accounts');
  table(['Account', 'Qisam', 'Currency', 'Balance', 'Rupay mein'], mine.accounts.filter((a) => !a.archived).map((a) => {
    const b = balances[idOf(a)] || 0; const p = toPKR(b, a.currency, rates);
    return [a.name, kindMeta(a.kind).label, a.currency, fmt(b, a.currency), p == null ? '-' : fmt(p)];
  }));

  head('Pichle 6 mahine');
  const months = lastMonths(6);
  table(['Mahina', 'Kharcha', `Is mein ${other} khata`, 'Aamdani', 'Bacha', 'Qarz diya', 'Wapas mila'], months.map((m) => {
    const r = monthReport(mine.ptx, mine.accounts, m, rates, spend);
    return [m, fmt(r.spent), fmt(r.khata), fmt(r.income), fmt(r.saved), fmt(r.lent), fmt(r.gotBack)];
  }));

  const r0 = range && reportRange ? reportRange({ kind: 'custom', from: range.from, to: range.to }) : monthReport(mine.ptx, mine.accounts, months[0], rates, spend);
  if (range) {
    head(`Is muddat ka khulasa (${range.label})`);
    table(['Kharcha', `Is mein ${other} khata`, 'Aamdani', 'Bacha', 'Roz ka avg', 'Pichli itni muddat se'], [[fmt(r0.spent), fmt(r0.khata), fmt(r0.income), fmt(r0.saved), fmt(r0.perDay), r0.change == null ? '-' : `${r0.change > 0 ? '+' : ''}${r0.change}%`]]);
  }
  head(range ? `Kis cheez par kharcha (${range.label})` : `Is mahine (${months[0]}) kis cheez par kharcha`);
  const cats = Object.entries(r0.byCat).sort((a, b) => b[1] - a[1]);
  table(['Qisam', 'Raqam', 'Hissa'], cats.length ? cats.map(([c, v]) => [EXPENSE.find((x) => x.id === c)?.label || c, fmt(v), `${Math.round((v / (r0.spent || 1)) * 100)}%`]) : [['Is mahine koi kharcha nahi', '', '']]);
  const inc = Object.entries(r0.inCat);
  if (inc.length) { head(range ? 'Is muddat ki aamdani' : 'Is mahine aamdani'); table(['Qisam', 'Raqam'], inc.map(([c, v]) => [INCOME.find((x) => x.id === c)?.label || c, fmt(v)])); }

  head('Logon ka khata');
  const pc = mine.contacts.filter((c) => !c.archived);
  table(['Banda', 'Baqi', 'Matlab'], pc.length ? pc.map((c) => {
    const b = Object.entries(people[idOf(c)]?.balance || {});
    return [c.name, b.length ? b.map(([cur, v]) => fmt(Math.abs(v), cur)).join(', ') : '0', b.length ? (b[0][1] > 0 ? 'Woh mujhe dega' : 'Main us ko dunga') : 'Barabar'];
  }) : [['Koi nahi', '', '']]);
  for (const c of pc) {
    const h = people[idOf(c)]?.history || [];
    if (!h.length) continue;
    head(`${c.name}: tareekh-waar`);
    table(['Tareekh', 'Kya hua', 'Raqam', 'Baqi', 'Note'], h.map((x) => [`${x.date} ${x.time || ''}`, TYPES[x.type].label, fmt(Math.abs(x.delta), x.currency), fmt(x.running, x.currency), x.note || '']));
  }

  head(range ? `Len-den (${range.label})` : 'Mere saare len-den');
  const acc = (id) => mine.accounts.find((a) => idOf(a) === id);
  const inRange = (d) => !range || (String(d).slice(0, 10) >= range.from && String(d).slice(0, 10) <= range.to);
  const tx = [...txAll].filter((t) => inRange(t.date)).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  table(['Tareekh', 'Qisam', 'Kahan / kis se', 'Raqam', 'Note'], tx.length ? tx.map((t) => {
    const a = acc(t.accountId); const cur = a?.currency || 'PKR';
    const who = mine.contacts.find((c) => idOf(c) === t.contactId)?.name;
    const where = t.type === 'transfer' ? `${a?.name || '?'} > ${acc(t.toAccountId)?.name || '?'}` : [a?.name, who].filter(Boolean).join(', ');
    const sign = t.type === 'transfer' ? '' : (TYPES[t.type]?.sign || Math.sign(t.amount)) > 0 ? '+' : '-';
    const kind = t.type === 'expense' || t.type === 'income' ? catMeta(t).label : t.synthetic ? `${other} khata` : TYPES[t.type].label;
    return [`${t.date} ${t.time || ''}`, kind, where, `${sign}${fmt(Math.abs(t.amount), cur)}`, t.note || ''];
  }) : [['Abhi koi len-den nahi', '', '', '', '']], { columnStyles: { 3: { halign: 'right' } } });

  if (shared?.entries?.length) {
    head(`${other} ke saath khata (sirf mera hissa)`);
    const rows = shared.entries.filter(visible(me)).filter((e) => inRange(e.date)).map((e) => {
      const v = view(e, me, names);
      const st = e.type === 'payment' ? (e.calc.left > 0 ? `${fmt(e.calc.left)} advance` : 'lag gaye') : e.calc.status === 'clear' ? 'clear' : e.calc.status === 'personal' ? 'apna' : `${fmt(e.calc.left)} baqi`;
      return [`${e.date} ${e.time || ''}`, e.note || catOf(e.type === 'expense' ? e.category : e.type).label, v.line, fmt(v.amount), st];
    });
    table(['Tareekh', 'Cheez', 'Kya hua', 'Raqam', 'Haalat'], rows);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Dosti Khata by EZOX  |  Safha ${i} / ${pages}`, 40, doc.internal.pageSize.getHeight() - 20);
  }
  const file = range ? `mera-hisaab-${range.from}-se-${range.to}.pdf` : `mera-hisaab-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  // Phone par: share sheet (WhatsApp / Files / Claude), warna download
  try {
    const f = new File([blob], file, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: 'Mera Hisaab' }); return 'shared'; }
  } catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
