// Business payout (Bazario) → "Mera Hisaab" mein aamdani.
// Bazario ka server parchi bhejta hai; fail ho to dobara (retry), kabhi ulti tarteeb mein bhi.
// Is liye har parchi "idempotent" hai: wohi parchi 10 dafa aaye, natija ek hi.
//
// Endpoints (key = Authorization: Bearer dk_...):
//   GET  /api/hook/health                 bina key, server jagane ke liye
//   POST /api/hook/payout                 naya payout
//   POST /api/hook/payout/reverse         ghalat payout wapas
//   GET  /api/hook/payout/:id             payout ka haal
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PK = 5 * 3600e3; // Pakistan (Asia/Karachi) UTC+5, daylight saving nahi

// Koi bhi waqt → Pakistan ki tareekh aur time
function pkWhen(input) {
  if (input == null || input === '') { const t = new Date(Date.now() + PK).toISOString(); return { date: t.slice(0, 10), time: t.slice(11, 16) }; }
  if (isDay(input)) return { date: input, time: '' };
  const ms = Date.parse(String(input));
  if (!Number.isFinite(ms)) return null;
  const t = new Date(ms + PK).toISOString();
  return { date: t.slice(0, 10), time: t.slice(11, 16) };
}
// Raqam: > 0, zyada se zyada 2 decimal
function money2(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1e9) return null;
  const c = Math.round(n * 100);
  if (Math.abs(n * 100 - c) > 1e-6) return null;
  return c / 100;
}
const cleanId = (v) => String(v ?? '').trim();
const ID_OK = /^[A-Za-z0-9_.:-]{1,80}$/;
const txt = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);

