import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLedger, monthStats, dueBefore } from '../server/ledger.js';

const P = ['aizaz', 'abdullah'];
let n = 0;
const ex = (paidBy, owed, date, time = '12:00', amount = owed * 2) => {
  const debtor = paidBy === 'aizaz' ? 'abdullah' : 'aizaz';
  return { _id: 'e' + ++n, type: 'expense', amount, paidBy, date, time, shares: { [debtor]: owed, [paidBy]: amount - owed } };
};
const pay = (from, amount, date, time = '12:00') => ({ _id: 'p' + ++n, type: 'payment', amount, from, to: from === 'aizaz' ? 'abdullah' : 'aizaz', date, time });
const loan = (from, amount, date, time = '12:00') => ({ ...pay(from, amount, date, time), _id: 'l' + ++n, type: 'loan' });
const byId = (l) => Object.fromEntries(l.entries.map((e) => [e._id, e.calc]));

test('Aizaz ki misaal: 850 phir 300', () => {
  const rows = [
    ex('abdullah', 100, '2026-11-20'), ex('abdullah', 300, '2026-11-21'), ex('abdullah', 200, '2026-11-22'),
    ex('abdullah', 200, '2026-11-23'), ex('abdullah', 200, '2026-11-24'),
    pay('aizaz', 850, '2026-11-25', '09:30'),
    ex('abdullah', 120, '2026-11-25', '19:45'), ex('abdullah', 80, '2026-11-26'),
    pay('aizaz', 300, '2026-11-27'),
  ];
  const l = computeLedger(rows, P); const c = byId(l);
  const [e1, e2, e3, e4, e5, p1, e6, e7, p2] = rows.map((r) => c[r._id]);
  for (const e of [e1, e2, e3, e4, e5, e6]) assert.equal(e.status, 'clear');
  assert.deepEqual(p1.cleared.map((x) => x.amount), [100, 300, 200, 200, 50]);
  assert.deepEqual(p2.cleared.map((x) => x.amount), [150, 120, 30]);
  assert.equal(e7.status, 'partial'); assert.equal(e7.left, 50);
  assert.deepEqual(l.balance, { from: 'aizaz', to: 'abdullah', amount: 50 });
});

test('Time se tarteeb: same din, pehle wala pehle clear', () => {
  const a = ex('abdullah', 100, '2026-11-10', '20:00');
  const b = ex('abdullah', 100, '2026-11-10', '08:00');
  const l = computeLedger([a, b, pay('aizaz', 100, '2026-11-11')], P);
  assert.equal(byId(l)[b._id].status, 'clear');
  assert.equal(byId(l)[a._id].status, 'pending');
});

test('Zyada payment advance banti hai, agle kharche us se katte hain', () => {
  const rows = [ex('abdullah', 3000, '2026-11-01'), pay('aizaz', 5000, '2026-11-02'), ex('abdullah', 500, '2026-11-03')];
  const l = computeLedger(rows, P); const c = byId(l);
  assert.equal(c[rows[0]._id].status, 'clear');
  assert.equal(c[rows[2]._id].status, 'clear');
  assert.equal(c[rows[1]._id].left, 1500);
  assert.deepEqual(l.balance, { from: 'abdullah', to: 'aizaz', amount: 1500 });
});

test('Ulte kharche aapas mein adjust (100 phir 200 wali misaal)', () => {
  const rows = [ex('abdullah', 50, '2026-11-01'), ex('aizaz', 100, '2026-11-02')];
  const l = computeLedger(rows, P);
  assert.deepEqual(l.balance, { from: 'abdullah', to: 'aizaz', amount: 50 });
  assert.equal(byId(l)[rows[0]._id].status, 'clear');
});

