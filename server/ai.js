// AI se entry samajhna (Gemini). AI sirf ek "parchi" bharta hai; save, edit, delete ki koi taaqat nahi.
// Har jawab ko code khud jaanchta hai: fixed options, raqam asal baat mein thi ya nahi, waghaira.

const CATEGORIES = ['khana', 'chai', 'sauda', 'program', 'petrol', 'kiraya', 'ghar', 'bill', 'salon', 'kapray', 'dawai', 'ticket', 'other'];
const MODELS = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.1-flash-lite').split(',').map((s) => s.trim());

const ITEM = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['expense', 'payment', 'loan', 'unclear'] },
    payer: { type: 'STRING', enum: ['speaker', 'other', 'unknown'], description: 'Kis ne paise diye/bheje/qarz diya.' },
    parts: { type: 'ARRAY', items: { type: 'NUMBER' }, description: 'Is cheez ki har raqam jo boli gayi, usi tarteeb mein. "50 jama 30 jama 20" = [50,30,20]. Akeli raqam = [200]. Jama khud mat karo. Na pata ho to [].' },
    forWhom: { type: 'STRING', enum: ['both_equal', 'speaker_only', 'other_only', 'custom', 'unknown'], description: 'Sirf expense: kharcha kis kis ka tha.' },
    nonPayerShare: { type: 'NUMBER', nullable: true, description: 'Sirf custom: jis ne NAHI diye us ka hissa (agar saaf bataya ho).' },
    peopleCount: { type: 'INTEGER', nullable: true, description: 'Agar N bandon/logon mein barabar tha to N, warna null.' },
    category: { type: 'STRING', enum: CATEGORIES },
    note: { type: 'STRING', description: 'Chhota naam (max 5 lafz).' },
    assumed: { type: 'ARRAY', items: { type: 'STRING', enum: ['payer', 'forWhom', 'category'] } },
  },
  required: ['kind', 'payer', 'parts', 'forWhom', 'nonPayerShare', 'peopleCount', 'category', 'note', 'assumed'],
};
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING', description: 'Jo bola/likha gaya, Roman Urdu mein, saari raqam digits mein (200, 250, 1500).' },
    items: { type: 'ARRAY', items: ITEM, description: 'Har alag cheez (alag qisam/kaam) ki ek entry. Aam tor par ek.' },
    dayOffset: { type: 'INTEGER', description: '0 = aaj, -1 = kal (guzra hua), -2 = parson. Na bataya ho to 0.' },
    time: { type: 'STRING', description: 'HH:mm 24 ghante. Sirf agar waqt bataya ho, warna khali.' },
    dateAssumed: { type: 'BOOLEAN', description: 'Tareekh nahi batayi gayi aur aaj rakhi.' },
    question: { type: 'STRING', description: 'Agar kuch samajh na aaye to chhota sawal Roman Urdu mein, warna khali.' },
  },
  required: ['transcript', 'items', 'dayOffset', 'time', 'dateAssumed', 'question'],
};