export function hookRoutes(app, store, { users, onMine, notify, prod }) {
  const metaKey = (me) => 'hook:' + me;
  const tombKey = (me, pid) => `ptomb:${me}:${sha(pid).slice(0, 40)}`;
  const clientIdOf = (me, pid) => `payout-${me}-${sha(pid).slice(0, 32)}`; // har bande ka apna, lambi id bhi fit
  const send = (res, code, body) => res.status(code).json(body);
  const fail = (res, code, error) => send(res, code, { ok: false, status: 'error', error });

  // Har IP: 1 minute mein 30 (health alag aur halka)
  const hits = new Map(); setInterval(() => hits.clear(), 60e3).unref();
  const limit = (req, max) => { const k = req.ip + (max > 30 ? ':h' : ''); const n = (hits.get(k) || 0) + 1; hits.set(k, n); return n > max; };

  app.get('/api/hook/health', (req, res) => {
    if (limit(req, 60)) return fail(res, 429, 'too many requests');
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });

  // Sirf HTTPS (Render par), aur key timing-safe tareeqe se
  async function auth(req, res) {
    if (prod && req.protocol !== 'https') { fail(res, 403, 'https only'); return null; }
    if (limit(req, 30)) { fail(res, 429, 'too many requests'); return null; }
    const h = String(req.get('authorization') || '');
    const key = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!/^dk_[a-f0-9]{48}$/.test(key)) { fail(res, 401, 'invalid key'); return null; }
    const hk = sha(key);
    for (const id of users) {
      const m = await store.meta.get(metaKey(id));
      const v = m?.value;
      if (v?.hash && v.hash.length === hk.length && crypto.timingSafeEqual(Buffer.from(v.hash), Buffer.from(hk))) return { me: id, hook: v };
    }
    fail(res, 401, 'invalid key'); return null;
  }
  const findEntry = (me, pid) => store.ptx.find({ clientId: clientIdOf(me, pid), owner: me });
  const getTomb = async (me, pid) => (await store.meta.get(tombKey(me, pid)))?.value || null;
  async function setTomb(me, pid, value) {
    const k = tombKey(me, pid);
    if (await store.meta.get(k)) await store.meta.update(k, { value }); else await store.meta.create({ _id: k, value });
  }
  const touch = (me, hook, field) => store.meta.update(metaKey(me), { value: { ...hook, last: new Date().toISOString(), [field]: (hook[field] || 0) + 1 } }).catch(() => {});

  // ---------------- CREATE ----------------
  app.post('/api/hook/payout', async (req, res, next) => {
    try {
      const a = await auth(req, res); if (!a) return;
      const { me, hook } = a;
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const pid = cleanId(b.id);
      if (!ID_OK.test(pid)) return fail(res, 400, 'id required: 1-80 chars, letters/numbers/_ - . :');
      const amount = money2(b.amount);
      if (amount == null) return fail(res, 400, 'amount must be a number > 0 with max 2 decimals');
      const when = pkWhen(b.date);
      if (!when) return fail(res, 400, 'date must be ISO 8601 (e.g. 2026-12-01T14:20:00+05:00)');
      if (b.forMonth != null && b.forMonth !== '' && !MONTH.test(String(b.forMonth))) return fail(res, 400, 'forMonth must be YYYY-MM');
      const accs = await store.accounts.all({ owner: me });
      const acc = accs.find((x) => String(x.clientId || x._id) === hook.accountId && !x.archived);
      if (!acc) return fail(res, 409, 'target account missing in app (choose it again in Business payout)');
      const cur = String(b.currency || acc.currency || 'PKR').toUpperCase();
      if (cur !== (acc.currency || 'PKR')) return fail(res, 400, `currency mismatch: account is ${acc.currency || 'PKR'}`);

      const existing = await findEntry(me, pid);
      const tomb = await getTomb(me, pid);
      if (existing) {
        const was = Number(existing.payoutAmount ?? existing.amount);
        if (existing.reversed) return send(res, 200, { ok: true, status: 'already_reversed', entryId: String(existing._id) });
        if (Math.round(was * 100) !== Math.round(amount * 100)) return send(res, 409, { ok: false, status: 'conflict', entryId: String(existing._id), error: `id already recorded with amount ${was}` });
        return send(res, 200, { ok: true, status: 'duplicate', entryId: String(existing._id) });
      }
      if (tomb?.state === 'deleted') { // aap ne app mein khud mitaya tha: dobara nahi
        if (tomb.amount != null && Math.round(tomb.amount * 100) !== Math.round(amount * 100)) return send(res, 409, { ok: false, status: 'conflict', error: `id was recorded with amount ${tomb.amount} and later deleted in app` });
        return send(res, 200, { ok: true, status: 'duplicate', entryId: null, note: 'deleted in app; not re-added' });
      }
      const reversedFirst = tomb?.state === 'reversed'; // reverse pehle aa chuka (ulti tarteeb)
      if (b.test === true) return send(res, 200, { ok: true, status: 'test', wouldBe: reversedFirst ? 'already_reversed' : 'created', entryId: null });

      const forMonth = MONTH.test(String(b.forMonth || '')) ? String(b.forMonth) : null;
      const source = txt(b.source, 24).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'payout';
      const note = txt(b.note, 120) || (forMonth ? `Payout: ${forMonth}` : 'Business payout');
      const doc = {
        type: 'income', amount, accountId: hook.accountId, category: 'business', note, date: when.date, time: when.time,
        owner: me, clientId: clientIdOf(me, pid), source, forMonth, payoutId: pid, payoutAmount: amount,
        reversed: reversedFirst, ...(reversedFirst ? { reversedAt: tomb.at, reverseReason: tomb.reason || '' } : {}),
      };
      let row;
      try { row = await store.ptx.create(doc); }
      catch (e) { // do parchiyan ek saath: doosri ko duplicate maan lo
        if (e?.code === 11000) { const again = await findEntry(me, pid); if (again) return send(res, 200, { ok: true, status: again.reversed ? 'already_reversed' : 'duplicate', entryId: String(again._id) }); }
        throw e;
      }
      res.status(reversedFirst ? 200 : 201).json({ ok: true, status: reversedFirst ? 'already_reversed' : 'created', entryId: String(row._id) });
      // Baqi kaam jawab ke baad (taake Bazario ko jaldi jawab mile)
      touch(me, hook, 'count'); onMine(me);
      if (!reversedFirst) notify(me, { title: `${source === 'bazario' ? 'Bazario' : 'Business'} payout aaya`, body: `${amount.toLocaleString('en-US')} ${acc.currency || 'PKR'} ${acc.name} mein jud gaye${forMonth ? ` (${forMonth})` : ''}.`, tag: 'payout-' + row._id, url: '/' }).catch(() => {});
    } catch (e) { next(e); }
  });

  // ---------------- REVERSE ----------------
  app.post('/api/hook/payout/reverse', async (req, res, next) => {
    try {
      const a = await auth(req, res); if (!a) return;
      const { me, hook } = a;
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const pid = cleanId(b.id);
      if (!ID_OK.test(pid)) return fail(res, 400, 'id required');
      const when = b.date != null && b.date !== '' ? pkWhen(b.date) : pkWhen(null);
      if (!when) return fail(res, 400, 'date must be ISO 8601');
      const reason = txt(b.reason, 120);
      const at = new Date().toISOString();
      const existing = await findEntry(me, pid);
      const tomb = await getTomb(me, pid);
      if (existing?.reversed || tomb?.state === 'reversed') return send(res, 200, { ok: true, status: 'already_reversed', entryId: existing ? String(existing._id) : null });
      if (b.test === true) return send(res, 200, { ok: true, status: 'test', wouldBe: 'reversed', entryId: existing ? String(existing._id) : null });
      // Hamesha yaad rakho (tombstone): ye id ab kabhi zinda nahi hogi
      await setTomb(me, pid, { state: 'reversed', at, reason, date: when.date, amount: existing ? Number(existing.payoutAmount ?? existing.amount) : tomb?.amount ?? null });
      if (existing) await store.ptx.update(String(existing._id), { reversed: true, reversedAt: at, reverseReason: reason });
      res.json({ ok: true, status: 'reversed', entryId: existing ? String(existing._id) : null });
      touch(me, hook, 'reversals'); onMine(me);
      if (existing) notify(me, { title: 'Payout wapas (reverse) hua', body: `${Number(existing.amount).toLocaleString('en-US')} ${existing.note ? `(${existing.note}) ` : ''}totals se nikal diya${reason ? `: ${reason}` : ''}.`, tag: 'payout-' + existing._id, url: '/' }).catch(() => {});
    } catch (e) { next(e); }
  });

  // ---------------- STATUS ----------------
  app.get('/api/hook/payout/:id', async (req, res, next) => {
    try {
      const a = await auth(req, res); if (!a) return;
      const pid = cleanId(req.params.id);
      if (!ID_OK.test(pid)) return fail(res, 400, 'bad id');
      const e = await findEntry(a.me, pid);
      const t = await getTomb(a.me, pid);
      if (e) return send(res, 200, { ok: true, status: e.reversed ? 'reversed' : 'created', entryId: String(e._id), amount: Number(e.payoutAmount ?? e.amount), forMonth: e.forMonth || null, date: e.date, reversedAt: e.reversedAt || null });
      if (t) return send(res, 200, { ok: true, status: t.state === 'deleted' ? 'deleted' : 'reversed', entryId: null, amount: t.amount ?? null, note: t.state === 'reversed' ? 'reversed before create (tombstone)' : 'deleted in app' });
      return send(res, 404, { ok: false, status: 'not_found' });
    } catch (e) { next(e); }
  });
}

