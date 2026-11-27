import { Utensils, Coffee, ShoppingBasket, Fuel, Car, Receipt, Shirt, CircleDot, ArrowLeftRight, PartyPopper, Pill, Ticket, HandCoins } from 'lucide-react';

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
  { id: 'sauda', label: 'Sabzi / sauda', icon: ShoppingBasket },
  { id: 'program', label: 'Program', icon: PartyPopper },
  { id: 'petrol', label: 'Petrol', icon: Fuel },
  { id: 'kiraya', label: 'Kiraya', icon: Car },
  { id: 'bill', label: 'Bill', icon: Receipt },
  { id: 'kapray', label: 'Kapray', icon: Shirt },
  { id: 'dawai', label: 'Dawai', icon: Pill },
  { id: 'ticket', label: 'Ticket', icon: Ticket },
  { id: 'other', label: 'Kuch aur', icon: CircleDot },
];
const SPECIAL = { payment: { id: 'payment', label: 'Payment', icon: ArrowLeftRight }, loan: { id: 'loan', label: 'Qarz', icon: HandCoins } };
export const catOf = (id) => CATEGORIES.find((c) => c.id === id) || SPECIAL[id] || CATEGORIES.at(-1);

export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };

export const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// Screenshot ko chhota kar ke JPEG banao (taake jaldi upload ho)
export function compressImage(file, max = 1400, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ye image khul nahi saki.')); };
    img.src = url;
  });
}

export const fileUrl = (id) => `/api/files/${id}?t=${encodeURIComponent(LS.get('khata.token', ''))}`;
export const shotUrl = (e) => e.fileUrl || (e.fileId ? fileUrl(e.fileId) : null);

// Har entry ko "mere" nazariye se samjhao: sirf doosre ka hissa
export function view(e, me, names) {
  const otherId = Object.keys(names).find((p) => p !== me);
  const other = names[otherId];
  if (e.type === 'loan') {
    const mine = e.from === me;
    return {
      mine,
      amount: e.amount,
      line: mine ? `Aap ne ${other} ko qarz diya` : `${other} ne aap ko qarz diya`,
    };
  }
  if (e.type === 'payment') {
    const mine = e.from === me;
    return {
      mine,
      amount: e.amount,
      line: mine ? `Aap ne ${other} ko bheje` : `${other} ne aap ko bheje`,
    };
  }
  const mine = e.paidBy === me;
  if (e.calc.owed <= 0) return { mine, amount: e.amount, line: 'Aap ka apna kharcha', personal: true };
  return {
    mine,
    amount: e.calc.owed,
    line: mine ? `Aap ne ${other} ke liye diye` : `${other} ne aap ke liye diye`,
  };
}
// Apna (sirf ek ka) kharcha sirf usi ko dikhe jis ne kiya
export const visible = (me) => (e) => e.type !== 'expense' || e.calc.owed > 0 || e.paidBy === me || e.createdBy === me;
