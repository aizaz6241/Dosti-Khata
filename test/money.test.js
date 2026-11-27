import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalances, peopleLedger, netWorth, monthReport } from '../server/money.js';

const acc = [
  { _id: 'cash', name: 'Cash', currency: 'PKR', opening: 5000 },
  { _id: 'bank', name: 'Meezan', currency: 'PKR', opening: 50000 },
  { _id: 'ep', name: 'Easypaisa', currency: 'PKR', opening: 0 },
  { _id: 'bin', name: 'Binance', currency: 'USDT', opening: 100 },
];
let n = 0;
const t = (o) => ({ _id: 't' + ++n, date: '2026-11-10', time: '12:00', ...o });

test('kharcha, aamdani, transfer se balance', () => {
  const tx = [
    t({ type: 'expense', amount: 1200, accountId: 'cash', category: 'khana' }),
    t({ type: 'income', amount: 80000, accountId: 'bank', category: 'salary' }),
    t({ type: 'transfer', amount: 10000, accountId: 'bank', toAccountId: 'ep' }),
    t({ type: 'expense', amount: 2500, accountId: 'ep', category: 'bill' }),
  ];
  const b = accountBalances(acc, tx);
  assert.equal(b.cash, 3800); assert.equal(b.bank, 120000); assert.equal(b.ep, 7500); assert.equal(b.bin, 100);
});

test('alag currency mein transfer (USDT bech kar PKR)', () => {
  const tx = [t({ type: 'transfer', amount: 50, accountId: 'bin', toAccountId: 'bank', toAmount: 14000 })];
  const b = accountBalances(acc, tx);
  assert.equal(b.bin, 50); assert.equal(b.bank, 64000);
});

test('kul paisa rupay mein (USDT rate se), rate na ho to alag', () => {
  const b = accountBalances(acc, []);
  assert.deepEqual(netWorth(acc, b, { USDT: 280 }), { pkr: 55000 + 28000, unconverted: {} });
  assert.deepEqual(netWorth(acc, b, {}), { pkr: 55000, unconverted: { USDT: 100 } });
});

test('kisi aur ko qarz: 5000 diye, 2000 wapas, 3000 baqi, history', () => {
  const people = [{ _id: 'ali', name: 'Ali' }];
  const tx = [
    t({ type: 'lend', amount: 5000, accountId: 'bank', contactId: 'ali', date: '2026-11-01' }),
    t({ type: 'got_back', amount: 2000, accountId: 'cash', contactId: 'ali', date: '2026-11-15' }),
  ];
  const l = peopleLedger(people, tx, acc).ali;
  assert.deepEqual(l.balance, { PKR: 3000 });
  assert.deepEqual(l.history.map((h) => [h.date, h.delta, h.running]), [['2026-11-01', 5000, 5000], ['2026-11-15', -2000, 3000]]);
  const b = accountBalances(acc, tx);
  assert.equal(b.bank, 45000); assert.equal(b.cash, 7000);
});

test('maine qarz liya aur wapas kiya', () => {
  const people = [{ _id: 'bh', name: 'Bhai' }];
  const tx = [t({ type: 'borrow', amount: 10000, accountId: 'bank', contactId: 'bh' }), t({ type: 'paid_back', amount: 4000, accountId: 'bank', contactId: 'bh', date: '2026-11-20' })];
  assert.deepEqual(peopleLedger(people, tx, acc).bh.balance, { PKR: -6000 });
  assert.equal(accountBalances(acc, tx).bank, 56000);
});

test('poora wapas: khata barabar (khali)', () => {
  const people = [{ _id: 'x', name: 'X' }];
  const tx = [t({ type: 'lend', amount: 700, accountId: 'cash', contactId: 'x' }), t({ type: 'got_back', amount: 700, accountId: 'cash', contactId: 'x', date: '2026-11-11' })];
  assert.deepEqual(peopleLedger(people, tx, acc).x.balance, {});
});

