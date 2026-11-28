// "Mera Hisaab" ke routes: sirf apna data (owner = login wala bande). Doosra banda kabhi nahi dekh sakta.
import { ACCOUNT_KINDS, CURRENCIES, PTX_TYPES, EXPENSE_CATS, INCOME_CATS } from './money.js';
import { rememberDeletedPayout } from './hook.js';

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
      const custom = /^c_[a-z0-9]{3,24}$/.test(String(b.category || '')); // apni banai hui category
      if (type === 'expense') out.category = EXPENSE_CATS.includes(b.category) || custom ? b.category : 'other';
      if (type === 'income') out.category = INCOME_CATS.includes(b.category) || custom ? b.category : 'other_in';
      if (type === 'transfer') {
        out.toAccountId = str(b.toAccountId, 64);
        if (!out.toAccountId || out.toAccountId === out.accountId) throw bad('Kis account mein bhejna hai? chuno.');
        const to = b.toAmount == null || b.toAmount === '' ? amount : round(b.toAmount);
        if (!(to > 0)) throw bad('Pohanchne wali raqam sahi likho.');
        out.toAmount = to;
        if (Number(b.rate) > 0 && Number(b.rate) < 1e7) out.rate = round(b.rate);
      }
      if (['lend', 'borrow', 'got_back', 'paid_back'].includes(type)) {
        out.contactId = str(b.contactId, 64);
        if (!out.contactId) throw bad('Kis bande ke saath? chuno.');
        out.old = !!b.old && !out.accountId; // purana qarz, kisi account se nahi
        if (!out.accountId) out.currency = CURRENCIES.includes(b.currency) ? b.currency : 'PKR'; // bina account: qarz kis currency mein (USD, USDT...)
      }
      return out;
    },
  },
  prefs: {
    clean(b) {
      const rates = {};
      for (const c of CURRENCIES) if (c !== 'PKR' && Number(b.rates?.[c]) > 0) rates[c] = round(b.rates[c]);
      const manual = Array.isArray(b.manual) ? CURRENCIES.filter((c) => c !== 'PKR' && b.manual.includes(c)) : [];
      const budget = Number(b.budget) > 0 && Number(b.budget) < 1e10 ? Math.round(Number(b.budget)) : 0;
      const customCats = (Array.isArray(b.customCats) ? b.customCats : []).slice(0, 60)
        .filter((c) => /^c_[a-z0-9]{3,24}$/.test(String(c?.id || '')) && str(c.label, 24))
        .map((c) => ({ id: c.id, label: str(c.label, 24), icon: /^[A-Za-z0-9]{2,20}$/.test(c.icon || '') ? c.icon : 'Tag', kind: c.kind === 'income' ? 'income' : 'expense' }));
      const catBudgets = {};
      for (const [k, v] of Object.entries(b.catBudgets || {}).slice(0, 80)) {
        if ((EXPENSE_CATS.includes(k) || /^c_[a-z0-9]{3,24}$/.test(k)) && Number(v) > 0 && Number(v) < 1e10) catBudgets[k] = Math.round(Number(v));
      }
      return { rates, manual, budget, customCats, catBudgets };
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
      // Backup se wapas aayi payout entry: us ki payout wali pehchan (reverse waghera) bhi wapas
      if (col === 'ptx' && clientId?.startsWith('payout-')) {
        const b = req.body;
        Object.assign(data, {
          payoutId: str(b.payoutId, 80) || undefined, payoutAmount: Number(b.payoutAmount) > 0 ? round(b.payoutAmount) : undefined,
          source: str(b.source, 24) || 'payout', forMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(b.forMonth || '') ? b.forMonth : null,
          reversed: !!b.reversed, reversedAt: b.reversed ? str(b.reversedAt, 40) : undefined, reverseReason: b.reversed ? str(b.reverseReason, 120) : undefined,
        });
      }
      if (col === 'prefs') {
        const all = await store.prefs.all({ owner: req.me });
        const old = all[0];
        for (const extra of all.slice(1)) await store.prefs.remove(String(extra._id)); // ghalti se do bane hon to ek rakho
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
      if (col === 'ptx' && row.payoutId) await rememberDeletedPayout(store, row); // Bazario dobara bheje to wapas na aaye
      await store[col].remove(String(row._id));
      res.json({ ok: true }); onChange(req.me);
    } catch (e) { next(e); }
  });
}
