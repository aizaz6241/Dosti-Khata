// "Mera Hisaab": apne accounts, apna kharcha/aamdani, aur logon ka khata.
// Server aur app dono yeh file use karte hain (offline bhi hisaab phone par banta hai).

export const ACCOUNT_KINDS = ['cash', 'bank', 'wallet', 'crypto', 'other'];
export const CURRENCIES = ['PKR', 'USDT', 'USD', 'AED', 'SAR', 'GBP', 'EUR'];
export const PTX_TYPES = ['expense', 'income', 'transfer', 'lend', 'borrow', 'got_back', 'paid_back', 'adjust'];
export const EXPENSE_CATS = ['khana', 'sauda', 'chai', 'ghar', 'bill', 'safar', 'petrol', 'kapray', 'dawai', 'salon', 'family', 'taleem', 'online', 'tohfa', 'sair', 'other'];
export const INCOME_CATS = ['salary', 'freelance', 'business', 'tohfa_in', 'refund', 'other_in'];

const round = (n) => Math.round(Number(n) * 100) / 100;
// Har cheez ki pehchan: app ka diya clientId, warna server ka _id
export const idOf = (x) => String(x.clientId || x._id);

// Account par asar: + paise aaye, - paise gaye
export function effects(t) {
  const a = Number(t.amount) || 0;
  switch (t.type) {
    case 'expense': return [[t.accountId, -a]];
    case 'income': return [[t.accountId, a]];
    case 'transfer': return [[t.accountId, -a], [t.toAccountId, Number(t.toAmount ?? a) || 0]];
    case 'lend': return [[t.accountId, -a]];
    case 'borrow': return [[t.accountId, a]];
    case 'got_back': return [[t.accountId, a]];
    case 'paid_back': return [[t.accountId, -a]];
    case 'adjust': return [[t.accountId, a]]; // a +/- dono ho sakta hai
    default: return [];
  }
}

// Bande ke khate par asar: + matlab woh mujhe dega
export function personEffect(t) {
  const a = Number(t.amount) || 0;
  return { lend: a, got_back: -a, borrow: -a, paid_back: a }[t.type] ?? 0;
}

const order = (a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));

export function accountBalances(accounts, txns) {
  const bal = Object.fromEntries(accounts.map((a) => [idOf(a), round(a.opening || 0)]));
  for (const t of txns) for (const [id, d] of effects(t)) if (id && id in bal) bal[id] = round(bal[id] + d);
  return bal;
}

// Har bande ka khata: kul baqi (currency ke hisaab se) aur tareekh-waar history (chalta hua baqi)
export function peopleLedger(contacts, txns, accounts) {
  const cur = Object.fromEntries(accounts.map((a) => [idOf(a), a.currency || 'PKR']));
  const out = Object.fromEntries(contacts.map((c) => [idOf(c), { balance: {}, history: [] }]));
  for (const t of [...txns].sort(order)) {
    const id = t.contactId && String(t.contactId);
    if (!id || !(id in out)) continue;
    const d = personEffect(t);
    if (!d) continue;
    const c = (t.accountId && cur[t.accountId]) || t.currency || 'PKR';
    const p = out[id];
    p.balance[c] = round((p.balance[c] || 0) + d);
    p.history.push({ ...t, currency: c, delta: d, running: p.balance[c] });
  }
  for (const p of Object.values(out)) for (const k of Object.keys(p.balance)) if (Math.abs(p.balance[k]) < 0.005) delete p.balance[k];
  return out;
}

export const toPKR = (amount, currency, rates = {}) => {
  if (!currency || currency === 'PKR') return Number(amount) || 0;
  const r = Number(rates[currency]);
  return r > 0 ? (Number(amount) || 0) * r : null; // rate na ho to null (alag dikhao)
};

export function netWorth(accounts, balances, rates) {
  let pkr = 0; const unconverted = {};
  for (const a of accounts) {
    if (a.archived) continue;
    const b = balances[idOf(a)] || 0;
    const v = toPKR(b, a.currency, rates);
    if (v == null) unconverted[a.currency] = round((unconverted[a.currency] || 0) + b);
    else pkr += v;
  }
  return { pkr: round(pkr), unconverted };
}

const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); };

// Mahine ka hisaab (PKR mein; doosri currency rate se)
export function monthReport(txns, accounts, monthKey, rates = {}) {
  const cur = Object.fromEntries(accounts.map((a) => [idOf(a), a.currency || 'PKR']));
  const sum = (m) => {
    const r = { spent: 0, income: 0, byCat: {}, inCat: {}, byDay: {}, count: 0, biggest: null, lent: 0, gotBack: 0 };
    for (const t of txns) {
      if (String(t.date).slice(0, 7) !== m) continue;
      const v = toPKR(t.amount, cur[t.accountId] || 'PKR', rates);
      if (v == null) continue;
      if (t.type === 'expense') {
        r.spent += v; r.count++;
        r.byCat[t.category || 'other'] = round((r.byCat[t.category || 'other'] || 0) + v);
        r.byDay[t.date] = round((r.byDay[t.date] || 0) + v);
        if (!r.biggest || v > r.biggest.pkr) r.biggest = { ...t, pkr: round(v) };
      } else if (t.type === 'income') {
        r.income += v;
        r.inCat[t.category || 'other_in'] = round((r.inCat[t.category || 'other_in'] || 0) + v);
      } else if (t.type === 'lend') r.lent += v;
      else if (t.type === 'got_back') r.gotBack += v;
    }
    r.spent = round(r.spent); r.income = round(r.income); r.lent = round(r.lent); r.gotBack = round(r.gotBack);
    return r;
  };
  const now = sum(monthKey);
  const before = sum(prevMonth(monthKey));
  const [y, mo] = monthKey.split('-').map(Number);
  const daysIn = new Date(y, mo, 0).getDate();
  return {
    month: monthKey,
    ...now,
    saved: round(now.income - now.spent),
    perDay: Math.round(now.spent / daysIn),
    prev: { month: prevMonth(monthKey), spent: before.spent, income: before.income },
    change: before.spent > 0 ? round(((now.spent - before.spent) / before.spent) * 100) : null,
  };
}