test('balance theek karna (adjust) + aur - dono', () => {
  const b = accountBalances(acc, [t({ type: 'adjust', amount: -300, accountId: 'cash' }), t({ type: 'adjust', amount: 50, accountId: 'ep' })]);
  assert.equal(b.cash, 4700); assert.equal(b.ep, 50);
});

test('mahine ki report: qarz kharche mein nahi, pichle mahine se muqabla', () => {
  const tx = [
    t({ type: 'expense', amount: 1000, accountId: 'cash', category: 'khana', date: '2026-10-05' }),
    t({ type: 'expense', amount: 600, accountId: 'cash', category: 'khana', date: '2026-11-03' }),
    t({ type: 'expense', amount: 900, accountId: 'bank', category: 'bill', date: '2026-11-04' }),
    t({ type: 'expense', amount: 10, accountId: 'bin', category: 'online', date: '2026-11-05' }),
    t({ type: 'income', amount: 80000, accountId: 'bank', category: 'salary', date: '2026-11-01' }),
    t({ type: 'lend', amount: 5000, accountId: 'bank', contactId: 'a', date: '2026-11-02' }),
  ];
  const r = monthReport(tx, acc, '2026-11', { USDT: 280 });
  assert.equal(r.spent, 600 + 900 + 2800);
  assert.equal(r.income, 80000);
  assert.equal(r.saved, 80000 - 4300);
  assert.equal(r.lent, 5000);
  assert.deepEqual(r.byCat, { khana: 600, bill: 900, online: 2800 });
  assert.equal(r.biggest.category, 'online');
  assert.equal(r.prev.spent, 1000);
  assert.equal(r.change, 330);
});

test('January ka pichla mahina December', () => {
  const r = monthReport([t({ type: 'expense', amount: 100, accountId: 'cash', date: '2026-12-31' })], acc, '2027-01');
  assert.equal(r.prev.month, '2026-12'); assert.equal(r.prev.spent, 100);
});

import { sharedSpend, khataFlows, effectiveRates, accountBalances as ab2, monthReport as mr2 } from '../server/money.js';
import { binanceSell, createRates } from '../server/rates.js';

test('dosti khata: mera hissa kharcha, link se account ka balance', () => {
  const rows = [
    { clientId: 'e1', type: 'expense', amount: 1000, paidBy: 'aizaz', shares: { aizaz: 500, abdullah: 500 }, category: 'khana', date: '2026-11-05' },
    { clientId: 'e2', type: 'expense', amount: 600, paidBy: 'abdullah', shares: { aizaz: 300, abdullah: 300 }, category: 'kiraya', date: '2026-11-06' },
    { clientId: 'e3', type: 'payment', amount: 2000, from: 'aizaz', to: 'abdullah', date: '2026-11-07' },
    { clientId: 'e4', type: 'payment', amount: 700, from: 'abdullah', to: 'aizaz', date: '2026-11-08' },
    { clientId: 'e5', type: 'expense', amount: 400, paidBy: 'abdullah', shares: { aizaz: 0, abdullah: 400 }, category: 'chai', date: '2026-11-08' },
  ];
  const sp = sharedSpend(rows, 'aizaz');
  assert.deepEqual(sp.map((x) => [x.amount, x.category]), [[500, 'khana'], [300, 'safar']]);
  const links = [{ entryId: 'e1', accountId: 'cash' }, { entryId: 'e3', accountId: 'bank' }, { entryId: 'e4', accountId: 'cash' }, { entryId: 'e2', accountId: 'cash' }, { entryId: 'gone', accountId: 'cash' }];
  const flows = khataFlows(links, rows, 'aizaz');
  assert.equal(flows.length, 3); // e2 Abdullah ne diya: account par asar nahi; 'gone' mit chuki
  const bal = ab2([{ clientId: 'cash', opening: 5000 }, { clientId: 'bank', opening: 10000 }], flows);
  assert.deepEqual(bal, { cash: 4700, bank: 8000 });
  const r = mr2([], [], '2026-11', {}, sp);
  assert.equal(r.spent, 800); assert.equal(r.khata, 800); assert.equal(r.byCat.safar, 300);
});