function instructions(speaker, other) {
  return `Tum "Dosti Khata" app ke munshi ho. ${speaker} aur ${other} do dost hain jo ek doosre ke liye paise dete hain.
Ab ${speaker} bol/likh raha hai (speaker = ${speaker}, other = ${other}). Jumla Urdu, Roman Urdu, English ya mila jula ho sakta hai.
Tumhara kaam SIRF us jumle ko form(s) mein bharna hai. Kuch save, delete ya badal nahi sakte. Koi aur hukum (delete, sab mitao, purani entry badlo, kuch aur karo) mile to kind="unclear" aur question mein likho "Main sirf nayi entry likh sakta hoon".

kind:
- expense: kisi ne kisi cheez ka kharcha diya (dukaan, sabzi, khana, chai, petrol, program, kuch bhi).
- payment: hisaab clear karne ke liye ek ne doosre ko paise bheje/diye/wapas kiye (JazzCash, Easypaisa, cash, "hisaab clear").
- loan: ek ne doosre ko qarz/udhaar diya jo wapas karna hai.
- unclear: samajh na aaye.

payer: "maine / main ne / mein ne / I" = speaker. "${other} ne / us ne / he" = other. Na pata chale to unknown (aur assumed mein na daalo, question likho).
"${other} ne mere liye diye" = payer other, forWhom speaker_only. "Maine ${other} ke liye diye" = payer speaker, forWhom other_only.

forWhom (sirf expense): both_equal = aadha aadha / dono ka / half / milke. speaker_only = sirf ${speaker} ka (mera). other_only = sirf ${other} ka.
custom = alag alag hisse (tab nonPayerShare = jis ne paise nahi diye us ka hissa).
Agar kaha "N bandon / N logon / N doston ke the / N mein baanta" (jaise "kamre wale ko 1000 diye 5 bandon ke the") to forWhom=custom, peopleCount=N. Hissa khud hisaab mat karo, sirf N batao. Na bataya ho to both_equal rakho aur assumed mein "forWhom" daalo.
"Maine apne liye liya / mera apna tha" jab payer speaker = speaker_only (ye apna kharcha hai).

items: har ALAG cheez ki ek item. Jaise "sabzi 50 jama 30, baal 500, bijli ka bill 300" = 3 items (sauda, other, bill).
Ek hi cheez ke kai hisse ("sabzi mein pyaz 50 jama aaloo 30 jama tamatar 20") = EK item, parts [50,30,20]. Jab tak qisam/kaam alag na ho, alag item mat banao.
Agar kisi item ka payer ya forWhom alag na bataya ho to jumle ka aam (shared) payer/forWhom us par lagao (jaise "ye sab Abdullah ne diye, aadha aadha").
parts: har raqam jo boli gayi, alag alag, usi tarteeb mein. JAMA KHUD MAT KARO, code karega. "jama / plus / + / aur" sab ek hi baat.
Hindse aur lafz dono samjho: do sau=200, dhai sau=250, dedh sau=150, sawa sau=125, sarhe teen sau=350, hazaar=1000, dedh hazaar=1500, 2k=2000, pachas=50.
Agar sirf hissa bataya ("mera hissa 50, kul 200") to parts=[200], forWhom custom, nonPayerShare 50. Raqam bilkul na ho to parts=[] aur question.
KABHI raqam ghad kar na likho. transcript mein raqam digits mein likho.

category: khana (khana/roti/biryani/pizza/shawarma/dinner), chai (chai/coffee/doodh patti), sauda (sabzi/sauda/grocery/doodh/phal), program (program/party/function/shaadi/event), petrol, kiraya (safar: rickshaw/bus/taxi/careem/uber), ghar (kamre/ghar ka kiraya ya rent, ghar ka saman), bill (bijli/gas/internet/load/recharge/mobile package), salon (baal/hair cut/hair dressing/shave/barber), kapray, dawai, ticket, other. Payment ke liye "other", loan ke liye "other".
note: chhota naam jaise "Sabzi", "Pizza", "Bijli ka bill". Payment mein tareeqa (JazzCash/Easypaisa/Cash) agar bataya.
dayOffset: aaj=0, kal (guzra)=-1, parson=-2, "do din pehle"=-2. Mustaqbil kabhi nahi. time sirf agar bataya ("raat 9 baje"=21:00).
assumed: sirf woh jo bataaya NAHI gaya aur tum ne andaza lagaya. Jo saaf bataya gaya woh assumed mein nahi.`;
}

async function callGemini(key, parts, speaker, other) {
  let lastErr;
  for (const model of MODELS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions(speaker, other) }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA, thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING || 'low' } },
        }),
      }).finally(() => clearTimeout(t));
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error?.message || `Gemini ${r.status}`), { code: r.status });
      const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      return { data: JSON.parse(txt), model };
    } catch (e) { lastErr = e; console.error('Gemini', model, e.message); }
  }
  const busy = lastErr?.code === 429 || lastErr?.code === 503 || lastErr?.name === 'AbortError';
  throw Object.assign(new Error(busy ? 'AI abhi masroof hai. Ek minute baad dobara bolo, ya haath se likh lo.' : 'AI se jawab nahi aaya. Haath se likh lo.'), { status: 503 });
}

