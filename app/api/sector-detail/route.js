/**
 * app/api/sector-detail/route.js
 *
 * GET /api/sector-detail?index=NIFTY%20AUTO
 *
 * Returns: { metadata, advance, stocks }
 *
 * Data strategy (most-reliable first):
 *  1. Blob cache (5-min TTL) — avoids repeated DB/NSE hits
 *  2. DB path (15 core sectors) — stock_eod + stock_signals + sector_isin_map.
 *     Metadata (last price, PE, 52W range) comes from NSE allIndices which
 *     works reliably from Vercel; constituent-stock pChange is computed from
 *     BSE bhavcopy prev_close so it is never stale beyond the nightly ingest.
 *  3. NSE equity-stockIndices — fallback for thematic sectors not in our DB,
 *     or if the DB query fails.
 *  4. Stale blob — last resort only.
 *
 * The old approach used NSE equity-stockIndices for everything, but NSE blocks
 * that endpoint from Vercel cloud IPs, resulting in 43-day-old cached data.
 */

import pool from '@/lib/db';
import { list, put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 5 * 60 * 1000;

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.nseindia.com/',
};

// NSE index name → sector_isin_map.sector (short name from ingest-sector-map.mjs)
const INDEX_TO_SECTOR = {
  'NIFTY BANK':                       'Bank',
  'NIFTY IT':                         'IT',
  'NIFTY PHARMA':                     'Pharma',
  'NIFTY FMCG':                       'FMCG',
  'NIFTY AUTO':                       'Auto',
  'NIFTY METAL':                      'Metal',
  'NIFTY ENERGY':                     'Energy',
  'NIFTY REALTY':                     'Realty',
  'NIFTY MEDIA':                      'Media',
  'NIFTY HEALTHCARE INDEX':           'Healthcare',
  'NIFTY OIL & GAS':                  'Oil & Gas',
  'NIFTY INFRASTRUCTURE':             'Infrastructure',
  'NIFTY PSU BANK':                   'PSU Bank',
  'NIFTY FINANCIAL SERVICES EX-BANK': 'Financial Services',
  'NIFTY CONSUMER DURABLES':          'Consumer Durables',
};

const VALID_INDICES = new Set([
  ...Object.keys(INDEX_TO_SECTOR),
  'NIFTY COMMODITIES', 'NIFTY INDIA CONSUMPTION',
  'NIFTY INDIA DEFENCE', 'NIFTY CHEMICALS', 'NIFTY CAPITAL MARKETS',
  'NIFTY EV & NEW AGE AUTOMOTIVE', 'NIFTY INDIA MANUFACTURING',
  'NIFTY TRANSPORTATION & LOGISTICS', 'NIFTY PRIVATE BANK',
  'NIFTY HOUSING', 'NIFTY INDIA RAILWAYS PSU',
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
      access: 'private', token, addRandomSuffix: false, contentType: 'application/json',
    });
  } catch {}
}