// App mein payout wali entry mitai jaye to us ki id yaad rakho (retry se wapas na aaye)
export async function rememberDeletedPayout(store, row) {
  if (!row?.payoutId || !row.owner) return;
  const k = `ptomb:${row.owner}:${sha(row.payoutId).slice(0, 40)}`;
  const old = await store.meta.get(k);
  if (old?.value?.state === 'reversed') return; // reverse wali yaad zyada pakki
  const value = { state: 'deleted', at: new Date().toISOString(), amount: Number(row.payoutAmount ?? row.amount) };
  if (old) await store.meta.update(k, { value }); else await store.meta.create({ _id: k, value });
}

// ---- App ke andar (login ke saath): key banao / dekho / band karo ----
export function hookAdminRoutes(app, store) {
  const metaKey = (me) => 'hook:' + me;
  app.get('/api/me/hook', async (req, res, next) => {
    try { const m = await store.meta.get(metaKey(req.me)); const v = m?.value; res.json(v?.hash ? { active: true, accountId: v.accountId, createdAt: v.createdAt, last: v.last || null, count: v.count || 0, reversals: v.reversals || 0, hint: v.hint } : { active: false }); }
    catch (e) { next(e); }
  });
  // Nayi key banate hi purani foran band (regenerate)
  app.post('/api/me/hook', async (req, res, next) => {
    try {
      const accountId = String(req.body?.accountId || '').slice(0, 64);
      const acc = (await store.accounts.all({ owner: req.me })).find((a) => String(a.clientId || a._id) === accountId && !a.archived);
      if (!acc) return res.status(400).json({ error: 'Pehle account chuno (aur woh sync ho chuka ho).' });
      const key = 'dk_' + crypto.randomBytes(24).toString('hex');
      const old = await store.meta.get(metaKey(req.me));
      const value = { hash: sha(key), accountId, createdAt: new Date().toISOString(), hint: key.slice(-4), count: old?.value?.count || 0, reversals: old?.value?.reversals || 0 };
      if (old) await store.meta.update(metaKey(req.me), { value }); else await store.meta.create({ _id: metaKey(req.me), value });
      res.json({ key, accountId, hint: value.hint }); // key sirf abhi dikhegi
    } catch (e) { next(e); }
  });
  app.delete('/api/me/hook', async (req, res, next) => {
    try { const old = await store.meta.get(metaKey(req.me)); if (old) await store.meta.remove(metaKey(req.me)); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
}
