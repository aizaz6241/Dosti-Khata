import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { computeLedger, monthStats, other, dueBefore } from './ledger.js';
import { setupPush } from './push.js';
import { snapshot, diff, shareOf } from './activity.js';
import { createAI } from './ai.js';
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
const nameOf = (id) => PEOPLE.find((p) => p.id === id)?.name || id;
let push = null; // setupPush ke baad
const ai = createAI();
const publicPeople = () => PEOPLE.map(({ id, name }) => ({ id, name }));

const store = createStore();
const utapi = process.env.UPLOADTHING_TOKEN ? new UTApi({ token: process.env.UPLOADTHING_TOKEN }) : null;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));
if (process.env.DEBUG_REQ) app.use('/api/entries', (req, _res, next) => { console.log(new Date().toISOString().slice(11, 23), req.method, req.url, req.body?.amount ?? ''); next(); });

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

/* ---------------- reminders (scheduled ping) ---------------- */
const rsTxt = (n) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-PK');
const pkNow = (d = new Date()) => {
  const t = new Date(d.getTime() + 5 * 3600 * 1000); // Pakistan time (UTC+5)
  return { date: t.toISOString().slice(0, 10), month: t.toISOString().slice(0, 7), day: t.getUTCDate(), mins: t.getUTCHours() * 60 + t.getUTCMinutes() };
};
function balanceLine(balance, me) {
  if (!balance.amount) return 'Hisaab bilkul barabar hai.';
  return balance.from === me
    ? `Abhi aap ne ${nameOf(balance.to)} ko ${rsTxt(balance.amount)} dene hain.`
    : `Abhi ${nameOf(balance.from)} ne aap ko ${rsTxt(balance.amount)} dene hain.`;
}
async function once(key, fn) {
  if (await store.meta.get(key)) return false;
  await store.meta.create({ _id: key, value: new Date().toISOString() });
  await fn();
  return true;
}

async function runReminders(now, force) {
  const t = pkNow(now);
  const done = [];
  const rows = await store.entries.all();
  const ledger = computeLedger(rows, IDS);

  // Raat 10 baje: aaj ka hisaab
  if (force === 'daily' || t.mins >= 21 * 60 + 45) {
    const ran = await once(`daily:${t.date}`, async () => {
      const today = rows.filter((r) => r.date === t.date && (r.type !== 'expense' || Number(r.shares?.[other(r.paidBy, IDS)] || 0) > 0));
      for (const me of IDS) {
        const body = today.length
          ? `Aaj ${today.length} ${today.length === 1 ? 'entry' : 'entries'} likhi gayi. ${balanceLine(ledger.balance, me)}`
          : `Aaj koi kharcha ya len-den hua? Abhi likh lo. ${balanceLine(ledger.balance, me)}`;
        await push.notify(me, { title: 'Aaj ka hisaab', body, tag: 'daily', url: '/' });
      }
    });
    if (ran) done.push('daily');
  }

  // Har mahine 1 se 5 tareekh: pichla hisaab clear karo
  if (force === 'monthly' || (t.day >= 1 && t.day <= 5 && t.mins >= 9 * 60 && t.mins < 21 * 60)) {
    const due = dueBefore(ledger, t.month);
    if (due.amount > 0) {
      const ran = await once(`monthly:${t.date}`, async () => {
        await push.notify(due.from, { title: 'Pichle mahine ka hisaab', body: `Aap ne ${nameOf(due.to)} ko pichle mahine ke ${rsTxt(due.amount)} dene hain. Clear kar do.`, tag: 'monthly', url: '/' });
        await push.notify(due.to, { title: 'Pichle mahine ka hisaab', body: `${nameOf(due.from)} ne aap ko pichle mahine ke ${rsTxt(due.amount)} dene hain.`, tag: 'monthly', url: '/' });
      });
      if (ran) done.push('monthly');
    }
  }
  return { at: t, done };
}

