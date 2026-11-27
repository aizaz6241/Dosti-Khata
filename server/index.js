import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { computeLedger, monthStats, other } from './ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PIN = String(process.env.APP_PIN || '1234');
const SECRET = process.env.APP_SECRET || 'dosti-khata-dev-secret';

// Do log: id aur dikhane wala naam
const PEOPLE = [
  { id: 'aizaz', name: process.env.PERSON_A || 'Aizaz' },
  { id: 'abdullah', name: process.env.PERSON_B || 'Abdullah' },
];
const IDS = PEOPLE.map((p) => p.id);

const store = createStore();
const app = express();
app.use(express.json({ limit: '100kb' }));

const tokenFor = () => crypto.createHmac('sha256', SECRET).update('pin:' + PIN).digest('hex');

app.get('/api/health', (_req, res) => res.json({ ok: true, store: store.kind }));

app.post('/api/login', (req, res) => {
  const pin = String(req.body?.pin || '');
  const a = Buffer.from(pin.padEnd(32));
  const b = Buffer.from(PIN.padEnd(32));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'PIN ghalat hai. Dobara koshish karein.' });
  }
  res.json({ token: tokenFor(), people: PEOPLE });
});

app.use('/api', (req, res, next) => {
  if (req.get('x-khata-token') !== tokenFor()) return res.status(401).json({ error: 'Login dobara karein.' });
  next();
});

const round = (n) => Math.round(Number(n) * 100) / 100;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

function clean(body, who) {
  const type = body.type === 'payment' ? 'payment' : 'expense';
  const amount = round(body.amount);
  if (!(amount > 0)) throw new Error('Raqam sahi likhein.');
  const date = isDay(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const note = String(body.note || '').slice(0, 120).trim();

  if (type === 'payment') {
    if (!IDS.includes(body.from)) throw new Error('Kis ne diye? chunein.');
    return { type, amount, date, note, category: 'payment', from: body.from, to: other(body.from, IDS), updatedBy: who };
  }

  if (!IDS.includes(body.paidBy)) throw new Error('Kis ne pay kiya? chunein.');
  const split = ['half', 'a', 'b', 'custom'].includes(body.split) ? body.split : 'half';
  let shares;
  if (split === 'half') shares = { [IDS[0]]: round(amount / 2), [IDS[1]]: round(amount - round(amount / 2)) };
  else if (split === 'a') shares = { [IDS[0]]: amount, [IDS[1]]: 0 };
  else if (split === 'b') shares = { [IDS[0]]: 0, [IDS[1]]: amount };
  else {
    const s0 = round(body.shares?.[IDS[0]] || 0);
    const s1 = round(amount - s0);
    if (s0 < 0 || s1 < 0) throw new Error('Hissa kul raqam se zyada nahi ho sakta.');
    shares = { [IDS[0]]: s0, [IDS[1]]: s1 };
  }
  return {
    type, amount, date, note,
    category: String(body.category || 'other').slice(0, 20),
    paidBy: body.paidBy, split, shares, updatedBy: who,
  };
}

app.get('/api/ledger', async (req, res, next) => {
  try {
    const rows = await store.all();
    const ledger = computeLedger(rows, IDS);
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const months = [...new Set(rows.map((r) => String(r.date).slice(0, 7)))].sort().reverse();
    res.json({ people: PEOPLE, ...ledger, stats: monthStats(rows, IDS, month), months });
  } catch (e) { next(e); }
});

app.post('/api/entries', async (req, res, next) => {
  try {
    const who = IDS.includes(req.get('x-khata-user')) ? req.get('x-khata-user') : undefined;
    const data = clean(req.body, who);
    res.status(201).json(await store.create({ ...data, createdBy: who }));
  } catch (e) { e.status = 400; next(e); }
});

app.put('/api/entries/:id', async (req, res, next) => {
  try {
    const who = IDS.includes(req.get('x-khata-user')) ? req.get('x-khata-user') : undefined;
    const row = await store.update(req.params.id, clean(req.body, who));
    if (!row) return res.status(404).json({ error: 'Entry nahi mili.' });
    res.json(row);
  } catch (e) { e.status = 400; next(e); }
});

app.delete('/api/entries/:id', async (req, res, next) => {
  try {
    const row = await store.remove(req.params.id);
    if (!row) return res.status(404).json({ error: 'Entry nahi mili.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Frontend (build)
const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Kuch ghalat ho gaya.' });
});

store.ready
  .then(() => app.listen(PORT, () => console.log(`Dosti Khata chal raha hai: http://localhost:${PORT} (store: ${store.kind})`)))
  .catch((e) => { console.error('DB connect nahi hua:', e.message); process.exit(1); });
