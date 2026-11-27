// Data store: MONGODB_URI ho to MongoDB, warna local JSON file (sirf development ke liye).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const FIELDS = ['type', 'amount', 'note', 'category', 'date', 'paidBy', 'shares', 'split', 'from', 'to', 'createdBy', 'updatedBy'];
const pick = (o) => Object.fromEntries(FIELDS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

function mongoStore(uri) {
  const schema = new mongoose.Schema(
    {
      type: { type: String, enum: ['expense', 'payment'], required: true },
      amount: { type: Number, required: true, min: 0 },
      note: { type: String, default: '' },
      category: { type: String, default: 'other' },
      date: { type: String, required: true }, // YYYY-MM-DD
      paidBy: String,
      shares: { type: Object, default: {} },
      split: String,
      from: String,
      to: String,
      createdBy: String,
      updatedBy: String,
    },
    { timestamps: true, minimize: false }
  );
  const Entry = mongoose.models.Entry || mongoose.model('Entry', schema);
  const ready = mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'dosti_khata' });

  return {
    kind: 'mongodb',
    ready,
    all: async () => Entry.find().lean(),
    get: async (id) => Entry.findById(id).lean(),
    create: async (data) => (await Entry.create(pick(data))).toObject(),
    update: async (id, data) => Entry.findByIdAndUpdate(id, pick(data), { new: true }).lean(),
    remove: async (id) => Entry.findByIdAndDelete(id).lean(),
  };
}

function fileStore(file) {
  const load = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
  const save = (rows) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  };
  return {
    kind: 'file',
    ready: Promise.resolve(),
    all: async () => load(),
    get: async (id) => load().find((r) => r._id === id) || null,
    create: async (data) => {
      const rows = load();
      const now = new Date().toISOString();
      const row = { _id: crypto.randomBytes(12).toString('hex'), ...pick(data), createdAt: now, updatedAt: now };
      rows.push(row);
      save(rows);
      return row;
    },
    update: async (id, data) => {
      const rows = load();
      const i = rows.findIndex((r) => r._id === id);
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...pick(data), updatedAt: new Date().toISOString() };
      save(rows);
      return rows[i];
    },
    remove: async (id) => {
      const rows = load();
      const row = rows.find((r) => r._id === id);
      save(rows.filter((r) => r._id !== id));
      return row || null;
    },
  };
}

export function createStore() {
  const uri = process.env.MONGODB_URI;
  if (uri) return mongoStore(uri);
  return fileStore(process.env.DATA_FILE || path.resolve('data/entries.json'));
}
