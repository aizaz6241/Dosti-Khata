import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Upar kone mein sync ka nishan:
// hara + lehrein = sab sync hai | laal = kuch sync baqi / server se rabta nahi | be-rang = offline
export default function SyncDot({ online, live, pending, syncing }) {
  const [tip, setTip] = useState(false);
  const state = !online ? 'off' : pending > 0 || syncing || !live ? 'warn' : 'ok';
  const text = state === 'ok' ? 'Sab sync hai. Har tabdeeli foran dono phones par.'
    : state === 'off' ? (pending ? `Offline. ${pending} ${pending === 1 ? 'entry' : 'entries'} phone mein mehfooz, net aate hi khud sync hongi.` : 'Offline. Net aate hi khud sync ho jayega.')
    : pending ? `${pending} ${pending === 1 ? 'entry' : 'entries'} sync ho rahi hain...` : 'Server se rabta ban raha hai...';
  return (
    <div className="syncdot-wrap">
      <button className={'syncdot ' + state} onClick={() => { setTip(true); setTimeout(() => setTip(false), 3200); }} aria-label={text}>
        <span className="core" />
        {state !== 'off' && <><span className="wave" /><span className="wave w2" /></>}
        {pending > 0 && <span className="count">{pending > 9 ? '9+' : pending}</span>}
      </button>
      <AnimatePresence>
        {tip && (
          <motion.div className="sync-tip" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{text}</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