test('Mahine badalne par baqi agle mahine chala jata hai', () => {
  const rows = [ex('abdullah', 400, '2026-10-05'), ex('abdullah', 300, '2026-10-28'), pay('aizaz', 500, '2026-11-02'), ex('abdullah', 100, '2026-11-10')];
  const l = computeLedger(rows, P);
  assert.deepEqual(l.balance, { from: 'aizaz', to: 'abdullah', amount: 300 });
  // October ka 200 abhi baqi hai (300 wale mein se), November ka 100 bhi
  assert.deepEqual(dueBefore(l, '2026-11'), { from: 'aizaz', to: 'abdullah', amount: 200 });
  const c = byId(l);
  assert.equal(c[rows[0]._id].status, 'clear');
  assert.equal(c[rows[1]._id].left, 200);
  // December mein: saal ke aakhir tak sab purana
  assert.equal(dueBefore(l, '2026-12').amount, 300);
});

test('Saal badalna (December se January)', () => {
  const rows = [ex('aizaz', 250, '2026-12-30'), pay('abdullah', 100, '2027-01-02')];
  const l = computeLedger(rows, P);
  assert.deepEqual(l.balance, { from: 'abdullah', to: 'aizaz', amount: 150 });
  assert.equal(dueBefore(l, '2027-01').amount, 150);
  assert.equal(monthStats(rows, P, '2027-01').sent.abdullah, 100);
});

test('Qarz: baqi banta hai aur wapas karne se clear', () => {
  const rows = [loan('abdullah', 1000, '2026-11-01'), pay('aizaz', 600, '2026-11-05')];
  const l = computeLedger(rows, P); const c = byId(l);
  assert.equal(c[rows[0]._id].status, 'partial'); assert.equal(c[rows[0]._id].left, 400);
  assert.equal(c[rows[1]._id].status, 'used');
  assert.deepEqual(l.balance, { from: 'aizaz', to: 'abdullah', amount: 400 });
});

test('Apna kharcha hisaab par asar nahi', () => {
  const self = { ...ex('abdullah', 0, '2026-11-01', '12:00', 300) };
  const l = computeLedger([self, ex('abdullah', 50, '2026-11-02')], P);
  assert.equal(byId(l)[self._id].status, 'personal');
  assert.equal(l.balance.amount, 50);
});

test('Barabar hisaab: balance 0, sab clear', () => {
  const rows = [ex('abdullah', 300, '2026-11-01'), ex('aizaz', 100, '2026-11-02'), pay('aizaz', 200, '2026-11-03')];
  const l = computeLedger(rows, P);
  assert.deepEqual(l.balance, { from: null, to: null, amount: 0 });
  for (const e of l.entries) assert.ok(['clear', 'used'].includes(e.calc.status));
});

test('Delete karne par hisaab dobara sahi banta hai', () => {
  const a = ex('abdullah', 100, '2026-11-01'), b = ex('abdullah', 100, '2026-11-02'), p = pay('aizaz', 100, '2026-11-03');
  let l = computeLedger([a, b, p], P);
  assert.equal(byId(l)[a._id].status, 'clear');
  l = computeLedger([b, p], P); // a delete
  assert.equal(byId(l)[b._id].status, 'clear');
  assert.equal(l.balance.amount, 0);
});

test('Paison ke decimal (paise) theek', () => {
  const rows = [ex('abdullah', 33.33, '2026-11-01', '12:00', 66.67), ex('abdullah', 33.33, '2026-11-02', '12:00', 66.67), pay('aizaz', 66.66, '2026-11-03')];
  const l = computeLedger(rows, P);
  assert.equal(l.balance.amount, 0);
});

test('Mahine ka hisaab sirf hissa ginta hai', () => {
  const rows = [ex('abdullah', 50, '2026-11-01', '12:00', 100), ex('aizaz', 200, '2026-11-02', '12:00', 200), pay('aizaz', 30, '2026-11-03'), loan('abdullah', 1000, '2026-11-04')];
  const s = monthStats(rows, P, '2026-11');
  assert.equal(s.forOther.abdullah, 50); assert.equal(s.forOther.aizaz, 200);
  assert.equal(s.sent.aizaz, 30); assert.equal(s.lent.abdullah, 1000); assert.equal(s.total, 250);
});
