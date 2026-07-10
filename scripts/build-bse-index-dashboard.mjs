/**
 * scripts/build-bse-index-dashboard.mjs — nightly BSE index dashboard build.
 *
 * Fetches all ~141 BSE indices (api.bseindia.com, see lib/bseIndex.js) and
 * computes the same returns/valuation shape as pages/api/index-dashboard.js's
 * NSE data (1M/3M/1Y absolute, 3Y/5Y CAGR, plus P/E, P/B, Div. Yield from
 * BSE's own daily index rows), so the Indices page can merge both sources.
 *
 * This exists because the Indices page only covered NSE (147 indices) — the
 * user asked for a much larger benchmark basket, and BSE is the only index
 * source that's actually reachable from a server (NSE blocks cloud IPs via
 * Akamai, see ingest-eod.mjs and lib/bseIndex.js). Unlike stock EOD data (one
 * bulk bhavcopy per day), index history is fetched per-symbol, so this writes
 * to Postgres one index at a time as each fetch completes — a mid-run failure
 * on one index doesn't lose progress already made on the others.
 *
 * Writes into Postgres table `bse_index_dashboard`, keyed by symbol.
 * Idempotent: re-running just upserts.
 *
 * Usage:
 *   node scripts/build-bse-index-dashboard.mjs
 * Env: POSTGRES_URL (required to persist; without it, dry-run prints a summary).
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchBseSymbolList, fetchBseDailySeries } from '../lib/bseIndex.js';

const RATE_LIMIT_MS = 300;

// ── Categorization ──────────────────────────────────────────────────────
// BSE has no published index-dashboard PDF (unlike NSE) to source an exact
// category mapping from, so categories are inferred from each index's name.
// Order matters: bond/fixed-income first (excluded from equity valuation),
// then sectoral (most specific), then strategy/factor, then thematic, with
// broad-market cap-weighted indices as the catch-all default.
const BOND_KEYWORDS = ['BOND', 'G-SEC', 'SOVEREIGN', 'GILT', 'GOVERNMENT BILL'];
const SECTOR_KEYWORDS = [
    'BANKEX', 'AUTO', 'INFORMATION TECHNOLOGY', 'FOCUSED IT', 'HEALTHCARE', 'FAST MOVING CONSUMER GOODS',
    'METAL', 'OIL & GAS', 'POWER', 'REALTY', 'REITS', 'PSU BANK', 'PSU', 'CAPITAL GOODS', 'CONSUMER DURABLES',
    'CONSUMER DISCRETIONARY', 'FINANCIAL SERVICES', 'TELECOMMUNICATION', 'UTILITIES', 'INSURANCE', 'TECK',
    'ENERGY', 'INDUSTRIALS', 'HOUSING', 'INFRASTRUCTURE', 'HOSPITALS', 'CAPITAL MARKETS', 'PRIVATE BANKS',
    'TOP 10 BANKS', 'MIDSMALL PRIVATE BANKS',
];
const STRATEGY_KEYWORDS = [
    'MOMENTUM', 'QUALITY', 'LOW VOLATILITY', 'ENHANCED VALUE', 'VALUE INDEX', 'EQUAL WEIGHT', 'EQUAL SIZE',
    'DIVIDEND', 'MULTICAP', 'MULTI ASSET', 'INVERSE', 'ARBITRAGE', 'STABLE DIVIDEND', 'FOCUSED MIDCAP',
];
const THEMATIC_KEYWORDS = [
    'IPO', 'CARBON', 'GREEN', 'CLEAN ENVIRONMENT', 'DEFENCE', 'INTERNET ECONOMY', 'MANUFACTURING', 'CPSE',
    'SHARIAH', 'ESG', 'SAATVIK', 'SELECT BUSINESS GROUPS', 'BHARAT 22', 'SECTOR LEADERS', 'COMMODITIES',
    'DIVERSIFIED FINANCIALS',
];

function categorize(name) {
    const n = name.toUpperCase();
    if (BOND_KEYWORDS.some(k => n.includes(k))) return 'bond';
    if (SECTOR_KEYWORDS.some(k => n.includes(k))) return 'sectoral';
    if (STRATEGY_KEYWORDS.some(k => n.includes(k))) return 'strategy';
    if (THEMATIC_KEYWORDS.some(k => n.includes(k))) return 'thematic';
    return 'broad';
}

function shortName(name) {
    return name.replace(/^BSE\s+/i, '').slice(0, 12).toUpperCase();
}

// ── Returns computation ─────────────────────────────────────────────────
// 1M/3M/1Y = absolute return; 3Y/5Y = CAGR — same convention as the NSE
// dashboard and app/api/bse-index/route.js.
function closestOnOrBefore(rows, targetDate) {
    let best = null;
    for (const r of rows) {
        if (r.date <= targetDate && (!best || r.date > best.date)) best = r;
    }
    return best;
}

function computeReturns(rows) {
    if (!rows.length) return null;
    const latest = rows[rows.length - 1];
    const monthsAgo = n => { const d = new Date(latest.date); d.setMonth(d.getMonth() - n); return d; };
    const yearsAgo = n => { const d = new Date(latest.date); d.setFullYear(d.getFullYear() - n); return d; };

    const m1 = closestOnOrBefore(rows, monthsAgo(1));
    const m3 = closestOnOrBefore(rows, monthsAgo(3));
    const y1 = closestOnOrBefore(rows, yearsAgo(1));
    const y3 = closestOnOrBefore(rows, yearsAgo(3));
    const y5 = closestOnOrBefore(rows, yearsAgo(5));

    const abs = from => from ? +(((latest.close / from.close) - 1) * 100).toFixed(2) : null;
    const cagr = (from, n) => from ? +((Math.pow(latest.close / from.close, 1 / n) - 1) * 100).toFixed(2) : null;

    return {
        r1m: abs(m1), r3m: abs(m3), r1y: abs(y1),
        r3y: cagr(y3, 3), r5y: cagr(y5, 5),
        pe: latest.pe, pb: latest.pb, dy: latest.dy,
        asOf: latest.date.toISOString().slice(0, 10),
    };
}

// ── Postgres ─────────────────────────────────────────────────────────────
async function ensureTable(c) {
    await c.query(`CREATE TABLE IF NOT EXISTS bse_index_dashboard (
    symbol     TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    cat        TEXT NOT NULL,
    short      TEXT,
    r1m NUMERIC, r3m NUMERIC, r1y NUMERIC, r3y NUMERIC, r5y NUMERIC,
    pe  NUMERIC, pb  NUMERIC, dy  NUMERIC,
    as_of      DATE,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_bse_index_dashboard_cat ON bse_index_dashboard (cat)`);
}

async function upsertIndex(c, symbol, name, cat, returns) {
    await c.query(
        `INSERT INTO bse_index_dashboard (symbol,name,cat,short,r1m,r3m,r1y,r3y,r5y,pe,pb,dy,as_of,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
     ON CONFLICT (symbol) DO UPDATE SET
       name=EXCLUDED.name, cat=EXCLUDED.cat, short=EXCLUDED.short,
       r1m=EXCLUDED.r1m, r3m=EXCLUDED.r3m, r1y=EXCLUDED.r1y, r3y=EXCLUDED.r3y, r5y=EXCLUDED.r5y,
       pe=EXCLUDED.pe, pb=EXCLUDED.pb, dy=EXCLUDED.dy, as_of=EXCLUDED.as_of, updated_at=now()`,
        [symbol, name, cat, shortName(name), returns.r1m, returns.r3m, returns.r1y, returns.r3y, returns.r5y,
            returns.pe, returns.pb, returns.dy, returns.asOf]
    );
}

async function main() {
    const url = process.env.POSTGRES_URL;
    const pool = url ? new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 }) : null;
    const c = pool ? await pool.connect() : null;
    if (c) await ensureTable(c);

    const symbolList = await fetchBseSymbolList();
    console.log(`[bse-index-dashboard] ${symbolList.length} BSE indices found`);

    const to = new Date();
    const from = new Date(); from.setFullYear(from.getFullYear() - 6); // 6y covers 5Y CAGR with margin

    let ok = 0, failed = 0;
    for (const { Indx_cd: symbol, shortalias } of symbolList) {
        const name = shortalias.trim();
        const cat = categorize(name);
        try {
            const rows = await fetchBseDailySeries(symbol, { from, to });
            const returns = computeReturns(rows);
            if (!returns) { console.log(`[bse-index-dashboard] ${name}: no data, skipped`); failed++; continue; }
            if (c) await upsertIndex(c, symbol, name, cat, returns);
            ok++;
            console.log(`[bse-index-dashboard] ${name} (${cat}): r1y=${returns.r1y} r3y=${returns.r3y}${c ? ' upserted' : ' (dry-run)'}`);
        } catch (e) {
            console.log(`[bse-index-dashboard] ${name}: FAILED — ${e.message}`);
            failed++;
        }
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    console.log(`[bse-index-dashboard] done — ${ok} indices upserted, ${failed} failed${c ? '' : ' (no POSTGRES_URL → dry-run)'}`);
    if (c) c.release();
    if (pool) await pool.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e); process.exit(1); });
}
