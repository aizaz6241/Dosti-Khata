import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

// Tarazu: jis ka paisa zyada laga hai (jis ko milna hai), us ka palra neeche.
// left = main (me), right = doosra
export default function Tarazu({ meName, otherName, meColor, otherColor, tilt }) {
  const angle = useSpring(0, { stiffness: 60, damping: 9, mass: 1.2 });
  useEffect(() => { angle.set(tilt); }, [tilt, angle]);

  const W = 320, cx = 160, cy = 46, half = 112, hang = 46;
  const rad = useTransform(angle, (a) => (a * Math.PI) / 180);
  const lx = useTransform(rad, (r) => cx - half * Math.cos(r));
  const ly = useTransform(rad, (r) => cy - half * Math.sin(r));
  const rx = useTransform(rad, (r) => cx + half * Math.cos(r));
  const ry = useTransform(rad, (r) => cy + half * Math.sin(r));
  const lPan = useTransform([lx, ly], ([x, y]) => `translate(${x - (cx - half)}px, ${y - cy}px)`);
  const rPan = useTransform([rx, ry], ([x, y]) => `translate(${x - (cx + half)}px, ${y - cy}px)`);
  const lHangY = useTransform(ly, (y) => y + hang);
  const rHangY = useTransform(ry, (y) => y + hang);

  return (
    <svg className="tarazu" viewBox={`0 0 ${W} 170`} role="img" aria-label="Hisaab ka tarazu">
      {/* stand */}
      <line x1={cx} y1={cy} x2={cx} y2={152} className="tz-post" />
      <path d={`M${cx - 38} 156 Q${cx} 144 ${cx + 38} 156 Z`} className="tz-base" />
      {/* strings */}
      <motion.line x1={lx} y1={ly} x2={lx} y2={lHangY} className="tz-string" />
      <motion.line x1={rx} y1={ry} x2={rx} y2={rHangY} className="tz-string" />
      {/* beam */}
      <motion.line x1={lx} y1={ly} x2={rx} y2={ry} className="tz-beam" />
      <circle cx={cx} cy={cy} r="6" className="tz-pivot" />
      {/* pans */}
      <motion.g style={{ transform: lPan }}>
        <Pan x={cx - half} y={cy + hang} color={meColor} label={meName} />
      </motion.g>
      <motion.g style={{ transform: rPan }}>
        <Pan x={cx + half} y={cy + hang} color={otherColor} label={otherName} />
      </motion.g>
    </svg>
  );
}

function Pan({ x, y, color, label }) {
  return (
    <g>
      <circle cx={x} cy={y - 15} r="15" fill={color} />
      <text x={x} y={y - 10} textAnchor="middle" className="tz-initial">{label[0]}</text>
      <path d={`M${x - 40} ${y} Q${x} ${y + 26} ${x + 40} ${y} Z`} className="tz-pan" />
      <text x={x} y={y + 42} textAnchor="middle" className="tz-name">{label}</text>
    </g>
  );
}
