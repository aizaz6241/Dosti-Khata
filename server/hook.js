// Business payout: aap ka apna finance software payout record kare to seedha yahan "aamdani" ban jaye.
// Har bande ki apni secret key (sirf ek dafa dikhti hai, database mein sirf us ka hash).
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const round = (n) => Math.round(Number(n) * 100) / 100;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const pkToday = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const pkTime = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(11, 16);

export function hookRoutes(app, store, { users, onMine, notify }) {
  const metaKey = (me) => 'hook:' + me;
  const tries = new Map(); setInterval(() => tries.clear(), 60e3).unref();

  // ---- Bahar se (aap ka software) — login nahi, sirf secret key ----
  app.post('/api/hook/payout', async (req, res, next) => {
    try {
      const n = (tries.get(req.ip) || 0) + 1; tries.set(req.ip, n);
      if (n > 30) return res.status(429).json({ error: 'too many requests' });
      const auth = String(req.get('authorization') || '');
      const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!/^dk_[a-f0-9]{48}$/.test(key)) return res.status(401).json({ error: 'invalid key' });
      const h = sha(key);
      let me = null, hook = null;
      for (const id of users) {
        const m = await store.meta.get(metaKey(id));
        if (m?.value?.hash && m.value.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(m.value.hash), Buffer.from(h))) { me = id; hook = m.value; }
      }
      if (!me) return res.status(401).json({ error: 'invalid key' });
      const b = req.body || {};
      const pid = String(b.id ?? '').replace(/[^\w-]/g, '').slice(0, 48);
      if (pid.length < 1) return res.status(400).json({ error: 'id required (unique payout id)' });
      const amount = round(b.amount);
      if (!(amount > 0) || amount > 1e9) return res.status(400).json({ error: 'amount must be > 0' });
      const acc = (await store.accounts.all({ owner: me })).find((a) => String(a.clientId || a._id) === hook.accountId && !a.archived);
      if (!acc) return res.status(409).json({ error: 'target account missing in app' });
      const cur = String(b.currency || acc.currency || 'PKR').toUpperCase();
      if (cur !== (acc.currency || 'PKR')) return res.status(400).json({ error: `currency mismatch: account is ${acc.currency}` });
      const clientId = `payout-${me}-${pid}`; // har bande ka apna (do users ke same id na takrayein)
      const dup = await store.ptx.find({ clientId });
      if (dup) return res.status(200).json({ ok: true, duplicate: true });
      const note = String(b.note || hook.note || 'Business payout').replace(/[<>]/g, '').slice(0, 120);
      const row = await store.ptx.create({
        type: 'income', amount, accountId: hook.accountId, category: 'business', note,
        date: isDay(b.date) ? b.date : pkToday(), time: /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || '') ? b.time : pkTime(),
        owner: me, clientId, source: 'payout',
      });
      await store.meta.update?.(metaKey(me), { value: { ...hook, last: new Date().toISOString(), count: (hook.count || 0) + 1 } });
      onMine(me);
      notify(me, { title: 'Business payout aaya', body: `${amount.toLocaleString('en-US')} ${acc.currency} ${acc.name} mein jud gaye${note ? `: ${note}` : ''}.`, tag: 'payout-' + pid, url: '/' }).catch(() => {});
      res.status(201).json({ ok: true, id: String(row._id) });
    } catch (e) { next(e); }
  });
}

// ---- App ke andar (login ke saath): key banao / dekho / band karo ----
export function hookAdminRoutes(app, store) {
  const metaKey = (me) => 'hook:' + me;
  app.get('/api/me/hook', async (req, res, next) => {
    try { const m = await store.meta.get(metaKey(req.me)); const v = m?.value; res.json(v?.hash ? { active: true, accountId: v.accountId, createdAt: v.createdAt, last: v.last || null, count: v.count || 0, hint: v.hint } : { active: false }); }
    catch (e) { next(e); }
  });
  app.post('/api/me/hook', async (req, res, next) => {
    try {
      const accountId = String(req.body?.accountId || '').slice(0, 64);
      const acc = (await store.accounts.all({ owner: req.me })).find((a) => String(a.clientId || a._id) === accountId && !a.archived);
      if (!acc) return res.status(400).json({ error: 'Pehle account chuno (aur woh sync ho chuka ho).' });
      const key = 'dk_' + crypto.randomBytes(24).toString('hex');
      const value = { hash: sha(key), accountId, createdAt: new Date().toISOString(), hint: key.slice(-4), count: 0, note: 'Business payout' };
      const old = await store.meta.get(metaKey(req.me));
      if (old) await store.meta.update(metaKey(req.me), { value }); else await store.meta.create({ _id: metaKey(req.me), value });
      res.json({ key, accountId, hint: value.hint }); // key sirf abhi dikhegi
    } catch (e) { next(e); }
  });
  app.delete('/api/me/hook', async (req, res, next) => {
    try { const old = await store.meta.get(metaKey(req.me)); if (old) await store.meta.remove(metaKey(req.me)); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
}
