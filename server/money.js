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
  if (t.reversed) return []; // wapas (reverse) hua payout: kisi total mein nahi
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
    case 'khata_out': return [[t.accountId, -a]]; // Abdullah wale khate ki entry, is account se paise gaye
    case 'khata_in': return [[t.accountId, a]];
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
    if (t.reversed) continue;
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
export function monthReport(txns, accounts, monthKey, rates = {}, shared = []) {
  const cur = Object.fromEntries(accounts.map((a) => [idOf(a), a.currency || 'PKR']));
  const sum = (m) => {
    const r = { spent: 0, income: 0, byCat: {}, inCat: {}, byDay: {}, count: 0, biggest: null, lent: 0, gotBack: 0, khata: 0 };
    // Dosti khata mein aap ka hissa bhi aap ka kharcha hai
    for (const s of shared) {
      if (String(s.date).slice(0, 7) !== m) continue;
      const v = Number(s.amount) || 0;
      r.spent += v; r.khata += v; r.count++;
      r.byCat[s.category] = round((r.byCat[s.category] || 0) + v);
      r.byDay[s.date] = round((r.byDay[s.date] || 0) + v);
      if (!r.biggest || v > r.biggest.pkr) r.biggest = { ...s, type: 'expense', pkr: round(v) };
    }
    for (const t of txns) {
      if (String(t.date).slice(0, 7) !== m || t.reversed) continue;
      const v = toPKR(t.amount, cur[t.accountId] || t.currency || 'PKR', rates);
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
    r.spent = round(r.spent); r.khata = round(r.khata); r.income = round(r.income); r.lent = round(r.lent); r.gotBack = round(r.gotBack);
    return r;
  };
  const now = sum(monthKey);
  const before = sum(prevMonth(monthKey));
  const [y, mo] = monthKey.split('-').map(Number);
  const daysIn = new Date(y, mo, 0).getDate();
  const tt = localToday();
  const passedM = tt.slice(0, 7) === monthKey ? Number(tt.slice(8)) : daysIn;
  return {
    month: monthKey,
    ...now,
    saved: round(now.income - now.spent),
    perDay: Math.round(now.spent / Math.max(1, passedM)),
    prev: { month: prevMonth(monthKey), spent: before.spent, income: before.income },
    change: before.spent > 0 ? round(((now.spent - before.spent) / before.spent) * 100) : null,
  };
}

// ---------------- Dosti khata (Abdullah wala) ko Mera Hisaab mein jodna ----------------
const SHARED_CAT = { khana: 'khana', chai: 'chai', sauda: 'sauda', program: 'sair', petrol: 'petrol', kiraya: 'safar', ghar: 'ghar', bill: 'bill', salon: 'salon', kapray: 'kapray', dawai: 'dawai', ticket: 'safar' };
export const sharedCat = (c) => SHARED_CAT[c] || 'other';

// Saanjhe khate ke har kharche mein aap ka apna hissa (poora bill nahi)
export function sharedSpend(rows, me) {
  const out = [];
  for (const e of rows || []) {
    if (e.type !== 'expense') continue;
    const v = round(Number(e.shares?.[me] || 0));
    if (!(v > 0)) continue;
    out.push({ date: String(e.date).slice(0, 10), time: e.time || '', amount: v, category: sharedCat(e.category), note: e.note || '', entryId: idOf(e), paidBy: e.paidBy, khata: true });
  }
  return out;
}

// Kis shared entry mein aap ke paise kis taraf gaye: 'out' (aap ne diye) ya 'in' (aap ko mile)
export function flowOf(e, me) {
  if (!e) return null;
  if (e.type === 'expense') return e.paidBy === me ? 'out' : null;
  if (e.from === me) return 'out';
  if (e.to === me || (e.from && e.from !== me)) return 'in';
  return null;
}

// Links (entry -> mera account) ko asal len-den bana do, taake account ka balance sahi rahe
export function khataFlows(links, rows, me) {
  const byId = new Map();
  for (const r of rows || []) { byId.set(idOf(r), r); if (r._id) byId.set(String(r._id), r); }
  const out = [];
  for (const l of links || []) {
    const e = byId.get(String(l.entryId));
    const dir = flowOf(e, me);
    if (!dir || !l.accountId) continue;
    out.push({ _id: 'k-' + idOf(e), clientId: 'k-' + idOf(e), type: dir === 'out' ? 'khata_out' : 'khata_in', amount: round(e.amount), accountId: l.accountId, date: String(e.date).slice(0, 10), time: e.time || '', note: e.note || '', category: e.category, khataType: e.type, entryId: idOf(e), createdAt: e.createdAt, synthetic: true });
  }
  return out;
}

// Rate: khud likha hua (agar "khud likhunga" chuna) warna live, warna purana likha hua
export function effectiveRates(prefs = {}, live = {}) {
  const manual = prefs.manual || [];
  const saved = prefs.rates || {};
  const out = {};
  for (const c of CURRENCIES) {
    if (c === 'PKR') continue;
    const l = Number(live?.[c]); const m = Number(saved[c]);
    if (manual.includes(c) && m > 0) out[c] = m;
    else if (l > 0) out[c] = l;
    else if (m > 0) out[c] = m;
  }
  return out;
}

// ---------------- Kisi bhi muddat (from..to, dono shamil) ka hisaab ----------------
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5) + 1;

