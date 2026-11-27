// Halke, saaf SVG charts: donut (hissa), bars (raqam), line (raftar). Tap / hover par raqam.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { money } from './meta';

export const CAT_COLORS = ['#3442B8', '#E0A021', '#1A9E8F', '#E5604D', '#8B5CF6', '#3A9BDC']; // validator se pass
export const OTHER_COLOR = '#A3AABB';
const short = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1000 ? (v / 1000).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(v)));

/* ---------- Donut ---------- */
export function Donut({ items, total, centerLabel = 'Kul' }) {
  const [on, setOn] = useState(null);
  const R = 62, r = 42, C = 80;
  let a0 = -Math.PI / 2;
  const gap = items.length > 1 ? 0.025 : 0;
  const arcs = items.map((it, i) => {
    const frac = total > 0 ? it.v / total : 0;
    const a1 = a0 + frac * Math.PI * 2;
    const s = a0 + gap / 2, e = Math.max(s + 0.001, a1 - gap / 2);
    const large = e - s > Math.PI ? 1 : 0;
    const p = (ang, rad) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
    const [x1, y1] = p(s, R), [x2, y2] = p(e, R), [x3, y3] = p(e, r), [x4, y4] = p(s, r);
    const d = frac >= 0.999 ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} L ${C - 0.01} ${C - r} A ${r} ${r} 0 1 0 ${C} ${C - r} Z`
      : `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
    a0 = a1;
    return { ...it, d, i };
  });
  const cur = on != null ? items[on] : null;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut" role="img" aria-label="Kharche ka hissa">
        {arcs.map((a) => (
          <motion.path key={a.id} d={a.d} fill={a.color} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: on == null || on === a.i ? 1 : 0.28, scale: on === a.i ? 1.04 : 1 }}
            style={{ transformOrigin: '80px 80px', cursor: 'pointer' }} transition={{ duration: 0.25 }} onClick={() => setOn(on === a.i ? null : a.i)} onMouseEnter={() => setOn(a.i)} onMouseLeave={() => setOn(null)} />
        ))}
        <text x="80" y="74" textAnchor="middle" className="d-lab">{cur ? cur.label : centerLabel}</text>
        <text x="80" y="94" textAnchor="middle" className="d-val">{money(cur ? cur.v : total)}</text>
        {cur && <text x="80" y="110" textAnchor="middle" className="d-lab">{Math.round((cur.v / total) * 100)}%</text>}
      </svg>
      <ul className="d-legend">
        {items.map((it, i) => (
          <li key={it.id} className={on === i ? 'on' : ''} onClick={() => setOn(on === i ? null : i)}>
            <i style={{ background: it.color }} /><span>{it.label}</span><b>{money(it.v)}</b><small>{Math.round((it.v / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Bars ---------- */
export function Bars({ data, avg, highlight, height = 150, color = 'var(--pine-2)', fmt = money }) {
  const [on, setOn] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.v), avg || 0);
  const W = 340, H = height, pb = 20, pt = 22;
  const n = data.length; const slot = W / n; const bw = Math.max(3, Math.min(26, slot * 0.62));
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const labelEvery = n <= 8 ? 1 : n <= 16 ? 2 : n <= 31 ? 5 : Math.ceil(n / 6);
  const cur = on != null ? data[on] : null;
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} className="bars" role="img" aria-label="Raqam ka chart" onMouseLeave={() => setOn(null)}>
        <line x1="0" x2={W} y1={H - pb} y2={H - pb} className="axis" />
        {avg > 0 && <><line x1="0" x2={W} y1={y(avg)} y2={y(avg)} className="avg" /><text x={W} y={y(avg) - 4} textAnchor="end" className="avg-t">avg {short(avg)}</text></>}
        {data.map((d, i) => {
          const x = i * slot + (slot - bw) / 2; const h = Math.max(d.v > 0 ? 3 : 0, H - pb - y(d.v));
          const r = Math.min(4, bw / 2, h);
          const path = h <= 0 ? '' : `M ${x} ${H - pb} L ${x} ${H - pb - h + r} Q ${x} ${H - pb - h} ${x + r} ${H - pb - h} L ${x + bw - r} ${H - pb - h} Q ${x + bw} ${H - pb - h} ${x + bw} ${H - pb - h + r} L ${x + bw} ${H - pb} Z`;
          return (
            <g key={d.key} onClick={() => setOn(on === i ? null : i)} onMouseEnter={() => setOn(i)}>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {path && <motion.path d={path} fill={color} initial={{ opacity: 0 }} animate={{ opacity: on == null || on === i ? (highlight === d.key ? 1 : 0.9) : 0.35 }} transition={{ delay: Math.min(i, 30) * 0.012 }} />}
              {(i % labelEvery === 0 || n <= 8) && <text x={i * slot + slot / 2} y={H - 5} textAnchor="middle" className={'tick' + (highlight === d.key ? ' hi' : '')}>{d.label}</text>}
            </g>
          );
        })}
      </svg>
      <div className={'chart-tip' + (cur ? ' show' : '')}>{cur ? <><span>{cur.title || cur.label}</span><b>{fmt(cur.v)}</b></> : <span>Bar par tap karo</span>}</div>
    </div>
  );
}

/* ---------- Line: raftar (jama hota kharcha), is dafa vs pichli dafa ---------- */
export function PaceLine({ now, prev, limit, labels }) {
  const [on, setOn] = useState(null);
  const W = 340, H = 170, pl = 4, pr = 4, pt = 14, pb = 20;
  const n = Math.max(now.length, prev.length, 2);
  const max = Math.max(1, ...now, ...prev, limit || 0) * 1.08;
  const x = (i) => pl + ((W - pl - pr) * i) / (n - 1);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = now.length ? `${path(now)} L ${x(now.length - 1)} ${H - pb} L ${x(0)} ${H - pb} Z` : '';
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((('touches' in e ? e.touches[0].clientX : e.clientX) - r.left) / r.width) * W;
    setOn(Math.max(0, Math.min(n - 1, Math.round(((px - pl) / (W - pl - pr)) * (n - 1)))));
  };
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} className="pace" role="img" aria-label="Kharche ki raftar" onMouseMove={move} onTouchStart={move} onTouchMove={move} onMouseLeave={() => setOn(null)}>
        <defs><linearGradient id="paceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--pine-2)" stopOpacity=".22" /><stop offset="1" stopColor="var(--pine-2)" stopOpacity="0" /></linearGradient></defs>
        {[0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={y((max / 1.08) * f)} y2={y((max / 1.08) * f)} className="grid" />)}
        <line x1="0" x2={W} y1={H - pb} y2={H - pb} className="axis" />
        {limit > 0 && <><line x1="0" x2={W} y1={y(limit)} y2={y(limit)} className="limit" /><text x={W - 2} y={y(limit) - 5} textAnchor="end" className="limit-t">Budget {short(limit)}</text></>}
        {prev.length > 1 && <path d={path(prev)} className="l-prev" />}
        {area && <motion.path d={area} fill="url(#paceFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
        {now.length > 1 && <motion.path d={path(now)} className="l-now" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }} />}
        {now.length > 0 && <circle cx={x(now.length - 1)} cy={y(now.at(-1))} r="4.5" className="l-dot" />}
        {on != null && <line x1={x(on)} x2={x(on)} y1={pt} y2={H - pb} className="cross" />}
        {on != null && now[on] != null && <circle cx={x(on)} cy={y(now[on])} r="4" className="l-dot" />}
        <text x={pl} y={H - 5} className="tick">{labels[0]}</text>
        <text x={W - pr} y={H - 5} textAnchor="end" className="tick">{labels[1]}</text>
      </svg>
      <div className={'chart-tip' + (on != null ? ' show' : '')}>
        {on != null ? <><span>Din {on + 1}</span><b>{now[on] != null ? money(now[on]) : '–'}</b><small>pichli dafa {money(prev[on] ?? 0)}</small></> : <span>Line par ungli phirao</span>}
      </div>
      <div className="legend-row"><span><i className="sw-now" /> Is dafa</span><span><i className="sw-prev" /> Pichli dafa</span>{limit > 0 && <span><i className="sw-lim" /> Budget</span>}</div>
    </div>
  );
}
