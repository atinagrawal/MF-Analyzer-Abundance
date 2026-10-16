#!/usr/bin/env node
/**
 * scripts/bing_telemetry.mjs
 *
 * Automated Bing Webmaster Search & Crawl Diagnostics Telemetry.
 * Queries Bing Webmaster REST API to retrieve:
 * 1. Crawl statistics (HTTP 2xx, 4xx, 5xx, robots blocks, malware, pages in index).
 * 2. Search query performance (search impressions, clicks, CTR, average rank position).
 * 3. Saves a persistent summary snapshot to data/bing-telemetry-summary.json.
 *
 * Usage:
 *   node scripts/bing_telemetry.mjs
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

const SITE_URL = 'https://mfcalc.getabundance.in/';
const API_KEY = process.env.BING_WEBMASTER_API_KEY || 'a3e39a7bf9d8469a815ccdeb6f167d48';
const BASE_API = 'https://ssl.bing.com/webmaster/api.svc/json';

function parseDotNetDate(dateStr) {
  if (!dateStr) return null;
  const m = /\/Date\((\d+)\)\//.exec(dateStr);
  return m ? new Date(parseInt(m[1], 10)).toISOString().split('T')[0] : dateStr;
}

async function run() {
  console.log('=== Bing Webmaster Telemetry & Diagnostics ===');
  console.log(`Site: ${SITE_URL}`);

  if (!API_KEY) {
    console.error('[Bing Telemetry] Missing BING_WEBMASTER_API_KEY. Exiting.');
    process.exit(1);
  }

  // 1. Crawl Stats
  let crawlSummary = null;
  try {
    const res = await fetch(`${BASE_API}/GetCrawlStats?siteUrl=${encodeURIComponent(SITE_URL)}&apikey=${API_KEY}`);
    if (res.ok) {
      const data = await res.json();
      const records = data?.d || [];
      if (records.length > 0) {
        // Most recent record
        const latest = records[records.length - 1];
        crawlSummary = {
          date: parseDotNetDate(latest.Date),
          crawledPages: latest.CrawledPages,
          inIndex: latest.InIndex,
          code2xx: latest.Code2xx,
          code4xx: latest.Code4xx,
          code5xx: latest.Code5xx,
          blockedByRobotsTxt: latest.BlockedByRobotsTxt,
          dnsFailures: latest.DnsFailures,
          connectionTimeout: latest.ConnectionTimeout,
          crawlErrors: latest.CrawlErrors,
        };
      }
    }
  } catch (err) {
    console.warn(`[Bing Telemetry] Crawl stats fetch error: ${err.message}`);
  }

  // 2. Query Stats (Search queries & impressions)
  let topQueries = [];
  let totalImpressions = 0;
  let totalClicks = 0;
  try {
    const res = await fetch(`${BASE_API}/GetQueryStats?siteUrl=${encodeURIComponent(SITE_URL)}&apikey=${API_KEY}`);
    if (res.ok) {
      const data = await res.json();
      const records = data?.d || [];
      const queryMap = new Map();

      for (const r of records) {
        const q = r.Query;
        if (!q) continue;
        const existing = queryMap.get(q) || { query: q, impressions: 0, clicks: 0, avgPosition: r.AvgImpressionPosition };
        existing.impressions += r.Impressions || 0;
        existing.clicks += r.Clicks || 0;
        totalImpressions += r.Impressions || 0;
        totalClicks += r.Clicks || 0;
        queryMap.set(q, existing);
      }

      topQueries = [...queryMap.values()].sort((a, b) => b.impressions - a.impressions).slice(0, 15);
    }
  } catch (err) {
    console.warn(`[Bing Telemetry] Query stats fetch error: ${err.message}`);
  }

  // 3. Print Report
  console.log('\n--- Bing Crawl Health ---');
  if (crawlSummary) {
    console.log(`Latest Crawl Date : ${crawlSummary.date}`);
    console.log(`Pages in Bing Index: ${crawlSummary.inIndex}`);
    console.log(`2xx Successful   : ${crawlSummary.code2xx}`);
    console.log(`4xx Client Errors : ${crawlSummary.code4xx}`);
    console.log(`5xx Server Errors : ${crawlSummary.code5xx}`);
    console.log(`Robots.txt Blocks : ${crawlSummary.blockedByRobotsTxt}`);
    console.log(`Crawl Errors Total: ${crawlSummary.crawlErrors}`);
  } else {
    console.log('No recent crawl stats returned.');
  }

  console.log('\n--- Bing Search Query Performance ---');
  console.log(`Total Tracked Impressions : ${totalImpressions}`);
  console.log(`Total Tracked Clicks       : ${totalClicks}`);
  if (topQueries.length > 0) {
    console.log('\nTop Search Queries:');
    topQueries.forEach((q, idx) => {
      console.log(`  ${idx + 1}. "${q.query}" -> ${q.impressions} impr, ${q.clicks} clicks (Avg Pos: ${q.avgPosition})`);
    });
  } else {
    console.log('No search queries tracked yet.');
  }

  // 4. Save persistent telemetry JSON
  const outputData = {
    updatedAt: new Date().toISOString(),
    siteUrl: SITE_URL,
    crawl: crawlSummary,
    totals: {
      impressions: totalImpressions,
      clicks: totalClicks,
    },
    topQueries,
  };

  try {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const targetFile = path.join(dataDir, 'bing-telemetry-summary.json');
    fs.writeFileSync(targetFile, JSON.stringify(outputData, null, 2), 'utf8');
    console.log(`\n[Bing Telemetry] Saved summary to ${path.relative(process.cwd(), targetFile)}`);
  } catch (err) {
    console.warn(`[Bing Telemetry] Failed to write summary JSON: ${err.message}`);
  }

  console.log('[Bing Telemetry] Done.');
}

run().catch((err) => {
  console.error('[Bing Telemetry] Fatal error:', err);
  process.exit(1);
});
