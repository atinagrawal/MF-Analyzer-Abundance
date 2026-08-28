#!/usr/bin/env node
/**
 * scripts/backfill-pms-detail-pages.mjs
 *
 * Eagerly pre-warms the R2 cache (pms-details-cache/{iaid}.json and
 * pms-period-history-cache/{iaid}.json -- the SAME keys app/api/pms-details/
 * route.js and app/api/pms-period-history/route.js read) for the "curated"
 * set of PMS strategies: providers NOT excluded by the PMS Screener's own
 * small-AUM filter (app/pms-screener/page.jsx's smallAumProviders logic,
 * ported here since a script can't import a 'use client' page component).
 *
 * Everything below that threshold still works correctly -- it just
 * backfills lazily on that visitor's first real page view instead (see
 * docs/superpowers/specs/2026-08-28-pms-detail-pages-design.md).
 *
 * Usage:
 *   node scripts/backfill-pms-detail-pages.mjs [--dry-run] [--limit=N]
 *
 * Run via GitHub Actions (.github/workflows/pms-detail-backfill.yml),
 * workflow_dispatch or monthly schedule.
 */

import { fetchPmsDetails, fetchPmsMonthSnapshot, monthsFrom, EARLIEST_YEAR, EARLIEST_MONTH, MONTH_ABBR } from '../lib/pmsScrapers.js';

const STRATEGIES = ['Equity', 'Debt', 'Multi Asset', 'Hybrid'];
const AUM_THRESHOLD = { Equity: 50, Debt: 10, 'Multi Asset': 10, Hybrid: 10 };
const FETCH_DELAY_MS = 200;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Same scrapeAPMI shape as app/api/pms-data/route.js -- one leaderboard call
 * per strategy. Requests the PREVIOUS calendar month, not the current one:
 * APMI has typically not yet published the current month's leaderboard data
 * (confirmed live during Task 8's review -- requesting the current month
 * returned a completely empty/wrong result). Same fix as
 * app/sitemap-pms.xml/route.js's fetchLeaderboard.
 */
async function fetchLeaderboard(strategy) {
  const now = new Date();
  let month = now.getMonth(); // 0-indexed current month == 1-indexed PREVIOUS month
  let year = now.getFullYear();
  if (month === 0) { month = 12; year -= 1; } // January edge case
  const params = new URLSearchParams();
  params.append('strategyname', strategy);
  params.append('servicetype', 'D');
  params.append('', '');
  params.append('', '');
  params.append('fromMonth', String(month));
  params.append('fromYears', String(year));
  params.append('asOnDate', `${year}-${month}-${new Date(year, month, 0).getDate()}`);

  const res = await fetch('https://www.apmiindia.org/apmi/welcomeiaperformance.htm?action=loadIAReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.apmiindia.org/' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`APMI leaderboard responded ${res.status} for strategy ${strategy}`);
  const html = await res.text();

  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  const rows = [];
  $('table tr').each((index, el) => {
    if (index === 0) return;
    const tds = $(el).find('td');
    if (tds.length < 12) return;
    const href = $(tds[1]).find('a').attr('href');
    const iaidMatch = href ? href.match(/IAID=(\d+)/) : null;
    if (!iaidMatch) return;
    rows.push({
      iaid: iaidMatch[1],
      portfolioManager: $(tds[0]).text().trim(),
      aum: parseFloat($(tds[2]).text().trim().replace(/[₹,]/g, '')) || 0,
    });
  });
  return rows;
}

/** Ports app/pms-screener/page.jsx's smallAumProviders logic -- provider-level exclusion. */
function computeCuratedSet(rows, strategy) {
  const threshold = AUM_THRESHOLD[strategy];
  const byProvider = {};
  rows.forEach((r) => {
    if (!byProvider[r.portfolioManager]) byProvider[r.portfolioManager] = [];
    byProvider[r.portfolioManager].push(r.aum);
  });
  const smallProviders = new Set(
    Object.entries(byProvider)
      .filter(([, aums]) => aums.every((a) => a < threshold))
      .map(([mgr]) => mgr)
  );
  return rows.filter((r) => !smallProviders.has(r.portfolioManager));
}

