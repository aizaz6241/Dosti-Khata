// Upar wala shisha-numa switch: "Mera" (apna paisa) ya dost ke saath wala khata
import { motion } from 'framer-motion';

export default function ModeSwitch({ mode, onChange, otherName, dot }) {
  const opts = [{ id: 'mera', label: 'Mera' }, { id: 'dosti', label: otherName }];
  return (
    <div className="mode-switch" role="tablist" aria-label="Kaun sa hisaab">
      {opts.map((o) => (
        <button key={o.id} role="tab" aria-selected={mode === o.id} className={mode === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {mode === o.id && <motion.span layoutId="mode-thumb" className="ms-thumb" transition={{ type: 'spring', stiffness: 520, damping: 34 }} />}
          <span className="ms-label">{o.label}</span>
          {o.id === 'dosti' && dot && <i className="ms-dot" />}
        </button>
      ))}
    </div>
  );
}
