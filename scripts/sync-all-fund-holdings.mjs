#!/usr/bin/env node
/**
 * scripts/sync-all-fund-holdings.mjs
 *
 * Proactive Cloudflare R2 cache population for the mutual fund universe.
 * Queries active equity, hybrid, and solution-oriented funds from mf_screener,
 * checks portfolio-creator-holdings/${amfiCode}.json in Cloudflare R2, and
 * fetches any missing or stale (>7 days) fund holdings from Groww's internal API
 * with request-level rate limiting (>= 500ms + jitter) and exponential backoff.
 *
 * Usage:
 *   node --env-file=.env.local scripts/sync-all-fund-holdings.mjs [options]
 *
 * Options:
 *   --dry-run     Check staleness and log targets without making any outbound Groww calls
 *   --limit=N     Process only the first N schemes (useful for verification and dry runs)
 *   --force       Bypass the 7-day TTL check and force-fetch all schemes
 *   --code=CODE   Fetch a specific single AMFI code
 */

import fs from 'fs';
import path from 'path';
import pool from '../lib/db.js';
import { r2Get } from '../lib/r2.js';
import { getHoldingsData, RequestThrottler } from '../lib/holdingsLookup.js';

const CACHE_PREFIX = 'portfolio-creator-holdings/';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const codeArg = args.find((a) => a.startsWith('--code='));
const targetCode = codeArg ? codeArg.split('=')[1] : null;

function isFresh(ts) {
  return ts && (Date.now() - ts) < TTL_MS;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getTargetUniverse() {
  if (targetCode) {
    const res = await pool.query(
      `SELECT code, name, category, amc, nav, ret_3y FROM mf_screener WHERE code = $1 LIMIT 1`,
      [targetCode]
    );
    return res.rows;
  }

  const query = `
    SELECT code, name, category, amc, nav, ret_3y
    FROM mf_screener
    WHERE (
      category ILIKE '%equity%'
      OR category ILIKE '%hybrid%'
      OR category ILIKE '%elss%'
      OR category ILIKE '%solution%'
      OR category ILIKE '%children%'
      OR category ILIKE '%retirement%'
    )
    AND category NOT ILIKE '%debt%'
    AND category NOT ILIKE '%gold%'
    AND category NOT ILIKE '%silver%'
    AND category NOT ILIKE '%commodity%'
    ORDER BY ret_3y DESC NULLS LAST, code ASC;
  `;
  const res = await pool.query(query);
  return res.rows;
}

async function main() {
  console.log('='.repeat(70));
  console.log('Reverse Holdings Engine: Proactive Cache Population (§5.1)');
  console.log(`Modes: dry-run=${isDryRun}, force=${isForce}, limit=${limit === Infinity ? 'ALL' : limit}`);
  console.log('='.repeat(70));

  const allSchemes = await getTargetUniverse();
  console.log(`[Universe] Found ${allSchemes.length} target equity/hybrid schemes in mf_screener.`);

  const schemesToProcess = allSchemes.slice(0, limit);
  console.log(`[Target] Processing ${schemesToProcess.length} schemes.`);

  const throttler = new RequestThrottler(500, 100);
  const needsReview = [];
  let alreadyFreshCount = 0;
  let fetchedSuccessCount = 0;
  let failedCount = 0;

  for (let i = 0; i < schemesToProcess.length; i++) {
    const scheme = schemesToProcess[i];
    const prefix = `[${i + 1}/${schemesToProcess.length}] [AMFI: ${scheme.code}] ${scheme.name}`;

    try {
      // 1. Staleness evaluation against R2
      if (!isForce) {
        const cached = await r2Get(`${CACHE_PREFIX}${scheme.code}.json`).catch(() => null);
        if (cached && cached.data && Array.isArray(cached.data.holdings) && cached.data.holdings.length > 0 && isFresh(cached.ts)) {
          alreadyFreshCount++;
          console.log(`${prefix} -> CACHED FRESH (${cached.data.holdings.length} holdings, source=${cached.data.source || 'r2'})`);
          continue;
        }
      }

      if (isDryRun) {
        console.log(`${prefix} -> [DRY-RUN] Would fetch from Groww API`);
        fetchedSuccessCount++;
        continue;
      }

      // 2. Fetch using opt-in request-level throttling
      console.log(`${prefix} -> FETCHING from Groww (throttled)...`);
      const data = await getHoldingsData(scheme.code, scheme.name, { throttler, awaitPut: true });

      if (!data || !Array.isArray(data.holdings) || data.holdings.length === 0) {
        console.warn(`⚠️  ${prefix} -> EMPTY or NULL holdings returned`);
        needsReview.push({
          code: scheme.code,
          name: scheme.name,
          category: scheme.category,
          amc: scheme.amc,
          reason: 'Zero or null holdings returned from vendor',
          timestamp: new Date().toISOString(),
        });
        failedCount++;
      } else {
        fetchedSuccessCount++;
        console.log(`✅  ${prefix} -> SUCCESS (${data.holdings.length} holdings stored in R2)`);
      }
    } catch (err) {
      console.error(`❌  ${prefix} -> ERROR: ${err.message}`);
      needsReview.push({
        code: scheme.code,
        name: scheme.name,
        category: scheme.category,
        amc: scheme.amc,
        reason: err.message,
        timestamp: new Date().toISOString(),
      });
      failedCount++;
    }
  }

  // Write audit review log if any schemes failed
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const reviewFile = path.join(dataDir, 'reverse-holdings-needs-review.json');
  fs.writeFileSync(reviewFile, JSON.stringify(needsReview, null, 2), 'utf8');

  console.log('\n' + '='.repeat(70));
  console.log('Cache Sync Completed:');
  console.log(` - Total target schemes: ${schemesToProcess.length}`);
  console.log(` - Already fresh (R2 skipped): ${alreadyFreshCount}`);
  console.log(` - Successfully fetched/verified: ${fetchedSuccessCount}`);
  console.log(` - Needs review (zero holdings / errors): ${failedCount}`);
  console.log(` - Review audit log written to: ${reviewFile}`);
  console.log('='.repeat(70));

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal sync script error:', err);
  process.exit(1);
});
