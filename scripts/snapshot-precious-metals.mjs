/**
 * scripts/snapshot-precious-metals.mjs
 *
 * Daily snapshot of the live Gold/Silver/Platinum rates (see
 * lib/preciousMetalsRates.js) into Postgres, so /gold-silver-rates can
 * eventually show a historical trend chart -- day one of that page has
 * only a live reading, this starts the history it'll need.
 *
 * One row per calendar date (IST); re-running the same day upserts
 * (last snapshot of the day wins), so a manual re-run or a workflow
 * retry is harmless.
 *
 * Usage: node scripts/snapshot-precious-metals.mjs
 * Env: POSTGRES_URL (required to persist; without it, dry-run prints the snapshot).
 */

import pg from 'pg';
import { fetchLiveRates } from '../lib/preciousMetalsRates.js';

function istDateString(d = new Date()) {
  // IST = UTC+5:30, no DST -- a fixed offset is exact, no Intl/tz-db needed.
  const ist = new Date(d.getTime() + (5.5 * 60 + d.getTimezoneOffset()) * 60000);
  return ist.toISOString().slice(0, 10);
}

async function ensureTable(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS precious_metals_history (
    date               DATE PRIMARY KEY,
    gold_usd_oz        NUMERIC,
    usd_inr            NUMERIC,
    silver_usd_oz      NUMERIC,
    gold_inr_gram      NUMERIC,
    silver_inr_gram    NUMERIC,
    platinum_inr_gram  NUMERIC,
    captured_at        TIMESTAMPTZ DEFAULT now()
  )`);
}

// Retries a transient blip (one bad moment on the upstream ticker) up to
// 2 extra times before giving up -- previously a single failed fetch
// here failed the whole day's cron run outright.
async function fetchLiveRatesWithRetry(attempts = 3, delayMs = 5000) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fetchLiveRates();
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      console.warn(`[snapshot-precious-metals] fetchLiveRates failed (attempt ${i}/${attempts}): ${err.message} -- retrying in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function main() {
  const rates = await fetchLiveRatesWithRetry();
  const row = {
    date: istDateString(),
    gold_usd_oz: rates.goldUsdOz.ask,
    usd_inr: rates.usdInr.ask,
    silver_usd_oz: rates.silverUsdOz.ask,
    gold_inr_gram: rates.goldInrGram.ask,
    silver_inr_gram: rates.silverInrGram.ask,
    platinum_inr_gram: rates.platinumInrGram.ask,
  };

  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.log('[snapshot-precious-metals] No POSTGRES_URL -- dry run:', row);
    return;
  }

  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 });
  const c = await pool.connect();
  try {
    await ensureTable(c);
    await c.query(
      `INSERT INTO precious_metals_history (date, gold_usd_oz, usd_inr, silver_usd_oz, gold_inr_gram, silver_inr_gram, platinum_inr_gram, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (date) DO UPDATE SET
         gold_usd_oz=EXCLUDED.gold_usd_oz, usd_inr=EXCLUDED.usd_inr, silver_usd_oz=EXCLUDED.silver_usd_oz,
         gold_inr_gram=EXCLUDED.gold_inr_gram, silver_inr_gram=EXCLUDED.silver_inr_gram,
         platinum_inr_gram=EXCLUDED.platinum_inr_gram, captured_at=now()`,
      [row.date, row.gold_usd_oz, row.usd_inr, row.silver_usd_oz, row.gold_inr_gram, row.silver_inr_gram, row.platinum_inr_gram]
    );
    console.log('[snapshot-precious-metals] upserted', row);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[snapshot-precious-metals] Fatal error:', err.message);
  process.exit(1);
});
