import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { computeLedger, monthStats, other } from './ledger.js';
import { UTApi, UTFile } from 'uploadthing/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SECRET = process.env.APP_SECRET || 'dosti-khata-dev-secret';

// Do accounts. PIN sirf pehli dafa set hota hai, baad mein app se badla ja sakta hai.
const PEOPLE = [
  { id: 'aizaz', name: process.env.PERSON_A || 'Aizaz', pin: process.env.PIN_AIZAZ || '6241' },
  { id: 'abdullah', name: process.env.PERSON_B || 'Abdullah', pin: process.env.PIN_ABDULLAH || '2120' },
];
const IDS = PEOPLE.map((p) => p.id);
const publicPeople = () => PEOPLE.map(({ id, name }) => ({ id, name }));

const store = createStore();
const utapi = process.env.UPLOADTHING_TOKEN ? new UTApi({ token: process.env.UPLOADTHING_TOKEN }) : null;
const app = express();
app.use(express.json({ limit: '8mb' }));

/* ---------------- accounts ---------------- */
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const users = new Map();

async function loadUsers() {
  for (const p of PEOPLE) {
    let u = await store.users.get(p.id);
    if (!u) {
      const salt = crypto.randomBytes(16).toString('hex');
      u = await store.users.create({ _id: p.id, name: p.name, pinSalt: salt, pinHash: hashPin(p.pin, salt) });
    }
    users.set(p.id, u);
  }
}

// Token PIN se juda hai: PIN badlo to purane sab login khud band.
const sign = (u) => crypto.createHmac('sha256', SECRET).update(`${u._id}:${u.pinHash}`).digest('hex');
const tokenFor = (u) => `${u._id}.${sign(u)}`;
function userFromToken(tok) {
  const [id, sig] = String(tok || '').split('.');
  const u = users.get(id);
  if (!u || !sig) return null;
  const good = sign(u);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)) ? u : null;
}
const pinOk = (u, pin) => {
  const a = Buffer.from(hashPin(pin, u.pinSalt), 'hex');
  const b = Buffer.from(u.pinHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Ghalat PIN ki had: 8 dafa ghalat to 10 minute ruko
const tries = new Map();
function limited(key) {
  const t = tries.get(key);
  if (!t || Date.now() - t.at > 10 * 60 * 1000) return false;
  return t.n >= 8;
}
function fail(key) {
  const t = tries.get(key);
  if (!t || Date.now() - t.at > 10 * 60 * 1000) tries.set(key, { n: 1, at: Date.now() });
  else t.n++;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, store: store.kind }));
app.get('/api/people', (_req, res) => res.json({ people: publicPeople() }));

app.post('/api/login', (req, res) => {
  const id = String(req.body?.user || '');
  const u = users.get(id);
  const key = `${req.ip}:${id}`;
  if (!u) return res.status(400).json({ error: 'Account chunein.' });
  if (limited(key)) return res.status(429).json({ error: 'Bohat dafa ghalat PIN. 10 minute baad koshish karein.' });
  if (!pinOk(u, String(req.body?.pin || ''))) {
    fail(key);
    return res.status(401).json({ error: 'PIN ghalat hai. Dobara likhein.' });
  }
  tries.delete(key);
  res.json({ token: tokenFor(u), me: u._id, people: publicPeople() });
});

// Is ke baad har cheez ke liye login zaroori
app.use('/api', (req, res, next) => {
  const u = userFromToken(req.get('x-khata-token') || req.query.t);
  if (!u) return res.status(401).json({ error: 'Dobara login karein.' });
  req.me = u._id;
  next();
});

app.post('/api/pin', async (req, res, next) => {
  try {
    const u = users.get(req.me);
    const { oldPin, newPin } = req.body || {};
    if (!pinOk(u, String(oldPin || ''))) return res.status(400).json({ error: 'Purana PIN ghalat hai.' });
    if (!/^\d{4,6}$/.test(String(newPin || ''))) return res.status(400).json({ error: 'Naya PIN 4 se 6 hindson ka ho.' });
    const salt = crypto.randomBytes(16).toString('hex');
    const updated = await store.users.update(u._id, { pinSalt: salt, pinHash: hashPin(newPin, salt) });
    users.set(u._id, updated);
    res.json({ token: tokenFor(updated) });
  } catch (e) { next(e); }
});

/* ---------------- entries ---------------- */
const round = (n) => Math.round(Number(n) * 100) / 100;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

