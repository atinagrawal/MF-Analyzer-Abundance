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

const SITE = 'https://mfcalc.getabundance.in';
const INDEXNOW_KEY = '63d50a3361c1f2289eeb84fb2104b366';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

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

async function submitBatch(urls) {
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  });
  // IndexNow returns 200/202 on success; 200 means "already known, no-op"
  // is also fine -- neither is an error worth failing the job over.
  if (!res.ok && res.status !== 202) {
    throw new Error(`IndexNow submit failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return res.status;
}

async function run() {
  const urlSets = await Promise.all(SITEMAPS.map(fetchSitemapUrls));
  const urls = [...new Set(urlSets.flat())];
  if (!urls.length) {
    console.log('[IndexNow] No URLs found across any sitemap -- nothing to submit.');
    return;
  }
  console.log(`[IndexNow] Submitting ${urls.length} URLs from ${SITEMAPS.length} sitemaps...`);

  const batches = chunk(urls, 10000); // IndexNow's documented per-request cap
  for (const [i, batch] of batches.entries()) {
    const status = await submitBatch(batch);
    console.log(`[IndexNow] Batch ${i + 1}/${batches.length} (${batch.length} URLs) -> HTTP ${status}`);
  }
  console.log('[IndexNow] Done.');
}

run().catch((e) => {
  console.error('[IndexNow] Fatal error:', e);
  process.exit(1);
});
