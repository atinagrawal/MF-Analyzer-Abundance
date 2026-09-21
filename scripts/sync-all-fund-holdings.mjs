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
import { r2Get, r2Put } from '../lib/r2.js';
import { getHoldingsData, RequestThrottler } from '../lib/holdingsLookup.js';

const CACHE_PREFIX = 'portfolio-creator-holdings/';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const isAmcOnly = args.includes('--amc-only');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const codeArg = args.find((a) => a.startsWith('--code='));
const targetCode = codeArg ? codeArg.split('=')[1] : null;

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function accumulateAmcData(amcMap, amcName, data) {
  if (!amcName || !data) return;
  const amcSlug = slugify(amcName);
  let record = amcMap.get(amcSlug);
  if (!record) {
    record = { amcSlug, amcName, info: null, managersMap: new Map() };
    amcMap.set(amcSlug, record);
  }

  // Capture structured facts only (NO narrative copy)
  if (data.amcInfo && !record.info) {
    record.info = {
      name: data.amcInfo.name || amcName,
      legalName: data.amcInfo.legalName || amcName,
      address: data.amcInfo.address || null,
      phone: data.amcInfo.phone || null,
      email: data.amcInfo.email || null,
      website: data.amcInfo.website || null,
      launchDate: data.amcInfo.launchDate || null,
      rank: data.amcInfo.rank || null,
    };
  }

  // Accumulate and deduplicate fund managers by person_name
  if (Array.isArray(data.fundManagerDetails)) {
    for (const m of data.fundManagerDetails) {
      if (!m.person_name) continue;
      const key = m.person_name.trim().toLowerCase();
      const existing = record.managersMap.get(key);
      if (!existing) {
        record.managersMap.set(key, {
          name: m.person_name.trim(),
          education: m.education || null,
          experience: m.experience || null,
          fundsManaged: Array.isArray(m.funds_managed)
            ? m.funds_managed.map((f) => ({
                schemeName: f.scheme_name,
                schemeCode: f.scheme_code,
              }))
            : [],
        });
      } else {
        if (Array.isArray(m.funds_managed)) {
          const seenCodes = new Set(existing.fundsManaged.map((f) => f.schemeCode));
          for (const f of m.funds_managed) {
            if (!seenCodes.has(f.scheme_code)) {
              existing.fundsManaged.push({
                schemeName: f.scheme_name,
                schemeCode: f.scheme_code,
              });
              seenCodes.add(f.scheme_code);
            }
          }
        }
        if (!existing.education && m.education) existing.education = m.education;
        if (!existing.experience && m.experience) existing.experience = m.experience;
      }
    }
  }
}

async function saveAmcProfiles(amcMap) {
  if (amcMap.size === 0) return;
  console.log('\n' + '='.repeat(70));
  console.log(`[AMC Profiles] Persisting profiles for ${amcMap.size} AMCs to Cloudflare R2...`);
  console.log('='.repeat(70));

  for (const [slug, record] of amcMap.entries()) {
    const profile = {
      amcSlug: slug,
      amcName: record.amcName,
      syncedAt: new Date().toISOString(),
      info: record.info || {
        name: record.amcName,
        legalName: record.amcName,
        address: null,
        phone: null,
        email: null,
        website: null,
        launchDate: null,
        rank: null,
      },
      managers: Array.from(record.managersMap.values()),
    };

    if (isDryRun) {
      console.log(`[DRY-RUN] Would save: amc-profiles/${slug}.json (${profile.managers.length} managers)`);
      continue;
    }

    try {
      await r2Put(`amc-profiles/${slug}.json`, JSON.stringify(profile, null, 2));
      console.log(` ✅ [AMC Profile] Saved: amc-profiles/${slug}.json (${profile.managers.length} managers)`);
    } catch (err) {
      console.error(` ❌ [AMC Profile] Failed to save amc-profiles/${slug}.json: ${err.message}`);
    }
  }
}

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
  const amcMap = new Map();

  // ── FAST-PATH AMC-ONLY BOOTSTRAP MODE ───────────────────────────────────────
  if (isAmcOnly) {
    console.log('\n[Mode: AMC-ONLY] Bootstrapping AMC profiles across all distinct AMCs in mf_screener...');
    const amcRes = await pool.query(`
      SELECT amc, count(*) as scheme_count
      FROM mf_screener
      WHERE amc IS NOT NULL
      GROUP BY amc
      ORDER BY scheme_count DESC
    `);
    console.log(`[Universe] Found ${amcRes.rows.length} distinct AMCs in mf_screener.`);

    const targetAmcs = amcRes.rows.slice(0, limit);
    for (let i = 0; i < targetAmcs.length; i++) {
      const amcRow = targetAmcs[i];
      const amcName = amcRow.amc;
      const amcPrefix = `[${i + 1}/${targetAmcs.length}] ${amcName}`;
      console.log(`\n${amcPrefix} (${amcRow.scheme_count} total schemes)`);

      // Query 2 representative schemes (equity first, then hybrid)
      const sampleRes = await pool.query(`
        SELECT code, name, category, amc
        FROM mf_screener
        WHERE amc = $1
        ORDER BY
          CASE WHEN category ILIKE '%equity%' THEN 1 WHEN category ILIKE '%hybrid%' THEN 2 ELSE 3 END,
          ret_3y DESC NULLS LAST,
          code ASC
        LIMIT 2
      `, [amcName]);

      for (const scheme of sampleRes.rows) {
        console.log(`  -> Fetching sample scheme [${scheme.code}]: ${scheme.name}...`);
        if (isDryRun) {
          console.log(`     [DRY-RUN] Would fetch from Groww`);
          continue;
        }
        try {
          const data = await getHoldingsData(scheme.code, scheme.name, { throttler, awaitPut: true });
          if (data) {
            accumulateAmcData(amcMap, scheme.amc, data);
            console.log(`     ✅ Captured scheme data (amcInfo: ${Boolean(data.amcInfo)}, managers: ${data.fundManagerDetails?.length || 0})`);
          }
        } catch (err) {
          console.warn(`     ⚠️ Error fetching scheme ${scheme.code}: ${err.message}`);
        }
      }
    }

    await saveAmcProfiles(amcMap);
    console.log('\n[AMC-ONLY Bootstrap Finished]');
    await pool.end();
    process.exit(0);
  }

  // ── FULL RUN: ACTIVE SCHEMES CRAWL ──────────────────────────────────────────
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
          accumulateAmcData(amcMap, scheme.amc, cached.data);
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
        accumulateAmcData(amcMap, scheme.amc, data);
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

  // Persist accumulated AMC profiles to R2
  await saveAmcProfiles(amcMap);

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
