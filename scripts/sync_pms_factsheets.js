/**
 * scripts/sync_pms_factsheets.js
 *
 * Syncs publicly-downloadable, strategy-level PMS factsheet/presentation
 * PDFs from AMC-owned websites (NOT APMI -- a separate concern from
 * lib/pmsScrapers.js) into one R2 document, consumed by
 * lib/pmsFactsheetsCache.js and composed into
 * app/api/pms-detail/[id]/route.js's response.
 *
 * Covers exactly the 4 providers verified live during research (see
 * pms_factsheets_research.txt and this session's chat history for the
 * verification trail): Carnelian Capital, Stallion Asset, Narnolia
 * Financial Advisors, and Renaissance Investment Managers. Every other
 * PMS provider's detail page is unaffected -- lib/pmsFactsheetsCache.js's
 * matchProvider() simply returns no match for anything not in this list,
 * and the UI section doesn't render.
 *
 * Each provider has a genuinely different technical shape (verified, not
 * assumed):
 *   - Carnelian: a clean WordPress REST API (wp-json/wp/v2/media) --
 *     the most reliable source here.
 *   - Stallion: 3 fixed, static URLs (same filename, overwritten monthly
 *     in place) -- no discovery needed, just existence-checked.
 *   - Narnolia: real, static, server-rendered HTML -- scraped with
 *     cheerio against verified real markup (a `.categorywrapper.pmscategory
 *     [data-parent]` div per strategy).
 *   - Renaissance: also scraped, but the /factsheets page's static HTML
 *     was verified DURING RESEARCH to lag behind the true current month
 *     (showed July when a later month was expected) -- this fetcher
 *     stores whatever the live page actually shows, with the real
 *     resolved period text, rather than assuming freshness. A visible
 *     "as of" period in the UI is how that honesty surfaces, not a
 *     silently-wrong "latest" label.
 *
 * Usage:
 *   node scripts/sync_pms_factsheets.js [--dry-run]
 *   node scripts/sync_pms_factsheets.js --self-test
 */

const cheerio = require('cheerio');
const { backupThenPut } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'pms-factsheets.json';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 800) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...options, headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if ((res.status === 429 || res.status >= 500) && i < retries) {
        await sleep(delayMs * (i + 1));
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries) {
        await sleep(delayMs * (i + 1));
        continue;
      }
      throw err;
    }
  }
}

function decodeHtmlEntities(str) {
  return (str || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–');
}

// "LARGE CAP" -> "Large Cap". Simple, deliberate -- see the NFO sync
// script's toTitleCase for the same reasoning (no acronym exceptions). One
// addition verified necessary here: a token mixing digits and letters
// (e.g. "5T", from Narnolia's real "5T X 5T" strategy name) keeps its
// original casing rather than being lowercased -- plain \b\w-based
// title-casing has no word boundary between "5" and "T" (both are \w),
// so naive title-casing silently produces "5t" instead.
function toTitleCase(raw) {
  if (!raw) return '';
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (/\d/.test(word) && /[a-zA-Z]/.test(word)) return word;
      return word.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    })
    .join(' ');
}

// Extracts a "Month YYYY" period from a filename or URL by finding a real
// month name adjacent to a year -- verified necessary because the
// SURROUNDING page text (Narnolia's performance-table note, Renaissance's
// generic anchor label) is NOT reliably in sync with the actual linked
// PDF's own date; the filename itself is the one place both sites encode
// the document's real period. Takes the LAST month+year match in the
// string, since some filenames carry other numbers (CMS ids, etc.) before
// the real date. Returns null (never a fabricated period) if no
// recognizable month+year is found.
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_PATTERN = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
function extractPeriodFromFilename(urlOrFilename) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlOrFilename);
  } catch {
    decoded = urlOrFilename;
  }
  const re = new RegExp(`(${MONTH_PATTERN})[\\s_'-]*(\\d{4}|\\d{2})\\b`, 'gi');
  let match;
  let last = null;
  while ((match = re.exec(decoded)) !== null) last = match;
  if (!last) return null;
  const [, month, yearRaw] = last;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  const idx = MONTH_FULL.findIndex((m) => m.toLowerCase().startsWith(month.toLowerCase().slice(0, 3)));
  return `${idx >= 0 ? MONTH_FULL[idx] : month} ${year}`;
}

