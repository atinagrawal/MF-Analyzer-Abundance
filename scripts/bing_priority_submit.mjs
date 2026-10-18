#!/usr/bin/env node
/**
 * scripts/bing_priority_submit.mjs
 *
 * Automated Bing Webmaster Tools API Priority Submitter.
 * Utilizes the official Bing Webmaster REST API to submit the highest-impact
 * pages daily within the Bing Webmaster URL submission quota (e.g. 99 URLs/day).
 *
 * Distinct from IndexNow:
 * - IndexNow submits bulk sitemap URLs without quota limits to the search index queue.
 * - This script directly interfaces with Bing Webmaster Tools API using the account API key
 *   (BING_WEBMASTER_API_KEY) to guarantee immediate prioritized crawling and verify feed health.
 *
 * Usage:
 *   node scripts/bing_priority_submit.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env.local if present
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[match[1]] = val.trim();
      }
    }
  }
} catch (_) {}

const DRY_RUN = process.argv.includes('--dry-run');
const SITE_URL = 'https://mfcalc.getabundance.in/';
const API_KEY = process.env.BING_WEBMASTER_API_KEY;
const BASE_API = 'https://ssl.bing.com/webmaster/api.svc/json';

const SITEMAPS = [
  'https://mfcalc.getabundance.in/sitemap.xml',
  'https://mfcalc.getabundance.in/sitemap-pms.xml',
  'https://mfcalc.getabundance.in/sitemap-funds.xml',
  'https://mfcalc.getabundance.in/sitemap-amc.xml',
  'https://mfcalc.getabundance.in/sitemap-nfo.xml',
  'https://mfcalc.getabundance.in/sitemap-indices.xml',
];

const TIER_1_CORE_URLS = [
  'https://mfcalc.getabundance.in/',
  'https://mfcalc.getabundance.in/pms-directory',
  'https://mfcalc.getabundance.in/pms-preferred',
  'https://mfcalc.getabundance.in/screener',
  'https://mfcalc.getabundance.in/nfo',
  'https://mfcalc.getabundance.in/cas-tracker',
  'https://mfcalc.getabundance.in/sifs',
  'https://mfcalc.getabundance.in/sifs/reports/aum-leaderboard',
  'https://mfcalc.getabundance.in/stocks-in-funds',
  'https://mfcalc.getabundance.in/articles',
  'https://mfcalc.getabundance.in/pioneers',
  'https://mfcalc.getabundance.in/geography',
  'https://mfcalc.getabundance.in/industry',
  'https://mfcalc.getabundance.in/rolling',
  'https://mfcalc.getabundance.in/indices',
  'https://mfcalc.getabundance.in/sip-calculator',
  'https://mfcalc.getabundance.in/swp-calculator',
  'https://mfcalc.getabundance.in/compare',
  'https://mfcalc.getabundance.in/book-consultation',
  'https://mfcalc.getabundance.in/pricing',
];

async function getQuota() {
  const url = `${BASE_API}/GetUrlSubmissionQuota?siteUrl=${encodeURIComponent(SITE_URL)}&apikey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GetUrlSubmissionQuota failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.d || { DailyQuota: 0, MonthlyQuota: 0 };
}

async function fetchSitemapUrls(sitemapUrl) {
  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  } catch (err) {
    console.warn(`[Bing Submit] Failed to fetch ${sitemapUrl}: ${err.message}`);
    return [];
  }
}

async function syncFeeds() {
  console.log('[Bing Submit] Checking sitemap feeds in Bing Webmaster Tools...');
  try {
    const res = await fetch(`${BASE_API}/GetFeeds?siteUrl=${encodeURIComponent(SITE_URL)}&apikey=${API_KEY}`);
    if (!res.ok) {
      console.warn(`[Bing Submit] GetFeeds returned HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const existingFeeds = new Set((data?.d || []).map((f) => f.Url));

    for (const feedUrl of SITEMAPS) {
      if (!existingFeeds.has(feedUrl)) {
        console.log(`[Bing Submit] Registering new sitemap feed: ${feedUrl}`);
        if (!DRY_RUN) {
          const submitRes = await fetch(`${BASE_API}/SubmitFeed?apikey=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ siteUrl: SITE_URL, feedUrl }),
          });
          console.log(`[Bing Submit] SubmitFeed ${feedUrl} -> HTTP ${submitRes.status}`);
        }
      } else {
        console.log(`[Bing Submit] Feed confirmed active: ${feedUrl}`);
      }
    }
  } catch (err) {
    console.warn(`[Bing Submit] Error syncing feeds: ${err.message}`);
  }
}

async function run() {
  console.log('=== Bing Webmaster Priority URL Submitter ===');
  console.log(`Site: ${SITE_URL}`);

  if (!API_KEY) {
    console.error('[Bing Submit] Missing BING_WEBMASTER_API_KEY. Exiting.');
    process.exit(1);
  }

  // 1. Check Quota
  const quota = await getQuota();
  console.log(`[Bing Submit] Quota: Daily = ${quota.DailyQuota}, Monthly = ${quota.MonthlyQuota}`);

  if (quota.DailyQuota <= 0) {
    console.log('[Bing Submit] Daily quota exhausted. Skipping submission for today.');
    return;
  }

  // 2. Sync Feeds
  await syncFeeds();

  // 3. Assemble priority URL candidates
  const candidates = [...TIER_1_CORE_URLS];

  // Load top PMS providers from local summary or sitemap
  try {
    const summaryPath = path.resolve(process.cwd(), 'data/pms-compliance-summary.json');
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      if (Array.isArray(summary.topProvidersCore)) {
        for (const p of summary.topProvidersCore) {
          if (p.registrationNo) {
            candidates.push(`https://mfcalc.getabundance.in/pms-directory/${p.registrationNo.toLowerCase()}`);
          }
        }
      }
    }
  } catch (_) {}

  // Pull additional priority URLs from sitemaps: NFOs, top PMS, top AMCs
  const [nfoUrls, pmsUrls, amcUrls] = await Promise.all([
    fetchSitemapUrls('https://mfcalc.getabundance.in/sitemap-nfo.xml'),
    fetchSitemapUrls('https://mfcalc.getabundance.in/sitemap-pms.xml'),
    fetchSitemapUrls('https://mfcalc.getabundance.in/sitemap-amc.xml'),
  ]);

  // Append NFOs (freshly active schemes)
  for (const u of nfoUrls) candidates.push(u);

  // Append top PMS provider profiles
  for (const u of pmsUrls.slice(0, 40)) candidates.push(u);

  // Append top AMCs
  for (const u of amcUrls.slice(0, 20)) candidates.push(u);

  // Deduplicate and cap to available daily quota
  const uniqueUrls = [...new Set(candidates)];
  const urlsToSubmit = uniqueUrls.slice(0, quota.DailyQuota);

  console.log(`[Bing Submit] Selected ${urlsToSubmit.length} priority URLs for submission (capped to daily quota ${quota.DailyQuota}).`);

  if (DRY_RUN) {
    console.log('[Bing Submit] [Dry Run] Would submit the following URLs:');
    urlsToSubmit.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
    return;
  }

  // 4. Submit Batch to Bing Webmaster Tools API
  const submitRes = await fetch(`${BASE_API}/SubmitUrlbatch?apikey=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      siteUrl: SITE_URL,
      urlList: urlsToSubmit,
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => '');
    throw new Error(`SubmitUrlbatch failed: HTTP ${submitRes.status} ${text}`);
  }

  console.log(`[Bing Submit] Successfully submitted ${urlsToSubmit.length} URLs to Bing Webmaster Tools API (HTTP ${submitRes.status}).`);

  // Verify updated quota
  const updatedQuota = await getQuota().catch(() => null);
  if (updatedQuota) {
    console.log(`[Bing Submit] Updated Quota: Daily = ${updatedQuota.DailyQuota}, Monthly = ${updatedQuota.MonthlyQuota}`);
  }

  console.log('[Bing Submit] Done.');
}

run().catch((err) => {
  console.error('[Bing Submit] Fatal error:', err);
  process.exit(1);
});