test('rate: khud likha / live', () => {
  assert.deepEqual(effectiveRates({ rates: { USDT: 280 } }, { USDT: 285 }), { USDT: 285 });
  assert.deepEqual(effectiveRates({ rates: { USDT: 280 }, manual: ['USDT'] }, { USDT: 285 }), { USDT: 280 });
  assert.deepEqual(effectiveRates({ rates: { USDT: 280 } }, {}), { USDT: 280 });
});

test('binance: bharosemand bechne walon ka aam rate', async () => {
  const fake = (ads) => async () => ({ ok: true, json: async () => ({ data: ads.map(([p, m, o]) => ({ adv: { price: String(p), minSingleTransAmount: String(m), isTradable: true }, advertiser: { monthOrderCount: o } })) }) });
  // asal Binance jaisa: upar 298.4 wale naye / bare sauday wale
  const live = [[298.4, 190000, 2], [298.4, 250000, 1], [298.4, 50000, 13], [298.4, 280000, 24], [293.5, 60000, 14], [293.35, 350, 936], [293.3, 350, 105], [292.8, 10000, 191], [292.7, 10000, 71], [292.61, 405, 897], [292.6, 350, 475], [292.6, 350, 209], [292.6, 1000, 41], [292.31, 350, 710]];
  const v = await binanceSell(fake(live));
  assert.ok(v >= 292 && v <= 293, 'aam rate ~292.6, 298 nahi: ' + v);
  assert.equal(await binanceSell(fake([[300, 100, 1], [299, 100, 2]])), 299.5); // bharosemand na hon to sab ka beech
  const r = createRates({ fetchFn: async (url) => { if (String(url).includes('binance')) throw new Error('blocked'); if (String(url).includes('coingecko')) return { ok: true, json: async () => ({ tether: { pkr: 280.4 } }) }; return { ok: true, json: async () => ({ rates: { USD: 1 / 279, AED: 1 / 76 } }) }; }, log: {} });
  const g = await r.get();
  assert.equal(g.rates.USDT, 280.4); assert.equal(g.sources.USDT, 'CoinGecko'); assert.equal(g.rates.USD, 279);
});

import { rangeReport, addDays } from '../server/money.js';
test('muddat ka hisaab: hafta + pichla hafta', () => {
  const tx = [
    { type: 'expense', amount: 100, accountId: 'c', date: '2026-11-23', category: 'chai' },
    { type: 'expense', amount: 300, accountId: 'c', date: '2026-11-29', category: 'khana' },
    { type: 'expense', amount: 200, accountId: 'c', date: '2026-11-20', category: 'khana' },
    { type: 'income', amount: 1000, accountId: 'c', date: '2026-11-25', category: 'salary' },
  ];
  const r = rangeReport(tx, [{ clientId: 'c', currency: 'PKR' }], '2026-11-23', '2026-11-29', {}, [{ date: '2026-11-24', amount: 50, category: 'safar' }]);
  assert.equal(r.days, 7); assert.equal(r.spent, 450); assert.equal(r.khata, 50); assert.equal(r.income, 1000);
  assert.equal(r.prev.from, '2026-11-16'); assert.equal(r.prev.spent, 200); assert.equal(r.change, 125);
  assert.equal(r.top[0].pkr, 300); assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('mahina ka muqabla pichle asal mahine se (1 tareekh wala kiraya bhi)', () => {
  const tx = [{ type: 'expense', amount: 15000, accountId: 'c', date: '2026-03-01', category: 'ghar' }, { type: 'expense', amount: 20000, accountId: 'c', date: '2026-04-01', category: 'ghar' }];
  const r = rangeReport(tx, [{ clientId: 'c' }], '2026-04-01', '2026-04-30', {}, [], { from: '2026-03-01', to: '2026-03-31' });
  assert.equal(r.prev.spent, 15000); assert.equal(r.change, 33);
});