async function backfillOneStrategy(iaid, r2Put, r2Get) {
  // -- Details --
  try {
    const details = await fetchPmsDetails(iaid);
    if (details) {
      await r2Put(`pms-details-cache/${iaid}.json`, JSON.stringify({ data: details, ts: Date.now() }));
    }
  } catch (e) {
    console.warn(`[backfill] details failed for IAID ${iaid}: ${e.message}`);
  }
  await sleep(FETCH_DELAY_MS);

  // -- Period history: extend existing cache, or full backfill if none --
  try {
    const existing = await r2Get(`pms-period-history-cache/${iaid}.json`).catch(() => null);
    const existingData = existing?.data || [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let months;
    if (!existingData.length) {
      months = monthsFrom(EARLIEST_YEAR, EARLIEST_MONTH, currentYear, currentMonth);
    } else {
      const [abbr, yearStr] = existingData[existingData.length - 1].asOnMonth.split('-');
      const lastYear = parseInt(yearStr, 10);
      const lastMonth = MONTH_ABBR.indexOf(abbr) + 1;
      if (lastYear === currentYear && lastMonth === currentMonth) {
        months = []; // already current
      } else {
        const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
        const nextYear = lastMonth === 12 ? lastYear + 1 : lastYear;
        months = monthsFrom(nextYear, nextMonth, currentYear, currentMonth);
      }
    }

    if (months.length) {
      const newSnapshots = [];
      for (const { year, month } of months) {
        const snap = await fetchPmsMonthSnapshot(iaid, year, month);
        if (snap) newSnapshots.push(snap);
        await sleep(FETCH_DELAY_MS);
      }
      const merged = [...existingData, ...newSnapshots];
      if (merged.length !== existingData.length) {
        await r2Put(`pms-period-history-cache/${iaid}.json`, JSON.stringify({ data: merged, ts: Date.now() }));
      }
    }
  } catch (e) {
    console.warn(`[backfill] period-history failed for IAID ${iaid}: ${e.message}`);
  }
}

async function main() {
  const { r2Put, r2Get } = await import('../lib/r2.js');

  console.log(`=== PMS detail pages backfill${isDryRun ? ' [DRY RUN]' : ''} ===`);

  const perStrategyRows = await Promise.all(STRATEGIES.map((s) => fetchLeaderboard(s)));
  let curated = [];
  STRATEGIES.forEach((strategy, i) => {
    curated = curated.concat(computeCuratedSet(perStrategyRows[i], strategy));
  });

  // De-dupe by IAID -- a strategy shouldn't appear twice, but be defensive.
  const seen = new Set();
  curated = curated.filter((r) => (seen.has(r.iaid) ? false : (seen.add(r.iaid), true)));

  console.log(`Curated set: ${curated.length} strategies across ${STRATEGIES.length} categories`);

  const toProcess = curated.slice(0, limit);
  console.log(`Processing ${toProcess.length} strategies${limit !== Infinity ? ` (limited to ${limit})` : ''}`);

  if (isDryRun) {
    console.log('[Dry Run] Would backfill IAIDs:', toProcess.map((r) => r.iaid).join(', '));
    return;
  }

  let done = 0;
  for (const row of toProcess) {
    await backfillOneStrategy(row.iaid, r2Put, r2Get);
    done += 1;
    if (done % 10 === 0) console.log(`Progress: ${done}/${toProcess.length}`);
  }

  console.log(`=== Backfill complete: ${done}/${toProcess.length} strategies processed ===`);
}

main().catch((err) => {
  console.error('[backfill-pms-detail-pages] Fatal error:', err);
  process.exit(1);
});
