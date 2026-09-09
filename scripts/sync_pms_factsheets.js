/**
 * scripts/sync_pms_factsheets.js
 *
 * Syncs publicly-downloadable, strategy-level PMS factsheet/presentation
 * PDFs from AMC-owned websites (NOT APMI -- a separate concern from
 * lib/pmsScrapers.js) into one R2 document, consumed by
 * lib/pmsFactsheetsCache.js and composed into
 * app/api/pms-detail/[id]/route.js's response.
 *
 * Covers 6 providers verified live during research (see
 * pms_factsheets_research.txt and this session's chat history for the
 * verification trail): Carnelian Capital, Stallion Asset, Narnolia
 * Financial Advisors, Renaissance Investment Managers, Sundaram Alternate
 * Assets, and Green Lantern Capital. Every other PMS provider's detail
 * page is unaffected -- lib/pmsFactsheetsCache.js's matchProvider()
 * simply returns no match for anything not in this list, and the UI
 * section doesn't render.
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
 *   - Sundaram: verified live that all 4 equity-strategy product pages
 *     link to the SAME monthly combined PDF (a "SUNbeam" newsletter, not
 *     a per-strategy factsheet) -- one Gemini call extracts all 4
 *     strategies from it at once (see extractMultiStrategyFactsheetData),
 *     a meaningful saving against the free tier's daily request cap.
 *   - Green Lantern: the opposite of Sundaram -- each of its 2 strategy
 *     pages links to its OWN separate, genuinely-different PDF (verified
 *     live: different byte content, different file sizes), so this uses
 *     the plain single-doc extraction path. No reliable period signal
 *     exists (the upload directory's YYYY/MM is the upload date, not the
 *     covered month -- verified live: a PDF's own cover page read "AUGUST
 *     2026" while its URL directory was "/2026/09/"), so period stays
 *     null, same honest-null precedent as Stallion's fixed URLs.
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

// Strategy names here come straight from each document's own title text
// (Carnelian has no fixed, published strategy list to pattern-match
// against the way Renaissance's fetcher does) -- so a strategy that was
// renamed or discontinued leaves old documents in the WordPress media
// library under a name that no longer corresponds to anything. Verified
// live: "Bharat Amritkaal Fund", "Structural Shift Fund", "Compounder
// Fund", and "Yng Strategy" all turned up once per_page was widened, none
// of them registered with APMI under Carnelian at all (checked directly
// against the live PMS screener's full strategy list, all 4 categories) --
// stale, abandoned product names, not real gaps. A document whose upload
// is older than this drops out rather than appearing as a phantom
// "strategy" with no real page to attach to; a genuinely active strategy
// publishes monthly, so this is a generous buffer, not a tight one.
const CARNELIAN_RECENCY_CUTOFF_DAYS = 120;

async function fetchCarnelian() {
  const documents = [];
  for (const docType of ['factsheet', 'presentation']) {
    // per_page=100 (WordPress's max) rather than 50 -- at 50, some older
    // strategy names sorted outside the most-recent-50 window and were
    // silently missed; 100 covers this site's current full result count
    // (85) in one call. Anything still stale after that is handled by
    // the recency filter below, not by limiting how much we ask for.
    const res = await fetchWithRetry(`https://carneliancapital.co.in/wp-json/wp/v2/media?search=${docType}&per_page=100`);
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
      const ageDays = (Date.now() - new Date(doc.date).getTime()) / 86400000;
      if (ageDays > CARNELIAN_RECENCY_CUTOFF_DAYS) continue;
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

// ── Sundaram Alternates: one combined monthly PDF, 4 strategies ────────────
// Verified live: each of these 4 equity-strategy product pages carries a
// "Factsheet" download button whose `data-src` points to the exact same
// PDF (a "SUNbeam" monthly newsletter covering all 4 strategies together,
// not a per-strategy factsheet). Scraped per-page (rather than hardcoding
// one URL) so a future divergence -- one strategy getting its own
// factsheet -- is picked up automatically rather than silently missed.
// `strategyName` here is APMI's own IAName for each (verified live via
// IaInsight.htm: IAID 324/325/326/327 -> "SISOP"/"S.E.L.F"/"VOYAGER"/
// "RISING STAR" exactly), so downstream matching in
// lib/pmsFactsheetsCache.js needs no fuzzy guessing. Sundaram's 5th
// product, F.I.R.S.T. (a debt strategy), links to the same PDF too but
// isn't covered by its content in any given month -- deliberately
// excluded here since there's nothing to extract for it.
const SUNDARAM_PRODUCTS = [
  { strategyName: 'SISOP', slug: 'sundaram-india-secular-opportunities-portfolio-sisop' },
  { strategyName: 'S.E.L.F', slug: 'sundaram-emerging-leadership-fund-s-e-l-f' },
  { strategyName: 'VOYAGER', slug: 'sundaram-voyager' },
  { strategyName: 'RISING STAR', slug: 'sundaram-rising-stars' },
];

async function fetchSundaram() {
  const documents = [];
  for (const p of SUNDARAM_PRODUCTS) {
    const res = await fetchWithRetry(`https://www.sundaramalternates.com/portfolios/products/${p.slug}`);
    if (!res.ok) {
      console.warn(`[PMS Factsheets] Sundaram ${p.strategyName}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    let url = parseSundaramFactsheetUrl(html);
    if (!url) {
      console.warn(`[PMS Factsheets] Sundaram ${p.strategyName}: no factsheet link found`);
      continue;
    }
    url = await resolveSundaramFactsheetUrl(url);
    const period = extractPeriodFromFilename(url);
    documents.push({
      strategyName: p.strategyName,
      docType: 'factsheet',
      period,
      title: `${p.strategyName}${period ? ' – ' + period : ''}`,
      url,
    });
  }
  return documents;
}

// Verified live: Sundaram's own S.E.L.F. product page links to
// ".../Factsheet_Jun_26.pdf" (correct spelling) which actually 302s
// elsewhere -- the real file lives under ".../Facsheet_Jun_26.pdf" (a
// typo, but the one every other product page uses and the one that
// really serves a PDF). Rather than hardcode either spelling, the
// discovered URL is verified with a HEAD check; if it doesn't look like
// a real PDF, the one-letter swap is tried before giving up and using
// the original anyway (a later stage -- the PDF fetch itself -- will
// then surface the real failure rather than this silently swallowing it).
async function urlLooksLikeRealPdf(url) {
  try {
    const res = await fetchWithRetry(url, { method: 'HEAD' }, 1, 500);
    return res.ok && (res.headers.get('content-type') || '').includes('pdf');
  } catch {
    return false;
  }
}

async function resolveSundaramFactsheetUrl(url) {
  if (await urlLooksLikeRealPdf(url)) return url;
  const swapped = url.includes('/Factsheet_') ? url.replace('/Factsheet_', '/Facsheet_') : url.replace('/Facsheet_', '/Factsheet_');
  if (swapped !== url && (await urlLooksLikeRealPdf(swapped))) return swapped;
  return url;
}

// Finds the real PDF path from the "Factsheet" download button's markup
// (verified live: a <p>Factsheet</p> label whose sibling <img data-src>
// carries the actual path -- the href isn't on an <a> tag at all here).
function parseSundaramFactsheetUrl(html) {
  const $ = cheerio.load(html);
  let url = null;
  $('p').each((_, el) => {
    if ($(el).text().trim().toLowerCase() !== 'factsheet') return;
    const src = $(el).siblings('img[data-src]').first().attr('data-src');
    if (src) url = new URL(src, 'https://www.sundaramalternates.com').href;
    return false;
  });
  return url;
}

// ── Green Lantern Capital: 2 strategies, each its own real PDF ─────────────
// Verified live: unlike Sundaram, each of these 2 product pages links to a
// genuinely different PDF (different byte content, different sizes) --
// standard single-doc extraction, no multi-strategy call needed.
// `strategyName` is APMI's own IAName for each (verified live via
// IaInsight.htm: IAID 317/318 -> "GLC Growth Fund"/"GL Alpha Fund"
// exactly), not the PDF's own shorter "GROWTH FUND"/"ALPHA FUND" headings.
const GREEN_LANTERN_PRODUCTS = [
  { strategyName: 'GLC Growth Fund', slug: 'growth-fund' },
  { strategyName: 'GL Alpha Fund', slug: 'alpha-fund' },
];

async function fetchGreenLantern() {
  const documents = [];
  for (const p of GREEN_LANTERN_PRODUCTS) {
    const res = await fetchWithRetry(`https://greenlanterncapital.in/our-offerings/${p.slug}/`);
    if (!res.ok) {
      console.warn(`[PMS Factsheets] Green Lantern ${p.strategyName}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const url = parseGreenLanternFactsheetUrl(html);
    if (!url) {
      console.warn(`[PMS Factsheets] Green Lantern ${p.strategyName}: no factsheet link found`);
      continue;
    }
    // No reliable period signal: the upload directory's YYYY/MM is the
    // upload date, not the covered month (verified live: a PDF's own
    // cover page read "AUGUST 2026" while its URL directory was
    // "/2026/09/") -- period stays honestly null, same precedent as
    // Stallion's fixed URLs.
    documents.push({ strategyName: p.strategyName, docType: 'factsheet', period: null, title: p.strategyName, url });
  }
  return documents;
}

// The download button is a plain <a href="...Fact-Sheet.pdf"> (verified
// live), simpler than Sundaram's img[data-src] markup.
function parseGreenLanternFactsheetUrl(html) {
  const $ = cheerio.load(html);
  const href = $('a[href*="Fact-Sheet.pdf"]').first().attr('href');
  return href ? new URL(href, 'https://greenlanterncapital.in').href : null;
}

// ── Gemini-based structured extraction from factsheet PDFs ─────────────────
// Links alone don't tell an investor what's actually in the strategy --
// this reads each factsheet's real content (top holdings, sector and
// market-cap allocation, valuation/quality metrics vs the benchmark, and
// what changed since last month) into structured JSON. Verified live
// against a real Carnelian factsheet before this was wired in: every
// field matched the source PDF exactly, including market-cap allocation
// (a pie chart with no text layer at all -- unextractable by any plain
// PDF-text-parsing approach, confirmed by testing scripts/../pdf-parse
// against the same file during design). Only `docType: 'factsheet'`
// documents are extracted -- presentations are narrative decks, not
// data-dense, and stay as plain links.
//
// `gemini-flash-latest` (not a pinned version) is deliberate: a pinned
// model name observed live during development (gemini-2.5-pro) was
// already retired for new callers within the same development session --
// the "-latest" alias exists specifically so this script doesn't need a
// model-name update every time Google rotates versions.
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const EXTRACTION_SCHEMA_PROMPT = `Extract structured data from this PMS strategy factsheet PDF. Return ONLY valid JSON matching this exact shape, no markdown fences, no commentary:
{
  "asOfDate": "YYYY-MM-DD or null",
  "marketCapAllocation": {"largeCap": number|null, "midCap": number|null, "smallCap": number|null, "cash": number|null},
  "sectorAllocation": [{"sector": string, "weightPct": number}],
  "topHoldings": [{"name": string, "weightPct": number}],
  "portfolioAttributes": {
    "revenueCagr": {"strategy": number|null, "benchmark": number|null},
    "epsCagr": {"strategy": number|null, "benchmark": number|null},
    "portfolioPe": {"strategy": number|null, "benchmark": number|null},
    "roe": {"strategy": number|null, "benchmark": number|null},
    "netDebtEquity": {"strategy": number|null, "benchmark": number|null},
    "peg": {"strategy": number|null, "benchmark": number|null},
    "sharpeRatio": {"strategy": number|null, "benchmark": number|null},
    "standardDeviation": {"strategy": number|null, "benchmark": number|null}
  },
  "portfolioChanges": {"newEntrants": [string], "exits": [string]}
}
If a field genuinely is not present in the document, use null (for objects/numbers) or an empty array -- never invent a value.`;

// A 429 whose quotaId contains "PerDay" is a hard daily cap, not a
// transient rate limit -- verified live during development against the
// free tier's real 20-requests/day ceiling for this model. Retrying that
// within the same run cannot succeed (the quota doesn't reset for hours),
// so it's surfaced as a distinct, non-retryable signal the caller can
// use to stop attempting further documents in this run entirely, rather
// than burning the rest of the run on calls that are certain to fail the
// same way.
class DailyQuotaExhaustedError extends Error {}

async function callGeminiWithRetry(base64Pdf, promptText = EXTRACTION_SCHEMA_PROMPT, retries = 3, delayMs = 4000) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: 'application/pdf', data: base64Pdf } }, { text: promptText }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );
    if (res.ok) return res.json();

    const body = await res.text().catch(() => '');
    if (res.status === 429 && /PerDay/i.test(body)) {
      throw new DailyQuotaExhaustedError(`Gemini free-tier daily request quota exhausted: ${body.slice(0, 300)}`);
    }
    const retryable = res.status === 429 || res.status === 503;
    if (!retryable || i >= retries) {
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    await sleep(delayMs * (i + 1));
  }
}

// A number that's finite and within a sane range for a percentage-shaped
// field; anything else (a hallucinated string, an out-of-range value)
// becomes null rather than being stored.
function sanePct(v, max = 100) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
function saneNum(v) {
  // v == null (null OR undefined) must short-circuit before Number(v) --
  // Number(null) is 0, not NaN, so without this check a genuinely-absent
  // field was silently stored (and rendered) as 0 instead of staying
  // null. Verified live: this is exactly why several stored extractions
  // showed "0%"/"0x" for metrics the source factsheet never mentioned.
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function saneMetricPair(pair) {
  if (!pair || typeof pair !== 'object') return { strategy: null, benchmark: null };
  return { strategy: saneNum(pair.strategy), benchmark: saneNum(pair.benchmark) };
}

// Field-level validation: a bad/missing individual field is dropped (set
// null/empty) rather than discarding the whole extraction, so one shaky
// number never hides everything else that extracted correctly. Returns
// null only if literally nothing usable came back at all.
function validateAndCleanExtraction(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const mc = raw.marketCapAllocation;
  let marketCapAllocation = null;
  if (mc && typeof mc === 'object') {
    const cleaned = { largeCap: sanePct(mc.largeCap), midCap: sanePct(mc.midCap), smallCap: sanePct(mc.smallCap), cash: sanePct(mc.cash) };
    const values = Object.values(cleaned).filter((v) => v != null);
    // Real allocations sum to ~100 -- a wildly-off total (bad OCR/extraction
    // reading, or a hallucinated number) is rejected wholesale rather than
    // shown as a broken bar chart.
    const total = values.reduce((a, b) => a + b, 0);
    if (values.length >= 2 && total >= 85 && total <= 115) marketCapAllocation = cleaned;
  }

  let sectorAllocation = null;
  if (Array.isArray(raw.sectorAllocation)) {
    const cleaned = raw.sectorAllocation
      .map((s) => ({ sector: typeof s?.sector === 'string' ? s.sector.trim() : null, weightPct: sanePct(s?.weightPct) }))
      .filter((s) => s.sector && s.weightPct != null);
    if (cleaned.length > 0) sectorAllocation = cleaned;
  }

  let topHoldings = null;
  if (Array.isArray(raw.topHoldings)) {
    const cleaned = raw.topHoldings
      .map((h) => ({ name: typeof h?.name === 'string' ? h.name.trim() : null, weightPct: sanePct(h?.weightPct) }))
      .filter((h) => h.name && h.weightPct != null);
    if (cleaned.length > 0) topHoldings = cleaned;
  }

  let portfolioAttributes = null;
  if (raw.portfolioAttributes && typeof raw.portfolioAttributes === 'object') {
    const pa = raw.portfolioAttributes;
    const cleaned = {
      revenueCagr: saneMetricPair(pa.revenueCagr),
      epsCagr: saneMetricPair(pa.epsCagr),
      portfolioPe: saneMetricPair(pa.portfolioPe),
      roe: saneMetricPair(pa.roe),
      netDebtEquity: saneMetricPair(pa.netDebtEquity),
      peg: saneMetricPair(pa.peg),
      sharpeRatio: saneMetricPair(pa.sharpeRatio),
      standardDeviation: saneMetricPair(pa.standardDeviation),
    };
    if (Object.values(cleaned).some((p) => p.strategy != null || p.benchmark != null)) portfolioAttributes = cleaned;
  }

  let portfolioChanges = null;
  if (raw.portfolioChanges && typeof raw.portfolioChanges === 'object') {
    const newEntrants = Array.isArray(raw.portfolioChanges.newEntrants) ? raw.portfolioChanges.newEntrants.filter((s) => typeof s === 'string' && s.trim()) : [];
    const exits = Array.isArray(raw.portfolioChanges.exits) ? raw.portfolioChanges.exits.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (newEntrants.length > 0 || exits.length > 0) portfolioChanges = { newEntrants, exits };
  }

  const asOfDate = typeof raw.asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.asOfDate) ? raw.asOfDate : null;

  if (!marketCapAllocation && !sectorAllocation && !topHoldings && !portfolioAttributes && !portfolioChanges) return null;

  return { asOfDate, marketCapAllocation, sectorAllocation, topHoldings, portfolioAttributes, portfolioChanges };
}

async function extractFactsheetData(pdfUrl) {
  const pdfRes = await fetchWithRetry(pdfUrl);
  if (!pdfRes.ok) throw new Error(`PDF fetch HTTP ${pdfRes.status}`);
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const base64 = buf.toString('base64');

  const json = await callGeminiWithRetry(base64);
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }

  const cleaned = validateAndCleanExtraction(raw);
  if (!cleaned) throw new Error('Extraction produced no usable fields after validation');
  return { ...cleaned, extractedAt: new Date().toISOString() };
}

// Same schema as EXTRACTION_SCHEMA_PROMPT, but for a PDF that covers
// several strategies together (see Sundaram's fetcher comment) --
// returns a "strategies" array with one entry per strategy name given,
// so one Gemini call extracts all of them instead of one call each.
function buildMultiStrategySchemaPrompt(strategyNames) {
  const nameList = strategyNames.map((n) => `"${n}"`).join(', ');
  return `Extract structured data from this PMS factsheet/newsletter PDF, which covers MULTIPLE strategies. Return ONLY valid JSON matching this exact shape, no markdown fences, no commentary:
{
  "strategies": [
    {
      "strategyName": "<exactly one of: ${nameList}>",
      "asOfDate": "YYYY-MM-DD or null",
      "marketCapAllocation": {"largeCap": number|null, "midCap": number|null, "smallCap": number|null, "cash": number|null},
      "sectorAllocation": [{"sector": string, "weightPct": number}],
      "topHoldings": [{"name": string, "weightPct": number}],
      "portfolioAttributes": {
        "revenueCagr": {"strategy": number|null, "benchmark": number|null},
        "epsCagr": {"strategy": number|null, "benchmark": number|null},
        "portfolioPe": {"strategy": number|null, "benchmark": number|null},
        "roe": {"strategy": number|null, "benchmark": number|null},
        "netDebtEquity": {"strategy": number|null, "benchmark": number|null},
        "peg": {"strategy": number|null, "benchmark": number|null},
        "sharpeRatio": {"strategy": number|null, "benchmark": number|null},
        "standardDeviation": {"strategy": number|null, "benchmark": number|null}
      },
      "portfolioChanges": {"newEntrants": [string], "exits": [string]}
    }
  ]
}
Return exactly one entry per strategy name listed above, using that exact strategyName string. If a field genuinely is not present for a given strategy, use null (for objects/numbers) or an empty array -- never invent a value.`;
}

// One Gemini call, one PDF fetch -- returns a Map<strategyName, cleaned
// extraction> covering as many of `strategyNames` as the model actually
// found usable data for. A strategy missing from the result (unmatched
// name, or nothing survived validateAndCleanExtraction) simply isn't a
// key in the returned Map; the caller falls back to that strategy's
// previous extraction, same as any other failure in this pipeline.
async function extractMultiStrategyFactsheetData(pdfUrl, strategyNames) {
  const pdfRes = await fetchWithRetry(pdfUrl);
  if (!pdfRes.ok) throw new Error(`PDF fetch HTTP ${pdfRes.status}`);
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const base64 = buf.toString('base64');

  const json = await callGeminiWithRetry(base64, buildMultiStrategySchemaPrompt(strategyNames));
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }

  const result = new Map();
  if (Array.isArray(raw?.strategies)) {
    for (const entry of raw.strategies) {
      if (!entry || typeof entry.strategyName !== 'string') continue;
      const cleaned = validateAndCleanExtraction(entry);
      if (cleaned) result.set(entry.strategyName, { ...cleaned, extractedAt: new Date().toISOString() });
    }
  }
  if (result.size === 0) throw new Error('Multi-strategy extraction produced no usable fields for any strategy');
  return result;
}

// Enriches each factsheet-type document with `.extracted` in place. Skips
// entirely (leaves `.extracted` unset) if GEMINI_API_KEY isn't configured
// -- the link-based sync must keep working whether or not extraction is
// set up. Re-extraction is skipped when a document's URL is unchanged
// from the previous run (same month's factsheet, already extracted) --
// both to avoid needless API calls and because a stable input should
// give a stable output.
//
// `quotaState` is shared across every provider's call in one run (see
// run()): once the free tier's daily request cap is hit for ANY document,
// every remaining document -- across every remaining provider -- would
// fail identically, so the whole run stops attempting new extractions
// rather than burning the rest of the run on calls certain to fail the
// same way. Whatever was already extracted earlier in the run is kept;
// whatever wasn't reached yet simply retries on the next scheduled or
// manually-triggered run (the URL-unchanged cache means already-extracted
// documents aren't re-spent either).
//
// Documents are grouped by URL first: when several strategies share one
// PDF (Sundaram's fetcher -- see its comment), one Gemini call covers the
// whole group via extractMultiStrategyFactsheetData instead of one call
// per strategy. A group of size 1 behaves exactly as before (single-doc
// providers are unaffected by this grouping).
async function enrichWithExtraction(documents, previousDocs, quotaState) {
  if (!GEMINI_API_KEY) {
    console.warn('[PMS Factsheets] GEMINI_API_KEY not set -- skipping structured extraction, links-only sync proceeds.');
    return documents;
  }
  const prevByKey = new Map((previousDocs || []).map((d) => [`${d.strategyName}::${d.docType}`, d]));
  const prevFor = (doc) => prevByKey.get(`${doc.strategyName}::${doc.docType}`);

  const byUrl = new Map();
  for (const doc of documents) {
    if (doc.docType !== 'factsheet') continue;
    if (!byUrl.has(doc.url)) byUrl.set(doc.url, []);
    byUrl.get(doc.url).push(doc);
  }

  for (const group of byUrl.values()) {
    const allCached = group.every((doc) => {
      const prev = prevFor(doc);
      return prev && prev.url === doc.url && prev.extracted;
    });
    if (allCached) {
      for (const doc of group) doc.extracted = prevFor(doc).extracted;
      continue;
    }

    if (quotaState.exhausted) {
      for (const doc of group) {
        const prev = prevFor(doc);
        if (prev?.extracted) doc.extracted = prev.extracted;
      }
      continue;
    }

    try {
      if (group.length === 1) {
        group[0].extracted = await extractFactsheetData(group[0].url);
        console.log(`[PMS Factsheets] Extracted: ${group[0].strategyName} (${group[0].period || 'undated'})`);
      } else {
        const byStrategy = await extractMultiStrategyFactsheetData(group[0].url, group.map((d) => d.strategyName));
        for (const doc of group) {
          const cleaned = byStrategy.get(doc.strategyName);
          if (cleaned) {
            doc.extracted = cleaned;
            console.log(`[PMS Factsheets] Extracted: ${doc.strategyName} (${doc.period || 'undated'})`);
          } else {
            console.warn(`[PMS Factsheets] Multi-strategy extraction had no usable data for ${doc.strategyName}`);
            const prev = prevFor(doc);
            if (prev?.extracted) doc.extracted = prev.extracted;
          }
        }
      }
    } catch (err) {
      if (err instanceof DailyQuotaExhaustedError) {
        quotaState.exhausted = true;
        console.warn(`[PMS Factsheets] Daily Gemini quota exhausted -- stopping further extraction attempts for the rest of this run. Remaining documents will be picked up on a later run.`);
      } else {
        console.warn(`[PMS Factsheets] Extraction failed for ${group.map((d) => d.strategyName).join(', ')} (${group[0].url}): ${err.message}`);
      }
      // A failed extraction keeps the previous month's extracted data
      // (if any) rather than wiping it -- same "don't overwrite good data
      // with a bad result" principle as everywhere else in this pipeline.
      for (const doc of group) {
        const prev = prevFor(doc);
        if (prev?.extracted) doc.extracted = prev.extracted;
      }
    }
  }
  return documents;
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
  { key: 'sundaram', displayName: 'Sundaram Alternate Assets', matchFragments: ['sundaram'], fetch: fetchSundaram },
  { key: 'greenlantern', displayName: 'Green Lantern Capital', matchFragments: ['green lantern'], fetch: fetchGreenLantern },
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
  const quotaState = { exhausted: false };
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
      documents = await enrichWithExtraction(documents, previousDocs, quotaState);
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

  // validateAndCleanExtraction: real, verified-against-source values from
  // the live Carnelian Compounder Strategy factsheet (August 2026) --
  // confirmed field-for-field correct against the actual PDF during
  // development, not synthetic.
  const realExtraction = validateAndCleanExtraction({
    asOfDate: '2026-07-31',
    marketCapAllocation: { largeCap: 30.1, midCap: 46.3, smallCap: 20.9, cash: 2.7 },
    sectorAllocation: [{ sector: 'Pharma & CDMO', weightPct: 29.9 }, { sector: 'BFSI - Credit', weightPct: 16.3 }],
    topHoldings: [{ name: 'Aditya Birla Capital', weightPct: 10.2 }],
    portfolioAttributes: { revenueCagr: { strategy: 16.4, benchmark: 13.4 }, sharpeRatio: { strategy: 0.8, benchmark: 0.6 } },
    portfolioChanges: { newEntrants: ['Sun Pharma'], exits: ['Bandhan Bank'] },
  });
  assert.strictEqual(realExtraction.marketCapAllocation.largeCap, 30.1);
  assert.strictEqual(realExtraction.sectorAllocation.length, 2);
  assert.strictEqual(realExtraction.portfolioAttributes.revenueCagr.strategy, 16.4);
  assert.strictEqual(realExtraction.portfolioChanges.newEntrants[0], 'Sun Pharma');

  // A market-cap allocation that doesn't sum anywhere near 100 is a sign
  // of a bad read (hallucination, misparsed chart) -- rejected wholesale
  // rather than shown as a broken bar chart, while unrelated fields in
  // the SAME response still survive individually.
  const badMarketCap = validateAndCleanExtraction({
    marketCapAllocation: { largeCap: 5, midCap: 5, smallCap: 5, cash: 5 }, // sums to 20, nowhere near 100
    sectorAllocation: [{ sector: 'IT', weightPct: 50 }],
  });
  assert.strictEqual(badMarketCap.marketCapAllocation, null);
  assert.strictEqual(badMarketCap.sectorAllocation.length, 1);

  // A holding with a non-numeric/out-of-range weight is dropped, not
  // stored as-is or coerced into a wrong number.
  const badHolding = validateAndCleanExtraction({
    topHoldings: [{ name: 'Real Stock', weightPct: 8.5 }, { name: 'Bad Row', weightPct: 'not a number' }, { name: 'Also Bad', weightPct: 250 }],
  });
  assert.strictEqual(badHolding.topHoldings.length, 1);
  assert.strictEqual(badHolding.topHoldings[0].name, 'Real Stock');

  // Nothing usable at all -> null, not an empty-shelled object.
  assert.strictEqual(validateAndCleanExtraction({ asOfDate: 'not-a-date' }), null);
  assert.strictEqual(validateAndCleanExtraction(null), null);

  // Regression: Number(null) === 0 in JS, so a genuinely-absent metric
  // pair must stay null, never silently become a displayed "0%"/"0x".
  // One real pair present (sharpeRatio) so the extraction as a whole
  // survives the "nothing usable at all" check.
  const nullMetricsExtraction = validateAndCleanExtraction({
    portfolioAttributes: {
      revenueCagr: { strategy: null, benchmark: null },
      epsCagr: { strategy: null, benchmark: null },
      sharpeRatio: { strategy: 0.7, benchmark: 0.4 },
    },
  });
  assert.strictEqual(nullMetricsExtraction.portfolioAttributes.revenueCagr.strategy, null);
  assert.strictEqual(nullMetricsExtraction.portfolioAttributes.revenueCagr.benchmark, null);
  assert.strictEqual(nullMetricsExtraction.portfolioAttributes.epsCagr.strategy, null);
  assert.strictEqual(nullMetricsExtraction.portfolioAttributes.sharpeRatio.strategy, 0.7);

  // parseSundaramFactsheetUrl: the "Factsheet" download button's markup,
  // verified against the real live page (a <p>Factsheet</p> label whose
  // sibling <img data-src> carries the actual PDF path, not an <a href>).
  assert.strictEqual(
    parseSundaramFactsheetUrl(`
      <div class="downloadWrap pt-4">
        <div class="downloadTxt">
          <p class="fw500 p_quaternary clr000">Factsheet</p>
          <img src="/Assets/Images/reports/viewIcon.svg" data-src="/pdf2/2026/Factsheet/Facsheet_Jun_26.pdf" class="viewBtn">
          <img src="/Assets/Images/reports/downloadBtn.svg" data-src="/pdf2/2026/Factsheet/Facsheet_Jun_26.pdf" class="downloadBtn">
        </div>
      </div>
    `),
    'https://www.sundaramalternates.com/pdf2/2026/Factsheet/Facsheet_Jun_26.pdf'
  );
  assert.strictEqual(parseSundaramFactsheetUrl('<div>no factsheet button here</div>'), null);

  // extractPeriodFromFilename already handles Sundaram's real filename
  // shape ("Facsheet_Jun_26.pdf") -- confirms the shared helper needs no
  // Sundaram-specific period parser.
  assert.strictEqual(extractPeriodFromFilename('/pdf2/2026/Factsheet/Facsheet_Jun_26.pdf'), 'June 2026');

  // parseGreenLanternFactsheetUrl: the real live markup is a plain
  // <a href="...Fact-Sheet.pdf">, simpler than Sundaram's img[data-src].
  assert.strictEqual(
    parseGreenLanternFactsheetUrl(
      '<a href="https://greenlanterncapital.in/wp-content/uploads/2026/09/Green-Lantern-Capital-LLP_Growth-Fund-Fact-Sheet.pdf" target="_blank">Download</a>'
    ),
    'https://greenlanterncapital.in/wp-content/uploads/2026/09/Green-Lantern-Capital-LLP_Growth-Fund-Fact-Sheet.pdf'
  );
  assert.strictEqual(parseGreenLanternFactsheetUrl('<div>no download link here</div>'), null);

  console.log('[PMS Factsheets Sync] Self-test: ALL PASSED');
}

module.exports = {
  parseCarnelianTitle,
  matchRenaissanceStrategy,
  extractPeriodFromFilename,
  toTitleCase,
  validateAndCleanExtraction,
  fetchCarnelian,
  fetchStallion,
  fetchNarnolia,
  fetchRenaissance,
  fetchSundaram,
  parseSundaramFactsheetUrl,
  fetchGreenLantern,
  parseGreenLanternFactsheetUrl,
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
