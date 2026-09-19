// tests/tickertapeMfRatios.test.js
//
// Unit tests for lib/tickertapeMfRatios.js's normalizeForMatch, parseSitemap
// (pure), and getTickertapeRatios (against a mocked global.fetch -- same
// pattern as tests/distributorResolution.test.js).
// lib/tickertapeMfRatios.js uses ES module import/export syntax, and this
// project's package.json has no "type": "module", so plain require()
// cannot load it under Node's CommonJS default -- use dynamic import()
// instead.
// Run with: node tests/tickertapeMfRatios.test.js

const assert = require('assert');

(async () => {
  const { normalizeForMatch, parseSitemap, getTickertapeRatios, __resetCacheForTests } = await import('../lib/tickertapeMfRatios.js');

  console.log('=== Running tickertapeMfRatios Unit Tests ===\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${e.message}`);
      failed++;
    }
  }

  // Installs a mock global.fetch for the duration of `fn`, keyed by a
  // url -> { ok, status, text } lookup table (only the methods
  // lib/tickertapeMfRatios.js's fetchText actually calls), then restores
  // the original fetch afterward regardless of whether fn throws.
  async function withMockFetch(responses, fn) {
    const original = global.fetch;
    global.fetch = async (url) => {
      for (const [pattern, body] of responses) {
        if (url.includes(pattern)) return { ok: true, status: 200, text: async () => body };
      }
      return { ok: false, status: 404, text: async () => '' };
    };
    try { await fn(); } finally { global.fetch = original; }
  }

  // ── normalizeForMatch ────────────────────────────────────────────────
  test('normalizeForMatch strips plan/option words even glued onto "fund" with no separator', () => {
    assert.strictEqual(normalizeForMatch('hdfc-flexi-cap-fundidcw'), normalizeForMatch('hdfc-flexi-cap-fund'));
  });

  test('normalizeForMatch treats a real fund name and its matching sitemap slug the same', () => {
    assert.strictEqual(normalizeForMatch('HDFC Flexi Cap Fund - Direct Plan - Growth'), normalizeForMatch('hdfc-flexi-cap-fund'));
  });

  test('normalizeForMatch is case-insensitive and hyphen/space agnostic', () => {
    assert.strictEqual(normalizeForMatch('ICICI Prudential Multi-Asset Active FOF'), normalizeForMatch('icici-prudential-multi-asset-active-fof'));
  });

  test('normalizeForMatch reconciles "ICICI Prudential" with Tickertape\'s own "ICICI Pru" slug branding', () => {
    // Real gap found during design: AMFI's full "ICICI Prudential" name
    // never matched Tickertape's abbreviated slugs until this alias was
    // added -- verified against the live site's own
    // icici-pru-multi-asset-active-fof-M_ICRMI entry.
    assert.strictEqual(normalizeForMatch('ICICI Prudential Multi-Asset Active FOF'), normalizeForMatch('icici-pru-multi-asset-active-fof'));
  });

  // ── parseSitemap ─────────────────────────────────────────────────────
  const SAMPLE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.tickertape.in/mutualfunds/hdfc-flexi-cap-fund-M_HDCEQ</loc></url>
  <url><loc>https://www.tickertape.in/mutualfunds/hdfc-flexi-cap-fundidcw-M_HDEN</loc></url>
  <url><loc>https://www.tickertape.in/mutualfunds/hdfc-flexi-cap-fundidcw-reinv-M_HDCEE</loc></url>
  <url><loc>https://www.tickertape.in/mutualfunds/icici-prudential-gold-etf-fof-M_ICGF</loc></url>
</urlset>`;

  test('parseSitemap extracts slug + mfId from every <loc> entry', () => {
    const entries = parseSitemap(SAMPLE_SITEMAP);
    assert.strictEqual(entries.length, 4);
    assert.deepStrictEqual(entries[0], {
      slug: 'hdfc-flexi-cap-fund-M_HDCEQ', mfId: 'M_HDCEQ',
      normalized: normalizeForMatch('hdfc-flexi-cap-fund'), isBare: true,
    });
  });

  test('parseSitemap marks IDCW/reinvestment variants as not bare, but normalizes them to the same name as the Growth variant', () => {
    const entries = parseSitemap(SAMPLE_SITEMAP);
    const idcw = entries.find(e => e.mfId === 'M_HDEN');
    const reinv = entries.find(e => e.mfId === 'M_HDCEE');
    const bare = entries.find(e => e.mfId === 'M_HDCEQ');
    assert.strictEqual(idcw.isBare, false);
    assert.strictEqual(reinv.isBare, false);
    assert.strictEqual(idcw.normalized, bare.normalized);
    assert.strictEqual(reinv.normalized, bare.normalized);
  });

  // ── getTickertapeRatios (mocked fetch) ───────────────────────────────
  const SAMPLE_PAGE_HTML = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { mfPageFaq: { ratios: { pe: 26.63, catPe: 28.81, sortino: -0.04, alpha: 1.19, sharpe: -0.37, stdDev: 12.55 } } } } },
  )}</script></body></html>`;

  await test('getTickertapeRatios matches by normalized name and extracts pe/catPe/sortino/alpha from __NEXT_DATA__', async () => {
    __resetCacheForTests();
    await withMockFetch([
      ['sitemaps/mutualfunds/sitemap.xml', SAMPLE_SITEMAP],
      ['hdfc-flexi-cap-fund-M_HDCEQ', SAMPLE_PAGE_HTML],
    ], async () => {
      const ratios = await getTickertapeRatios('HDFC Flexi Cap Fund - Direct Plan - Growth');
      assert.deepStrictEqual(ratios, { pe: 26.63, catPe: 28.81, sortino: -0.04, alpha: 1.19 });
    });
  });

  await test('getTickertapeRatios never returns Std Dev/Sharpe -- this app self-computes those', async () => {
    __resetCacheForTests();
    await withMockFetch([
      ['sitemaps/mutualfunds/sitemap.xml', SAMPLE_SITEMAP],
      ['hdfc-flexi-cap-fund-M_HDCEQ', SAMPLE_PAGE_HTML],
    ], async () => {
      const ratios = await getTickertapeRatios('HDFC Flexi Cap Fund - Direct Plan - Growth');
      assert.strictEqual('stdDev' in ratios, false);
      assert.strictEqual('sharpe' in ratios, false);
    });
  });

  const FOF_PAGE_HTML = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { mfPageFaq: { ratios: { pe: null, catPe: null, sortino: -0.1019, alpha: 3.38, sharpe: -1.01, stdDev: 5.2 } } } } },
  )}</script></body></html>`;

  await test('getTickertapeRatios still returns available fields (sortino/alpha) when pe/catPe are null -- a real Fund-of-Funds has no portfolio PE', async () => {
    __resetCacheForTests();
    await withMockFetch([
      ['sitemaps/mutualfunds/sitemap.xml', SAMPLE_SITEMAP],
      ['hdfc-flexi-cap-fund-M_HDCEQ', FOF_PAGE_HTML],
    ], async () => {
      const ratios = await getTickertapeRatios('HDFC Flexi Cap Fund');
      assert.deepStrictEqual(ratios, { pe: null, catPe: null, sortino: -0.1019, alpha: 3.38 });
    });
  });

  await test('getTickertapeRatios returns null (not a throw) when no sitemap entry matches', async () => {
    __resetCacheForTests();
    await withMockFetch([
      ['sitemaps/mutualfunds/sitemap.xml', SAMPLE_SITEMAP],
    ], async () => {
      const ratios = await getTickertapeRatios('Some Totally Unrelated Scheme Name');
      assert.strictEqual(ratios, null);
    });
  });

  await test('getTickertapeRatios returns null (not a throw) when the sitemap fetch itself fails', async () => {
    __resetCacheForTests();
    await withMockFetch([], async () => {
      const ratios = await getTickertapeRatios('HDFC Flexi Cap Fund');
      assert.strictEqual(ratios, null);
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
