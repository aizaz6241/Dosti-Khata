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
