// Activity log: har entry ka likhna, badalna, delete karna, pehle aur baad ke saath.
// Server aur app dono yeh file use karte hain.

const other = (p, ids) => (p === ids[0] ? ids[1] : ids[0]);

// Entry ki zaroori baatein (log mein rakhne ke liye)
export function snapshot(e) {
  if (!e) return null;
  return {
    type: e.type, amount: e.amount, note: e.note || '', category: e.category, date: e.date, time: e.time || '',
    paidBy: e.paidBy, from: e.from, to: e.to, split: e.split, shares: e.shares || {},
    shot: !!(e.fileId || e.fileUrl || e.fileKey), createdBy: e.createdBy, confirmedAt: e.confirmedAt || null,
  };
}

// Doosre ka hissa (jo hisaab mein jata hai)
export function shareOf(s, ids) {
  if (!s) return 0;
  if (s.type !== 'expense') return Number(s.amount) || 0;
  return Number(s.shares?.[other(s.paidBy, ids)] || 0);
}

// Kya kya badla
export function diff(before, after, ids) {
  if (!before || !after) return [];
  const ch = [];
  const add = (f, a, b) => { if ((a ?? '') !== (b ?? '')) ch.push({ f, from: a ?? '', to: b ?? '' }); };
  add('share', shareOf(before, ids), shareOf(after, ids));
  if (before.type === 'expense') {
    add('amount', before.amount, after.amount);
    add('paidBy', before.paidBy, after.paidBy);
    add('category', before.category, after.category);
  } else add('from', before.from, after.from);
  add('note', before.note, after.note);
  add('when', `${before.date} ${before.time}`.trim(), `${after.date} ${after.time}`.trim());
  if (before.shot !== after.shot) ch.push({ f: 'shot', from: before.shot, to: after.shot });
  // Kul raqam badli magar hissa wahi: sirf tab dikhao jab hissa bhi badla ho ya kuch aur na badla ho
  const onlyTotal = ch.find((c) => c.f === 'amount');
  if (onlyTotal && ch.some((c) => c.f === 'share')) return ch.filter((c) => c.f !== 'amount');
  return ch;
}
