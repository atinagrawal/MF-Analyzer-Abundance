/**
 * app/api/sector-detail/route.js
 *
 * GET /api/sector-detail?index=NIFTY%20AUTO
 *
 * Returns: { metadata, advance, stocks, chart30dPath, chart365dPath }
 *
 * Fetches NSE equity-stockIndices for a sector index.
 * Cached in Blob for 5 minutes (same TTL as market-watch).
 * Includes all constituent stocks with OHLC, 52W, volume, 30d/1Y returns.
 */

import { list, put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 5 * 60 * 1000;

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.nseindia.com/',
};

// Validate index is one of our known sectors (prevent SSRF)
const VALID_INDICES = new Set([
  'NIFTY BANK', 'NIFTY IT', 'NIFTY PHARMA', 'NIFTY FMCG',
  'NIFTY AUTO', 'NIFTY METAL', 'NIFTY ENERGY', 'NIFTY REALTY',
  'NIFTY MEDIA', 'NIFTY HEALTHCARE INDEX', 'NIFTY OIL & GAS',
  'NIFTY INFRASTRUCTURE', 'NIFTY PSU BANK', 'NIFTY COMMODITIES',
  'NIFTY INDIA CONSUMPTION', 'NIFTY FINANCIAL SERVICES EX-BANK',
]);

async function blobGet(token, key) {
  try {
    const { blobs } = await list({ prefix: key, token, limit: 1 });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].downloadUrl || blobs[0].url, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function blobPut(token, key, payload) {
  try {
    await put(key, JSON.stringify(payload), {
      access: 'private', token, addRandomSuffix: false,
      contentType: 'application/json',
    });
  } catch {}
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const index = searchParams.get('index');

  if (!index || !VALID_INDICES.has(index)) {
    return Response.json({ error: 'Invalid or missing index parameter' }, { status: 400 });
  }

  const token  = process.env.BLOB_READ_WRITE_TOKEN;
  const blobKey = `sector-detail/${encodeURIComponent(index)}.json`;

  // 1. Blob cache
  if (token) {
    const cached = await blobGet(token, blobKey);
    if (cached?.cached_at && (Date.now() - new Date(cached.cached_at).getTime()) < TTL_MS) {
      return Response.json(cached, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } });
    }
  }

  // 2. Fetch from NSE
  try {
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(index)}`;
    const res  = await fetch(url, { headers: H, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`NSE returned ${res.status}`);
    const raw = await res.json();

    const meta    = raw.metadata ?? {};
    const advance = raw.advance  ?? {};

    // Separate index row (priority != 0 or symbol == index name) from stocks
    const stocks = (raw.data ?? []).filter(s =>
      s.priority === 0 && s.symbol !== index && s.symbol !== meta.indexName
    );

    const payload = {
      cached_at: new Date().toISOString(),
      indexName: meta.indexName || index,
      metadata:  meta,
      advance,
      stocks: stocks.map(s => ({
        symbol:           s.symbol,
        companyName:      s.meta?.companyName || s.symbol,
        lastPrice:        s.lastPrice,
        change:           s.change,
        pChange:          s.pChange,
        open:             s.open,
        dayHigh:          s.dayHigh,
        dayLow:           s.dayLow,
        previousClose:    s.previousClose,
        yearHigh:         s.yearHigh,
        yearLow:          s.yearLow,
        nearWKH:          s.nearWKH,   // % away from 52W high (positive = below)
        nearWKL:          s.nearWKL,   // % away from 52W low  (negative = above)
        totalTradedVolume: s.totalTradedVolume,
        totalTradedValue:  s.totalTradedValue,
        perChange30d:     s.perChange30d,
        perChange365d:    s.perChange365d,
        isFNO:            s.meta?.isFNOSec || false,
      })),
    };

    if (token) blobPut(token, blobKey, payload);

    return Response.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[sector-detail]', index, err.name, err.message);
    // Serve stale cache on NSE failure
    if (token) {
      const stale = await blobGet(token, blobKey);
      if (stale) return Response.json({ ...stale, stale: true }, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'no-store' },
      });
    }
    return Response.json({ error: err.message }, { status: 503 });
  }
}