function clean(body, who) {
  const type = ['payment', 'loan'].includes(body.type) ? body.type : 'expense';
  const amount = round(body.amount);
  if (!(amount > 0)) throw new Error('Raqam sahi likhein.');
  const date = isDay(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const note = String(body.note || '').slice(0, 120).trim();
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.time || '')) ? body.time : undefined;
  const base = { type, amount, date, time, note };

  if (type !== 'expense') {
    if (!IDS.includes(body.from)) throw new Error('Kis ne paise diye? chunein.');
    return { ...base, category: type, from: body.from, to: other(body.from, IDS), updatedBy: who };
  }

  if (!IDS.includes(body.paidBy)) throw new Error('Kis ne pay kiya? chunein.');
  const debtor = other(body.paidBy, IDS);
  // split: half = aadha-aadha, full = poora doosre ka, self = poora apna (hisaab par asar nahi),
  // custom = doosre ka hissa khud likha
  const split = ['half', 'full', 'self', 'custom'].includes(body.split) ? body.split : 'half';
  let owed;
  if (split === 'half') owed = round(amount / 2);
  else if (split === 'full') owed = amount;
  else if (split === 'self') owed = 0;
  else {
    owed = round(body.owed);
    if (!(owed > 0) || owed > amount) throw new Error('Hissa 0 se zyada aur kul raqam se kam ho.');
  }
  const shares = { [debtor]: owed, [body.paidBy]: round(amount - owed) };
  return { ...base, category: String(body.category || 'other').slice(0, 20), paidBy: body.paidBy, split, shares, updatedBy: who };
}

// Screenshot: UploadThing par (token ho to), warna database mein
async function saveShot(dataUrl, who) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Screenshot sahi image nahi hai.');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > 5 * 1024 * 1024) throw new Error('Screenshot bohat bara hai.');
  if (utapi) {
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
    const name = `khata-${who}-${Date.now()}.${ext}`;
    const r = await utapi.uploadFiles(new UTFile([data], name, { type: m[1] }));
    if (r.error || !r.data) throw new Error('Screenshot upload nahi hua, dobara koshish karein.');
    return { fileUrl: r.data.ufsUrl || r.data.url, fileKey: r.data.key, fileId: null };
  }
  const f = await store.files.create({ mime: m[1], size: data.length, data, by: who });
  return { fileId: String(f._id), fileUrl: null, fileKey: null };
}
async function dropShot(row) {
  try {
    if (row.fileKey && utapi) await utapi.deleteFiles(row.fileKey);
    if (row.fileId) await store.files.remove(row.fileId);
  } catch (e) { console.error('Screenshot delete nahi hua:', e.message); }
}
const hasShot = (row) => !!(row.fileId || row.fileKey);

app.get('/api/ledger', async (req, res, next) => {
  try {
    const rows = await store.entries.all();
    const ledger = computeLedger(rows, IDS);
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const months = [...new Set(rows.map((r) => String(r.date).slice(0, 7)))].sort().reverse();
    res.json({ me: req.me, people: publicPeople(), ...ledger, stats: monthStats(rows, IDS, month), months });
  } catch (e) { next(e); }
});

app.post('/api/entries', async (req, res, next) => {
  try {
    const data = clean(req.body, req.me);
    if (data.type !== 'expense' && req.body.screenshot) Object.assign(data, await saveShot(req.body.screenshot, req.me));
    res.status(201).json(await store.entries.create({ ...data, createdBy: req.me }));
  } catch (e) { e.status = e.status || 400; next(e); }
});

async function ownEntry(req, res) {
  const row = await store.entries.get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Entry nahi mili.' }); return null; }
  if (row.createdBy && row.createdBy !== req.me) {
    const n = PEOPLE.find((p) => p.id === row.createdBy)?.name;
    res.status(403).json({ error: `Ye entry ${n} ne likhi hai, sirf wohi badal sakta hai.` });
    return null;
  }
  return row;
}

app.put('/api/entries/:id', async (req, res, next) => {
  try {
    const row = await ownEntry(req, res);
    if (!row) return;
    const data = clean(req.body, req.me);
    if (req.body.screenshot && data.type !== 'expense') {
      Object.assign(data, await saveShot(req.body.screenshot, req.me));
      if (hasShot(row)) await dropShot(row);
    } else if ((req.body.removeScreenshot || data.type === 'expense') && hasShot(row)) {
      await dropShot(row);
      Object.assign(data, { fileId: null, fileUrl: null, fileKey: null });
    }
    res.json(await store.entries.update(req.params.id, data));
  } catch (e) { e.status = e.status || 400; next(e); }
});

app.delete('/api/entries/:id', async (req, res, next) => {
  try {
    const row = await ownEntry(req, res);
    if (!row) return;
    await store.entries.remove(req.params.id);
    if (hasShot(row)) await dropShot(row);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/files/:id', async (req, res, next) => {
  try {
    const f = await store.files.get(req.params.id);
    if (!f) return res.status(404).end();
    const buf = Buffer.isBuffer(f.data) ? f.data : f.data?.buffer ? Buffer.from(f.data.buffer) : Buffer.from(String(f.data), 'base64');
    res.set('Content-Type', f.mime).set('Cache-Control', 'private, max-age=31536000, immutable').send(buf);
  } catch (e) { next(e); }
});

/* ---------------- frontend ---------------- */
const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Kuch ghalat ho gaya.' });
});

store.ready
  .then(loadUsers)
  .then(() => app.listen(PORT, () => console.log(`Dosti Khata chal raha hai: http://localhost:${PORT} (store: ${store.kind}, screenshots: ${utapi ? 'uploadthing' : 'database'})`)))
  .catch((e) => { console.error('Start nahi hua:', e.message); process.exit(1); });
