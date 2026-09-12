/**
 * scripts/sync_pms_factsheets.js
 *
 * Syncs publicly-downloadable, strategy-level PMS factsheet/presentation
 * PDFs from AMC-owned websites (NOT APMI -- a separate concern from
 * lib/pmsScrapers.js) into one R2 document, consumed by
 * lib/pmsFactsheetsCache.js and composed into
 * app/api/pms-detail/[id]/route.js's response.
 *
 * Covers 11 providers verified live during research (see
 * pms_factsheets_research.txt and this session's chat history for the
 * verification trail): Carnelian Capital, Stallion Asset, Narnolia
 * Financial Advisors, Renaissance Investment Managers, Sundaram Alternate
 * Assets, Green Lantern Capital, ICICI Prudential, Alchemy Capital,
 * Abakkus Investment Managers, Buoyant Capital, and Dezerv. Every other
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
 *   - ICICI Prudential: a clean JSON API (/api/v1/investorcornerrevamp.json),
 *     but its PDF assets sit behind an F5 WAF that blocks a bare
 *     User-Agent-only request (a real HTML "Page Not Found" body, not a
 *     network error) -- verified live that a realistic Accept/
 *     Accept-Language pair (now part of the shared HEADERS, since these
 *     are harmless to send to every provider) plus a `?crafterSite=
 *     production` query parameter on the asset URL together resolve it.
 *     Covers only the strategies actually present in that JSON's
 *     `factsheets`/`presentations` arrays -- e.g. Rising Stars Strategy
 *     (a real, APMI-registered strategy, inception Feb 2026) is simply
 *     absent from both arrays as of this writing, verified not a missed
 *     URL pattern but genuinely not yet published.
 *   - Alchemy: 8 PMS strategies, only 1 of which was linked from the
 *     site's own nav -- the real sitemap (https://www.alchemycapital.com/
 *     sitemap) surfaced all 8 real strategy page URLs, each APMI-
 *     registered and each with its own factsheet + presentation.
 *   - Abakkus: 3 publicly-marketed PMS strategies, fixed S3 URLs with no
 *     month in the filename -- existence-checked, honest-null period.
 *   - Buoyant: a single APMI-registered strategy (Opportunities PMS,
 *     IAID 606). The /insights/factsheets/ page carries a WP-localised
 *     JSON month list; filenames vary month-to-month, so the newest
 *     "factsheet"-named PDF is discovered from that list rather than
 *     guessed. The site's three other PMS (NDPMS, All-Weather, Liquid)
 *     are non-discretionary or absent from APMI's public reporting, so
 *     they have no detail page to enrich.
 *   - Dezerv: 4 factsheet "decks" at fixed slugs, but only 2 (Equity
 *     Revival -> IAID 1028, Alpha Focus -> IAID 1032) map to an APMI
 *     equity strategy with schema-relevant data. SHINE (gold/multi-asset)
 *     and Dynamic Debt Plus (debt) have no APMI listing. Neither built
 *     strategy discloses stock holdings -- market-cap, Morningstar sector
 *     weights and volatility/Sharpe are what get extracted.
 *
 * Usage:
 *   node scripts/sync_pms_factsheets.js [--dry-run]
 *   node scripts/sync_pms_factsheets.js --self-test
 */