const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export function rangeReport(txns, accounts, from, to, rates = {}, shared = [], prevWin = null) {
  const cur = Object.fromEntries(accounts.map((a) => [idOf(a), a.currency || 'PKR']));
  const sum = (f, t) => {
    const r = { spent: 0, income: 0, khata: 0, byCat: {}, inCat: {}, byDay: {}, inDay: {}, count: 0, top: [], lent: 0, gotBack: 0, borrowed: 0, paidBack: 0 };
    const inR = (d) => { const s = String(d).slice(0, 10); return s >= f && s <= t; };
    const addSpend = (x, v, cat) => {
      r.spent += v; r.count++;
      r.byCat[cat] = round((r.byCat[cat] || 0) + v);
      r.byDay[x.date] = round((r.byDay[x.date] || 0) + v);
      r.top.push({ ...x, pkr: round(v) });
    };
    for (const s of shared) if (inR(s.date)) { const v = Number(s.amount) || 0; r.khata += v; addSpend({ ...s, type: 'expense' }, v, s.category); }
    for (const x of txns) {
      if (!inR(x.date) || x.synthetic || x.reversed) continue;
      const v = toPKR(x.amount, cur[x.accountId] || x.currency || 'PKR', rates);
      if (v == null) continue;
      if (x.type === 'expense') addSpend(x, v, x.category || 'other');
      else if (x.type === 'income') {
        r.income += v;
        r.inCat[x.category || 'other_in'] = round((r.inCat[x.category || 'other_in'] || 0) + v);
        r.inDay[x.date] = round((r.inDay[x.date] || 0) + v);
      } else if (x.type === 'lend') r.lent += v;
      else if (x.type === 'got_back') r.gotBack += v;
      else if (x.type === 'borrow') r.borrowed += v;
      else if (x.type === 'paid_back') r.paidBack += v;
    }
    for (const k of ['spent', 'income', 'khata', 'lent', 'gotBack', 'borrowed', 'paidBack']) r[k] = round(r[k]);
    r.top.sort((a, b) => b.pkr - a.pkr); r.top = r.top.slice(0, 5);
    return r;
  };
  const days = daysBetween(from, to);
  const now = sum(from, to);
  const pFrom = prevWin?.from || addDays(from, -days); const pTo = prevWin?.to || addDays(from, -1);
  const prev = sum(pFrom, pTo);
  const t = localToday();
  const passed = t >= from && t <= to ? daysBetween(from, t) : days; // abhi chal rahi muddat: sirf guzre din
  return {
    from, to, days, passed, ...now,
    saved: round(now.income - now.spent),
    perDay: Math.round(now.spent / Math.max(1, passed)),
    prev: { from: pFrom, to: pTo, spent: prev.spent, income: prev.income, byDay: prev.byDay },
    change: prev.spent > 0 ? Math.round(((now.spent - prev.spent) / prev.spent) * 100) : null,
  };
}
