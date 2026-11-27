// Mera Hisaab ke labels aur icons
import {
  Utensils, ShoppingBasket, Coffee, House, Receipt, Car, Fuel, Shirt, Pill, Scissors, HeartHandshake, GraduationCap,
  MonitorSmartphone, Gift, Plane, CircleDot, Briefcase, Laptop, Store, RotateCcw, Wallet, Landmark, Smartphone, Bitcoin,
  PiggyBank, ArrowLeftRight, HandCoins, Undo2, ArrowDownLeft, ArrowUpRight, SlidersHorizontal, Users,
  Tag, Gamepad2, Dumbbell, Baby, PawPrint, Wifi, Wrench, BookOpen, Music, Heart, Sparkles, Cigarette, Zap, Droplets, Bike, Gem, Camera, Dog,
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
  khata_out: { label: 'Dosti khata', icon: Users, sign: -1 },
  khata_in: { label: 'Dosti khata', icon: Users, sign: 1 },
};

// Apni banai hui categories (prefs mein save hoti hain)
export const CUSTOM_ICONS = { Tag, Gamepad2, Dumbbell, Baby, PawPrint, Wifi, Wrench, BookOpen, Music, Heart, Sparkles, Cigarette, Zap, Droplets, Bike, Gem, Camera, Dog, Gift, Plane, Coffee, Car, Laptop, Store };
let CUSTOM = [];
export const setCustomCats = (list) => { CUSTOM = (list || []).map((c) => ({ ...c, icon: CUSTOM_ICONS[c.icon] || Tag, iconName: c.icon, custom: true })); };
export const catList = (kind) => {
  const base = kind === 'income' ? INCOME : EXPENSE;
  const mine = CUSTOM.filter((c) => c.kind === kind);
  return [...base.slice(0, -1), ...mine, base.at(-1)]; // "Kuch aur" aakhir mein
};
export const catInfo = (id, kind = 'expense') => {
  const base = kind === 'income' ? INCOME : EXPENSE;
  return base.find((c) => c.id === id) || CUSTOM.find((c) => c.id === id) || base.at(-1);
};

export const catMeta = (t) => {
  if (t.type === 'expense') return catInfo(t.category, 'expense');
  if (t.type === 'income') return catInfo(t.category, 'income');
  return { id: t.type, ...TYPES[t.type] };
};
export const kindMeta = (k) => KINDS.find((x) => x.id === k) || KINDS.at(-1);

export const money = (n, cur = 'PKR') => {
  const v = Number(n) || 0;
  const s = Math.abs(v) >= 1000 || Number.isInteger(v) ? Math.round(v).toLocaleString('en-PK') : v.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  const neg = v < 0 && s !== '0' ? '-' : '';
  const a = neg ? s.replace('-', '') : s;
  return cur === 'PKR' ? `${neg}Rs ${a}` : `${neg}${a} ${cur}`;
};
export const moneyExact = (n, cur = 'PKR') => {
  const s = (Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
  return cur === 'PKR' ? `Rs ${s}` : `${s} ${cur}`;
};