// ── Carnelian: WordPress Media Library REST API ─────────────────────────────
// "Factsheet_Shift Strategy (PMS) – August 2026" -> {strategyName: "Shift
// Strategy", period: "August 2026"}. "Carnelian Shift Strategy Presentation
// – August 2026" -> same, for the presentation title shape. A general,
// non-strategy-specific deck ("Carnelian Introduction Presentation") is
// deliberately excluded -- it isn't tied to one strategy.
function parseCarnelianTitle(rawTitle, docType) {
  const title = decodeHtmlEntities(rawTitle).trim();
  let rest;
  if (docType === 'factsheet') {
    const m = /^Factsheet_(.+)$/i.exec(title);
    if (!m) return null;
    rest = m[1];
  } else {
    const m = /^Carnelian\s+(.+?)\s+Presentation\s*[-–]\s*(.+)$/i.exec(title);
    if (!m) return null;
    const strategyName = m[1].trim();
    if (/^Introduction$/i.test(strategyName)) return null;
    return { strategyName, period: m[2].trim() };
  }
  const dashIdx = rest.search(/[–-]/);
  if (dashIdx === -1) return null;
  let strategyName = rest.slice(0, dashIdx).trim();
  const period = rest.slice(dashIdx + 1).trim();
  strategyName = strategyName.replace(/\(PMS\)/i, '').replace(/\bPMS\b/i, '').trim();
  if (!strategyName || !period) return null;
  return { strategyName, period };
}

async function fetchCarnelian() {
  const documents = [];
  for (const docType of ['factsheet', 'presentation']) {
    const res = await fetchWithRetry(`https://carneliancapital.co.in/wp-json/wp/v2/media?search=${docType}&per_page=50`);
    if (!res.ok) {
      console.warn(`[PMS Factsheets] Carnelian ${docType}: HTTP ${res.status}`);
      continue;
    }
    const items = await res.json();
    if (!Array.isArray(items)) continue;

    // Keep only the newest entry per strategy -- the media library holds
    // multiple revisions uploaded within the same month (e.g. a corrected
    // re-upload), disambiguated here by the item's own upload date.
    const byStrategy = new Map();
    for (const item of items) {
      const parsed = parseCarnelianTitle(item.title?.rendered, docType);
      if (!parsed || !item.source_url) continue;
      const existing = byStrategy.get(parsed.strategyName);
      if (!existing || new Date(item.date) > new Date(existing.date)) {
        byStrategy.set(parsed.strategyName, {
          strategyName: parsed.strategyName,
          docType,
          period: parsed.period,
          title: decodeHtmlEntities(item.title.rendered),
          url: item.source_url,
          date: item.date,
        });
      }
    }
    for (const doc of byStrategy.values()) {
      delete doc.date;
      documents.push(doc);
    }
  }
  return documents;
}

