// Dosti Khata ki apni chhoti si dhun (app khuli ho tab). Phone ki notification awaaz web app badal nahi sakti.
let ctx = null;
const unlock = () => {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* awaaz na bhi ho to koi baat nahi */ }
};
if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
}

// Do narm ghantiyan, jaise "ting-tong" (sikke ki halki khankar)
export function chime() {
  try {
    unlock();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    [[1046.5, 0], [1568, 0.11], [2093, 0.22]].forEach(([f, t], i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, now + t);
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(i === 2 ? 0.35 : 0.9, now + t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + (i === 2 ? 0.5 : 0.38));
      o.connect(g); g.connect(master);
      o.start(now + t); o.stop(now + t + 0.6);
    });
  } catch { /* chup */ }
}
