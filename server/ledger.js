// Hisaab engine.
// Har entry ek "qarz" banati hai (kaun kis ko kitna dega).
// Naya qarz pehle ulti taraf ke purane qarz ko (sab se purana pehle) khatam karta hai.
// Jo bach jaye woh naya khula qarz ban jata hai. Is tarah:
//  - payment purane kharchon ko tick karti hai (FIFO)
//  - zyada payment "advance" ban jati hai
//  - ek din ka kharcha doosre din ke ulte kharche se adjust ho jata hai

const round = (n) => Math.round(n * 100) / 100;

export function other(p, people) {
  return p === people[0] ? people[1] : people[0];
}

function sortKey(e) {
  return [new Date(e.date).getTime(), new Date(e.createdAt || e.date).getTime()];
}

export function computeLedger(entries, people) {
  const list = [...entries].sort((a, b) => {
    const [a1, a2] = sortKey(a);
    const [b1, b2] = sortKey(b);
    return a1 - b1 || a2 - b2;
  });

  const open = []; // { id, debtor, creditor, remaining }
  const info = new Map();

  for (const e of list) {
    const id = String(e._id);
    let debtor, creditor, amount;

    if (e.type === 'expense') {
      creditor = e.paidBy;
      debtor = other(e.paidBy, people);
      amount = round(Number(e.shares?.[debtor] || 0));
    } else {
      // payment: from -> to. "to" ab "from" ka utna qarzdaar hai.
      creditor = e.from;
      debtor = e.to;
      amount = round(Number(e.amount));
    }

    const rec = { owed: amount, debtor, creditor, settled: 0, links: [], applied: [] };
    info.set(id, rec);
    if (amount <= 0) continue;

    let remaining = amount;
    for (const due of open) {
      if (remaining <= 0) break;
      if (due.remaining <= 0) continue;
      if (due.debtor !== creditor || due.creditor !== debtor) continue;
      const take = round(Math.min(due.remaining, remaining));
      due.remaining = round(due.remaining - take);
      remaining = round(remaining - take);
      const dueRec = info.get(due.id);
      dueRec.settled = round(dueRec.settled + take);
      dueRec.links.push({ id, amount: take });
      rec.applied.push({ id: due.id, amount: take });
    }
    if (remaining > 0) open.push({ id, debtor, creditor, remaining });
  }

  // Balance: abhi kaun kis ko kitna dega
  let balance = { from: null, to: null, amount: 0 };
  const sum = open.reduce((s, d) => s + d.remaining, 0);
  if (sum > 0.004) {
    const d = open.find((x) => x.remaining > 0);
    balance = { from: d.debtor, to: d.creditor, amount: round(sum) };
  }

  const remainingById = new Map(open.map((d) => [d.id, d.remaining]));

  const out = list.map((e) => {
    const id = String(e._id);
    const r = info.get(id);
    const left = round(remainingById.get(id) || 0);
    let status;
    if (e.type === 'expense') {
      if (r.owed <= 0) status = 'personal';
      else if (left <= 0) status = 'clear';
      else if (left < r.owed) status = 'partial';
      else status = 'pending';
    } else {
      const usedOnOld = round(r.applied.reduce((s, a) => s + a.amount, 0));
      if (left <= 0) status = 'used';
      else status = usedOnOld > 0 ? 'advance-partial' : 'advance';
    }
    return {
      ...e,
      _id: id,
      calc: {
        debtor: r.debtor,
        creditor: r.creditor,
        owed: r.owed,
        left, // abhi tak khula hissa (kharcha: baqi qarz, payment: advance)
        settledBy: r.links, // kis entry ne ise clear kiya
        cleared: r.applied, // is entry ne kin purani entries ko clear kiya
        status,
      },
    };
  });

  return { entries: out.reverse(), balance };
}

export function monthStats(entries, people, monthKey) {
  // monthKey: "2026-11"
  const inMonth = entries.filter((e) => String(e.date).slice(0, 7) === monthKey);
  const stats = {
    month: monthKey,
    total: 0,
    count: 0,
    paid: Object.fromEntries(people.map((p) => [p, 0])),
    share: Object.fromEntries(people.map((p) => [p, 0])),
    sent: Object.fromEntries(people.map((p) => [p, 0])),
    categories: {},
    days: {},
  };
  for (const e of inMonth) {
    const day = String(e.date).slice(0, 10);
    if (e.type === 'expense') {
      stats.total = round(stats.total + e.amount);
      stats.count++;
      stats.paid[e.paidBy] = round(stats.paid[e.paidBy] + e.amount);
      for (const p of people) stats.share[p] = round(stats.share[p] + Number(e.shares?.[p] || 0));
      const c = e.category || 'other';
      stats.categories[c] = round((stats.categories[c] || 0) + e.amount);
      stats.days[day] = round((stats.days[day] || 0) + e.amount);
    } else {
      stats.sent[e.from] = round(stats.sent[e.from] + e.amount);
    }
  }
  return stats;
}