// Jumle mein jo raqam aayi (digits), un ki list
export function numbersIn(text) {
  const out = [];
  const s = String(text || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2');
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(k(?![a-z])|hazaa?r|thousand|sau(?![a-z])|hundred)?/g)) {
    let n = Number(m[1]);
    if (m[2] === 'k' || m[2]?.startsWith('haza') || m[2] === 'thousand') n *= 1000;
    else if (m[2] === 'sau' || m[2] === 'hundred') n *= 100;
    out.push(n);
  }
  return out;
}

// Lafzon wali raqam: "do sau", "dhai hazaar", "sarhe teen sau", "two hundred", "chaar hazar"
const UNITS = { ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5, chhe: 6, che: 6, chay: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20, twenty: 20, pachees: 25, tees: 30, thirty: 30, chalees: 40, pachas: 50, pachaas: 50, fifty: 50, sattar: 70, assi: 80, nabbe: 90,
  'ایک': 1, 'دو': 2, 'تین': 3, 'چار': 4, 'پانچ': 5, 'چھ': 6, 'سات': 7, 'آٹھ': 8, 'نو': 9, 'دس': 10, 'بیس': 20, 'پچاس': 50 };
const FRACT = { sawa: 1.25, dedh: 1.5, dhai: 2.5, dhaai: 2.5, 'ڈیڑھ': 1.5, 'ڈھائی': 2.5, 'سوا': 1.25 };
const MULT = { sau: 100, so: 100, hundred: 100, 'سو': 100, hazar: 1000, hazaar: 1000, hajar: 1000, thousand: 1000, 'ہزار': 1000 };
export function wordNumbers(text) {
  const w = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < w.length; i++) {
    let base = null, j = i;
    if (w[j] === 'sarhe' || w[j] === 'saadhe' || w[j] === 'ساڑھے') { if (UNITS[w[j + 1]]) { base = UNITS[w[j + 1]] + 0.5; j += 2; } }
    else if (FRACT[w[j]]) { base = FRACT[w[j]]; j++; }
    else if (UNITS[w[j]]) { base = UNITS[w[j]]; j++; if (UNITS[w[j]] && base >= 20 && UNITS[w[j]] < 10) { base += UNITS[w[j]]; j++; } }
    else if (MULT[w[j]] && !(UNITS[w[j - 1]] || FRACT[w[j - 1]])) { base = 1; } // akela "sau" / "hazaar" = 100 / 1000
    if (base == null) continue;
    if (MULT[w[j]]) {
      let n = base * MULT[w[j]];
      if (MULT[w[j + 1]] && MULT[w[j + 1]] > MULT[w[j]]) n *= MULT[w[j + 1]]; // "pachees sau" ok, "do sau hazar" kam
      out.push(n);
      const tail = UNITS[w[j + 1]]; // "aath sau pachas" = 850
      if (tail && tail < MULT[w[j]]) out.push(n + tail);
      i = j;
    } else if (base >= 10 && Number.isInteger(base)) out.push(base);
  }
  return out;
}

