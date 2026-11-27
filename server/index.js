import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { computeLedger, other, dueBefore } from './ledger.js';
import { setupPush } from './push.js';
import { snapshot, diff, shareOf } from './activity.js';
import { createAI } from './ai.js';
import { personalRoutes } from './personal.js';
import { createRates } from './rates.js';
import { hookRoutes, hookAdminRoutes } from './hook.js';
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
app.disable('x-powered-by');
const PROD = !!process.env.MONGODB_URI;
if (PROD && SECRET === 'dosti-khata-dev-secret') console.error('KHATRA: APP_SECRET set nahi! Render par APP_SECRET lagao.');

// Hifazati headers: page kisi aur site mein chhup kar na khule, sirf apni files chalein, waghera
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
      "img-src 'self' data: blob: https://utfs.io https://*.ufs.sh", "connect-src 'self'", "worker-src 'self' blob:",
      "manifest-src 'self'", "media-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
    ].join('; '),
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
// Har IP ki had: ek minute mein 600 se zyada API calls nahi (koi hamla kare to server na baithe)
const hits = new Map();
setInterval(() => hits.clear(), 60e3).unref();
app.use('/api', (req, res, next) => {
  const n = (hits.get(req.ip) || 0) + 1; hits.set(req.ip, n);
  if (n > 600) return res.status(429).json({ error: 'Bohat zyada requests. Ek minute baad.' });
  next();
});
// Bari body sirf entries (screenshot) ke liye; baqi sab chhoti
app.use(['/api/entries', '/api/ai'], express.json({ limit: '8mb' }));
app.use(express.json({ limit: '200kb' }));
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

// Token PIN se juda hai: PIN badlo to purane sab login khud band. Har token 180 din chalta hai (app khud naya leti rehti hai).
const TOKEN_DAYS = 180;
const sign = (u, exp) => crypto.createHmac('sha256', SECRET).update(exp ? `${u._id}:${u.pinHash}:${exp}` : `${u._id}:${u.pinHash}`).digest('hex');
const tokenFor = (u) => { const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400; return `${u._id}.${exp}.${sign(u, exp)}`; };
const LEGACY_UNTIL = Date.parse('2027-02-01T00:00:00Z'); // purane (bina muddat) tokens sirf tab tak, app inhein khud badal deti hai
const safeEq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function userFromToken(tok) {
  const parts = String(tok || '').split('.');
  const u = users.get(parts[0]);
  if (!u) return null;
  if (parts.length === 3) {
    const exp = Number(parts[1]);
    if (!(exp > Date.now() / 1000)) return null;
    return safeEq(parts[2], sign(u, parts[1])) ? u : null;
  }
  if (parts.length === 2 && Date.now() < LEGACY_UNTIL) return safeEq(parts[1], sign(u)) ? u : null;
  return null;
}
const tokenExp = (tok) => { const p = String(tok || '').split('.'); return p.length === 3 ? Number(p[1]) : 0; };
const pinOk = (u, pin) => {
  const a = Buffer.from(hashPin(pin, u.pinSalt), 'hex');
  const b = Buffer.from(u.pinHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Ghalat PIN ki had: ek phone/IP se 8 dafa ghalat to 10 minute ruko.
// Aur poore account par (har jagah se mila kar) 20 dafa ghalat to 1 ghanta band, taake koi bohat se IPs se PIN na dhoonde.
const acctFails = new Map();
const acctLocked = (id) => { const t = acctFails.get(id); return t && Date.now() - t.at < 3600e3 && t.n >= 20; };
const acctFail = (id) => { const t = acctFails.get(id); if (!t || Date.now() - t.at > 3600e3) acctFails.set(id, { n: 1, at: Date.now() }); else t.n++; };
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
  if (acctLocked(id)) return res.status(429).json({ error: 'Is account par bohat ghalat koshishein hui hain. 1 ghante baad koshish karein.' });
  if (!pinOk(u, String(req.body?.pin || '').slice(0, 12))) {
    fail(key); acctFail(id);
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

// (Pehle yahan "poora khata saaf" karne ka admin raasta tha. Security ke liye hata diya: data sirf app se mitta hai.)

app.all('/api/cron/tick', async (req, res, next) => {
  try {
    // Test ke liye: sirf secret ke saath waqt badal sakte hain
    const isTest = !PROD && safeEq(req.get('x-cron-key') || '', SECRET); // waqt badalna sirf local test mein
    const now = isTest && req.query.now ? new Date(req.query.now) : new Date();
    res.json(await runReminders(now, isTest ? req.query.force : undefined));
  } catch (e) { next(e); }
});

// Business payout (bahar ke software se, sirf secret key ke saath)
hookRoutes(app, store, { users: IDS, onMine: (me) => broadcast('mine', { at: Date.now() }, me), notify: (...a) => push.notify(...a) });

// Is ke baad har cheez ke liye login zaroori
app.use('/api', (req, res, next) => {
  let u = userFromToken(req.get('x-khata-token') || (req.path.startsWith('/files/') ? req.query.t : ''));
  if (!u && req.path === '/stream' && req.query.s) { // stream ticket
    const [id, exp, sig] = String(req.query.s).split('.');
    if (users.get(id) && Number(exp) > Date.now() / 1000 && safeEq(sig, ticketSig(id, exp))) u = users.get(id);
  }
  if (!u) return res.status(401).json({ error: 'Dobara login karein.' });
  req.me = u._id;
  next();
});

/* ---------------- real-time (Server-Sent Events) ---------------- */
const streams = new Set(); // { res, me }
function broadcast(event, data, onlyUser) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const s of streams) if (!onlyUser || s.me === onlyUser) s.res.write(msg);
}
// Live stream ka ticket: 10 minute ka, sirf stream ke liye (asal login token URL / logs mein na jaye)
const ticketSig = (id, exp) => crypto.createHmac('sha256', SECRET).update(`stream:${id}:${users.get(id)?.pinHash}:${exp}`).digest('hex');
app.post('/api/stream/ticket', (req, res) => { const exp = Math.floor(Date.now() / 1000) + 600; res.json({ ticket: `${req.me}.${exp}.${ticketSig(req.me, exp)}` }); });
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`retry: 3000\nevent: hello\ndata: {}\n\n`);
  const entry = { res, me: req.me };
  // Ek bande ke zyada se zyada 8 khule connection (purana band)
  const mineS = [...streams].filter((s) => s.me === req.me);
  if (mineS.length >= 8) { mineS[0].res.end(); streams.delete(mineS[0]); }
  streams.add(entry);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); streams.delete(entry); });
});