// Poora khata saaf (sirf owner ke secret se). Accounts, PIN aur notifications rehti hain.
app.post('/api/admin/reset', async (req, res, next) => {
  try {
    if (req.get('x-admin-key') !== SECRET || SECRET === 'dosti-khata-dev-secret' && process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Ijazat nahi.' });
    const rows = await store.entries.all();
    for (const r of rows) { if (hasShot(r)) await dropShot(r); await store.entries.remove(String(r._id)); }
    const acts = await store.activity.all();
    for (const a of acts) await store.activity.remove(String(a._id));
    broadcast('change', { action: 'reset', at: Date.now() });
    res.json({ entries: rows.length, activity: acts.length });
  } catch (e) { next(e); }
});

app.all('/api/cron/tick', async (req, res, next) => {
  try {
    // Test ke liye: sirf secret ke saath waqt badal sakte hain
    const isTest = req.get('x-cron-key') === SECRET;
    const now = isTest && req.query.now ? new Date(req.query.now) : new Date();
    res.json(await runReminders(now, isTest ? req.query.force : undefined));
  } catch (e) { next(e); }
});

// Is ke baad har cheez ke liye login zaroori
app.use('/api', (req, res, next) => {
  const u = userFromToken(req.get('x-khata-token') || req.query.t);
  if (!u) return res.status(401).json({ error: 'Dobara login karein.' });
  req.me = u._id;
  next();
});

/* ---------------- real-time (Server-Sent Events) ---------------- */
const streams = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const r of streams) r.write(msg);
}
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`retry: 3000\nevent: hello\ndata: {}\n\n`);
  streams.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); streams.delete(res); });
});

/* ---------------- AI: bol kar / likh kar entry ---------------- */
// AI sirf form bharne ki tajweez deta hai. Yahan se kuch save nahi hota.
app.get('/api/ai/status', (_req, res) => res.json({ enabled: ai.enabled }));
app.post('/api/ai/parse', async (req, res, next) => {
  try {
    const { audio, mime, text, today } = req.body || {};
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(today || '')) ? today : new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const otherId = other(req.me, IDS);
    const names = Object.fromEntries(PEOPLE.map((p) => [p.id, p.name]));
    res.json(await ai.parse({ me: req.me, otherId, names, audio, mime, text, today: day }));
  } catch (e) { e.status = e.status || 500; next(e); }
});

/* ---------------- push ---------------- */
app.get('/api/push/key', (_req, res) => res.json({ publicKey: push.publicKey }));
app.post('/api/push/subscribe', async (req, res, next) => {
  try { await push.subscribe(req.me, req.body?.subscription, String(req.get('user-agent') || '').slice(0, 160)); res.json({ ok: true }); }
  catch (e) { next(e); }
});
app.post('/api/push/unsubscribe', async (req, res, next) => {
  try { await push.unsubscribe(String(req.body?.endpoint || '')); res.json({ ok: true }); } catch (e) { next(e); }
});
app.post('/api/push/test', async (req, res, next) => {
  try {
    const n = await push.notify(req.me, { title: 'Dosti Khata', body: 'Notifications chal rahi hain.', tag: 'test', url: '/' });
    res.json({ sent: n });
  } catch (e) { next(e); }
});

