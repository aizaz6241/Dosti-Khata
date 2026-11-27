// Live rate: 1 USDT = kitne rupay (Binance P2P par bechne ka rate), aur doosri currencies ka rate.
// Har thori der baad naya; beech mein yaad rakha hua (taake Binance ko baar baar na pucha jaye).

const T = (ms) => AbortSignal.timeout(ms);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (n) => Math.round(n * 100) / 100;

// Binance P2P: USDT bechne par kitne PKR milte hain (sab se upar wala ad, ajeeb ho to beech wala)
export async function binanceSell(fetchFn = fetch) {
  const res = await fetchFn('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', clienttype: 'web' },
    body: JSON.stringify({ fiat: 'PKR', asset: 'USDT', tradeType: 'SELL', page: 1, rows: 10, payTypes: [], countries: [], publisherType: null, proMerchantAds: false, shieldMerchantAds: false, filterType: 'all', periods: [], additionalKycVerifyFilter: 0, classifies: ['mass', 'profession', 'fiat_trade'] }),
    signal: T(7000),
  });
  if (!res.ok) throw new Error('binance ' + res.status);
  const j = await res.json();
  const ads = (j?.data || []).map((d) => ({ price: Number(d?.adv?.price), min: Number(d?.adv?.minSingleTransAmount) || 0 })).filter((a) => a.price > 50 && a.price < 2000);
  if (!ads.length) throw new Error('binance: koi ad nahi');
  // Bari had (jaise 2 lakh se upar) wale ads aam bande ke kaam ke nahi, un ka rate alag hota hai
  const normal = ads.filter((a) => a.min <= 50000);
  const prices = (normal.length >= 3 ? normal : ads).map((a) => a.price);
  const top = prices[0]; const mid = median(prices.slice(0, 5));
  return r2(Math.abs(top - mid) / mid > 0.03 ? mid : top);
}

async function coingecko(fetchFn = fetch) {
  const res = await fetchFn('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=pkr', { signal: T(6000) });
  if (!res.ok) throw new Error('coingecko ' + res.status);
  const v = Number((await res.json())?.tether?.pkr);
  if (!(v > 50)) throw new Error('coingecko: rate nahi');
  return r2(v);
}

// USD, AED, SAR, GBP, EUR -> PKR
async function fiat(fetchFn = fetch) {
  const res = await fetchFn('https://open.er-api.com/v6/latest/PKR', { signal: T(6000) });
  if (!res.ok) throw new Error('fx ' + res.status);
  const r = (await res.json())?.rates || {};
  const out = {};
  for (const c of ['USD', 'AED', 'SAR', 'GBP', 'EUR']) if (Number(r[c]) > 0) out[c] = r2(1 / Number(r[c]));
  if (!out.USD) throw new Error('fx: rate nahi');
  return out;
}

export function createRates({ fetchFn = fetch, ttl = 3 * 60e3, fiatTtl = 6 * 3600e3, log = console } = {}) {
  let usdt = null; let fx = null; let busy = null;
  const fresh = (x, t) => x && Date.now() - x.at < t;
  async function load() {
    const jobs = [];
    if (!fresh(usdt, ttl)) jobs.push((async () => {
      try { usdt = { rate: await binanceSell(fetchFn), source: 'Binance P2P', at: Date.now() }; }
      catch (e) {
        log.warn?.('rate: binance nahi mila', e.message);
        try { usdt = { rate: await coingecko(fetchFn), source: 'CoinGecko', at: Date.now() }; }
        catch (e2) { log.warn?.('rate: coingecko bhi nahi', e2.message); }
      }
    })());
    if (!fresh(fx, fiatTtl)) jobs.push((async () => {
      try { fx = { rates: await fiat(fetchFn), at: Date.now() }; } catch (e) { log.warn?.('rate: fx nahi', e.message); }
    })());
    await Promise.all(jobs);
  }
  return {
    async get() {
      if (!fresh(usdt, ttl) || !fresh(fx, fiatTtl)) { busy ||= load().finally(() => { busy = null; }); await busy; }
      const rates = { ...(fx?.rates || {}) }; const sources = {};
      for (const c of Object.keys(rates)) sources[c] = 'Open ER';
      if (usdt) { rates.USDT = usdt.rate; sources.USDT = usdt.source; }
      else if (rates.USD) { rates.USDT = rates.USD; sources.USDT = 'USD rate'; }
      return { rates, sources, at: usdt?.at || fx?.at || null };
    },
  };
}
