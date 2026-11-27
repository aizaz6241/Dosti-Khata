// Data store: MONGODB_URI ho to MongoDB, warna local JSON files (sirf development ke liye).
// Teen collections: entries (kharche/payments), users (accounts + PIN), files (payment screenshots)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const ENTRY_FIELDS = ['clientId', 'type', 'amount', 'note', 'category', 'date', 'time', 'paidBy', 'shares', 'split', 'from', 'to', 'createdBy', 'updatedBy', 'fileId', 'fileUrl', 'fileKey'];

function mongoStore(uri) {
  const Entry = mongoose.models.Entry || mongoose.model('Entry', new mongoose.Schema(
    {
      type: { type: String, enum: ['expense', 'payment', 'loan'], required: true },
      amount: { type: Number, required: true, min: 0 },
      note: { type: String, default: '' },
      category: { type: String, default: 'other' },
      date: { type: String, required: true }, // YYYY-MM-DD
      time: String, // HH:mm (Pakistan time)
      paidBy: String,
      shares: { type: Object, default: {} },
      split: String,
      from: String,
      to: String,
      createdBy: String,
      updatedBy: String,
      clientId: { type: String, index: { unique: true, sparse: true } },
      fileId: String,
      fileUrl: String,
      fileKey: String,
    },
    { timestamps: true, minimize: false }
  ));
  const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema(
    { _id: String, name: String, pinHash: String, pinSalt: String },
    { timestamps: true }
  ));
  const File = mongoose.models.File || mongoose.model('File', new mongoose.Schema(
    { mime: String, size: Number, data: Buffer, by: String },
    { timestamps: true }
  ));

  const Sub = mongoose.models.Sub || mongoose.model('Sub', new mongoose.Schema(
    { user: String, endpoint: { type: String, unique: true }, keys: Object, ua: String },
    { timestamps: true }
  ));
  const Meta = mongoose.models.Meta || mongoose.model('Meta', new mongoose.Schema({ _id: String, value: mongoose.Schema.Types.Mixed }));

  const repo = (M, fields) => ({
    all: async (q = {}) => M.find(q).lean(),
    find: async (q) => M.findOne(q).lean(),
    get: async (id) => M.findById(id).lean(),
    create: async (data) => (await M.create(fields ? pick(data, fields) : data)).toObject(),
    update: async (id, data) => M.findByIdAndUpdate(id, fields ? pick(data, fields) : data, { new: true }).lean(),
    remove: async (id) => M.findByIdAndDelete(id).lean(),
  });

  return {
    kind: 'mongodb',
    ready: mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'dosti_khata' }),
    entries: repo(Entry, ENTRY_FIELDS),
    users: repo(User),
    files: repo(File),
    subs: repo(Sub),
    meta: repo(Meta),
  };
}

function pick(o, fields) {
  const out = Object.fromEntries(fields.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  for (const k of fields) if (o[k] === null) out[k] = null;
  return out;
}

function fileRepo(file, fields, idGiven = false) {
  const load = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
  const save = (rows) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(rows)); };
  const match = (r, q) => Object.entries(q).every(([k, v]) => r[k] === v);
  return {
    all: async (q = {}) => load().filter((r) => match(r, q)),
    find: async (q) => load().find((r) => match(r, q)) || null,
    get: async (id) => load().find((r) => r._id === id) || null,
    create: async (data) => {
      const rows = load();
      const now = new Date().toISOString();
      const clean = fields ? pick(data, fields) : { ...data };
      if (clean.data && Buffer.isBuffer(clean.data)) clean.data = clean.data.toString('base64');
      const row = { _id: idGiven && data._id ? data._id : crypto.randomBytes(12).toString('hex'), ...clean, createdAt: now, updatedAt: now };
      rows.push(row); save(rows);
      return row;
    },
    update: async (id, data) => {
      const rows = load();
      const i = rows.findIndex((r) => r._id === id);
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...(fields ? pick(data, fields) : data), updatedAt: new Date().toISOString() };
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
  if (process.env.MONGODB_URI) return mongoStore(process.env.MONGODB_URI);
  const dir = path.resolve(process.env.DATA_DIR || 'data');
  return {
    kind: 'file',
    ready: Promise.resolve(),
    entries: fileRepo(path.join(dir, 'entries.json'), ENTRY_FIELDS),
    users: fileRepo(path.join(dir, 'users.json'), null, true),
    files: fileRepo(path.join(dir, 'files.json'), null),
    subs: fileRepo(path.join(dir, 'subs.json'), null),
    meta: fileRepo(path.join(dir, 'meta.json'), null, true),
  };
}