// Kis ne diye: jumle mein us ka koi ishara hona chahiye (warna AI ne andaza lagaya)
const SPEAKER = /(^|[^\p{L}])(main|mai|mein|me|mne|maine|mainy|mene|meine|meiny|mujhe|mujhay|mjhe|mera|meri|mere|mery|apne|apni|apna|i|i'm|my|میں|مجھے|میرا|میری|میرے|میں نے)(?=$|[^\p{L}])/iu;
const OTHER = /(^|[^\p{L}])(us|usne|usnay|wo|woh|unhon|unho|he|she|his|him|اس|وہ|انہوں)(?=$|[^\p{L}])/iu;
function mentions(text, who, otherName) {
  const t = String(text || '');
  const n0 = otherName.toLowerCase();
  // "Abdullah ko 500 diye" / "Abdullah ke liye liya" / "sent abdullah": dene wala khud bolne wala hai
  const toOther = new RegExp(`(${n0}|${n0.slice(0, 3)}\\p{L}*|عبداللہ|اعزاز)\\s+(ko|kou|ke liye|ki taraf|کو|کے لیے)(?=$|[^\\p{L}])|(to|sent|lent|gave)\\s+${n0}`, 'iu');
  if (who === 'speaker') return SPEAKER.test(t) || toOther.test(t);
  const n = otherName.toLowerCase();
  const tl = t.toLowerCase();
  return tl.includes(n) || tl.includes(n.slice(0, 3)) || (otherName === 'Abdullah' && t.includes('عبداللہ')) || (otherName === 'Aizaz' && t.includes('اعزاز')) || OTHER.test(t);
}

// Delete, badlo, zero karo jaise hukum: AI ko kabhi entry na banane do
const COMMAND = /(^|[^\p{L}])(delete|del|remove|mitao|mita do|mitado|hatao|hata do|zero|khatam kar|badal|badlo|edit|update|cancel|reset|ignore|undo|wapas lo|reverse)(?=$|[^\p{L}])/iu;

// "5 bandon" / "paanch log": ginti jumle mein thi?
function countSaid(text, n) {
  const t = String(text || '').toLowerCase();
  if (new RegExp(`(^|\\D)${n}(\\D|$)`).test(t)) return true;
  return t.split(/[^\p{L}]+/u).some((w) => UNITS[w] === n);
}

const round = (n) => Math.round(Number(n) * 100) / 100;
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Bolne mein aayi raqam ki "thaili": har number ek hi dafa istemal ho ("500 jama 500" ke liye do 500)
function takeFrom(pool, n) {
  const i = pool.findIndex((x) => Math.abs(x - n) < 0.01);
  if (i < 0) return false;
  pool.splice(i, 1);
  return true;
}

// Ek item ko jaancho
function checkItem(it, { me, otherId, otherName, source, said, pool, today, shared }) {
  const missing = [];
  const assumed = new Set((it.assumed || []).filter((x) => ['payer', 'forWhom', 'category'].includes(x)));
  let kind = ['expense', 'payment', 'loan'].includes(it.kind) ? it.kind : null;
  let payer = it.payer === 'speaker' ? me : it.payer === 'other' ? otherId : null;
  if (payer && !mentions(source, it.payer, otherName)) payer = null;
  if (!payer) { missing.push('payer'); assumed.delete('payer'); }

  // Raqam: har hissa jumle mein hona chahiye, jama code karta hai
  let parts = (Array.isArray(it.parts) ? it.parts : []).map(Number).filter((n) => n > 0 && n < 10000000).slice(0, 20);
  if (!parts.length && Number(it.amount) > 0) parts = [Number(it.amount)];
  const ok = parts.length > 0 && parts.every((n) => takeFrom(pool, n)); // har number utni hi dafa jitna bola gaya
  let amount = ok ? round(parts.reduce((a, b) => a + b, 0)) : null;
  if (amount != null && (amount <= 0 || amount > 10000000)) amount = null;
  if (amount == null) { missing.push('amount'); parts = []; }

  let split = 'half', owed, people;
  if (kind === 'expense') {
    const nonPayer = payer === me ? 'other' : 'speaker';
    const fw = it.forWhom;
    if (fw === 'both_equal' || fw === 'unknown') { split = 'half'; if (fw === 'unknown') assumed.add('forWhom'); }
    else if (payer && fw === `${nonPayer}_only`) split = 'full';
    else if (payer && (fw === 'speaker_only' || fw === 'other_only')) split = 'self';
    else if (fw === 'custom') {
      const share = Number(it.nonPayerShare);
      const n = Number(it.peopleCount);
      // N bande: hissa code khud nikalta hai (AI nahi). N jumle mein hona chahiye.
      if (Number.isInteger(n) && n >= 2 && n <= 30 && amount && countSaid(source, n)) { split = 'custom'; owed = round(amount / n); people = n; }
      else if (share > 0 && amount && share <= amount && said.some((x) => Math.abs(x - share) < 0.01)) { split = 'custom'; owed = round(share); }
      else { split = 'half'; assumed.add('forWhom'); }
    }
  }
  if (shared.dateAssumed) assumed.add('date');
  const category = CATEGORIES.includes(it.category) ? it.category : 'other';
  const note = String(it.note || '').replace(/[<>]/g, '').trim().slice(0, 40);
  return {
    kind,
    form: kind && {
      type: kind,
      ...(kind === 'expense' ? { paidBy: payer, split, owed, people, category } : { from: payer }),
      amount, parts: parts.length > 1 ? parts : undefined, note, date: shared.date, time: shared.time,
    },
    assumed: [...assumed],
    missing,
  };
}

// AI ke jawab ko jaancho aur app ke form(s) ki shakal do
export function toForm(ai, { me, otherId, today, typedText, otherName = '' }) {
  const source = typedText || ai.transcript || '';
  // Purani shakal (ek hi entry) bhi chale
  const rawItems = Array.isArray(ai.items) ? ai.items : [{ ...ai, parts: ai.parts || (ai.amount != null ? [ai.amount] : []) }];
  const typedNums = typedText ? [...numbersIn(typedText), ...wordNumbers(typedText)] : [];
  const said = typedNums.length ? typedNums : [...numbersIn(ai.transcript), ...wordNumbers(ai.transcript)];
  const pool = [...said];
  const off = Number.isInteger(ai.dayOffset) ? Math.max(-62, Math.min(0, ai.dayOffset)) : 0;
  const shared = {
    date: addDays(today, off),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(ai.time || '') ? ai.time : '',
    dateAssumed: false,
  };
  let question = String(ai.question || '').slice(0, 160);
  let items = rawItems.slice(0, 15).map((it) => checkItem(it, { me, otherId, otherName, source, said, pool, today, shared }));
  if (COMMAND.test(source)) { items = []; question = 'Main sirf nayi entry likh sakta hoon. Badalna ya delete karna ho to entry khol kar khud karo.'; }
  items = items.filter((i) => i.kind);
  const first = items[0] || { kind: null, form: null, assumed: [], missing: ['amount'] };
  if (!question) question = first.missing.includes('amount') ? 'Raqam samajh nahi aayi, khud likh do.' : first.missing.includes('payer') ? 'Kis ne paise diye? Aap ne bataya nahi, chun lo.' : '';
  return {
    transcript: String(typedText || ai.transcript || '').slice(0, 300),
    items,
    // ek entry ho to seedha bhi (purane rastay ke liye)
    kind: items.length === 1 ? first.kind : items.length ? 'many' : null,
    form: items.length === 1 ? first.form : null,
    assumed: items.length === 1 ? first.assumed : [],
    missing: items.length === 1 ? first.missing : [],
    question,
  };
}

export function createAI() {
  const key = process.env.GEMINI_API_KEY;
  const hits = new Map(); // har bande ki had: 40 dafa / ghanta
  return {
    enabled: !!key,
    async parse({ me, otherId, names, audio, mime, text, today }) {
      if (!key) throw Object.assign(new Error('AI abhi on nahi.'), { status: 503 });
      const h = (hits.get(me) || []).filter((t) => Date.now() - t < 3600e3);
      if (h.length >= Number(process.env.AI_LIMIT || 40)) throw Object.assign(new Error('Is ghante bohat dafa AI use hua. Thori der baad, ya haath se likho.'), { status: 429 });
      hits.set(me, [...h, Date.now()]);
      const parts = [];
      if (audio) {
        if (!/^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|aac|m4a|x-m4a|flac)/.test(mime || '')) throw Object.assign(new Error('Ye awaaz ki file samajh nahi aayi.'), { status: 400 });
        if (audio.length > 9_000_000) throw Object.assign(new Error('Awaaz bohat lambi hai, chhota bolo.'), { status: 400 });
        parts.push({ inlineData: { mimeType: mime.split(';')[0], data: audio } });
        parts.push({ text: 'Upar wali awaaz suno aur form bharo.' });
      } else {
        const t = String(text || '').trim().slice(0, 600);
        if (!t) throw Object.assign(new Error('Kuch likho ya bolo.'), { status: 400 });
        parts.push({ text: t });
      }
      const { data, model } = await callGemini(key, parts, names[me], names[otherId]);
      return { ...toForm(data, { me, otherId, today, typedText: audio ? null : String(text || '').trim(), otherName: names[otherId] }), model };
    },
  };
}
