// scripts/migrate-stock-eod-to-turso.mjs
/**
 * One-time backfill: copies every row from Postgres `stock_eod` into the
 * Turso `stock-eod` database, paginated by (trade_date, isin) keyset.
 *
 * Usage: node scripts/migrate-stock-eod-to-turso.mjs
 * Env: POSTGRES_URL, TURSO_STOCK_EOD_URL, TURSO_STOCK_EOD_TOKEN
 */

import pg from 'pg';
import { upsertDay } from '../lib/stockEodStore.js';

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[migrate-eod] FATAL: POSTGRES_URL is required.');
  process.exit(1);
}

pg.types.setTypeParser(1082, (val) => val); // DATE as plain string

const PAGE_SIZE = 20000;

async function main() {
  const client = new pg.Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let lastDate = '0001-01-01', lastIsin = '';
  let totalCopied = 0;
  let page = 0;

  for (;;) {
    const { rows } = await client.query(
      `SELECT trade_date, isin, symbol, name, series, open, high, low, close, prev_close, volume, turnover
         FROM stock_eod
        WHERE (trade_date, isin) > ($1::date, $2)
        ORDER BY trade_date, isin
        LIMIT $3`,
      [lastDate, lastIsin, PAGE_SIZE]
    );
    if (!rows.length) break;

    const byDate = new Map();
    for (const r of rows) {
      if (!byDate.has(r.trade_date)) byDate.set(r.trade_date, []);
      byDate.get(r.trade_date).push({
        isin: r.isin, symbol: r.symbol, name: r.name, series: r.series,
        open: r.open == null ? null : +r.open, high: r.high == null ? null : +r.high,
        low: r.low == null ? null : +r.low, close: +r.close,
        prev_close: r.prev_close == null ? null : +r.prev_close,
        volume: r.volume == null ? null : Number(r.volume),
        turnover: r.turnover == null ? null : +r.turnover,
      });
    }
    for (const [dateIso, dayRows] of byDate) {
      await upsertDay(dateIso, dayRows);
    }
    totalCopied += rows.length;
    page++;
    const last = rows[rows.length - 1];
    lastDate = last.trade_date; lastIsin = last.isin;
    console.log(`[migrate-eod] page ${page}: copied ${rows.length} rows (total ${totalCopied.toLocaleString()}), through ${lastDate}/${lastIsin}`);

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`[migrate-eod] done — ${totalCopied.toLocaleString()} rows copied.`);
  await client.end();
}

main().catch((err) => { console.error('[migrate-eod] FATAL:', err); process.exit(1); });
