import { Utensils, Coffee, ShoppingBag, Fuel, Car, Receipt, Shirt, CircleDot, ArrowLeftRight } from 'lucide-react';

const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
export { LS };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-khata-token': LS.get('khata.token', ''),
      'x-khata-user': LS.get('khata.me', ''),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Internet check karein, phir dobara koshish karein.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const rs = (n) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-PK');
export const num = (n) => Math.round(Number(n) || 0).toLocaleString('en-PK');

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const thisMonth = () => today().slice(0, 7);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Itwaar', 'Peer', 'Mangal', 'Budh', 'Jumeraat', 'Juma', 'Hafta'];

export const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const monthShort = (key) => {
  const [y, m] = key.split('-').map(Number);
  return key.slice(0, 4) === thisMonth().slice(0, 4) ? MONTHS[m - 1] : `${SHORT[m - 1]} ${String(y).slice(2)}`;
};
export const dayLabel = (day) => {
  const t = today();
  const y = new Date(Date.parse(t) - 86400000).toISOString().slice(0, 10);
  if (day === t) return 'Aaj';
  if (day === y) return 'Kal';
  const d = new Date(day + 'T00:00:00');
  return `${d.getDate()} ${SHORT[d.getMonth()]}, ${DAYS[d.getDay()]}`;
};
export const shortDay = (day) => {
  const d = new Date(day + 'T00:00:00');
  return `${d.getDate()} ${SHORT[d.getMonth()]}`;
};

export const CATEGORIES = [
  { id: 'khana', label: 'Khana', icon: Utensils },
  { id: 'chai', label: 'Chai', icon: Coffee },
  { id: 'sauda', label: 'Sauda', icon: ShoppingBag },
  { id: 'petrol', label: 'Petrol', icon: Fuel },
  { id: 'kiraya', label: 'Kiraya', icon: Car },
  { id: 'bill', label: 'Bill', icon: Receipt },
  { id: 'kapray', label: 'Kapray', icon: Shirt },
  { id: 'other', label: 'Kuch aur', icon: CircleDot },
];
export const catOf = (id) => CATEGORIES.find((c) => c.id === id) || (id === 'payment' ? { id, label: 'Payment', icon: ArrowLeftRight } : CATEGORIES.at(-1));

export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };

export const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
