// Mera Hisaab ke labels aur icons
import {
  Utensils, ShoppingBasket, Coffee, House, Receipt, Car, Fuel, Shirt, Pill, Scissors, HeartHandshake, GraduationCap,
  MonitorSmartphone, Gift, Plane, CircleDot, Briefcase, Laptop, Store, RotateCcw, Wallet, Landmark, Smartphone, Bitcoin,
  PiggyBank, ArrowLeftRight, HandCoins, Undo2, ArrowDownLeft, ArrowUpRight, SlidersHorizontal,
} from 'lucide-react';

export const EXPENSE = [
  { id: 'khana', label: 'Khana', icon: Utensils },
  { id: 'sauda', label: 'Sauda / sabzi', icon: ShoppingBasket },
  { id: 'chai', label: 'Chai', icon: Coffee },
  { id: 'ghar', label: 'Ghar / kiraya', icon: House },
  { id: 'bill', label: 'Bills', icon: Receipt },
  { id: 'safar', label: 'Safar', icon: Car },
  { id: 'petrol', label: 'Petrol', icon: Fuel },
  { id: 'kapray', label: 'Kapray', icon: Shirt },
  { id: 'dawai', label: 'Sehat / dawai', icon: Pill },
  { id: 'salon', label: 'Baal / salon', icon: Scissors },
  { id: 'family', label: 'Ghar walon ko', icon: HeartHandshake },
  { id: 'taleem', label: 'Taleem', icon: GraduationCap },
  { id: 'online', label: 'Online / apps', icon: MonitorSmartphone },
  { id: 'tohfa', label: 'Tohfa', icon: Gift },
  { id: 'sair', label: 'Ghoomna', icon: Plane },
  { id: 'other', label: 'Kuch aur', icon: CircleDot },
];
export const INCOME = [
  { id: 'salary', label: 'Tankhwah', icon: Briefcase },
  { id: 'freelance', label: 'Freelance', icon: Laptop },
  { id: 'business', label: 'Karobar', icon: Store },
  { id: 'tohfa_in', label: 'Tohfa mila', icon: Gift },
  { id: 'refund', label: 'Wapsi / refund', icon: RotateCcw },
  { id: 'other_in', label: 'Kuch aur', icon: CircleDot },
];
export const KINDS = [
  { id: 'cash', label: 'Cash', icon: Wallet },
  { id: 'bank', label: 'Bank', icon: Landmark },
  { id: 'wallet', label: 'Mobile wallet', icon: Smartphone },
  { id: 'crypto', label: 'Crypto', icon: Bitcoin },
  { id: 'other', label: 'Kuch aur', icon: PiggyBank },
];
// Jaldi account banane ke liye
export const PRESETS = [
  { name: 'Cash', kind: 'cash', currency: 'PKR' },
  { name: 'Bank', kind: 'bank', currency: 'PKR' },
  { name: 'JazzCash', kind: 'wallet', currency: 'PKR' },
  { name: 'Easypaisa', kind: 'wallet', currency: 'PKR' },
  { name: 'SadaPay', kind: 'wallet', currency: 'PKR' },
  { name: 'NayaPay', kind: 'wallet', currency: 'PKR' },
  { name: 'Binance', kind: 'crypto', currency: 'USDT' },
];
export const CURRENCIES = ['PKR', 'USDT', 'USD', 'AED', 'SAR', 'GBP', 'EUR'];

export const TYPES = {
  expense: { label: 'Kharcha', icon: ArrowUpRight, sign: -1 },
  income: { label: 'Aamdani', icon: ArrowDownLeft, sign: 1 },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, sign: 0 },
  lend: { label: 'Qarz diya', icon: HandCoins, sign: -1 },
  borrow: { label: 'Qarz liya', icon: HandCoins, sign: 1 },
  got_back: { label: 'Wapas mila', icon: Undo2, sign: 1 },
  paid_back: { label: 'Wapas diya', icon: Undo2, sign: -1 },
  adjust: { label: 'Balance theek kiya', icon: SlidersHorizontal, sign: 1 },
};

export const catMeta = (t) => {
  if (t.type === 'expense') return EXPENSE.find((c) => c.id === t.category) || EXPENSE.at(-1);
  if (t.type === 'income') return INCOME.find((c) => c.id === t.category) || INCOME.at(-1);
  return { id: t.type, ...TYPES[t.type] };
};
export const kindMeta = (k) => KINDS.find((x) => x.id === k) || KINDS.at(-1);

export const money = (n, cur = 'PKR') => {
  const v = Number(n) || 0;
  const s = Math.abs(v) >= 1000 || Number.isInteger(v) ? Math.round(v).toLocaleString('en-PK') : v.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  return cur === 'PKR' ? `Rs ${s}` : `${s} ${cur}`;
};
export const moneyExact = (n, cur = 'PKR') => {
  const s = (Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
  return cur === 'PKR' ? `Rs ${s}` : `${s} ${cur}`;
};