// Nayi entry / tabdeeli par doosre ko batao
async function tellOther(row, action, me, act) {
  try {
    const to = other(me, IDS);
    const by = nameOf(me);
    // Apna (sirf ek ka) kharcha: doosre ko na batao, jab tak pehle ya ab hissa na ho
    if (act && row.type === 'expense' && !shareOf(act.before, IDS) && !shareOf(act.after, IDS)) return;
    let line;
    if (row.type === 'expense') {
      const debtor = other(row.paidBy, IDS);
      const owed = Number(row.shares?.[debtor] || 0);
      if (owed <= 0 && action === 'create') return; // apna kharcha, doosre ka kaam nahi
      line = row.paidBy === to ? `Aap ne ${nameOf(debtor)} ke liye ${rsTxt(owed)} diye` : `${nameOf(row.paidBy)} ne aap ke liye ${rsTxt(owed)} diye`;
    } else {
      const verb = row.type === 'loan' ? 'qarz diya' : 'bheje';
      line = row.from === to ? `Aap ne ${nameOf(row.to)} ko ${rsTxt(row.amount)} ${verb}` : `${nameOf(row.from)} ne aap ko ${rsTxt(row.amount)} ${verb}`;
    }
    if (row.note) line += `: ${row.note}`;
    if (action === 'update' && act?.changes?.length) line = `${row.note || 'Entry'}: ${changeText(act.changes, to)}`;
    if (action === 'delete') line = `${row.note || 'Entry'} (${rsTxt(shareOf(snapshot(row), IDS))}) hata di`;
    const ledger = computeLedger(await store.entries.all(), IDS);
    const title = { create: `${by} ne nayi entry likhi`, update: `${by} ne entry badli`, delete: `${by} ne entry delete ki` }[action];
    await push.notify(to, { title, body: `${line}. ${balanceLine(ledger.balance, to)}`, tag: 'entry-' + (row.clientId || row._id), url: '/' });
  } catch (e) { console.error('Notify nahi hua:', e.message); }
}
async function logActivity(action, before, after, me) {
  const b = snapshot(before), a = snapshot(after);
  const key = String((after || before).clientId || (after || before)._id);
  const changes = action === 'update' ? diff(b, a, IDS) : [];
  if (action === 'update' && !changes.length) return null; // kuch badla hi nahi
  return store.activity.create({ action, key, by: me, at: new Date(), before: b, after: a, changes });
}
function changeText(changes, to) {
  const parts = [];
  for (const c of changes) {
    if (c.f === 'share') parts.push(`${rsTxt(c.from)} se ${rsTxt(c.to)}`);
    else if (c.f === 'paidBy' || c.f === 'from') parts.push(`ab ${c.to === to ? 'aap' : nameOf(c.to)} ne diye`);
    else if (c.f === 'note') parts.push(`naam "${c.to}"`);
    else if (c.f === 'when') parts.push('tareekh/time badla');
    else if (c.f === 'shot') parts.push(c.to ? 'screenshot lagaya' : 'screenshot hataya');
  }
  return parts.join(', ');
}
async function changed(action, before, after, me) {
  let act = null;
  try { act = await logActivity(action, before, after, me); } catch (e) { console.error('Activity:', e.message); }
  broadcast('change', { action, by: me, at: Date.now() }); // log ke baad, taake app ko poori cheez mile
  if (action !== 'update' || act) await tellOther(after || before, action, me, act);
}

app.post('/api/pin', async (req, res, next) => {
  try {
    const u = users.get(req.me);
    const { oldPin, newPin } = req.body || {};
    if (!pinOk(u, String(oldPin || ''))) return res.status(400).json({ error: 'Purana PIN ghalat hai.' });
    if (!/^\d{4}$/.test(String(newPin || ''))) return res.status(400).json({ error: 'Naya PIN 4 hindson ka ho.' });
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
  // Jama ke hisse (50+30+20) sirf tab jab un ka jama asal raqam ke barabar ho
  const parts = Array.isArray(body.parts) && body.parts.length > 1 && body.parts.length <= 20 && body.parts.every((n) => Number(n) > 0)
    && Math.abs(body.parts.reduce((a, b) => a + Number(b), 0) - amount) < 0.01 ? body.parts.map((n) => round(n)) : null;
  return { ...base, parts, category: String(body.category || 'other').slice(0, 20), paidBy: body.paidBy, split, shares, updatedBy: who };
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

// Kachi entries: hisaab app khud (phone par) banati hai, taake offline bhi chale
app.get('/api/entries', async (req, res, next) => {
  try {
    const [rows, all] = await Promise.all([store.entries.all(), store.activity.recent(300)]);
    // Doosre ke apne (sirf us ke) kharchon ki activity na bhejo
    const activity = all.filter((a) => a.by === req.me || shareOf(a.before, IDS) > 0 || shareOf(a.after, IDS) > 0);
    res.json({ me: req.me, people: publicPeople(), rows, activity, at: Date.now() });
  }
  catch (e) { next(e); }
});

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
    // Offline se dobara aayi hui entry do dafa na bane
    const clientId = /^[\w-]{8,64}$/.test(String(req.body.clientId || '')) ? req.body.clientId : undefined;
    const data = clean(req.body, req.me);
    if (clientId) {
      const dup = await store.entries.find({ clientId });
      if (dup) {
        // Pehle wali koshish server tak pohanch gayi thi (jawab raste mein kho gaya).
        // Ab jo naya data aaya hai woh "tabdeeli" ke taur par lagao, taake kuch na khoye.
        if (dup.createdBy && dup.createdBy !== req.me) return res.status(200).json(dup);
        const updated = await store.entries.update(String(dup._id), keepConfirm(dup, data));
        res.status(200).json(updated);
        changed('update', dup, updated, req.me);
        return;
      }
    }
    if (data.type !== 'expense' && req.body.screenshot) Object.assign(data, await saveShot(req.body.screenshot, req.me));
    const row = await store.entries.create({ ...data, clientId, createdBy: req.me });
    res.status(201).json(row);
    changed('create', null, row, req.me);
  } catch (e) { e.status = e.status || 400; next(e); }
});