// ── Stallion: fixed static URLs, existence-checked each run ─────────────────
async function urlExists(url) {
  try {
    const res = await fetchWithRetry(url, { method: 'HEAD' }, 1, 800);
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchStallion() {
  const candidates = [
    { strategyName: 'Core Fund', docType: 'factsheet', title: 'Monthly Performance Factsheet', url: 'https://www.stallionasset.com/regulatory/PMS_Performance.pdf' },
    { strategyName: 'Core Fund', docType: 'factsheet', title: 'Strategy Factsheet Note', url: 'https://www.stallionasset.com/regulatory/Stallion_Asset_Factsheet_Freelanced_12.pdf' },
    { strategyName: 'Core Fund', docType: 'presentation', title: 'Investor Presentation', url: 'https://www.stallionasset.com/regulatory/Stallion_Asset_PMS_Presentation_131.pdf' },
  ];
  const documents = [];
  for (const c of candidates) {
    if (await urlExists(c.url)) {
      // No date is encoded in these filenames (they're overwritten in
      // place each month) -- period is honestly null rather than guessed.
      documents.push({ ...c, period: null });
    } else {
      console.warn(`[PMS Factsheets] Stallion: ${c.url} no longer resolves, dropping.`);
    }
  }
  return documents;
}

// ── Narnolia: real server-rendered HTML, scraped with cheerio ──────────────
// Verified real markup: each strategy lives in its own
// `<div class="categorywrapper pmscategory" data-parent="{slug}">`, whose
// slug matches a tab link `<a id="{slug}">{DISPLAY NAME}</a>` elsewhere on
// the page. `[id="..."]` (attribute selector) is used instead of `#id`
// (ID selector) because a slug like "5T-X-5T" starting with a digit is not
// a valid CSS identifier for an ID selector.
async function fetchNarnolia() {
  const res = await fetchWithRetry('https://www.narnolia.com/portfolio-management-services-pms');
  if (!res.ok) {
    console.warn(`[PMS Factsheets] Narnolia: HTTP ${res.status}`);
    return [];
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const documents = [];

  $('.categorywrapper.pmscategory').each((_, wrapperEl) => {
    const wrapper = $(wrapperEl);
    const slug = wrapper.attr('data-parent');
    if (!slug) return;

    const tabLabel = toTitleCase($(`a[id="${slug}"]`).first().text().replace(/\s+/g, ' ').trim());
    const strategyName = tabLabel || slug;

    // Fallback only: the performance-table note's "as on" date reflects
    // when the RETURNS TABLE was last updated, which can lag behind the
    // actual factsheet PDF's own date (verified live -- the note read
    // "July 2026" while the linked PDF's own filename said "August 2026").
    // The filename is checked first per-link below; this is only used if
    // a link's filename has no recognizable date at all.
    const noteText = wrapper.find('.profiletablenote').first().text();
    const noteMatch = /as on\s+([A-Za-z]+\s+\d{4})/i.exec(noteText);
    const notePeriod = noteMatch ? noteMatch[1] : null;

    wrapper.find("a.staticdwnldbtn[href*='Pms-Iap-pdf']").each((__, linkEl) => {
      const href = $(linkEl).attr('href');
      // The generic multi-strategy "PMS Product Note" brochure isn't tied
      // to one strategy -- excluded, not guessed into one.
      if (!href || /Product_Note/i.test(href)) return;
      const period = extractPeriodFromFilename(href) || notePeriod;
      documents.push({
        strategyName,
        docType: 'factsheet',
        period,
        title: `${strategyName} Factsheet${period ? ' – ' + period : ''}`,
        url: href,
      });
    });
  });

  return documents;
}

// ── Renaissance: scraped, deliberately not treated as authoritative-fresh ──
// Research verified this page's static HTML can lag behind the true
// current month, and filename conventions have changed multiple times
// over the site's history (abbreviations vary by era) -- so strategy
// names are matched only against known fragments, never guessed, and
// whatever period text the real link's own anchor text carries is stored
// as-is so a lag is visible in the UI rather than hidden.
const RENAISSANCE_STRATEGIES = [
  { name: 'India Next PMS', patterns: [/india\s*next/i] },
  { name: 'Midcap PMS', patterns: [/mid\s*cap/i, /\bmc\b/i, /\bmp\b/i] },
  { name: 'Opportunities PMS', patterns: [/opportunit/i, /\bopp\b/i, /\bop\b/i] },
  { name: 'Smart Alpha PMS', patterns: [/smart\s*alpha/i] },
];

function matchRenaissanceStrategy(text) {
  return RENAISSANCE_STRATEGIES.find((s) => s.patterns.some((p) => p.test(text)));
}

async function fetchRenaissance() {
  const res = await fetchWithRetry('https://renaissanceinvest.in/factsheets');
  if (!res.ok) {
    console.warn(`[PMS Factsheets] Renaissance: HTTP ${res.status}`);
    return [];
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const byStrategy = new Map();

  $('a[href*="factsheet/pms/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !/\.pdf$/i.test(href)) return;
    // The anchor's own visible text is just a generic label (verified
    // live: e.g. "RENAISSANCE OPPORTUNITIES PMS", no date at all) -- the
    // real period lives in the filename, same as Narnolia.
    const rawText = $(el).text().replace(/\s+/g, ' ').trim() || href;
    const monthMatch = /factsheet\/pms\/(\d{4})\/(\d{1,2})-[a-z]+\//i.exec(href);
    if (!monthMatch) return;
    const [, year, monthNum] = monthMatch;
    const sortKey = `${year}-${String(monthNum).padStart(2, '0')}`;

    const strategy = matchRenaissanceStrategy(rawText) || matchRenaissanceStrategy(href);
    if (!strategy) return; // consolidated/all-strategy PDF, or an unrecognized name -- skipped, not guessed

    const existing = byStrategy.get(strategy.name);
    if (!existing || sortKey > existing.sortKey) {
      const period = extractPeriodFromFilename(href);
      const title = `${strategy.name}${period ? ' – ' + period : ''}`;
      byStrategy.set(strategy.name, {
        strategyName: strategy.name,
        docType: 'factsheet',
        period,
        title,
        url: new URL(href, 'https://renaissanceinvest.in/factsheets').href,
        sortKey,
      });
    }
  });

  return [...byStrategy.values()].map((doc) => {
    delete doc.sortKey;
    return doc;
  });
}

// ── Provider registry ────────────────────────────────────────────────────
// matchFragments: lowercase substrings checked against APMI's own
// `providerName` field (from lib/pmsScrapers.js) to attach these
// factsheets to the right existing /pms/[id] page. Only 4 entries, so a
// plain substring check is simpler and more auditable than a fuzzy
// matcher -- see lib/pmsFactsheetsCache.js.
const PROVIDERS = [
  { key: 'carnelian', displayName: 'Carnelian Capital Advisors', matchFragments: ['carnelian'], fetch: fetchCarnelian },
  { key: 'stallion', displayName: 'Stallion Asset', matchFragments: ['stallion'], fetch: fetchStallion },
  { key: 'narnolia', displayName: 'Narnolia Financial Advisors', matchFragments: ['narnolia'], fetch: fetchNarnolia },
  { key: 'renaissance', displayName: 'Renaissance Investment Managers', matchFragments: ['renaissance'], fetch: fetchRenaissance },
];

async function run() {
  console.log('=== Syncing PMS Strategy Factsheets ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Get, r2Put } = await import('../lib/r2.js');

  const existing = await r2Get(R2_KEY).catch((e) => {
    console.warn(`[PMS Factsheets] Could not read existing R2 document: ${e.message}`);
    return null;
  });

  const providers = {};
  for (const p of PROVIDERS) {
    let documents = [];
    try {
      documents = await p.fetch();
    } catch (err) {
      console.error(`[PMS Factsheets] ${p.key}: fetch threw -- ${err.message}`);
    }

    const previousDocs = existing?.providers?.[p.key]?.documents;
    if (documents.length === 0 && Array.isArray(previousDocs) && previousDocs.length > 0) {
      console.warn(`[PMS Factsheets] ${p.key}: fetch returned 0 documents -- keeping previous ${previousDocs.length} rather than wiping them.`);
      providers[p.key] = existing.providers[p.key];
    } else {
      providers[p.key] = { displayName: p.displayName, matchFragments: p.matchFragments, documents };
    }
    console.log(`[PMS Factsheets] ${p.key}: ${providers[p.key].documents.length} documents.`);
  }

  const result = { syncedAt: new Date().toISOString(), providers };

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[PMS Factsheets] Successfully wrote to R2 (${R2_KEY}).`);
  }
}

function selfTest() {
  const assert = require('assert');

  assert.deepStrictEqual(
    parseCarnelianTitle('Factsheet_Shift Strategy (PMS) &#8211; August 2026', 'factsheet'),
    { strategyName: 'Shift Strategy', period: 'August 2026' }
  );
  assert.deepStrictEqual(
    parseCarnelianTitle('Factsheet_Compounder Strategy PMS &#8211; October 2025', 'factsheet'),
    { strategyName: 'Compounder Strategy', period: 'October 2025' }
  );
  assert.deepStrictEqual(
    parseCarnelianTitle('Carnelian Shift Strategy Presentation &#8211; August 2026', 'presentation'),
    { strategyName: 'Shift Strategy', period: 'August 2026' }
  );
  assert.deepStrictEqual(
    parseCarnelianTitle('Carnelian Bespoke Portfolio Presentation &#8211; August 2026', 'presentation'),
    { strategyName: 'Bespoke Portfolio', period: 'August 2026' }
  );
  assert.strictEqual(parseCarnelianTitle('Carnelian Introduction Presentation &#8211; August 2026', 'presentation'), null);
  assert.strictEqual(parseCarnelianTitle('Something unrelated', 'factsheet'), null);

  assert.strictEqual(extractPeriodFromFilename('639221272508634354_PMS_Large_Cap_Strategy_Factsheet_-_August_2026.pdf'), 'August 2026');
  assert.strictEqual(extractPeriodFromFilename('Renaissance Opportunities PMS Factsheet - July 2026.pdf'), 'July 2026');
  assert.strictEqual(extractPeriodFromFilename('Renaissance India Next PMS Factsheet - April 2026 - with RMP.pdf'), 'April 2026');
  assert.strictEqual(extractPeriodFromFilename("Renaissance India Next PMS Factsheet - Mar'26.pdf"), 'March 2026');
  assert.strictEqual(extractPeriodFromFilename('no-date-here.pdf'), null);
  assert.strictEqual(toTitleCase('LARGE CAP'), 'Large Cap');
  assert.strictEqual(toTitleCase('MID & SMALL CAP'), 'Mid & Small Cap');
  assert.strictEqual(toTitleCase('5T X 5T'), '5T X 5T');

  assert.deepStrictEqual(matchRenaissanceStrategy('Renaissance India Next PMS Factsheet - April 2026'), RENAISSANCE_STRATEGIES[0]);
  assert.deepStrictEqual(matchRenaissanceStrategy('Renaissance Midcap PMS Factsheet - June 2026'), RENAISSANCE_STRATEGIES[1]);
  assert.deepStrictEqual(matchRenaissanceStrategy('PPT - Factsheet - Oct 2023 PMS-OPP'), RENAISSANCE_STRATEGIES[2]);
  assert.strictEqual(matchRenaissanceStrategy('Renaissance PMS Factsheet (Consolidated) - July 2026'), undefined);

  // Narnolia's cheerio pass, checked against a fixture mirroring the real
  // verified markup shape (not the live site, so this runs offline).
  const fixtureHtml = `
    <ul><li><a id="large-cap">LARGE CAP </a></li></ul>
    <div class="categorywrapper pmscategory" data-parent="large-cap">
      <div class="profiletablenote">Please Note data as on July 2026, the 1 yr is ABSOLUTE returns</div>
      <div class="buttonsec">
        <a href="https://www.narnolia.com/files/Pms-Iap-pdf/123_PMS_Large_Cap_Strategy_Factsheet_-_August_2026.pdf" class="staticdwnldbtn">LEARN MORE</a>
      </div>
    </div>
    <a href="https://www.narnolia.com/files/Pms-Iap-pdf/999_PMS_Product_Note_-_August_2026.pdf" class="staticdwnldbtn">DOWNLOAD PMS BROCHURE</a>
  `;
  const $fixture = cheerio.load(fixtureHtml);
  const fixtureDocs = [];
  $fixture('.categorywrapper.pmscategory').each((_, wrapperEl) => {
    const wrapper = $fixture(wrapperEl);
    const slug = wrapper.attr('data-parent');
    const tabLabel = toTitleCase($fixture(`a[id="${slug}"]`).first().text().replace(/\s+/g, ' ').trim());
    const noteText = wrapper.find('.profiletablenote').first().text();
    const noteMatch = /as on\s+([A-Za-z]+\s+\d{4})/i.exec(noteText);
    const notePeriod = noteMatch ? noteMatch[1] : null;
    wrapper.find("a.staticdwnldbtn[href*='Pms-Iap-pdf']").each((__, linkEl) => {
      const href = $fixture(linkEl).attr('href');
      if (/Product_Note/i.test(href)) return;
      fixtureDocs.push({ strategyName: tabLabel, period: extractPeriodFromFilename(href) || notePeriod, url: href });
    });
  });
  assert.strictEqual(fixtureDocs.length, 1);
  assert.strictEqual(fixtureDocs[0].strategyName, 'Large Cap');
  // Filename's own date (August 2026) wins over the note's lagging "July
  // 2026" -- this is the exact real-world discrepancy the fix addresses.
  assert.strictEqual(fixtureDocs[0].period, 'August 2026');

  console.log('[PMS Factsheets Sync] Self-test: ALL PASSED');
}

module.exports = {
  parseCarnelianTitle,
  matchRenaissanceStrategy,
  extractPeriodFromFilename,
  toTitleCase,
  fetchCarnelian,
  fetchStallion,
  fetchNarnolia,
  fetchRenaissance,
  PROVIDERS,
};

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    run().catch((e) => {
      console.error('[PMS Factsheets Sync] Fatal error:', e);
      process.exit(1);
    });
  }
}
