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
    const shot = op.body.screenshot ? { fileUrl: op.body.screenshot } : op.body.removeScreenshot ? { fileUrl: null, fileId: null } : {};
    const data = { ...normalize(op.body, ids), ...shot, pending: true };
    if (op.kind === 'create' && i < 0) out.push({ ...data, _id: op.key, clientId: op.key, createdBy: me, createdAt: new Date(op.at).toISOString() });
    else if (i >= 0) out[i] = { ...out[i], ...data };
  }
  return out;
}

// Line mein naya kaam jodo, purane kaam ke saath mila kar
function mergeOp(queue, op) {
  const q = [...queue];
  const idx = (kind) => q.findIndex((o) => o.key === op.key && o.kind === kind);
  if (op.kind === 'create') return [...q, op];
  const c = idx('create');
  if (op.kind === 'update') {
    if (c >= 0) { q[c] = { ...q[c], body: mergeBody(q[c].body, op.body) }; return q; }
    const u = idx('update');
    if (u >= 0) { q[u] = { ...q[u], body: mergeBody(q[u].body, op.body), at: op.at }; return q; }
    return [...q, op];
  }
  // delete
  if (c >= 0) return q.filter((o) => o.key !== op.key); // server tak gaya hi nahi tha
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
  const [queue, setQueue] = useState([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [live, setLive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const qRef = useRef([]);
  const flushing = useRef(false);
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
      setOnline(true);
    } catch (e) {
      if (e.status === 401) cb.current.onUnauthorized?.();
      else if (!e.status) setOnline(false);
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !LS.get('khata.token')) return;
    flushing.current = true;
    setSyncing(true);
    try {
      while (qRef.current.length) {
        const op = qRef.current[0];
        try {
          if (op.kind === 'create') await api('/entries', { method: 'POST', body: { ...op.body, clientId: op.key } });
          else if (op.kind === 'update') await api('/entries/' + encodeURIComponent(op.key), { method: 'PUT', body: op.body });
          else await api('/entries/' + encodeURIComponent(op.key), { method: 'DELETE' });
        } catch (e) {
          if (!e.status || e.status >= 500 || e.status === 429) { setOnline(!!e.status); break; } // net nahi / server so raha: baad mein
          if (e.status === 401) { cb.current.onUnauthorized?.(); break; }
          if (!(op.kind === 'delete' && e.status === 404)) cb.current.onError?.(e.message);
        }
        // kaam ho gaya (ya server ne mana kar diya): line se hatao
        await saveQueue(qRef.current.filter((o) => o !== op));
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
    await pull();
  }, [pull, saveQueue]);

  const enqueue = useCallback(async (op) => {
    const full = { ...op, at: Date.now() };
    await saveQueue(mergeOp(qRef.current, full));
    flush();
  }, [flush, saveQueue]);

  // Shuru mein: phone mein rakhi line load karo
  useEffect(() => {
    (async () => {
      let q = [];
      try { q = (await idbGet(QUEUE)) || []; } catch { q = LS.get(QUEUE, []); }
      qRef.current = q;
      setQueue(q);
      if (token) flush();
    })();
  }, [token, flush]);

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

  return { rows, queue, online, live, syncing, enqueue, pull, flush };
}