const cheerio = require('cheerio');
const { backupThenPut } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'pms-factsheets.json';
// Accept/Accept-Language verified necessary for ICICI Prudential's site
// specifically (a User-Agent alone still hit its WAF's bot-mitigation
// page) -- both are generic, realistic-browser headers, harmless to send
// to every provider, so added here rather than special-cased.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 800) {
  for (let i = 0; i <= retries; i++) {
    try {
      // Merge (not overwrite): a caller's own options.headers -- e.g. InCred's
      // WAF rejects any request with no Referer at all, verified live -- adds
      // to the default HEADERS rather than silently losing them.
      const res = await fetch(url, { ...options, headers: { ...HEADERS, ...options.headers }, signal: AbortSignal.timeout(15000) });
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
const MONTH_PATTERN = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember|t)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
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
async function urlExists(url, headers) {
  try {
    const res = await fetchWithRetry(url, { method: 'HEAD', headers }, 1, 800);
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
// properName: the full name each abbreviation stands for, verified live
// against the Table of Contents of Sundaram's own June 2026 combined
// "SUNbeam" factsheet PDF -- surfaced on the detail page as a subtitle so
// "SISOP" etc. isn't shown as an unexplained acronym.
const SUNDARAM_PRODUCTS = [
  { strategyName: 'SISOP', slug: 'sundaram-india-secular-opportunities-portfolio-sisop', properName: 'Sundaram India Secular Opportunities Portfolio' },
  { strategyName: 'S.E.L.F', slug: 'sundaram-emerging-leadership-fund-s-e-l-f', properName: 'Sundaram Emerging Leadership Fund Portfolio' },
  { strategyName: 'VOYAGER', slug: 'sundaram-voyager', properName: 'Sundaram Voyager Portfolio' },
  { strategyName: 'RISING STAR', slug: 'sundaram-rising-stars', properName: 'Sundaram Rising Stars' },
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
      properName: p.properName,
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

// ── ICICI Prudential: clean JSON API, WAF-gated PDF assets ─────────────────
// The JSON's own `strategy`/`title` field is verbatim identical to APMI's
// IAName (verified live for 2 IAIDs) -- used as-is for strategyName, no
// fuzzy matching needed downstream. `?crafterSite=production` is baked
// into the stored URL itself (not just the fetch call here) so every
// later fetch of this URL -- the public link, and extractFactsheetData's
// own PDF download -- carries it automatically.
const ICICI_API_URL = 'https://www.iciciprualternates.com/api/v1/investorcornerrevamp.json?crafterSite=production';

function resolveIciciUrl(rawUrl) {
  return new URL(rawUrl, 'https://www.iciciprualternates.com').href + '?crafterSite=production';
}

// Strategies that ARE APMI-registered and whose factsheet we already hold
// (supplied by the distributor) but which ICICI has not yet added to its
// investor-corner JSON API. Carried with url:null -- the extracted data is
// filled manually and the /pms/[id] page shows the portfolio breakdown
// without a (non-existent) download link. As soon as ICICI publishes the
// strategy to its API, fetchICICIPru()'s dedupe drops this entry and the
// real, WAF-verified URL takes over automatically.
const ICICI_PENDING_FACTSHEETS = [
  { strategyName: 'ICICI Prudential PMS Rising Stars Strategy', period: 'August 2026' },
];

// Pure: append each ICICI_PENDING_FACTSHEETS entry that isn't already
// present as a factsheet in `documents` (the API version always wins).
function appendPendingIciciFactsheets(documents, pending = ICICI_PENDING_FACTSHEETS) {
  const known = new Set(documents.filter((d) => d.docType === 'factsheet').map((d) => d.strategyName));
  for (const p of pending) {
    if (known.has(p.strategyName)) continue;
    documents.push({ strategyName: p.strategyName, docType: 'factsheet', period: p.period ?? null, title: p.strategyName, url: null });
  }
  return documents;
}

async function fetchICICIPru() {
  const res = await fetchWithRetry(ICICI_API_URL);
  if (!res.ok) {
    console.warn(`[PMS Factsheets] ICICI Prudential: HTTP ${res.status}`);
    return [];
  }
  const json = await res.json();
  const documents = [];

  for (const item of json?.factsheets?.items || []) {
    const rawUrl = item.url?.[0];
    if (!rawUrl || !item.strategy) continue;
    documents.push({
      strategyName: item.strategy,
      docType: 'factsheet',
      period: extractPeriodFromFilename(rawUrl),
      title: item.strategy,
      url: resolveIciciUrl(rawUrl),
    });
  }

  for (const item of json?.presentations?.items || []) {
    const rawUrl = item.url?.[0];
    // "ICICI Prudential PMS About Us" is a firm-level deck, not tied to
    // one strategy -- excluded, same reasoning as Carnelian's generic
    // "Introduction" presentation.
    if (!rawUrl || !item.title || /\babout us\b/i.test(item.title)) continue;
    documents.push({
      strategyName: item.title,
      docType: 'presentation',
      period: extractPeriodFromFilename(rawUrl),
      title: item.title,
      url: resolveIciciUrl(rawUrl),
    });
  }

  // Append pending-publication factsheets the API doesn't yet carry.
  return appendPendingIciciFactsheets(documents);
}

// ── Alchemy Capital: 8 strategies, each its own factsheet + presentation ───
// Verified live via the site's real sitemap (https://www.alchemycapital.com/
// sitemap) -- the nav only linked one of the 8 strategy pages, but all 8
// exist at predictable /portfolio-management-services/{slug} URLs and all
// 8 are APMI-registered. Each page has two plain <a href="...pdf"> buttons
// labelled "DOWNLOAD FACTSHEET" / "DOWNLOAD PRESENTATION" (verified live).
// `strategyName` is APMI's own IAName for each (verified live via
// IaInsight.htm for all 8 IAIDs), not the page's own shorter title.
const ALCHEMY_PRODUCTS = [
  { strategyName: 'Alchemy Select Stock', slug: 'alchemy-select-stock' },
  { strategyName: 'Alchemy High Growth', slug: 'alchemy-high-growth' },
  { strategyName: 'ALCHEMY W.I.N STRATEGY', slug: 'alchemy-win-strategy' },
  { strategyName: 'Alchemy Ascent', slug: 'alchemy-ascent' },
  { strategyName: 'Alchemy Alpha 100', slug: 'alchemy-alpha-100' },
  { strategyName: 'Alchemy Alpha Small cap', slug: 'alchemy-alpha-smallcap' },
  { strategyName: 'Alchemy Smart Alpha 250', slug: 'alchemy-smart-alpha-250' },
  { strategyName: 'Alchemy Smart Alpha Micro & Small cap', slug: 'alchemy-smart-alpha-micro-%26-small-cap' },
];

function parseAlchemyDocLinks(html) {
  const $ = cheerio.load(html);
  const links = {};
  $('a[href$=".pdf"]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim().toUpperCase();
    const href = $(el).attr('href');
    if (!href) return;
    if (text.includes('FACTSHEET')) links.factsheet = href;
    else if (text.includes('PRESENTATION')) links.presentation = href;
  });
  return links;
}

async function fetchAlchemy() {
  const documents = [];
  for (const p of ALCHEMY_PRODUCTS) {
    const res = await fetchWithRetry(`https://www.alchemycapital.com/portfolio-management-services/${p.slug}`);
    if (!res.ok) {
      console.warn(`[PMS Factsheets] Alchemy ${p.strategyName}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const links = parseAlchemyDocLinks(html);
    for (const [docType, href] of Object.entries(links)) {
      const url = new URL(href, 'https://www.alchemycapital.com').href;
      const period = extractPeriodFromFilename(href);
      documents.push({
        strategyName: p.strategyName,
        docType,
        period,
        title: `${p.strategyName}${period ? ' – ' + period : ''}`,
        url,
      });
    }
  }
  return documents;
}

// ── Abakkus Asset Manager: 3 public PMS strategies, fixed S3 URLs ──────────
// Verified live: abakkuscapital's Our Products page separates PMS from
// AIF/PE/RIA products -- only 3 of the 14 APMI-registered Abakkus PMS
// strategies are marketed publicly with real factsheets (the rest --
// Select Opportunities, Shariah/ESG/FPI variants, "2" variants -- simply
// aren't listed there, same "not everything registered is publicly
// marketed" pattern as every other provider this session). Each strategy's
// Factsheet + Presentation PDF is a direct, fixed S3 URL with no month/date
// encoded in the filename at all (verified: "AACA_Factsheet.pdf", no
// "_sep26" suffix like other providers) -- same honest-null-period
// precedent as Stallion's fixed URLs, existence-checked via urlExists()
// rather than assumed. `strategyName` is APMI's own IAName for each
// (verified live via IaInsight.htm for all 3 IAIDs).
// Note the real, verified-live inconsistency: the factsheet filename uses
// "AEO" for Emerging Opportunities, but the presentation filename uses
// "AEOA" -- not a typo to "fix", just how Abakkus's own S3 bucket is
// named. Each strategy's two URLs are therefore listed explicitly rather
// than derived from one shared slug.
const ABAKKUS_CANDIDATES = [
  { strategyName: 'Abakkus All Cap Approach', docType: 'factsheet', url: 'https://abakkus-website.s3.ap-south-1.amazonaws.com/files/factsheets/AACA_Factsheet.pdf' },
  { strategyName: 'Abakkus All Cap Approach', docType: 'presentation', url: 'https://abakkus-website.s3.ap-south-1.amazonaws.com/files/presentations/Abakkus+Investment+Profile+PPT+-+AACA.pdf' },
  { strategyName: 'Abakkus Emerging Opportunities Approach', docType: 'factsheet', url: 'https://abakkus-website.s3.ap-south-1.amazonaws.com/files/factsheets/AEO_Factsheet.pdf' },
  { strategyName: 'Abakkus Emerging Opportunities Approach', docType: 'presentation', url: 'https://abakkus-website.s3.ap-south-1.amazonaws.com/files/presentations/Abakkus+Investment+Profile+PPT+-+AEOA.pdf' },
  { strategyName: 'Abakkus Diversified Alpha Approach', docType: 'factsheet', url: 'https://abakkus-website.s3.ap-south-1.amazonaws.com/files/factsheets/ADAA_Factsheet.pdf' },
  { strategyName: 'Abakkus Diversified Alpha Approach', docType: 'presentation', url: 'https://abakkus-website.s3.ap-south-1.amazonaws.com/files/presentations/Abakkus+Investment+Profile+PPT+-+ADAA.pdf' },
];

async function fetchAbakkus() {
  const documents = [];
  for (const c of ABAKKUS_CANDIDATES) {
    if (await urlExists(c.url)) {
      documents.push({ strategyName: c.strategyName, docType: c.docType, period: null, title: c.strategyName, url: c.url });
    } else {
      console.warn(`[PMS Factsheets] Abakkus ${c.strategyName} (${c.docType}): URL no longer resolves, dropping.`);
    }
  }
  return documents;
}

// ── Buoyant Capital: one flagship strategy, month-list embedded in the page ─
// Verified live: only ONE Buoyant strategy is APMI-registered ("Buoyant
// Opportunities PMS", IAID 606) -- the site's other three (Opportunities
// NDPMS, All-Weather, Liquid) are non-discretionary / not in APMI's public
// reporting, and the single monthly PDF is Opportunities-only. The
// /insights/factsheets/ page ships a WordPress-localised JSON array of
// {"month":"August 2026","url":"...pdf"} entries; filenames are NOT
// consistent month-to-month ("Buoyant-factsheet-July-2026.pdf" vs
// "Buoyant-PMS-Factsheet-Aug-2026.pdf" vs older "Quick-Insights-*.pdf"),
// so the latest is discovered from that list, not guessed from a URL
// pattern. Only entries whose URL path contains "factsheet" are considered
// -- a month that only has a lighter "Quick Insights" note keeps last
// month's real factsheet rather than regressing to a sparse PDF.
const BUOYANT_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Pure: given the /insights/factsheets/ page HTML, return { strategyName,
// docType, period, title, url } for the newest factsheet PDF, or null.
function parseBuoyantLatestFactsheet(html) {
  const entryRe = /\{"month":"([A-Za-z]+ \d{4})","url":"([^"]+?\.pdf)"\}/g;
  let best = null;
  let bestRank = -1;
  let m;
  while ((m = entryRe.exec(html))) {
    const monthLabel = m[1];
    const url = m[2].replace(/\\\//g, '/');
    if (!/buoyantcap\.com/i.test(url) || !/factsheet/i.test(url)) continue;
    const [mon, yr] = monthLabel.toLowerCase().split(' ');
    const monIdx = BUOYANT_MONTHS.indexOf(mon);
    const year = parseInt(yr, 10);
    if (monIdx < 0 || !Number.isFinite(year)) continue;
    const rank = year * 12 + monIdx;
    if (rank > bestRank) {
      bestRank = rank;
      best = { monthLabel, url };
    }
  }
  if (!best) return null;
  return {
    strategyName: 'Buoyant Opportunities PMS',
    docType: 'factsheet',
    period: best.monthLabel,
    title: `Buoyant Opportunities PMS — ${best.monthLabel}`,
    url: best.url,
  };
}

async function fetchBuoyant() {
  const res = await fetchWithRetry('https://www.buoyantcap.com/insights/factsheets/');
  if (!res.ok) {
    console.warn(`[PMS Factsheets] Buoyant: HTTP ${res.status}`);
    return [];
  }
  const doc = parseBuoyantLatestFactsheet(await res.text());
  if (!doc) {
    console.warn('[PMS Factsheets] Buoyant: no factsheet entry found on /insights/factsheets/');
    return [];
  }
  if (!(await urlExists(doc.url))) {
    console.warn(`[PMS Factsheets] Buoyant: newest factsheet URL does not resolve (${doc.url}), dropping.`);
    return [];
  }
  return [doc];
}

// ── Dezerv: 2 of its equity strategies publish a factsheet with schema data ─
// Verified live: Dezerv markets 4 factsheet "decks" at fixed slugs
// (/decks/{ers,afs,shine,ddplus}-factsheet/), each embedding one fixed
// CloudFront PDF URL. Only two map to an APMI-registered equity strategy
// AND carry schema-relevant data:
//   - Equity Revival Strategy  -> APMI IAID 1028
//   - Alpha Focus Strategy     -> APMI IAID 1032
// SHINE (a gold / multi-asset strategy) and Dynamic Debt Plus (debt) are
// absent from APMI's public reporting -- no detail page to attach to --
// and SHINE's factsheet has no equity holdings / sectors / market-cap to
// extract anyway. Neither ERS nor AFS discloses stock-level holdings (both
// are fund-of-sleeves), so topHoldings stays empty; market-cap split,
// Morningstar sector weights and volatility/Sharpe-vs-benchmark are the
// real extractable content. The deck page's own <a href> to the PDF is
// used (survives a filename change) rather than a hard-coded CloudFront
// URL; strategyName is APMI's exact leaderboard form so the downstream
// fuzzy match in lib/pmsFactsheetsCache.js resolves cleanly.
const DEZERV_DECKS = [
  { strategyName: 'dezerv. Equity Revival Strategy', deck: 'https://www.dezerv.in/decks/ers-factsheet/' },
  { strategyName: 'dezerv. Alpha Focus Strategy', deck: 'https://www.dezerv.in/decks/afs-factsheet/' },
];

// Pure: the deck page carries exactly one <a href="...cloudfront.../*.pdf">.
function parseDezervDeckPdf(html) {
  const $ = cheerio.load(html);
  const href = $('a[href$=".pdf"]').first().attr('href');
  return href && /\.pdf($|\?)/i.test(href) ? href.trim() : null;
}

async function fetchDezerv() {
  const documents = [];
  for (const d of DEZERV_DECKS) {
    const res = await fetchWithRetry(d.deck);
    if (!res.ok) {
      console.warn(`[PMS Factsheets] Dezerv ${d.strategyName}: HTTP ${res.status}`);
      continue;
    }
    const url = parseDezervDeckPdf(await res.text());
    if (!url) {
      console.warn(`[PMS Factsheets] Dezerv ${d.strategyName}: no PDF link on ${d.deck}`);
      continue;
    }
    if (!(await urlExists(url))) {
      console.warn(`[PMS Factsheets] Dezerv ${d.strategyName}: PDF does not resolve (${url}), dropping.`);
      continue;
    }
    documents.push({ strategyName: d.strategyName, docType: 'factsheet', period: null, title: d.strategyName, url });
  }
  return documents;
}

// ── Negen Capital: single strategy, factsheet + presentation ───────────────
// Verified live: negenpms.com's own header nav carries a "Factsheets"
// dropdown listing every past month newest-first, each `<a class="menu-
// link">` labelled with its own `<span class="menu-text">Month YYYY</span>`
// -- taking the first entry is far more reliable than guessing from the
// PDF filename, whose word order has already changed once on this site
// (older files: "Negen-PMS-<Month>-<Year>-Factsheet.pdf"; current:
// "Negen-PMS-Factsheet-<Month>-<Year>.pdf"). A separate monthly
// "Presentation" PDF is linked directly (no dropdown/archive) -- a
// narrative deck, not data-dense, so it's stored as docType 'presentation'
// (same reasoning as every other provider's presentation docs -- see the
// Gemini-extraction comment below). strategyName is APMI's exact
// leaderboard form (IAID 176, verified live) so downstream matching in
// lib/pmsFactsheetsCache.js resolves cleanly. Negen has only this one
// APMI-registered strategy.
const NEGEN_STRATEGY_NAME = 'Negen Special Situations & Dynamic Allocation Strategy';

async function fetchNegen() {
  const res = await fetchWithRetry('https://negenpms.com/');
  if (!res.ok) {
    console.warn(`[PMS Factsheets] Negen: HTTP ${res.status}`);
    return [];
  }
  const $ = cheerio.load(await res.text());
  const documents = [];

  const factsheetLink = $('a.menu-link[href*="Factsheet" i]')
    .filter((_, el) => /\.pdf$/i.test($(el).attr('href') || ''))
    .first();
  const factsheetUrl = factsheetLink.attr('href');
  const period = factsheetLink.find('.menu-text').text().trim() || null;
  if (factsheetUrl) {
    documents.push({
      strategyName: NEGEN_STRATEGY_NAME,
      docType: 'factsheet',
      period,
      title: `Negen PMS Factsheet${period ? ' – ' + period : ''}`,
      url: factsheetUrl,
    });
  } else {
    console.warn('[PMS Factsheets] Negen: no factsheet link found');
  }

  const presentationLink = $('a[href*="Presentation" i]')
    .filter((_, el) => /\.pdf$/i.test($(el).attr('href') || ''))
    .first();
  const presentationUrl = presentationLink.attr('href');
  if (presentationUrl) {
    documents.push({
      strategyName: NEGEN_STRATEGY_NAME,
      docType: 'presentation',
      period,
      title: `Negen PMS Presentation${period ? ' – ' + period : ''}`,
      url: presentationUrl,
    });
  }

  return documents;
}

// ── Motilal Oswal AMC: 7 equity strategies, one combined "Monthly
// Communique" PDF ───────────────────────────────────────────────────────
// Verified live: motilaloswalamc.com/pms/downloads/monthly-communique
// renders its file list client-side (no server-rendered <a href> to
// scrape -- an Adobe AEM /content/dam/ asset path), but the URL itself
// follows a strict, verified-live pattern: the communique for a given
// DATA month is uploaded the FOLLOWING calendar month, e.g. August 2026's
// data lives under the "sep" (September) upload directory --
// ".../monthly-communique/2026/sep/PMS%20Communique%20August%202026.pdf".
// Rather than hardcode this month's URL (which breaks every month), each
// candidate (data month, upload month) pair is HEAD-checked newest-first
// until one resolves -- same existence-checked-not-hardcoded approach
// already used by fetchStallion(). strategyName values are APMI's exact
// leaderboard form (verified live via IaInsight.htm against each IAID:
// 364, 423, 431, 1517, 412, 425, 366) so downstream matching in
// lib/pmsFactsheetsCache.js resolves cleanly; note "Founders Strategy" in
// the communique itself vs APMI's "Motilal Oswal Founders Portfolio" --
// that fuzzy gap is exactly what getFactsheetDataForStrategy()'s
// significantWords scoring is for, so the communique's own heading text
// is kept as `title` but APMI's exact name is used for `strategyName`.
const MOTILAL_OSWAL_STRATEGIES = [
  'Value Migration Strategy',
  'Motilal Oswal Ethical Strategy',
  'Motilal Oswal Founders Portfolio',
  'Motilal Oswal India Growth Strategy',
  'Motilal Oswal Mid to Mega Strategy',
  'Motilal Oswal Multifactor Equity Strategy',
  'Next Trillion Dollar Opportunity Strategy',
];

async function fetchMotilalOswal() {
  const now = new Date();
  for (let back = 0; back < 4; back++) {
    const dataDate = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const uploadDate = new Date(dataDate.getFullYear(), dataDate.getMonth() + 1, 1);
    const dataMonthName = MONTH_FULL[dataDate.getMonth()];
    const dataYear = dataDate.getFullYear();
    const uploadMonthAbbr = MONTH_FULL[uploadDate.getMonth()].slice(0, 3).toLowerCase();
    const uploadYear = uploadDate.getFullYear();
    const url = `https://www.motilaloswalamc.com/content/dam/motilal-mf/downloads/pms/monthly-communique/${uploadYear}/${uploadMonthAbbr}/PMS%20Communique%20${dataMonthName}%20${dataYear}.pdf`;
    if (await urlExists(url)) {
      const period = `${dataMonthName} ${dataYear}`;
      return MOTILAL_OSWAL_STRATEGIES.map((strategyName) => ({
        strategyName,
        docType: 'factsheet',
        period,
        title: `Motilal Oswal PMS Monthly Communique – ${period}`,
        url,
      }));
    }
  }
  console.warn('[PMS Factsheets] Motilal Oswal: no monthly communique found in the last 4 candidate months');
  return [];
}

// ── Invesco Asset Management: 5 equity strategies, each its own PDF ────────
// Verified live: invescomutualfund.com runs on Sitefinity CMS with a public
// OData API (/api/default/pmsfactsheets) that lists every published
// factsheet entry -- ordered by PMSFactsheetDate desc, the newest entries'
// date tells us the latest published period across all 5 strategies (they
// publish together). The entity's own PMSFactsheetDocument navigation
// property came back empty on every entry tested (permission-filtered on
// the public API, not a real gap), so rather than treat that as "no PDF",
// the real PDF URL is constructed from Invesco's own verified-live, stable
// filename convention (docs/default-source/pms-factsheet/invesco-india-
// {slug}-portfolio---factsheet---{day}-{month}-{year}.pdf) and existence-
// checked, same as every other predictable-URL provider in this file
// (Stallion, Motilal Oswal). strategyName is APMI's exact leaderboard form
// (verified live via IaInsight.htm against IAID 449-453).
const INVESCO_STRATEGIES = [
  { strategyName: 'Invesco India Large Cap Core Portfolio', slug: 'large-cap-core' },
  { strategyName: 'Invesco India Caterpillar Portfolio', slug: 'caterpillar' },
  { strategyName: 'Invesco India R.I.S.E Portfolio', slug: 'r-i-s-e' },
  { strategyName: 'Invesco India DAWN Portfolio', slug: 'dawn' },
  { strategyName: 'Invesco India Challengers Portfolio', slug: 'challengers' },
];

async function fetchInvesco() {
  const res = await fetchWithRetry('https://www.invescomutualfund.com/api/default/pmsfactsheets?%24orderby=PMSFactsheetDate%20desc&%24top=1');
  if (!res.ok) {
    console.warn(`[PMS Factsheets] Invesco: HTTP ${res.status} listing latest factsheet date`);
    return [];
  }
  const json = await res.json();
  const latestDateRaw = json?.value?.[0]?.PMSFactsheetDate;
  if (!latestDateRaw) {
    console.warn('[PMS Factsheets] Invesco: no PMSFactsheetDate found in API response');
    return [];
  }
  const d = new Date(latestDateRaw);
  const day = d.getUTCDate();
  const monthIdx = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const period = `${MONTH_FULL[monthIdx]} ${year}`;

  const documents = [];
  for (const s of INVESCO_STRATEGIES) {
    const url = `https://www.invescomutualfund.com/docs/default-source/pms-factsheet/invesco-india-${s.slug}-portfolio---factsheet---${day}-${MONTH_FULL[monthIdx].toLowerCase()}-${year}.pdf`;
    if (await urlExists(url)) {
      documents.push({ strategyName: s.strategyName, docType: 'factsheet', period, title: `${s.strategyName} – ${period}`, url });
    } else {
      console.warn(`[PMS Factsheets] Invesco ${s.strategyName}: expected URL does not resolve (${url})`);
    }
  }
  return documents;
}

// ── InCred Asset Management: 3 equity strategies, each its own PDF ─────────
// Verified live: incredassetmanagement.com sits behind a Cloudflare WAF
// rule that rejects any request carrying no Referer header at all (HTTP
// 403 on both the listing page and the PDFs themselves) -- NOT a real
// bot/JS challenge (no cookie or script execution required), confirmed by
// the exact same request succeeding the moment a Referer is added. This
// fetcher is the one place in this file that passes a custom Referer
// through fetchWithRetry's options for exactly that reason; every other
// provider's plain HEADERS default (no Referer) is unaffected.
// strategyName is APMI's exact leaderboard form (verified live via
// IaInsight.htm against IAID 138/139/140). InCred markets several more
// strategies (Ascend, Select Opportunities, Focused Healthcare Equity,
// Active Momentum, Omni Alpha) that have no factsheet on this page --
// left uncovered rather than guessed at.
const INCRED_REFERER = { Referer: 'https://www.incredassetmanagement.com/' };
const INCRED_STRATEGIES = [
  { strategyName: 'InCred Multicap Portfolio', linkText: 'InCred Multicap Portfolio Factsheet' },
  { strategyName: 'InCred Small and Midcap Portfolio', linkText: 'InCred Small and Mid Cap Portfolio Factsheet' },
  { strategyName: 'InCred Healthcare Portfolio', linkText: 'InCred Healthcare Portfolio Factsheet' },
];

async function fetchIncred() {
  const res = await fetchWithRetry('https://www.incredassetmanagement.com/insights/', { headers: INCRED_REFERER });
  if (!res.ok) {
    console.warn(`[PMS Factsheets] InCred: HTTP ${res.status}`);
    return [];
  }
  const $ = cheerio.load(await res.text());
  const documents = [];
  for (const s of INCRED_STRATEGIES) {
    const link = $('a').filter((_, el) => $(el).text().trim() === s.linkText).first();
    const href = link.attr('href');
    if (!href) {
      console.warn(`[PMS Factsheets] InCred ${s.strategyName}: no link found for "${s.linkText}"`);
      continue;
    }
    const url = new URL(href, 'https://www.incredassetmanagement.com').href;
    const period = extractPeriodFromFilename(url);
    documents.push({ strategyName: s.strategyName, docType: 'factsheet', period, title: `${s.strategyName}${period ? ' – ' + period : ''}`, url });
  }
  return documents;
}

// ── Green Portfolio: 5 strategies, one page each, 3 of them currently
// sharing a combined "Pitchbook" PDF ────────────────────────────────────
// Verified live: 5 of Green Portfolio's 7 APMI-registered strategies have
// their own page at /portfolio-management-services/{slug} (MNC Advantage
// Fund and Fund of Funds have neither a page nor a factsheet -- excluded,
// not guessed at). Each page carries exactly one non-boilerplate PDF link
// (Terms/Privacy/Cookies are the other 3 .pdf links on every page,
// filtered out by name). Special Fund's and Super 30's pages currently
// link to byte-identical combined "Pitchbook" PDFs (different admin
// panel file IDs, same content, confirmed live via checksum) covering
// Special Fund + Super 30 + Dividend Yield together; Dividend Yield's own
// page links to a newer, larger combined pitchbook covering the same 3
// strategies plus more -- each strategy's document simply carries
// whatever URL its own page currently links to (same "read what's really
// there, don't guess" approach as every other multi-strategy provider in
// this file), so this naturally self-corrects if/when all 3 pages start
// pointing at the same current file. strategyName is APMI's exact
// leaderboard form (verified live via IaInsight.htm against IAID 98, 99,
// 100, 102, 1764).
const GREEN_PORTFOLIO_STRATEGIES = [
  { strategyName: 'GREEN PORTFOLIO SPECIAL FUND', slug: 'green-portfolio-special-fund' },
  { strategyName: 'GREEN PORTFOLIO SUPER 30 DYNAMIC FUND', slug: 'super-30-fund' },
  { strategyName: 'GREEN PORTFOLIO DIVIDEND YIELD FUND', slug: 'green-portfolio-dividend-yield-fund' },
  { strategyName: 'GREEN PORTFOLIO THE IMPACT ESG FUND', slug: 'green-portfolio-impact-esg-fund' },
  { strategyName: 'THE GREEN ETHICAL FUND', slug: 'green-ethical-fund' },
];
const GREEN_PORTFOLIO_BOILERPLATE = ['terms-of-services', 'privacy-policy', 'cookies-policies'];

async function fetchGreenPortfolio() {
  const documents = [];
  for (const s of GREEN_PORTFOLIO_STRATEGIES) {
    const res = await fetchWithRetry(`https://greenportfolio.co/portfolio-management-services/${s.slug}`);
    if (!res.ok) {
      console.warn(`[PMS Factsheets] Green Portfolio ${s.strategyName}: HTTP ${res.status}`);
      continue;
    }
    const $ = cheerio.load(await res.text());
    let url = null;
    $('a[href$=".pdf" i]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || GREEN_PORTFOLIO_BOILERPLATE.some((b) => href.toLowerCase().includes(b))) return;
      url = new URL(href, 'https://greenportfolio.co').href;
      return false;
    });
    if (!url) {
      console.warn(`[PMS Factsheets] Green Portfolio ${s.strategyName}: no factsheet link found`);
      continue;
    }
    const period = extractPeriodFromFilename(url);
    documents.push({ strategyName: s.strategyName, docType: 'factsheet', period, title: `${s.strategyName}${period ? ' – ' + period : ''}`, url });
  }
  return documents;
}

// ── Equitree Capital Advisors: 1 equity strategy (Emerging Opportunities) ──
// Verified live: equitreecapital.com/pms/ links directly to the latest
// factsheet ("Download factsheet→" linking to /documents/Equitree PMS Factsheet Sept'26.pdf).
// strategyName is APMI's exact leaderboard form ("Equitree Emerging Opportunities",
// IAID 407, verified live) so downstream matching in lib/pmsFactsheetsCache.js
// resolves cleanly.
async function fetchEquitree() {
  const res = await fetchWithRetry('https://equitreecapital.com/pms/');
  if (!res.ok) {
    console.warn(`[PMS Factsheets] Equitree: HTTP ${res.status}`);
    return [];
  }
  const $ = cheerio.load(await res.text());
  let pdfHref = null;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && /PMS.*Factsheet/i.test(href) && /\.pdf$/i.test(href.trim())) {
      pdfHref = href.trim();
      return false;
    }
  });
  if (!pdfHref) {
    console.warn('[PMS Factsheets] Equitree: no factsheet link found');
    return [];
  }
  const url = new URL(pdfHref, 'https://equitreecapital.com').href;
  const period = extractPeriodFromFilename(url);
  return [
    {
      strategyName: 'Equitree Emerging Opportunities',
      docType: 'factsheet',
      period,
      title: `Equitree PMS Factsheet${period ? ' – ' + period : ''}`,
      url,
    },
  ];
}

// ── Aditya Birla Sun Life AMC: 6 core domestic equity strategies ────────────
// Verified live: alternateinvestments.adityabirlacapital.com/marketing-resources
// serves all document uploads in its RSC payload, including the monthly combined
// factsheet (ABSL Alternates Factsheet August 2026.pdf) and strategy pitch decks.
const ABSL_EQUITY_STRATEGIES = [
  { strategyName: 'Select Sector Portfolio', properName: 'ABSL Select Sector Portfolio', presRegex: /ABSL_SSP_.*\.pdf$/i },
  { strategyName: 'India Special Opportunities Portfolio', properName: 'ABSL India Special Opportunities Portfolio', presRegex: /ABSL_ISOP_.*\.pdf$/i },
  { strategyName: 'Innovation Portfolio', properName: 'ABSL Innovation Portfolio', presRegex: /ABSL_Innovation_.*\.pdf$/i },
  { strategyName: 'Top 200 Core Equity Portfolio', properName: 'ABSL Top 200 Core Equity Portfolio', presRegex: /ABSL_Top_200_.*\.pdf$/i },
  { strategyName: 'Core Equity Portfolio', properName: 'ABSL Core Equity Portfolio', presRegex: /ABSL_CEP_August_.*\.pdf$/i },
  { strategyName: 'Next 100 Portfolio', properName: 'ABSL Next 100 Portfolio', presRegex: /ABSL_Next_100_.*\.pdf$/i },
];

async function fetchAdityaBirla() {
  const res = await fetchWithRetry('https://alternateinvestments.adityabirlacapital.com/marketing-resources');
  if (!res.ok) {
    console.warn(`[PMS Factsheets] Aditya Birla: HTTP ${res.status}`);
    return [];
  }
  const html = await res.text();
  const pdfMatches = [...html.matchAll(/\/uploads\/([a-zA-Z0-9_-]+\.pdf)/g)];
  const uniqueUrls = [...new Set(pdfMatches.map((m) => m[0]))];
  const BASE_URL = 'https://alternateinvestments.adityabirlacapital.com';

  const factsheetPath = uniqueUrls.find((u) => /ABSL_Alternates_Factsheet/i.test(u));
  const period = factsheetPath ? extractPeriodFromFilename(factsheetPath) : null;

  const documents = [];
  for (const s of ABSL_EQUITY_STRATEGIES) {
    if (factsheetPath) {
      documents.push({
        strategyName: s.strategyName,
        docType: 'factsheet',
        period,
        title: `${s.properName}${period ? ' – ' + period : ''}`,
        url: BASE_URL + factsheetPath,
        properName: s.properName,
      });
    }
    const presPath = uniqueUrls.find((u) => s.presRegex.test(u) && !/observer/i.test(u));
    if (presPath) {
      const presPeriod = extractPeriodFromFilename(presPath);
      documents.push({
        strategyName: s.strategyName,
        docType: 'presentation',
        period: presPeriod,
        title: `${s.properName} Presentation${presPeriod ? ' – ' + presPeriod : ''}`,
        url: BASE_URL + presPath,
      });
    }
  }

  const iespPath = uniqueUrls.find((u) => /ABSL_IESP_.*\.pdf$/i.test(u));
  if (iespPath) {
    const iespPeriod = extractPeriodFromFilename(iespPath);
    documents.push({
      strategyName: 'ABSL India Equity Services',
      docType: 'presentation',
      period: iespPeriod,
      title: `ABSL India Equity Services Portfolio Presentation${iespPeriod ? ' – ' + iespPeriod : ''}`,
      url: BASE_URL + iespPath,
    });
  }

  return documents;
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
  "objective": "the strategy's own stated investment objective/philosophy, verbatim or lightly trimmed, or null",
  "marketCapAllocation": {"largeCap": number|null, "midCap": number|null, "smallCap": number|null, "cash": number|null},
  "sectorAllocation": [{"sector": string, "weightPct": number}],
  "topHoldings": [{"name": string, "weightPct": number|null, "capBucket": "Large Cap"|"Mid Cap"|"Small Cap"|null}],
  "portfolioAttributes": {
    "revenueCagr": {"strategy": number|null, "benchmark": number|null},
    "epsCagr": {"strategy": number|null, "benchmark": number|null},
    "portfolioPe": {"strategy": number|null, "benchmark": number|null},
    "roe": {"strategy": number|null, "benchmark": number|null},
    "netDebtEquity": {"strategy": number|null, "benchmark": number|null},
    "peg": {"strategy": number|null, "benchmark": number|null},
    "sharpeRatio": {"strategy": number|null, "benchmark": number|null},
    "standardDeviation": {"strategy": number|null, "benchmark": number|null},
    "arithmeticMeanReturn": {"strategy": number|null, "benchmark": number|null},
    "beta": {"strategy": number|null, "benchmark": number|null},
    "correlation": {"strategy": number|null, "benchmark": number|null},
    "alpha": {"strategy": number|null, "benchmark": number|null},
    "trackingError": {"strategy": number|null, "benchmark": number|null},
    "upCaptureRatio": {"strategy": number|null, "benchmark": number|null},
    "downCaptureRatio": {"strategy": number|null, "benchmark": number|null}
  },
  "portfolioChanges": {"newEntrants": [string], "exits": [string]}
}
Beta/Correlation/Alpha/Tracking Error/Up capture Ratio/Down capture Ratio are relative-to-benchmark metrics -- they normally have only a "strategy" value; leave "benchmark" null for these unless the document genuinely shows a benchmark-side figure for them too.
If a field genuinely is not present in the document, use null (for objects/numbers/strings) or an empty array -- never invent a value.`;

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
  // Same Number(null)===0 trap as saneNum below -- must short-circuit
  // before Number(v) or a genuinely-absent field becomes a stored 0%.
  if (v == null) return null;
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

// Only these 3 values are meaningful to the UI (a market-cap-bucket
// label alongside a holding, used when no weight% is published) --
// anything else becomes null rather than showing an unrecognized string.
const KNOWN_CAP_BUCKETS = new Set(['Large Cap', 'Mid Cap', 'Small Cap']);
function saneCapBucket(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return KNOWN_CAP_BUCKETS.has(trimmed) ? trimmed : null;
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

  // A named holding is kept even when weightPct is absent or invalid --
  // verified necessary against Sundaram's real factsheets, which rank
  // top holdings per strategy but publish only a market-cap bucket per
  // name, never a weight% at all. Only `name` is required to survive;
  // weightPct and capBucket are independently cleaned (garbage in either
  // becomes null on that field, not a dropped row).
  let topHoldings = null;
  if (Array.isArray(raw.topHoldings)) {
    const cleaned = raw.topHoldings
      .map((h) => ({
        name: typeof h?.name === 'string' ? h.name.trim() : null,
        weightPct: sanePct(h?.weightPct),
        capBucket: saneCapBucket(h?.capBucket),
      }))
      .filter((h) => h.name);
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
      // These 6 are relative-to-benchmark risk measures (see prompt comment) --
      // schema still stores {strategy,benchmark} for uniformity with the rest
      // of this object, but benchmark is null for the overwhelming majority
      // of real factsheets, which report a strategy-only figure.
      arithmeticMeanReturn: saneMetricPair(pa.arithmeticMeanReturn),
      beta: saneMetricPair(pa.beta),
      correlation: saneMetricPair(pa.correlation),
      alpha: saneMetricPair(pa.alpha),
      trackingError: saneMetricPair(pa.trackingError),
      upCaptureRatio: saneMetricPair(pa.upCaptureRatio),
      downCaptureRatio: saneMetricPair(pa.downCaptureRatio),
    };
    if (Object.values(cleaned).some((p) => p.strategy != null || p.benchmark != null)) portfolioAttributes = cleaned;
  }

  // Verbatim-ish objective/philosophy text sourced from the factsheet itself
  // -- almost always a better description than APMI's own "Purpose" field
  // (see lib/pmsScrapers.js), which is why the UI prefers this when present.
  // Capped well above any real factsheet objective's length so a genuine
  // paragraph survives, while a hallucinated wall of text still gets capped.
  let objective = null;
  if (typeof raw.objective === 'string') {
    const trimmed = raw.objective.trim();
    if (trimmed) objective = trimmed.length > 600 ? trimmed.slice(0, 600).trim() : trimmed;
  }

  let portfolioChanges = null;
  if (raw.portfolioChanges && typeof raw.portfolioChanges === 'object') {
    const newEntrants = Array.isArray(raw.portfolioChanges.newEntrants) ? raw.portfolioChanges.newEntrants.filter((s) => typeof s === 'string' && s.trim()) : [];
    const exits = Array.isArray(raw.portfolioChanges.exits) ? raw.portfolioChanges.exits.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (newEntrants.length > 0 || exits.length > 0) portfolioChanges = { newEntrants, exits };
  }

  const asOfDate = typeof raw.asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.asOfDate) ? raw.asOfDate : null;

  if (!marketCapAllocation && !sectorAllocation && !topHoldings && !portfolioAttributes && !portfolioChanges && !objective) return null;

  return { asOfDate, objective, marketCapAllocation, sectorAllocation, topHoldings, portfolioAttributes, portfolioChanges };
}

async function extractFactsheetData(pdfUrl) {
  // A same-origin Referer is a no-op for the overwhelming majority of
  // providers but is the actual fix InCred's WAF needs (see fetchIncred's
  // comment) -- sending it unconditionally here means any current or
  // future provider with the same anti-hotlinking-style rule just works,
  // without a per-provider special case in the extraction path.
  const pdfRes = await fetchWithRetry(pdfUrl, { headers: { Referer: new URL(pdfUrl).origin + '/' } });
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
      "objective": "the strategy's own stated investment objective/philosophy, verbatim or lightly trimmed, or null",
      "marketCapAllocation": {"largeCap": number|null, "midCap": number|null, "smallCap": number|null, "cash": number|null},
      "sectorAllocation": [{"sector": string, "weightPct": number}],
      "topHoldings": [{"name": string, "weightPct": number|null, "capBucket": "Large Cap"|"Mid Cap"|"Small Cap"|null}],
      "portfolioAttributes": {
        "revenueCagr": {"strategy": number|null, "benchmark": number|null},
        "epsCagr": {"strategy": number|null, "benchmark": number|null},
        "portfolioPe": {"strategy": number|null, "benchmark": number|null},
        "roe": {"strategy": number|null, "benchmark": number|null},
        "netDebtEquity": {"strategy": number|null, "benchmark": number|null},
        "peg": {"strategy": number|null, "benchmark": number|null},
        "sharpeRatio": {"strategy": number|null, "benchmark": number|null},
        "standardDeviation": {"strategy": number|null, "benchmark": number|null},
        "arithmeticMeanReturn": {"strategy": number|null, "benchmark": number|null},
        "beta": {"strategy": number|null, "benchmark": number|null},
        "correlation": {"strategy": number|null, "benchmark": number|null},
        "alpha": {"strategy": number|null, "benchmark": number|null},
        "trackingError": {"strategy": number|null, "benchmark": number|null},
        "upCaptureRatio": {"strategy": number|null, "benchmark": number|null},
        "downCaptureRatio": {"strategy": number|null, "benchmark": number|null}
      },
      "portfolioChanges": {"newEntrants": [string], "exits": [string]}
    }
  ]
}
Beta/Correlation/Alpha/Tracking Error/Up capture Ratio/Down capture Ratio are relative-to-benchmark metrics -- they normally have only a "strategy" value; leave "benchmark" null for these unless the document genuinely shows a benchmark-side figure for them too.
Return exactly one entry per strategy name listed above, using that exact strategyName string. If a field genuinely is not present for a given strategy, use null (for objects/numbers/strings) or an empty array -- never invent a value.`;
}

// One Gemini call, one PDF fetch -- returns a Map<strategyName, cleaned
// extraction> covering as many of `strategyNames` as the model actually
// found usable data for. A strategy missing from the result (unmatched
// name, or nothing survived validateAndCleanExtraction) simply isn't a
// key in the returned Map; the caller falls back to that strategy's
// previous extraction, same as any other failure in this pipeline.
async function extractMultiStrategyFactsheetData(pdfUrl, strategyNames) {
  // A same-origin Referer is a no-op for the overwhelming majority of
  // providers but is the actual fix InCred's WAF needs (see fetchIncred's
  // comment) -- sending it unconditionally here means any current or
  // future provider with the same anti-hotlinking-style rule just works,
  // without a per-provider special case in the extraction path.
  const pdfRes = await fetchWithRetry(pdfUrl, { headers: { Referer: new URL(pdfUrl).origin + '/' } });
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
    // Skip non-factsheets, and pending docs with no URL yet (nothing to
    // download for Gemini -- their extracted data is filled manually and
    // preserved via prevFor() below).
    if (doc.docType !== 'factsheet' || !doc.url) continue;
    if (!byUrl.has(doc.url)) byUrl.set(doc.url, []);
    byUrl.get(doc.url).push(doc);
  }

  // A URL-less factsheet doc still inherits any previously-stored extraction.
  for (const doc of documents) {
    if (doc.docType === 'factsheet' && !doc.url && !doc.extracted) {
      const prev = prevFor(doc);
      if (prev?.extracted) doc.extracted = prev.extracted;
    }
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
        console.warn(`[PMS Factsheets] Daily Gemini quota exhausted -- stopping further extraction attempts for the rest of this run. Remaining documents will be picked up on a later run (or run scripts/pms_factsheet_manual_fill.js --list to extract them locally right now instead of waiting).`);
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
  { key: 'iciciprudential', displayName: 'ICICI Prudential Asset Management Company', matchFragments: ['icici prudential'], fetch: fetchICICIPru },
  { key: 'alchemy', displayName: 'Alchemy Capital Management', matchFragments: ['alchemy'], fetch: fetchAlchemy },
  { key: 'abakkus', displayName: 'Abakkus Investment Managers', matchFragments: ['abakkus'], fetch: fetchAbakkus },
  { key: 'buoyant', displayName: 'Buoyant Capital', matchFragments: ['buoyant'], fetch: fetchBuoyant },
  { key: 'dezerv', displayName: 'Dezerv Investments', matchFragments: ['dezerv'], fetch: fetchDezerv },
  { key: 'negen', displayName: 'Negen Capital', matchFragments: ['negen'], fetch: fetchNegen },
  { key: 'motilaloswal', displayName: 'Motilal Oswal Asset Management Company', matchFragments: ['motilal oswal'], fetch: fetchMotilalOswal },
  { key: 'invesco', displayName: 'Invesco Asset Management', matchFragments: ['invesco'], fetch: fetchInvesco },
  { key: 'incred', displayName: 'InCred Asset Management', matchFragments: ['incred'], fetch: fetchIncred },
  { key: 'greenportfolio', displayName: 'Green Portfolio', matchFragments: ['green portfolio'], fetch: fetchGreenPortfolio },
  { key: 'equitree', displayName: 'Equitree Capital Advisors', matchFragments: ['equitree'], fetch: fetchEquitree },
  { key: 'adityabirla', displayName: 'Aditya Birla Sun Life AMC Limited', matchFragments: ['aditya birla'], fetch: fetchAdityaBirla },
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
  assert.strictEqual(extractPeriodFromFilename("Equitree PMS Factsheet Sept'26.pdf"), 'September 2026');
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

  // A holding with a non-numeric/out-of-range weight keeps the row but
  // nulls just that field -- weight isn't required to know what a
  // strategy holds. An unnamed row is dropped (nothing to show at all).
  const badHolding = validateAndCleanExtraction({
    topHoldings: [
      { name: 'Real Stock', weightPct: 8.5 },
      { name: 'Bad Weight Kept', weightPct: 'not a number' },
      { name: 'Out Of Range Kept', weightPct: 250 },
      { name: '', weightPct: 5 },
    ],
  });
  assert.strictEqual(badHolding.topHoldings.length, 3);
  assert.strictEqual(badHolding.topHoldings[0].weightPct, 8.5);
  assert.strictEqual(badHolding.topHoldings[1].weightPct, null);
  assert.strictEqual(badHolding.topHoldings[2].weightPct, null);

  // Real shape verified against Sundaram's factsheets: top holdings
  // ranked by name with a market-cap bucket, no weight% at all.
  const bucketOnlyHoldings = validateAndCleanExtraction({
    topHoldings: [
      { name: 'Polycab India Limited', weightPct: null, capBucket: 'Large Cap' },
      { name: 'Unrecognized Bucket', weightPct: null, capBucket: 'Micro Cap' },
    ],
  });
  assert.strictEqual(bucketOnlyHoldings.topHoldings[0].weightPct, null);
  assert.strictEqual(bucketOnlyHoldings.topHoldings[0].capBucket, 'Large Cap');
  assert.strictEqual(bucketOnlyHoldings.topHoldings[1].capBucket, null); // not one of the 3 known buckets

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

  // objective: real, verified-against-source text from Sundaram SISOP's
  // June 2026 SUNbeam factsheet -- trimmed of surrounding whitespace, kept
  // even when nothing else in the response survived validation (an
  // objective alone is still usable -- it's what replaces APMI's inferior
  // "Purpose" field on the detail page).
  const objectiveOnly = validateAndCleanExtraction({
    objective: '  To generate capital appreciation across market cycles by investing in a concentrated set of high conviction stocks.  ',
  });
  assert.strictEqual(objectiveOnly.objective, 'To generate capital appreciation across market cycles by investing in a concentrated set of high conviction stocks.');
  assert.strictEqual(objectiveOnly.marketCapAllocation, null);

  // A blank/whitespace-only objective is the same as absent -- never store
  // an empty string a UI would render as an empty "Purpose" card.
  assert.strictEqual(validateAndCleanExtraction({ objective: '   ' }), null);
  assert.strictEqual(validateAndCleanExtraction({ objective: 123 }), null);

  // Real, verified-against-source values from Sundaram SISOP's June 2026
  // "Performance Measures - Since Inception" table: Beta/Correlation/Alpha/
  // Tracking Error/capture ratios are relative-to-benchmark measures with
  // no benchmark-side figure of their own (benchmark stays null), while
  // Arithmetic Mean/Sharpe Ratio genuinely have both sides.
  const relativeMetrics = validateAndCleanExtraction({
    portfolioAttributes: {
      arithmeticMeanReturn: { strategy: 18.6, benchmark: 13.1 },
      beta: { strategy: 0.8, benchmark: null },
      correlation: { strategy: 0.8, benchmark: null },
      alpha: { strategy: 6.6, benchmark: null },
      trackingError: { strategy: 9.7, benchmark: null },
      upCaptureRatio: { strategy: 105.2, benchmark: null },
      downCaptureRatio: { strategy: 76.1, benchmark: null },
    },
  });
  assert.strictEqual(relativeMetrics.portfolioAttributes.arithmeticMeanReturn.benchmark, 13.1);
  assert.strictEqual(relativeMetrics.portfolioAttributes.beta.strategy, 0.8);
  assert.strictEqual(relativeMetrics.portfolioAttributes.beta.benchmark, null);
  assert.strictEqual(relativeMetrics.portfolioAttributes.downCaptureRatio.strategy, 76.1);

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

  // resolveIciciUrl: bakes the ?crafterSite=production param that the
  // live WAF requires directly into the stored URL, verified live
  // against the real F5-protected asset host.
  assert.strictEqual(
    resolveIciciUrl('/static-assets/documents/icici_pru_pms_ace_strategy_factsheet_september_2026.pdf'),
    'https://www.iciciprualternates.com/static-assets/documents/icici_pru_pms_ace_strategy_factsheet_september_2026.pdf?crafterSite=production'
  );

  // parseAlchemyDocLinks: real live markup -- one button's label is plain
  // text in the <a>, the other wraps it in <span>; both must be found.
  const alchemyLinks = parseAlchemyDocLinks(`
    <div class="btngroup inline">
      <a href="/media/m4wddqxd/alchemy-win-strategy-jul26-1.pdf" class="snapshot-btn" target="_blank">
        DOWNLOAD PRESENTATION
        <img src="/images/download.svg" alt="">
      </a>
      <a href="/media/zw2bezw4/alchemy-win-strategy-jul26.pdf" class="snapshot-btn" target="_blank">
        <span>DOWNLOAD FACTSHEET</span>
        <img src="/images/download.svg" alt="">
      </a>
    </div>
  `);
  assert.strictEqual(alchemyLinks.presentation, '/media/m4wddqxd/alchemy-win-strategy-jul26-1.pdf');
  assert.strictEqual(alchemyLinks.factsheet, '/media/zw2bezw4/alchemy-win-strategy-jul26.pdf');

  // parseBuoyantLatestFactsheet: the real page ships an escaped-slash JSON
  // month list; the newest "factsheet"-named PDF wins, a Quick-Insights
  // entry for a later month is ignored, and cross-year ordering is by
  // (year, month) not string sort.
  const buoyant = parseBuoyantLatestFactsheet(
    '{"month":"December 2025","url":"https:\\/\\/www.buoyantcap.com\\/wp-content\\/uploads\\/2025\\/12\\/Buoyant-factsheet-December-2025.pdf"},' +
    '{"month":"July 2026","url":"https:\\/\\/www.buoyantcap.com\\/wp-content\\/uploads\\/2026\\/08\\/Buoyant-factsheet-July-2026.pdf"},' +
    '{"month":"August 2026","url":"https:\\/\\/www.buoyantcap.com\\/wp-content\\/uploads\\/2026\\/09\\/Buoyant-PMS-Factsheet-Aug-2026.pdf"},' +
    '{"month":"September 2026","url":"https:\\/\\/www.buoyantcap.com\\/wp-content\\/uploads\\/2026\\/10\\/Quick-Insights-September-2026.pdf"}'
  );
  assert.strictEqual(buoyant.url, 'https://www.buoyantcap.com/wp-content/uploads/2026/09/Buoyant-PMS-Factsheet-Aug-2026.pdf');
  assert.strictEqual(buoyant.strategyName, 'Buoyant Opportunities PMS');
  assert.strictEqual(buoyant.period, 'August 2026');
  assert.strictEqual(parseBuoyantLatestFactsheet('<div>no month list here</div>'), null);

  // appendPendingIciciFactsheets: a pending strategy is added as a
  // url:null factsheet when absent, and skipped once the API carries it.
  const pending = [{ strategyName: 'ICICI Prudential PMS Rising Stars Strategy', period: 'August 2026' }];
  const absent = appendPendingIciciFactsheets(
    [{ strategyName: 'ICICI Prudential PMS ACE Strategy', docType: 'factsheet', url: 'https://x/ace.pdf' }],
    pending,
  );
  assert.strictEqual(absent.length, 2);
  assert.strictEqual(absent[1].strategyName, 'ICICI Prudential PMS Rising Stars Strategy');
  assert.strictEqual(absent[1].url, null);
  assert.strictEqual(absent[1].period, 'August 2026');
  const present = appendPendingIciciFactsheets(
    [{ strategyName: 'ICICI Prudential PMS Rising Stars Strategy', docType: 'factsheet', url: 'https://x/rs.pdf' }],
    pending,
  );
  assert.strictEqual(present.length, 1, 'API version already present -> pending entry skipped');

  // parseDezervDeckPdf: the deck page carries one <a href> to a CloudFront
  // PDF; trailing query strings are tolerated, a non-PDF link is ignored.
  assert.strictEqual(
    parseDezervDeckPdf(
      '<a href="https://www.dezerv.in/faq">FAQ</a>' +
      '<a href="https://d21ldyuk035o7q.cloudfront.net/portfolio-review/acquisition/dezerv-equity-revival-factsheet.pdf">Download</a>'
    ),
    'https://d21ldyuk035o7q.cloudfront.net/portfolio-review/acquisition/dezerv-equity-revival-factsheet.pdf'
  );
  assert.strictEqual(parseDezervDeckPdf('<a href="/decks/afs-factsheet/">back</a>'), null);

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
  fetchICICIPru,
  resolveIciciUrl,
  appendPendingIciciFactsheets,
  fetchAlchemy,
  parseAlchemyDocLinks,
  fetchAbakkus,
  fetchBuoyant,
  parseBuoyantLatestFactsheet,
  fetchDezerv,
  parseDezervDeckPdf,
  fetchNegen,
  fetchMotilalOswal,
  fetchInvesco,
  fetchIncred,
  fetchGreenPortfolio,
  fetchEquitree,
  fetchAdityaBirla,
  PROVIDERS,
  extractFactsheetData,
  extractMultiStrategyFactsheetData,
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
