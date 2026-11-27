import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export default function Sheet({ open, onClose, title, children, footer }) {
  // Sheet khula ho to peeche wala page bilkul na hile (iPhone par bhi)
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY; const b = document.body.style;
    const old = { position: b.position, top: b.top, left: b.left, right: b.right, overflow: b.overflow };
    Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', overflow: 'hidden' });
    return () => { Object.assign(b, old); window.scrollTo(0, y); };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="sheet-scrim" onClick={onClose} onTouchMove={(e) => e.preventDefault()} />
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}
          >
            <div className="sheet-grip" />
            <header className="sheet-head">
              <h2>{title}</h2>
              <button className="icon-btn" onClick={onClose} aria-label="Band karo"><X size={20} /></button>
            </header>
            <div className="sheet-body" onPointerDown={(e) => e.stopPropagation()}>{children}</div>
            {footer && <div className="sheet-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
