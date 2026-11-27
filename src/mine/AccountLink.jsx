// Dosti khata ki entry: paise mere kis account se gaye / mein aaye (sirf mujhe dikhta hai)
import { Lock } from 'lucide-react';
import { idOf } from '../../server/money.js';
import { kindMeta } from './meta';

export default function AccountLink({ accounts, value, onChange, dir }) {
  const list = (accounts || []).filter((a) => !a.archived && (a.currency || 'PKR') === 'PKR');
  if (!list.length || !dir) return null;
  return (
    <div className="field acc-link">
      <span className="field-label">{dir === 'out' ? 'Mere kis account se gaye?' : 'Mere kis account mein aaye?'} <small className="lock-note"><Lock size={11} /> sirf aap ko dikhega</small></span>
      <div className="chips" role="radiogroup">
        {list.map((a) => {
          const K = kindMeta(a.kind).icon;
          return <button type="button" key={idOf(a)} role="radio" aria-checked={value === idOf(a)} className={'chip' + (value === idOf(a) ? ' on' : '')} onClick={() => onChange(idOf(a))}><K size={14} /> {a.name}</button>;
        })}
        <button type="button" role="radio" aria-checked={!value} className={'chip ghost' + (!value ? ' on' : '')} onClick={() => onChange('')}>Koi nahi</button>
      </div>
    </div>
  );
}
