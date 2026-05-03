/**
 * app/api/market-watch/route.js
 *
 * Server-side proxy for NSE India live market data.
 * Caches in Vercel Blob for 5 minutes to avoid NSE rate limits
 * and handle IP blocks gracefully (serves stale cache on failure).
 *
 * GET /api/market-watch
 * Response: {
 *   timestamp, marketStatus, isOpen,
 *   indices: [{ id, name, last, change, pct, open, high, low, prevClose, pe, pb, dy, perChange30d, perChange365d }],
 *   nifty50: { advances, declines, unchanged, totalVolume, totalValue, ohlc },
 *   currency: { usdinr },
 *   cached_at, stale
 * }
 */

import { list, put } from '@vercel/blob';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

const BLOB_KEY = 'market-watch/latest.json';
const TTL_MS   = 5 * 60 * 1000; // 5 minutes

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.nseindia.com/',
  'Accept-Language': 'en-IN,en;q=0.9',
};

// Which indices to show — ordered by importance
const WATCH_LIST = [
  { id: 'NIFTY 50',          name: 'Nifty 50'         },
  { id: 'NIFTY BANK',        name: 'Nifty Bank'        },
  { id: 'NIFTY MIDCAP 150',  name: 'Nifty Midcap 150' },
  { id: 'NIFTY SMALLCAP 250',name: 'Nifty SC 250'      },
  { id: 'NIFTY IT',          name: 'Nifty IT'          },
  { id: 'INDIA VIX',         name: 'India VIX'         },
  { id: 'NIFTY50 USD',       name: 'Nifty50 USD'       },
];

async function fetchFromNSE() {
  const sig = AbortSignal.timeout(12_000);

  // Parallel: allIndices + Nifty50 detail + marketStatus
  const [allRes, n50Res, msRes] = await Promise.all([
    fetch('https://www.nseindia.com/api/allIndices',                                           { headers: NSE_HEADERS, signal: sig }),
    fetch('https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050',                 { headers: NSE_HEADERS, signal: sig }),
    fetch('https://www.nseindia.com/api/marketStatus',                                         { headers: NSE_HEADERS, signal: sig }),
  ]);

  if (!allRes.ok) throw new Error(`NSE allIndices returned ${allRes.status}`);
  const allData = await allRes.json();
  const indexMap = Object.fromEntries(allData.data.map(d => [d.index, d]));

  // Build filtered watch list
  const indices = WATCH_LIST
    .map(({ id, name }) => {
      const d = indexMap[id];
      if (!d) return null;
      return {
        id, name,
        last:         d.last,
        change:       d.variation,
        pct:          d.percentChange,
        open:         d.open,
        high:         d.high,
        low:          d.low,
        prevClose:    d.previousClose,
        pe:           d.pe,
        pb:           d.pb,
        dy:           d.dy,
        perChange30d:  d.perChange30d,
        perChange365d: d.perChange365d,
      };
    })
    .filter(Boolean);

  // Nifty 50 detail (advances/declines + OHLC + volume)
  let nifty50 = null;
  if (n50Res.ok) {
    const n50 = await n50Res.json();
    nifty50 = {
      advances:    parseInt(n50.advance?.advances  || 0),
      declines:    parseInt(n50.advance?.declines  || 0),
      unchanged:   parseInt(n50.advance?.unchanged || 0),
      totalVolume: n50.metadata?.totalTradedVolume,
      totalValue:  n50.metadata?.totalTradedValue,
      ohlc: {
        open:  n50.metadata?.open,
        high:  n50.metadata?.high,
        low:   n50.metadata?.low,
        close: n50.metadata?.last,
      },
    };
  }

  // Market status + USD/INR proxy (currency futures)
  let marketStatus = 'Unknown';
  let isOpen = false;
  let usdinr = null;
  if (msRes.ok) {
    const ms = await msRes.json();
    const cm = ms.marketState?.find(m => m.market === 'Capital Market');
    if (cm) { marketStatus = cm.marketStatus; isOpen = cm.marketStatus === 'Open'; }
    const cf = ms.marketState?.find(m => m.market === 'currencyfuture');
    if (cf?.last) usdinr = parseFloat(cf.last);
  }

  return {
    timestamp:    new Date().toISOString(),
    cached_at:    new Date().toISOString(),
    marketStatus,
    isOpen,
    indices,
    nifty50,
    currency: { usdinr },
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

  // 1. Check cache
  if (token) {
    const cached = await blobGet(token);
    if (cached?.cached_at) {
      const age = Date.now() - new Date(cached.cached_at).getTime();
      if (age < TTL_MS) {
        return Response.json(cached, {
          headers: { 'Cache-Control': 'no-store', 'X-Cache': 'HIT', 'X-Age': String(Math.round(age/1000)) },
        });
      }
    }
  }

  // 2. Fetch fresh
  try {
    const data = await fetchFromNSE();
    if (token) blobPut(token, data);
    return Response.json(data, { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } });
  } catch (err) {
    console.error('[market-watch]', err.name, err.message);
    // 3. Serve stale cache on NSE failure
    if (token) {
      const stale = await blobGet(token);
      if (stale) {
        return Response.json({ ...stale, stale: true }, {
          headers: { 'Cache-Control': 'no-store', 'X-Cache': 'STALE' },
        });
      }
    }
    return Response.json({ error: err.message }, { status: 503 });
  }
}
