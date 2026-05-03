/**
 * app/api/market-watch/route.js
 *
 * NSE India market data proxy — server-side, Blob-cached 5 min.
 *
 * GET /api/market-watch
 * Response: { timestamp, marketStatus, isOpen,
 *   indices, nifty50, currency, fiiDii, gainers, losers, stale }
 */

import { list, put } from '@vercel/blob';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

const BLOB_KEY = 'market-watch/latest.json';
const TTL_MS   = 5 * 60 * 1000; // 5 minutes

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.nseindia.com/',
  'Accept-Language': 'en-IN,en;q=0.9',
};

const WATCH_LIST = [
  { id: 'NIFTY 50',           name: 'Nifty 50'          },
  { id: 'NIFTY BANK',         name: 'Nifty Bank'         },
  { id: 'NIFTY MIDCAP 150',   name: 'Nifty Midcap 150'  },
  { id: 'NIFTY SMALLCAP 250', name: 'Nifty SC 250'       },
  { id: 'NIFTY IT',           name: 'Nifty IT'           },
  { id: 'INDIA VIX',          name: 'India VIX'          },
  { id: 'NIFTY50 USD',        name: 'Nifty50 USD'        },
];

// Core sectoral indices for heatmap
const SECTORAL_LIST = [
  { id: 'NIFTY BANK',               name: 'Bank',        short: 'BANK'     },
  { id: 'NIFTY IT',                 name: 'IT',          short: 'IT'       },
  { id: 'NIFTY PHARMA',             name: 'Pharma',      short: 'PHARMA'   },
  { id: 'NIFTY FMCG',               name: 'FMCG',        short: 'FMCG'     },
  { id: 'NIFTY AUTO',               name: 'Auto',        short: 'AUTO'     },
  { id: 'NIFTY METAL',              name: 'Metal',       short: 'METAL'    },
  { id: 'NIFTY ENERGY',             name: 'Energy',      short: 'ENERGY'   },
  { id: 'NIFTY REALTY',             name: 'Realty',      short: 'REALTY'   },
  { id: 'NIFTY MEDIA',              name: 'Media',       short: 'MEDIA'    },
  { id: 'NIFTY HEALTHCARE INDEX',   name: 'Healthcare',  short: 'HEALTH'   },
  { id: 'NIFTY OIL & GAS',          name: 'Oil & Gas',   short: 'OIL&GAS'  },
  { id: 'NIFTY INFRASTRUCTURE',     name: 'Infra',       short: 'INFRA'    },
  { id: 'NIFTY PSU BANK',           name: 'PSU Bank',    short: 'PSU BANK' },
  { id: 'NIFTY COMMODITIES',        name: 'Commodities', short: 'COMM'     },
  { id: 'NIFTY INDIA CONSUMPTION',  name: 'Consumption', short: 'CONSUMP'  },
  { id: 'NIFTY FINANCIAL SERVICES EX-BANK', name: 'Fin Ex-Bank', short: 'FIN-XBAK' },
];

// 52-week tracker indices
const YEAR_TRACKER = [
  'NIFTY 50', 'NIFTY BANK', 'NIFTY MIDCAP 150',
  'NIFTY SMALLCAP 250', 'NIFTY IT', 'NIFTY PHARMA',
  'NIFTY FMCG', 'NIFTY AUTO', 'NIFTY METAL',
];

