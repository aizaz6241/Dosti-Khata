// Backup: poora hisaab ek file mein phone par. Khud har kuch din baad, aur wapas lane ka tareeqa.
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Upload, ShieldCheck, Check } from 'lucide-react';
import { LS, today } from '../lib';

export const BK = 'khata.backup';
export const EVERY = [[0, 'Band'], [1, 'Roz'], [3, '3 din'], [7, 'Hafta'], [15, '15 din'], [30, 'Mahina']];
export const backupCfg = () => ({ every: 3, last: 0, ...(LS.get(BK, {}) || {}) });
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function buildBackup({ me, names, mine, rows }) {
  const strip = (x) => { const { pending, ...r } = x; return r; };
  return {
    app: 'dosti-khata', v: 1, at: new Date().toISOString(), me, name: names[me],
    mine: { accounts: mine.accounts.map(strip), ptx: mine.ptx.map(strip), contacts: mine.contacts.map(strip), links: (mine.links || []).map(strip), prefs: strip(mine.prefs || {}) },
    shared: (rows || []).filter((r) => r.createdBy === me).map(({ calc, history, edits, ...r }) => r),
  };
}

// File banao aur phone mein save (iPhone: share sheet > "Save to Files"; Android: Downloads)
export async function saveBackup(obj, { share = true } = {}) {
  const name = `dosti-khata-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  if (share) {
    try {
      const f = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: 'Dosti Khata backup' }); return 'shared'; }
    } catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export default function BackupSheet({ me, makeBackup, onRestore, say }) {
  const [cfg, setCfg] = useState(backupCfg());
  const [preview, setPreview] = useState(null);
  const file = useRef();
  const setEvery = (every) => { const c = { ...cfg, every }; setCfg(c); LS.set(BK, c); };
  const now = async () => {
    const r = await saveBackup(makeBackup());
    if (r !== 'cancel') { const c = { ...cfg, last: Date.now() }; setCfg(c); LS.set(BK, c); say(r === 'shared' ? 'Backup tayyar: "Save to Files" chuno' : 'Backup phone mein save ho gaya (Downloads)'); }
  };
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (obj?.app !== 'dosti-khata' || !obj.mine) throw new Error('Ye Dosti Khata ki backup file nahi.');
      if (obj.me !== me) throw new Error(`Ye backup ${obj.name || obj.me} ka hai, aap ka nahi.`);
      setPreview(obj);
    } catch (err) { say(err.message.includes('JSON') ? 'File sahi nahi (kharab ya koi aur file).' : err.message); }
  };
  const last = cfg.last ? new Date(cfg.last) : null;
  return (
    <div className="form backup">
      <div className="bk-top"><ShieldCheck size={22} /><span><b>{last ? `Aakhri backup: ${last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${last.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Abhi tak koi backup nahi'}</b><small>File mein: accounts, saare len-den, khate, budget, aur Abdullah wale khate ki aap ki entries</small></span></div>
      <motion.button whileTap={{ scale: 0.97 }} type="button" className="btn primary wide" onClick={now}><Download size={18} /> Abhi backup lo</motion.button>
      <div className="field">
        <span className="field-label">Khud backup kitne din baad?</span>
        <div className="bk-every">{EVERY.map(([d, l]) => <button type="button" key={d} className={cfg.every === d ? 'on' : ''} onClick={() => setEvery(d)}>{l}</button>)}</div>
        <p className="hint">{cfg.every ? (isIOS() ? `Har ${cfg.every === 1 ? 'din' : cfg.every + ' din'} baad app yaad dilayegi: ek tap se file "Files" mein save. (iPhone bina tap ke file save nahi karne deta.)` : `Har ${cfg.every === 1 ? 'din' : cfg.every + ' din'} baad app kholte hi file khud Downloads mein save ho jayegi.`) : 'Khud backup band hai.'}</p>
      </div>
      <div className="field">
        <span className="field-label">Backup se wapas lao</span>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={pick} />
        {!preview ? <button type="button" className="btn ghost wide" onClick={() => file.current.click()}><Upload size={18} /> Backup file chuno</button> : (
          <div className="bk-preview">
            <p><b>{new Date(preview.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</b> ka backup</p>
            <p className="hint">{preview.mine.accounts.length} accounts, {preview.mine.ptx.length} len-den, {preview.mine.contacts.length} bande, {preview.shared?.length || 0} khate ki entries.<br />Jo cheezein ab app mein nahi (mit gayi), woh wapas aa jayengi. Jo baad mein likhi, woh bhi rahengi. Kuch double nahi hoga.</p>
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => setPreview(null)}>Rehne do</button>
              <button type="button" className="btn primary" onClick={async () => { const n = await onRestore(preview); setPreview(null); say(n ? `${n} cheezein wapas aa gayi ✓` : 'Sab pehle se maujood tha, kuch wapas lane ki zaroorat nahi'); }}><Check size={17} /> Wapas lao</button>
            </div>
          </div>
        )}
      </div>
      <p className="hint">Backup file mein aap ka paisa ka hisaab hai: kisi ko na bhejein, aur WhatsApp par mat daalein.</p>
    </div>
  );
}
