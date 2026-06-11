// app/api/breadth-indices/route.js — index strip for the breadth dashboard.
// Pulls Nifty 50 / 500 / Bank + India VIX from Yahoo (server-accessible, unlike NSE),
// and returns last level, day change %, weekly RSI(14), and a regime tag.

export const revalidate = 900; // 15 min — near-live during market hours

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const INDICES = [
  { key: 'nifty50', label: 'Nifty 50', sym: '%5ENSEI', kind: 'equity' },
  { key: 'nifty500', label: 'Nifty 500', sym: '%5ECRSLDX', kind: 'equity' },
  { key: 'niftybank', label: 'Nifty Bank', sym: '%5ENSEBANK', kind: 'equity' },
  { key: 'vix', label: 'India VIX', sym: '%5EINDIAVIX', kind: 'vix' },
];

function rsi(v, p = 14) {
  if (v.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const c = v[i] - v[i - 1]; if (c >= 0) g += c; else l -= c; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < v.length; i++) { const c = v[i] - v[i - 1]; ag = (ag * (p - 1) + Math.max(c, 0)) / p; al = (al * (p - 1) + Math.max(-c, 0)) / p; }
  if (al === 0) return 100;
  return +(100 - 100 / (1 + ag / al)).toFixed(2);
}
function weeklyCloses(daily) {
  const byWeek = new Map();
  for (const p of daily) { const wk = Math.floor(p.t / (7 * 864e5)); byWeek.set(wk, p.c); }
  return [...byWeek.values()];
}
function tag(kind, last, sma50) {
  if (kind === 'vix') return last < 14 ? 'Low' : last <= 20 ? 'Neutral' : last <= 28 ? 'Elevated' : 'High fear';
  if (sma50 == null) return 'Neutral';
  const d = (last / sma50 - 1) * 100;
  return d > 1.5 ? 'Bullish' : d < -1.5 ? 'Bearish' : 'Neutral';
}

async function one(idx) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${idx.sym}?range=1y&interval=1d`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ...stub(idx), error: true };
    const j = await r.json();
    const res = j.chart.result[0];
    const ts = res.timestamp || [];
    const cl = res.indicators.quote[0].close || [];
    const daily = [];
    for (let i = 0; i < ts.length; i++) if (cl[i] != null) daily.push({ t: ts[i] * 1000, c: cl[i] });
    if (daily.length < 2) return { ...stub(idx), error: true };
    const closes = daily.map((d) => d.c);
    const last = closes[closes.length - 1], prev = closes[closes.length - 2];
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    return {
      key: idx.key, label: idx.label,
      last: +last.toFixed(2),
      change_pct: +((last / prev - 1) * 100).toFixed(2),
      rsi_w: rsi(weeklyCloses(daily)),
      tag: tag(idx.kind, last, sma50),
      kind: idx.kind,
    };
  } catch (e) { return { ...stub(idx), error: true }; }
}
const stub = (idx) => ({ key: idx.key, label: idx.label, last: null, change_pct: null, rsi_w: null, tag: 'Neutral', kind: idx.kind });

export async function GET() {
  const out = await Promise.all(INDICES.map(one));
  return new Response(JSON.stringify({ asof: new Date().toISOString(), indices: out }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600' },
  });
}
