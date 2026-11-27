// Bol kar ya likh kar entry: AI sirf form bharta hai, save aap khud karte ho.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, Square, Send, Sparkles, WifiOff } from 'lucide-react';
import { api, today, nowTime } from '../lib';

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
const MAX_SECONDS = 25;

const toBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

export default function VoiceEntry({ otherName, online, onResult }) {
  const [state, setState] = useState('idle'); // idle | rec | think | error
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef(null);
  const stopTimer = useRef(null);
  const stream = useRef(null);
  const raf = useRef(0);
  const canRecord = typeof window !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  const cleanup = () => {
    cancelAnimationFrame(raf.current);
    clearInterval(stopTimer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  const send = async (body) => {
    setState('think'); setErr('');
    try {
      const r = await api('/ai/parse', { method: 'POST', body: { ...body, today: today() } });
      if (!r.items?.length) { setState('error'); setErr(r.question || 'Ye kharcha, payment ya qarz samajh nahi aaya. Dobara bolo ya haath se likho.'); return; }
      for (const it of r.items) if (!it.form.time) it.form.time = nowTime();
      onResult(r);
    } catch (e) {
      setState('error');
      setErr(e.status ? e.message : 'Net nahi hai ya server so raha hai. Thori der baad koshish karo.');
    }
  };

  const start = async () => {
    setErr('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        cleanup();
        const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
        if (blob.size < 1500) { setState('error'); setErr('Awaaz nahi aayi. Mic ke paas bolo.'); return; }
        send({ audio: await toBase64(blob), mime: blob.type });
      };
      rec.current = r;
      r.start();
      setState('rec'); setSecs(0);
      const started = Date.now();
      stopTimer.current = setInterval(() => {
        const sec = Math.floor((Date.now() - started) / 1000);
        setSecs(sec);
        if (sec >= MAX_SECONDS) stop();
      }, 250);
      // Awaaz ki unchai (lehrein dikhane ke liye)
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const an = ctx.createAnalyser(); an.fftSize = 256;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const tick = () => { an.getByteFrequencyData(buf); setLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128); raf.current = requestAnimationFrame(tick); };
        tick();
      } catch { /* lehrein na bhi hon to koi baat nahi */ }
    } catch {
      setState('error');
      setErr('Mic ki ijazat nahi mili. Phone ki settings mein is app ko mic ki ijazat do, ya neeche likh kar batao.');
    }
  };
  const stop = () => { if (rec.current?.state === 'recording') rec.current.stop(); };

  if (!online) {
    return <div className="voice"><p className="voice-off"><WifiOff size={18} /> AI ke liye internet chahiye. Abhi haath se likh lo, entry offline bhi save hogi.</p></div>;
  }

  return (
    <div className="voice">
      <p className="voice-hint">Apne andaz mein bolo, jaise: <i>"{otherName} ne sabzi wale ko 200 diye, aadha aadha"</i></p>

      {canRecord && (
        <div className="mic-area">
          <motion.button
            className={'mic ' + state}
            onClick={state === 'rec' ? stop : start}
            disabled={state === 'think'}
            whileTap={{ scale: 0.94 }}
            style={{ '--lvl': Math.min(1, level) }}
            aria-label={state === 'rec' ? 'Bas, rok do' : 'Bolna shuru karo'}
          >
            <span className="mic-ring" />
            {state === 'rec' ? <Square size={30} fill="currentColor" /> : state === 'think' ? <Sparkles size={34} className="spin-slow" /> : <Mic size={36} />}
          </motion.button>
          <p className="mic-label">
            {state === 'rec' ? `Sun raha hoon... ${secs}s (bol kar dobara dabao)` : state === 'think' ? 'Samajh raha hoon...' : 'Dabao aur bolo'}
          </p>
        </div>
      )}

      <div className="voice-or">{canRecord ? 'ya likh kar batao' : 'Likh kar batao'}</div>
      <form className="voice-text" onSubmit={(e) => { e.preventDefault(); if (text.trim() && state !== 'think') send({ text }); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Jaise: sabzi 50 jama 30, bijli 300, Abdullah ne diye aadha aadha" maxLength={600} disabled={state === 'think' || state === 'rec'} />
        <button className="icon-btn send" disabled={!text.trim() || state === 'think'} aria-label="Samjho"><Send size={19} /></button>
      </form>

      {err && <p className="err voice-err">{err}</p>}
      <p className="hint">AI sirf form bharega. Aap dekh kar khud "Save" karoge. Ye delete ya kuch badal nahi sakta.</p>
    </div>
  );
}