/* ---------------- Mera Hisaab (sirf apna) ---------------- */
// Doosre bande ko is ki khabar nahi jati; sirf apne doosre phone ko "change" (taake wahan bhi update ho)
hookAdminRoutes(app, store); // /api/me/hook pehle, warna /api/me/:col use pakad leta hai
personalRoutes(app, store, (me) => broadcast('mine', { at: Date.now() }, me));

/* ---------------- AI: bol kar / likh kar entry ---------------- */
// AI sirf form bharne ki tajweez deta hai. Yahan se kuch save nahi hota.
app.get('/api/ai/status', (_req, res) => res.json({ enabled: ai.enabled }));
// Live currency rate (USDT: Binance P2P bechne ka rate)
const liveRates = process.env.RATES_FAKE // sirf local test ke liye
  ? { get: async () => ({ rates: JSON.parse(process.env.RATES_FAKE), sources: { USDT: 'Binance P2P' }, at: Date.now() }) }
  : createRates();
app.get('/api/rates', async (_req, res, next) => { try { res.set('Cache-Control', 'no-store'); res.json(await liveRates.get()); } catch (e) { next(e); } });
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
  try { await push.unsubscribe(String(req.body?.endpoint || ''), req.me); res.json({ ok: true }); } catch (e) { next(e); }
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
  const row = after || before;
  const privateOnly = row?.type === 'expense' && !shareOf(snapshot(before), IDS) && !shareOf(snapshot(after), IDS);
  broadcast('change', { action, by: me, at: Date.now() }, privateOnly ? me : undefined); // log ke baad; "sirf apna" kharcha sirf apne phones ko
  if (action !== 'update' || act) await tellOther(after || before, action, me, act);
}

