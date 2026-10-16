/**
 * scripts/submit_indexnow.js
 *
 * Pings IndexNow (api.indexnow.org, fans out to Bing + Yandex -- Google
 * ignores IndexNow entirely, it still relies on crawling + the sitemap) with
 * every URL currently listed across this site's sitemaps, so Bing doesn't
 * have to wait for its own crawl schedule to notice changed/new pages.
 *
 * Key file: public/63d50a3361c1f2289eeb84fb2104b366.txt (the raw key,
 * served at https://mfcalc.getabundance.in/<key>.txt -- IndexNow's own
 * ownership-verification mechanism, no separate webmaster-tools step
 * needed for this specific protocol).
 *
 * No per-page "did this actually change" tracking -- the data behind
 * almost every page here (NAVs, returns) genuinely changes daily, and
 * IndexNow has no concept of "unchanged, skip it" anyway: submitting a
 * URL again just tells Bing "worth a look," it's not an error to resubmit
 * something stable. Simpler and more maintainable than wiring a
 * changed-URL tracker into every nightly job that touches page data.
 */

const fs = require('fs');
const path = require('path');

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

const SITE = 'https://mfcalc.getabundance.in';
const INDEXNOW_KEY = process.env.BING_WEBMASTER_API_KEY || 'a3e39a7bf9d8469a815ccdeb6f167d48';
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
];

const SITEMAPS = [
  '/sitemap.xml',
  '/sitemap-amc.xml',
  '/sitemap-funds.xml',
  '/sitemap-pms.xml',
  '/sitemap-nfo.xml',
  '/sitemap-indices.xml',
];

async function fetchSitemapUrls(path) {
  const res = await fetch(`${SITE}${path}`);
  if (!res.ok) {
    console.warn(`[IndexNow] ${path} returned ${res.status}, skipping`);
    return [];
  }
  const xml = await res.text();
  // Sitemap <loc> entries are always a single line, no attributes -- a
  // plain regex is simpler and dependency-free vs. a full XML parser for
  // extracting just this one field.
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function resolveActiveKey() {
  const preferred = process.env.BING_WEBMASTER_API_KEY || 'a3e39a7bf9d8469a815ccdeb6f167d48';
  try {
    const res = await fetch(`${SITE}/${preferred}.txt`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text === preferred) return preferred;
    }
  } catch (_) {}
  return '63d50a3361c1f2289eeb84fb2104b366';
}

async function submitBatchToEndpoint(endpoint, urls, key) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: key,
      keyLocation: `${SITE}/${key}.txt`,
      urlList: urls,
    }),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`IndexNow submit to ${endpoint} failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return res.status;
}

async function submitBatch(urls, key) {
  const results = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const status = await submitBatchToEndpoint(endpoint, urls, key);
      results.push(`${new URL(endpoint).host}: HTTP ${status}`);
    } catch (err) {
      console.warn(`[IndexNow] ${endpoint} warning: ${err.message}`);
    }
  }
  return results.join(', ') || 'OK';
}

async function run() {
  const urlSets = await Promise.all(SITEMAPS.map(fetchSitemapUrls));
  const urls = [...new Set(urlSets.flat())];
  if (!urls.length) {
    console.log('[IndexNow] No URLs found across any sitemap -- nothing to submit.');
    return;
  }
  const activeKey = await resolveActiveKey();
  console.log(`[IndexNow] Using verification key: ${activeKey}`);
  console.log(`[IndexNow] Submitting ${urls.length} URLs from ${SITEMAPS.length} sitemaps...`);

  const batches = chunk(urls, 10000); // IndexNow's documented per-request cap
  for (const [i, batch] of batches.entries()) {
    const status = await submitBatch(batch, activeKey);
    console.log(`[IndexNow] Batch ${i + 1}/${batches.length} (${batch.length} URLs) -> ${status}`);
  }
  console.log('[IndexNow] Done.');
}

run().catch((e) => {
  console.error('[IndexNow] Fatal error:', e);
  process.exit(1);
});
