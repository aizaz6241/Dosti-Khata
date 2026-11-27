// "Mera Hisaab" ke routes: sirf apna data (owner = login wala bande). Doosra banda kabhi nahi dekh sakta.
import { ACCOUNT_KINDS, CURRENCIES, PTX_TYPES, EXPENSE_CATS, INCOME_CATS } from './money.js';

const round = (n) => Math.round(Number(n) * 100) / 100;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
const bad = (m) => Object.assign(new Error(m), { status: 400 });

const COLS = {
  accounts: {
    clean(b) {
      const name = str(b.name, 40);
      if (!name) throw bad('Account ka naam likho.');
      const opening = round(b.opening || 0);
      if (!Number.isFinite(opening) || Math.abs(opening) > 1e10) throw bad('Shuru ki raqam sahi likho.');
      return {
        name,
        kind: ACCOUNT_KINDS.includes(b.kind) ? b.kind : 'other',
        currency: CURRENCIES.includes(b.currency) ? b.currency : 'PKR',
        opening,
        archived: !!b.archived,
        color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : undefined,
      };
    },
  },
  contacts: {
    clean(b) {
      const name = str(b.name, 40);
      if (!name) throw bad('Naam likho.');
      return { name, phone: str(b.phone, 20), note: str(b.note, 120), archived: !!b.archived };
    },
  },
  ptx: {
    clean(b) {
      const type = PTX_TYPES.includes(b.type) ? b.type : null;
      if (!type) throw bad('Qisam sahi nahi.');
      const amount = round(b.amount);
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e10 || (type !== 'adjust' && amount < 0)) throw bad('Raqam sahi likho.');
      const out = {
        type, amount,
        date: isDay(b.date) ? b.date : new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10),
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || '') ? b.time : '',
        note: str(b.note, 120),
        accountId: b.accountId ? str(b.accountId, 64) : '',
      };
      if (['expense', 'income', 'transfer', 'adjust'].includes(type) && !out.accountId) throw bad('Account chuno.');
      if (type === 'expense') out.category = EXPENSE_CATS.includes(b.category) ? b.category : 'other';
      if (type === 'income') out.category = INCOME_CATS.includes(b.category) ? b.category : 'other_in';
      if (type === 'transfer') {
        out.toAccountId = str(b.toAccountId, 64);
        if (!out.toAccountId || out.toAccountId === out.accountId) throw bad('Kis account mein bhejna hai? chuno.');
        const to = b.toAmount == null || b.toAmount === '' ? amount : round(b.toAmount);
        if (!(to > 0)) throw bad('Pohanchne wali raqam sahi likho.');
        out.toAmount = to;
      }
      if (['lend', 'borrow', 'got_back', 'paid_back'].includes(type)) {
        out.contactId = str(b.contactId, 64);
        if (!out.contactId) throw bad('Kis bande ke saath? chuno.');
        out.old = !!b.old && !out.accountId; // purana qarz, kisi account se nahi
      }
      return out;
    },
  },
  prefs: {
    clean(b) {
      const rates = {};
      for (const c of CURRENCIES) if (c !== 'PKR' && Number(b.rates?.[c]) > 0) rates[c] = round(b.rates[c]);
      const manual = Array.isArray(b.manual) ? CURRENCIES.filter((c) => c !== 'PKR' && b.manual.includes(c)) : [];
      return { rates, manual };
    },
  },
  // Dosti khata ki entry kis account se gayi / mein aayi (sirf aap ko pata)
  links: {
    clean(b) {
      const entryId = str(b.entryId, 64); const accountId = str(b.accountId, 64);
      if (!entryId || !accountId) throw bad('Account chuno.');
      return { entryId, accountId };
    },
  },
};

export function personalRoutes(app, store, onChange) {
  const findOwn = async (col, key, me) => {
    let row = /^[a-f0-9]{24}$/.test(key) ? await store[col].get(key) : null;
    if (!row) row = await store[col].find({ clientId: key });
    if (!row) row = await store[col].get(key); // file store ke ids
    return row && row.owner === me ? row : null;
  };

  app.get('/api/me/data', async (req, res, next) => {
    try {
      const me = req.me;
      const [accounts, ptx, contacts, prefs, links] = await Promise.all(['accounts', 'ptx', 'contacts', 'prefs', 'links'].map((c) => store[c].all({ owner: me })));
      res.json({ accounts, ptx, contacts, links, prefs: prefs[0] || { rates: {}, manual: [] } });
    } catch (e) { next(e); }
  });

  app.post('/api/me/:col', async (req, res, next) => {
    try {
      const col = req.params.col;
      if (!COLS[col]) return res.status(404).json({ error: 'Nahi mila.' });
      const data = COLS[col].clean(req.body || {});
      const clientId = /^[\w-]{8,64}$/.test(String(req.body?.clientId || '')) ? req.body.clientId : undefined;
      if (col === 'prefs') {
        const old = (await store.prefs.all({ owner: req.me }))[0];
        const row = old ? await store.prefs.update(String(old._id), data) : await store.prefs.create({ ...data, owner: req.me });
        onChange(req.me); return res.json(row);
      }
      if (clientId) {
        const dup = await store[col].find({ clientId });
        if (dup) {
          if (dup.owner !== req.me) return res.status(409).json({ error: 'Dobara koshish karo.' });
          const row = await store[col].update(String(dup._id), data); onChange(req.me); return res.json(row);
        }
      }
      const row = await store[col].create({ ...data, owner: req.me, clientId });
      res.status(201).json(row); onChange(req.me);
    } catch (e) { e.status = e.status || 400; next(e); }
  });

  app.put('/api/me/:col/:key', async (req, res, next) => {
    try {
      const col = req.params.col;
      if (!COLS[col] || col === 'prefs') return res.status(404).json({ error: 'Nahi mila.' });
      const row = await findOwn(col, req.params.key, req.me);
      if (!row) return res.status(404).json({ error: 'Nahi mila.' });
      const out = await store[col].update(String(row._id), COLS[col].clean(req.body || {}));
      res.json(out); onChange(req.me);
    } catch (e) { e.status = e.status || 400; next(e); }
  });

  app.delete('/api/me/:col/:key', async (req, res, next) => {
    try {
      const col = req.params.col;
      if (!COLS[col] || col === 'prefs') return res.status(404).json({ error: 'Nahi mila.' });
      const row = await findOwn(col, req.params.key, req.me);
      if (!row) return res.status(404).json({ error: 'Nahi mila.' });
      const key = String(row.clientId || row._id);
      // Jis account ya bande ke len-den hon, woh mitaya nahi, chhupaya jata hai (hisaab kharab na ho)
      if (col === 'accounts' || col === 'contacts') {
        const field = col === 'accounts' ? ['accountId', 'toAccountId'] : ['contactId'];
        const used = (await store.ptx.all({ owner: req.me })).some((t) => field.some((f) => t[f] === key || t[f] === String(row._id)))
          || (col === 'accounts' && (await store.links.all({ owner: req.me })).some((l) => l.accountId === key || l.accountId === String(row._id)));
        if (used) { await store[col].update(String(row._id), { archived: true }); onChange(req.me); return res.json({ ok: true, archived: true }); }
      }
      await store[col].remove(String(row._id));
      res.json({ ok: true }); onChange(req.me);
    } catch (e) { next(e); }
  });
}
