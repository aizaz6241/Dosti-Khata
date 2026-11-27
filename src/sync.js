// Offline-first sync.
// - Server ki entries phone par save (localStorage)
// - Har nayi entry/tabdeeli pehle phone ki "line" (queue, IndexedDB) mein, phir net ho to server par
// - Net wapas aaye, app khule, ya doosra banda kuch likhe (real-time) to sab khud sync
import { useCallback, useEffect, useRef, useState } from 'react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { api, LS } from './lib';

const ROWS = 'khata.rows';
const QUEUE = 'khata.queue';

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const keyOf = (r) => r.clientId || String(r._id);
const round = (n) => Math.round(Number(n) * 100) / 100;

// Form ka data -> wahi shakal jo server save karta hai (taake offline bhi hisaab sahi bane)
export function normalize(body, ids) {
  const other = (p) => (p === ids[0] ? ids[1] : ids[0]);
  const base = { type: body.type, amount: round(body.amount), note: body.note || '', date: body.date, time: body.time };
  if (body.type !== 'expense') return { ...base, category: body.type, from: body.from, to: other(body.from) };
  const debtor = other(body.paidBy);
  const amt = base.amount;
  const owed = body.split === 'half' ? round(amt / 2) : body.split === 'full' ? amt : body.split === 'self' ? 0 : round(body.owed);
  return { ...base, category: body.category, paidBy: body.paidBy, split: body.split, shares: { [debtor]: owed, [body.paidBy]: round(amt - owed) } };
}

export function applyQueue(rows, queue, me, ids) {
  const out = rows.map((r) => ({ ...r }));
  const find = (key) => out.findIndex((r) => keyOf(r) === key || String(r._id) === key);
  for (const op of queue) {
    const i = find(op.key);
    if (op.kind === 'delete') { if (i >= 0) out.splice(i, 1); continue; }
    if (op.kind === 'confirm') { if (i >= 0) out[i] = { ...out[i], confirmedAt: new Date(op.at).toISOString(), confirmedBy: me, pending: true }; continue; }
    const body = op.body || {};
    const shot = body.screenshot ? { fileUrl: body.screenshot } : body.removeScreenshot ? { fileUrl: null, fileId: null } : {};
    const data = { ...normalize(body, ids), ...shot, pending: true };
    if (op.kind === 'create' && i < 0) out.push({ ...data, _id: op.key, clientId: op.key, createdBy: me, createdAt: new Date(op.at).toISOString() });
    else if (i >= 0) {
      const prev = out[i];
      const reset = prev.confirmedAt && (data.amount !== prev.amount || data.from !== prev.from) ? { confirmedAt: null, confirmedBy: null } : {};
      out[i] = { ...prev, ...data, ...reset };
    }
  }
  return out;
}

// Line mein naya kaam jodo, purane kaam ke saath mila kar
function mergeOp(queue, op) {
  const q = [...queue];
  const idx = (kind) => q.findIndex((o) => o.key === op.key && o.kind === kind);
  if (op.kind === 'create' || op.kind === 'confirm') return [...q, op];
  const c = idx('create');
  if (op.kind === 'update') {
    if (c >= 0) { q[c] = { ...q[c], body: mergeBody(q[c].body, op.body), rev: (q[c].rev || 0) + 1 }; return q; }
    const u = idx('update');
    if (u >= 0) { q[u] = { ...q[u], body: mergeBody(q[u].body, op.body), at: op.at, rev: (q[u].rev || 0) + 1 }; return q; }
    return [...q, op];
  }
  // delete: baqi kaam hata do. Delete phir bhi bhejo, kyun ke ho sakta hai pehli koshish
  // server tak pohanch gayi ho (jawab kho gaya ho). Na pohanchi ho to server "nahi mili" kahega, koi baat nahi.
  return [...q.filter((o) => o.key !== op.key), op];
}
function mergeBody(a, b) {
  const m = { ...a, ...b };
  if (!b.screenshot && a.screenshot && !b.removeScreenshot) m.screenshot = a.screenshot;
  if (b.removeScreenshot) { delete m.screenshot; }
  if (b.screenshot) delete m.removeScreenshot;
  return m;
}