// Fetch index-level metadata (last, PE, 52W range, etc.) from NSE allIndices.
// allIndices is a single lightweight call that covers every index and works
// reliably from Vercel — unlike equity-stockIndices which is blocked.
async function fetchIndexMeta(index) {
  try {
    const r = await fetch('https://www.nseindia.com/api/allIndices', {
      headers: H, signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const x = d.data?.find(i => i.index === index);
    if (!x) return null;
    return {
      indexName:         x.index,
      last:              x.last,
      percChange:        x.percentChange,
      open:              x.open,
      high:              x.high,
      low:               x.low,
      yearHigh:          x.yearHigh,
      yearLow:           x.yearLow,
      totalTradedVolume: x.totalTradedVolume,
      totalTradedValue:  x.totalTradedValue,
      pe:                x.pe,
      perChange30d:      x.perChange30d,
      perChange365d:     x.perChange365d,
      chart30dPath:      null,
      chart365dPath:     null,
    };
  } catch { return null; }
}

// Pull constituent stocks from our own DB.
// pChange = (close - prev_close) / prev_close * 100, sourced from BSE bhavcopy.
// nearWKH / nearWKL come from stock_signals (pct_from_52h / pct_from_52l).
async function fetchStocksFromDB(sectorName) {
  const c = await pool.connect();
  try {
    const { rows } = await c.query(`
      WITH latest AS (SELECT MAX(trade_date) AS d FROM stock_eod)
      SELECT
        se.isin,
        se.symbol,
        se.name                                                       AS company_name,
        se.trade_date,
        CAST(se.close      AS FLOAT)                                  AS last_price,
        CAST(se.prev_close AS FLOAT)                                  AS previous_close,
        CAST(se.open       AS FLOAT)                                  AS open,
        CAST(se.high       AS FLOAT)                                  AS day_high,
        CAST(se.low        AS FLOAT)                                  AS day_low,
        CAST(se.volume     AS BIGINT)                                 AS total_traded_volume,
        CAST(se.turnover   AS FLOAT)                                  AS total_traded_value,
        CASE WHEN se.prev_close > 0
          THEN CAST(se.close - se.prev_close AS FLOAT) ELSE 0 END     AS change,
        CASE WHEN se.prev_close > 0
          THEN ROUND(CAST(
            (se.close - se.prev_close) / se.prev_close * 100 AS NUMERIC
          ), 2) ELSE 0 END                                            AS p_change,
        CAST(ss.pct_from_52h AS FLOAT)                                AS near_wkh,
        CAST(ss.pct_from_52l AS FLOAT)                                AS near_wkl
      FROM stock_eod se
      CROSS JOIN latest
      JOIN sector_isin_map sim ON se.isin = sim.isin AND sim.sector = $1
      LEFT JOIN stock_signals ss ON se.isin = ss.isin AND ss.snap_date = se.trade_date
      WHERE se.trade_date = latest.d
      ORDER BY p_change DESC
    `, [sectorName]);
    return rows;
  } finally {
    c.release();
  }
}

// A/D counts come from sector_breadth (updated nightly by build-sector-breadth.mjs).
async function fetchAdvanceFromDB(sectorName) {
  const c = await pool.connect();
  try {
    const { rows } = await c.query(
      `SELECT advancing, declining, unchanged
         FROM sector_breadth WHERE sector = $1
        ORDER BY snap_date DESC LIMIT 1`,
      [sectorName]
    );
    if (!rows.length) return {};
    return {
      advances:  String(rows[0].advancing  ?? 0),
      declines:  String(rows[0].declining  ?? 0),
      unchanged: String(rows[0].unchanged  ?? 0),
    };
  } finally {
    c.release();
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const index = searchParams.get('index');

  if (!index || !VALID_INDICES.has(index)) {
    return Response.json({ error: 'Invalid or missing index parameter' }, { status: 400 });
  }

  const token   = process.env.BLOB_READ_WRITE_TOKEN;
  const blobKey = `sector-detail/${encodeURIComponent(index)}.json`;

  // 1. Blob cache (5-min TTL)
  if (token) {
    const cached = await blobGet(token, blobKey);
    if (cached?.cached_at && (Date.now() - new Date(cached.cached_at).getTime()) < TTL_MS) {
      return Response.json(cached, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } });
    }
  }

  const sectorName = INDEX_TO_SECTOR[index];

  // 2. DB-powered path (15 core sectors that have sector_isin_map entries)
  if (sectorName) {
    try {
      const [meta, stockRows, advance] = await Promise.all([
        fetchIndexMeta(index),
        fetchStocksFromDB(sectorName),
        fetchAdvanceFromDB(sectorName),
      ]);

      const tradeDate = stockRows[0]?.trade_date ?? null;

      const payload = {
        cached_at: new Date().toISOString(),
        indexName: index,
        metadata: {
          ...(meta ?? { indexName: index }),
          timeVal: tradeDate ? `EOD ${tradeDate}` : null,
        },
        advance,
        stocks: stockRows.map(r => ({
          symbol:            r.symbol,
          companyName:       r.company_name || r.symbol,
          lastPrice:         r.last_price,
          change:            r.change,
          pChange:           Number(r.p_change),
          open:              r.open,
          dayHigh:           r.day_high,
          dayLow:            r.day_low,
          previousClose:     r.previous_close,
          yearHigh:          null,
          yearLow:           null,
          nearWKH:           r.near_wkh,
          nearWKL:           r.near_wkl,
          totalTradedVolume: r.total_traded_volume,
          totalTradedValue:  r.total_traded_value,
          perChange30d:      null,
          perChange365d:     null,
          isFNO:             false,
        })),
        source: 'db',
      };

      if (token) blobPut(token, blobKey, payload);

      return Response.json(payload, {
        headers: { 'X-Cache': 'MISS', 'X-Source': 'db', 'Cache-Control': 'no-store' },
      });
    } catch (dbErr) {
      console.error('[sector-detail] DB error', index, dbErr.message);
      // fall through to NSE attempt below
    }
  }

  // 3. NSE live — for thematic sectors not in our DB, or on DB failure
  try {
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(index)}`;
    const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`NSE returned ${res.status}`);
    const raw = await res.json();

    const meta    = raw.metadata ?? {};
    const advance = raw.advance  ?? {};
    const stocks  = (raw.data ?? []).filter(s =>
      s.priority === 0 && s.symbol !== index && s.symbol !== meta.indexName
    );

    const payload = {
      cached_at: new Date().toISOString(),
      indexName: meta.indexName || index,
      metadata:  meta,
      advance,
      stocks: stocks.map(s => ({
        symbol:            s.symbol,
        companyName:       s.meta?.companyName || s.symbol,
        lastPrice:         s.lastPrice,
        change:            s.change,
        pChange:           s.pChange,
        open:              s.open,
        dayHigh:           s.dayHigh,
        dayLow:            s.dayLow,
        previousClose:     s.previousClose,
        yearHigh:          s.yearHigh,
        yearLow:           s.yearLow,
        nearWKH:           s.nearWKH,
        nearWKL:           s.nearWKL,
        totalTradedVolume: s.totalTradedVolume,
        totalTradedValue:  s.totalTradedValue,
        perChange30d:      s.perChange30d,
        perChange365d:     s.perChange365d,
        isFNO:             s.meta?.isFNOSec || false,
      })),
      source: 'nse',
    };

    if (token) blobPut(token, blobKey, payload);

    return Response.json(payload, {
      headers: { 'X-Cache': 'MISS', 'X-Source': 'nse', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[sector-detail]', index, err.name, err.message);

    // Stale blob — last resort
    if (token) {
      const stale = await blobGet(token, blobKey);
      if (stale) return Response.json({ ...stale, stale: true }, {
        headers: { 'X-Cache': 'STALE', 'Cache-Control': 'no-store' },
      });
    }
    return Response.json({ error: err.message }, { status: 503 });
  }
}