// Raqam ya bhejne wala badla to "mil gaye" ki tasdeeq dobara chahiye
function keepConfirm(row, data) {
  if (row.confirmedAt && (Number(data.amount) !== Number(row.amount) || data.from !== row.from || data.type !== row.type)) {
    data.confirmedAt = null; data.confirmedBy = null;
  }
  return data;
}

// Entry id ya clientId dono se mil jaye
async function findEntry(key) {
  if (/^[a-f0-9]{24}$/.test(key)) {
    const r = await store.entries.get(key);
    if (r) return r;
  }
  return store.entries.find({ clientId: key });
}
async function ownEntry(req, res) {
  const row = await findEntry(req.params.id);
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
    const data = keepConfirm(row, clean(req.body, req.me));
    if (req.body.screenshot && data.type !== 'expense') {
      Object.assign(data, await saveShot(req.body.screenshot, req.me));
      if (hasShot(row)) await dropShot(row);
    } else if ((req.body.removeScreenshot || data.type === 'expense') && hasShot(row)) {
      await dropShot(row);
      Object.assign(data, { fileId: null, fileUrl: null, fileKey: null });
    }
    const updated = await store.entries.update(String(row._id), data);
    res.json(updated);
    changed('update', row, updated, req.me);
  } catch (e) { e.status = e.status || 400; next(e); }
});

// Paise lene wala tasdeeq kare: "haan, mil gaye"
app.post('/api/entries/:id/confirm', async (req, res, next) => {
  try {
    const row = await findEntry(req.params.id);
    if (!row) return res.status(404).json({ error: 'Entry nahi mili.' });
    if (row.type === 'expense' || row.to !== req.me) return res.status(403).json({ error: 'Sirf paise lene wala tasdeeq kar sakta hai.' });
    if (row.confirmedAt) return res.json(row);
    const updated = await store.entries.update(String(row._id), { confirmedAt: new Date().toISOString(), confirmedBy: req.me });
    res.json(updated);
    let act = null;
    try { act = await store.activity.create({ action: 'confirm', key: String(row.clientId || row._id), by: req.me, at: new Date(), before: snapshot(row), after: snapshot(updated), changes: [] }); } catch {}
    broadcast('change', { action: 'confirm', by: req.me, at: Date.now() });
    const what = row.type === 'loan' ? 'qarz' : 'paise';
    push.notify(row.from, { title: `${nameOf(req.me)} ne tasdeeq ki`, body: `${rsTxt(row.amount)} ${what} mil gaye${row.note ? ` (${row.note})` : ''}. ✓`, tag: 'confirm-' + (row.clientId || row._id), url: '/' }).catch(() => {});
  } catch (e) { next(e); }
});

app.delete('/api/entries/:id', async (req, res, next) => {
  try {
    const row = await ownEntry(req, res);
    if (!row) return;
    await store.entries.remove(String(row._id));
    if (hasShot(row)) await dropShot(row);
    res.json({ ok: true });
    changed('delete', row, null, req.me);
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
// Service worker aur manifest hamesha taaza (taake update foran mile)
app.get(['/sw.js', '/manifest.webmanifest'], (req, res) => {
  res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, req.path));
});
app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '365d', immutable: true }));
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get(/^(?!\/api).*/, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html')));

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Kuch ghalat ho gaya.' });
});

store.ready
  .then(loadUsers)
  .then(async () => {
    push = await setupPush(store);
    // Server jaag raha ho to khud bhi har 5 minute check kare (GitHub wala ping backup hai)
    setInterval(() => runReminders(new Date()).catch((e) => console.error('Reminder:', e.message)), 5 * 60 * 1000);
  })
  .then(() => app.listen(PORT, () => console.log(`Dosti Khata chal raha hai: http://localhost:${PORT} (store: ${store.kind}, screenshots: ${utapi ? 'uploadthing' : 'database'})`)))
  .catch((e) => { console.error('Start nahi hua:', e.message); process.exit(1); });