async function fetchFromNSE() {
  const sig = AbortSignal.timeout(14_000);
  const nse = (path) => fetch(`https://www.nseindia.com/api/${path}`, { headers: H, signal: sig });

  const [allRes, n50Res, msRes, fiiRes, gainRes, lossRes, holRes] = await Promise.allSettled([
    nse('allIndices'),
    nse('equity-stockIndices?index=NIFTY%2050'),
    nse('marketStatus'),
    nse('fiidiiTradeReact'),
    nse('live-analysis-variations?index=gainers'),
    nse('live-analysis-variations?index=loosers'),
    nse('holiday-master?type=trading'),
  ]);

  // ── All indices ──────────────────────────────────────────────────────────
  let indices = [];
  if (allRes.status === 'fulfilled' && allRes.value.ok) {
    const d = await allRes.value.json();
    const indexMap = Object.fromEntries(d.data.map(x => [x.index, x]));
    indices = WATCH_LIST.map(({ id, name }) => {
      const x = indexMap[id];
      if (!x) return null;
      return { id, name, last: x.last, change: x.variation, pct: x.percentChange,
        open: x.open, high: x.high, low: x.low, prevClose: x.previousClose,
        pe: x.pe, pb: x.pb, dy: x.dy,
        perChange30d: x.perChange30d, perChange365d: x.perChange365d };
    }).filter(Boolean);
  }

  // ── Sectoral heatmap ─────────────────────────────────────────────────────
  const sectoral = allRes.status === 'fulfilled' && allRes.value.ok
    ? SECTORAL_LIST.map(({ id, name, short }) => {
        const x = indexMap?.[id];
        return x ? { id, name, short, last: x.last, pct: x.percentChange,
                     change: x.variation, open: x.open, high: x.high, low: x.low } : null;
      }).filter(Boolean)
    : [];

  // ── 52-week high/low tracker ──────────────────────────────────────────────
  const yearTracker = allRes.status === 'fulfilled' && allRes.value.ok
    ? YEAR_TRACKER.map(id => {
        const x = indexMap?.[id];
        return x ? { id, name: WATCH_LIST.find(w => w.id === id)?.name || id,
                     last: x.last, yearHigh: x.yearHigh, yearLow: x.yearLow,
                     pct: x.percentChange } : null;
      }).filter(Boolean)
    : [];

  // ── Nifty 50 detail ──────────────────────────────────────────────────────
  let nifty50 = null;
  if (n50Res.status === 'fulfilled' && n50Res.value.ok) {
    const n = await n50Res.value.json();
    nifty50 = {
      advances:    parseInt(n.advance?.advances  || 0),
      declines:    parseInt(n.advance?.declines  || 0),
      unchanged:   parseInt(n.advance?.unchanged || 0),
      totalVolume: n.metadata?.totalTradedVolume,
      totalValue:  n.metadata?.totalTradedValue,
      ohlc: { open: n.metadata?.open, high: n.metadata?.high,
               low:  n.metadata?.low,  close: n.metadata?.last },
    };
  }

  // ── Market status + USD/INR proxy ─────────────────────────────────────────
  let marketStatus = 'Unknown', isOpen = false, usdinr = null;
  if (msRes.status === 'fulfilled' && msRes.value.ok) {
    const ms = await msRes.value.json();
    const cm = ms.marketState?.find(m => m.market === 'Capital Market');
    if (cm) { marketStatus = cm.marketStatus; isOpen = cm.marketStatus === 'Open'; }
    const cf = ms.marketState?.find(m => m.market === 'currencyfuture');
    if (cf?.last) usdinr = parseFloat(cf.last);
  }

  // ── FII / DII flows ───────────────────────────────────────────────────────
  let fiiDii = null;
  if (fiiRes.status === 'fulfilled' && fiiRes.value.ok) {
    const rows = await fiiRes.value.json();
    const fii  = rows.find(r => r.category === 'FII/FPI') || rows[1];
    const dii  = rows.find(r => r.category === 'DII')     || rows[0];
    if (fii && dii) {
      fiiDii = {
        date: fii.date,
        fii: { buy: parseFloat(fii.buyValue), sell: parseFloat(fii.sellValue), net: parseFloat(fii.netValue) },
        dii: { buy: parseFloat(dii.buyValue), sell: parseFloat(dii.sellValue), net: parseFloat(dii.netValue) },
      };
    }
  }

  // ── Top gainers (Nifty 50) ────────────────────────────────────────────────
  const mapStocks = (d, key) => {
    try {
      const data = d?.[key]?.data || d?.allSec?.data || [];
      return data.slice(0, 5).map(s => ({
        symbol: s.symbol, ltp: s.ltp, pct: s.net_price,
        volume: s.trade_quantity,
      }));
    } catch { return []; }
  };

  let gainers = [], losers = [];
  if (gainRes.status === 'fulfilled' && gainRes.value.ok) {
    const gd = await gainRes.value.json();
    gainers = mapStocks(gd, 'NIFTY');
  }
  if (lossRes.status === 'fulfilled' && lossRes.value.ok) {
    const ld = await lossRes.value.json();
    losers = mapStocks(ld, 'NIFTY');
  }

  // ── Market holidays ──────────────────────────────────────────────────────
  let holidays = [];
  if (holRes.status === 'fulfilled' && holRes.value.ok) {
    const hd = await holRes.value.json();
    holidays = (hd.CM || []).map(h => ({
      date: h.tradingDate,
      day:  h.weekDay,
      desc: h.description,
    }));
  }

  return {
    timestamp: new Date().toISOString(),
    cached_at: new Date().toISOString(),
    marketStatus, isOpen, indices, nifty50,
    currency: { usdinr },
    fiiDii, gainers, losers,
    sectoral, yearTracker, holidays,
    stale: false,
  };
}

async function blobGet(token) {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY, token, limit: 1 });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].downloadUrl || blobs[0].url, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function blobPut(token, payload) {
  try {
    await put(BLOB_KEY, JSON.stringify(payload), {
      access: 'private', token, addRandomSuffix: false, contentType: 'application/json',
    });
  } catch {}
}

export async function GET() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (token) {
    const cached = await blobGet(token);
    if (cached?.cached_at && (Date.now() - new Date(cached.cached_at).getTime()) < TTL_MS) {
      return Response.json(cached, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } });
    }
  }

  try {
    const data = await fetchFromNSE();
    if (token) blobPut(token, data);
    return Response.json(data, { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[market-watch]', err.name, err.message);
    if (token) {
      const stale = await blobGet(token);
      if (stale) return Response.json({ ...stale, stale: true }, { headers: { 'X-Cache': 'STALE', 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: err.message }, { status: 503 });
  }
}