// Purana ho raha token naya karo (app khud karti hai)
app.post('/api/token', (req, res) => {
  const u = users.get(req.me);
  const tok = req.get('x-khata-token') || '';
  const left = tokenExp(tok) - Date.now() / 1000;
  res.json({ token: left > 60 * 86400 ? tok : tokenFor(u) });
});
app.post('/api/pin', async (req, res, next) => {
  try {
    const u = users.get(req.me);
    const { oldPin, newPin } = req.body || {};
    const key = 'pin:' + req.me;
    if (limited(key)) return res.status(429).json({ error: 'Bohat dafa ghalat. 10 minute baad.' });
    if (!pinOk(u, String(oldPin || '').slice(0, 12))) { fail(key); return res.status(400).json({ error: 'Purana PIN ghalat hai.' }); }
    if (!/^\d{4,8}$/.test(String(newPin || ''))) return res.status(400).json({ error: 'Naya PIN 4 se 8 hindson ka ho (6 behtar hai).' });
    if (/^(\d)\1+$/.test(String(newPin)) || '0123456789'.includes(String(newPin)) || '9876543210'.includes(String(newPin))) return res.status(400).json({ error: 'Itna aasaan PIN nahi (1111, 1234). Koi aur rakho.' });
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
  if (!(amount > 0) || amount > 1e9) throw new Error('Raqam sahi likhein.');
  const date = isDay(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const note = String(body.note || '').replace(/[<>]/g, '').slice(0, 120).trim();
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
  const CATS = ['khana', 'chai', 'sauda', 'program', 'petrol', 'kiraya', 'ghar', 'bill', 'salon', 'kapray', 'dawai', 'ticket', 'other'];
  return { ...base, parts, category: CATS.includes(body.category) ? body.category : 'other', paidBy: body.paidBy, split, shares, updatedBy: who };
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
    if (r.error || !r.data) throw Object.assign(new Error('Screenshot upload nahi hua, thori der baad khud dobara.'), { status: 503 });
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
// Har bande ko sirf woh jo us ka haq hai: doosre ka "sirf apna" kharcha bilkul nahi,
// aur jo kharcha doosre ne diya us ka poora bill nahi, sirf mera hissa.
function viewFor(row, me) {
  if (!row || row.type !== 'expense' || row.paidBy === me || row.createdBy === me) return row;
  const mine = Number(row.shares?.[me] || 0);
  if (!(mine > 0)) return null;
  const out = { ...row, amount: mine, shares: { [me]: mine, [row.paidBy]: 0 }, split: 'full' };
  delete out.parts; delete out.owed; delete out.people;
  return out;
}
function actFor(a, me) {
  const by = a.after || a.before;
  if (!by || by.type !== 'expense' || a.by === me) return a;
  const before = viewFor(a.before, me), after = viewFor(a.after, me);
  if (!before && !after) return null;
  return { ...a, before, after, changes: (a.changes || []).filter((c) => !['amount', 'split', 'parts'].includes(c.f)) };
}
app.get('/api/entries', async (req, res, next) => {
  try {
    const [rows, all] = await Promise.all([store.entries.all(), store.activity.recent(300)]);
    const mine = rows.map((r) => viewFor(r, req.me)).filter(Boolean);
    const activity = all.filter((a) => a.by === req.me || shareOf(a.before, IDS) > 0 || shareOf(a.after, IDS) > 0).map((a) => actFor(a, req.me)).filter(Boolean);
    res.set('Cache-Control', 'no-store').json({ me: req.me, people: publicPeople(), rows: mine, activity, at: Date.now() });
  }
  catch (e) { next(e); }
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
        if (dup.createdBy && dup.createdBy !== req.me) return res.status(409).json({ error: 'Dobara koshish karein.' });
        const updated = await store.entries.update(String(dup._id), keepConfirm(dup, data));
        res.status(200).json(updated);
        changed('update', dup, updated, req.me);
        return;
      }
    }
    if (data.type !== 'expense' && req.body.screenshot) Object.assign(data, await saveShot(req.body.screenshot, req.me));
    const row = await store.entries.create({ ...data, clientId, createdBy: req.me });
    res.status(201).json(viewFor(row, req.me));
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
    res.json(viewFor(updated, req.me));
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
    if (!/^[\w-]{1,64}$/.test(req.params.id)) return res.status(404).end();
    const f = await store.files.get(req.params.id);
    if (!f) return res.status(404).end();
    if (!(await store.entries.find({ fileId: req.params.id }))) return res.status(404).end();
    const buf = Buffer.isBuffer(f.data) ? f.data : f.data?.buffer ? Buffer.from(f.data.buffer) : Buffer.from(String(f.data), 'base64');
    res.set('Content-Type', /^image\/(jpeg|png|webp)$/.test(f.mime) ? f.mime : 'application/octet-stream').set('Cache-Control', 'private, max-age=31536000, immutable').send(buf);
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

app.use((err, req, res, _next) => {
  const status = err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : err.status || 500;
  if (status >= 500) console.error('Server ghalti:', req.method, req.path, err.message);
  res.status(status).json({ error: status >= 500 ? 'Server mein masla hua, thori der baad koshish karein.' : status === 413 ? 'Bohat bari cheez bheji.' : err.message || 'Ghalat request.' });
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
