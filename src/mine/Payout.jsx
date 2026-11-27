// Business payout: aap ka finance software payout record kare to seedha Binance (ya chuna hua) account mein aamdani
import { useEffect, useState } from 'react';
import { Copy, KeyRound, Link2, Trash2, Check } from 'lucide-react';
import { api } from '../lib';
import { idOf } from '../../server/money.js';

export default function PayoutSheet({ accounts, say }) {
  const [st, setSt] = useState(null);
  const [acc, setAcc] = useState(() => (accounts.find((a) => a.currency === 'USDT') ? idOf(accounts.find((a) => a.currency === 'USDT')) : ''));
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/me/hook').then(setSt).catch(() => setSt({ active: false, offline: true })); }, []);
  const url = `${location.origin}/api/hook/payout`;
  const accName = (id) => accounts.find((a) => idOf(a) === id);
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); say('Copy ho gaya'); } catch { say('Copy nahi hua, haath se select karo'); } };
  const make = async () => {
    setBusy(true);
    try { const r = await api('/me/hook', { method: 'POST', body: { accountId: acc } }); setKey(r.key); setSt({ active: true, accountId: r.accountId, hint: r.hint, count: 0 }); }
    catch (e) { say(e.message); }
    setBusy(false);
  };
  const off = async () => { setBusy(true); try { await api('/me/hook', { method: 'DELETE' }); setSt({ active: false }); setKey(''); say('Connection band, purani key ab kaam nahi karegi'); } catch (e) { say(e.message); } setBusy(false); };
  const a = st?.accountId ? accName(st.accountId) : null;
  const sample = JSON.stringify({ id: 'payout-2026-11', amount: 250, currency: a?.currency || 'USDT', date: '2026-11-30', note: 'November payout' }, null, 2);
  if (!st) return <p className="hint center">Load ho raha hai...</p>;
  if (st.offline) return <p className="hint center">Is ke liye internet chahiye.</p>;
  return (
    <div className="form payout">
      <p className="hint">Aap ka business software jab payout record kare, woh is app ko ek chhota sa message bheje. App khud "Aamdani" likh degi (Karobar), aur aap ko notification aayegi. Ek hi payout do dafa aaye to bhi ek hi baar likha jayega.</p>
      {!st.active || key ? null : (
        <div className="bk-top ok"><Link2 size={20} /><span><b>Connected: {a ? a.name : 'account mit gaya'}</b><small>Key ...{st.hint}. {st.count ? `${st.count} payout aa chuke` : 'Abhi tak koi payout nahi aaya'}{st.last ? `, aakhri ${new Date(st.last).toLocaleDateString('en-GB')}` : ''}</small></span></div>
      )}
      {(!st.active || key) && !key && (
        <div className="field">
          <span className="field-label">Payout kis account mein aaye?</span>
          <div className="chips">{accounts.filter((x) => !x.archived).map((x) => <button type="button" key={idOf(x)} className={'chip' + (acc === idOf(x) ? ' on' : '')} onClick={() => setAcc(idOf(x))}>{x.name} ({x.currency})</button>)}</div>
          <button type="button" className="btn primary wide" disabled={!acc || busy} onClick={make}><KeyRound size={17} /> Secret key banao</button>
        </div>
      )}
      {key && (
        <div className="key-box">
          <p className="b-msg warn">Ye key sirf abhi dikh rahi hai. Copy kar ke apne software mein (secret jagah) rakh lo.</p>
          <code className="code" onClick={() => copy(key)}>{key}</code>
          <button type="button" className="btn ghost wide" onClick={() => copy(key)}><Copy size={16} /> Key copy karo</button>
        </div>
      )}
      {st.active && (
        <div className="dev">
          <span className="field-label">Apne software ke developer ke liye</span>
          <p className="hint">Payout record hote hi ye request bhejo (HTTPS POST):</p>
          <code className="code" onClick={() => copy(url)}>POST {url}</code>
          <code className="code">Authorization: Bearer {key || 'dk_...(aap ki key)'}{'\n'}Content-Type: application/json</code>
          <code className="code pre">{sample}</code>
          <p className="hint"><b>id</b> har payout ka apna (dobara na aaye), <b>amount</b> zaroori, <b>currency</b> account wali ({a?.currency || 'USDT'}), <b>date</b> aur <b>note</b> agar chaho. Jawab 201 = likh diya, 200 duplicate = pehle se tha.</p>
          <button type="button" className="btn ghost wide" onClick={() => copy(`curl -X POST ${url} -H "Authorization: Bearer ${key || 'KEY'}" -H "Content-Type: application/json" -d '${JSON.stringify(JSON.parse(sample))}'`)}><Copy size={16} /> Poori misaal (curl) copy karo</button>
          <div className="form-actions">
            <button type="button" className="btn danger" disabled={busy} onClick={off}><Trash2 size={16} /> Connection band karo</button>
            {!key && <button type="button" className="btn ghost" disabled={busy} onClick={() => setSt({ ...st, active: false })}><KeyRound size={16} /> Nayi key</button>}
          </div>
        </div>
      )}
      {key && <button type="button" className="btn primary wide" onClick={() => setKey('')}><Check size={17} /> Key save kar li</button>}
    </div>
  );
}