export function useKhata({ token, onError, onUnauthorized }) {
  const [rows, setRows] = useState(() => LS.get(ROWS, null));
  const [activity, setActivity] = useState(() => LS.get('khata.activity', []));
  const [queue, setQueue] = useState([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [live, setLive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const qRef = useRef([]);
  const flushing = useRef(false);
  const inflight = useRef(null); // abhi server ko ja raha kaam
  // Phone mein rakhi line pehle load ho, phir koi naya kaam jude
  const ready = useRef(null);
  if (!ready.current) {
    ready.current = (async () => {
      let q = [];
      try { q = (await idbGet(QUEUE)) || []; } catch { q = LS.get(QUEUE, []); }
      q = q.map((o) => (o.id ? o : { ...o, id: newId() }));
      qRef.current = q;
      setQueue(q);
    })();
  }

  const cb = useRef({ onError, onUnauthorized });
  cb.current = { onError, onUnauthorized };

  const saveQueue = useCallback(async (q) => {
    qRef.current = q;
    setQueue(q);
    try { await idbSet(QUEUE, q); } catch { LS.set(QUEUE, q); }
  }, []);

  const pull = useCallback(async () => {
    if (!LS.get('khata.token')) return;
    try {
      const r = await api('/entries');
      setRows(r.rows);
      LS.set(ROWS, r.rows);
      setActivity(r.activity || []);
      LS.set('khata.activity', r.activity || []);
      setOnline(true);
    } catch (e) {
      if (e.status === 401) cb.current.onUnauthorized?.();
      else if (!e.status) setOnline(false);
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !LS.get('khata.token')) return;
    await ready.current;
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      while (qRef.current.length) {
        const op = qRef.current[0];
        inflight.current = op;
        try {
          if (op.kind === 'create') await api('/entries', { method: 'POST', body: { ...op.body, clientId: op.key } });
          else if (op.kind === 'update') await api('/entries/' + encodeURIComponent(op.key), { method: 'PUT', body: op.body });
          else if (op.kind === 'confirm') await api('/entries/' + encodeURIComponent(op.key) + '/confirm', { method: 'POST' });
          else await api('/entries/' + encodeURIComponent(op.key), { method: 'DELETE' });
        } catch (e) {
          if (!e.status || e.status >= 500 || e.status === 429) { setOnline(!!e.status); break; } // net nahi / server so raha: baad mein
          if (e.status === 401) { cb.current.onUnauthorized?.(); break; }
          if (!(op.kind === 'delete' && e.status === 404)) cb.current.onError?.(e.message);
        }
        // Kaam ho gaya (ya server ne mana kar diya): line se hatao.
        // Agar bhejte waqt user ne isi entry ko badal diya tha, to woh tabdeeli agli baar "update" ban kar jaye.
        const now = qRef.current.find((o) => o.id === op.id);
        let next = qRef.current.filter((o) => o.id !== op.id);
        if (now && (now.rev || 0) !== (op.rev || 0) && now.kind !== 'delete') {
          next = [{ ...now, kind: 'update', rev: 0 }, ...next];
        }
        await saveQueue(next);
      }
    } finally {
      inflight.current = null;
      flushing.current = false;
      setSyncing(false);
    }
    await pull();
  }, [pull, saveQueue]);

  const enqueue = useCallback(async (op) => {
    await ready.current;
    const full = { ...op, id: newId(), rev: 0, at: Date.now() };
    let next = mergeOp(qRef.current, full);
    // Jo entry abhi server ko ja rahi hai, us ka delete line mein zaroor rahe
    const fly = inflight.current;
    if (op.kind === 'delete' && fly && fly.key === op.key) {
      next = [...next.filter((o) => o.key !== op.key), full];
    }
    await saveQueue(next);
    flush();
  }, [flush, saveQueue]);

  useEffect(() => { if (token) ready.current.then(flush); }, [token, flush]);

  // Net aaye/jaye
  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === 'visible' && flush();
    const msg = (e) => e.data?.type === 'refresh' && pull();
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    navigator.serviceWorker?.addEventListener('message', msg);
    const t = setInterval(() => (qRef.current.length ? flush() : pull()), 45000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
      navigator.serviceWorker?.removeEventListener('message', msg);
      clearInterval(t);
    };
  }, [flush, pull]);

  // Real-time: server jab bhi kuch badle, foran naya data
  useEffect(() => {
    if (!token || typeof EventSource === 'undefined') return;
    let es, retry;
    const open = () => {
      es = new EventSource('/api/stream?t=' + encodeURIComponent(token));
      es.addEventListener('hello', () => { setLive(true); setOnline(true); flush(); });
      es.addEventListener('change', () => pull());
      es.onerror = () => {
        setLive(false);
        if (es.readyState === EventSource.CLOSED) { clearTimeout(retry); retry = setTimeout(open, 5000); }
      };
    };
    open();
    return () => { clearTimeout(retry); es?.close(); };
  }, [token, pull, flush]);

  return { rows, activity, queue, online, live, syncing, enqueue, pull, flush };
}
