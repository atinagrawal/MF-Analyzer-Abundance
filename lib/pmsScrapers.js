/**
 * lib/pmsScrapers.js
 *
 * Pure APMI scraping + parsing functions for a single Investment Approach
 * (IA) -- deliberately dependency-light (cheerio + native fetch only, no
 * `@/` alias imports) so this file is importable both from Next API routes
 * (`@/lib/pmsScrapers`) and the standalone `scripts/backfill-pms-detail-pages.mjs`
 * (`../lib/pmsScrapers.js`), matching the existing dual-import pattern
 * `lib/bseIndex.js` already uses. Caching lives in the API route files that
 * call these functions (Task 2/3), not here.
 *
 * Two independent APMI endpoints, both verified live and cookie-free:
 *   1. GET IaInsight.htm?IAID=N        -- static details (fees, facts, manager)
 *   2. POST getPerformanceChart.htm    -- one month's period-wise performance
 */

import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0';
const REFERRER = 'https://www.apmiindia.org/';

// ── 1. IaInsight.htm -- static details ──────────────────────────────────────

export async function fetchIaInsightHtml(iaid) {
  const res = await fetch(`https://www.apmiindia.org/apmi/IaInsight.htm?IAID=${encodeURIComponent(iaid)}`, {
    headers: { 'User-Agent': USER_AGENT, Referer: REFERRER },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`APMI IaInsight responded ${res.status}`);
  return res.text();
}

/**
 * Finds the <p> (or, for the Fund Manager card, <span class="wrapdata">)
 * immediately following a <label><b>labelText</b></label>, matching the
 * markup verified live on IaInsight.htm. Returns null if the label isn't
 * found or its value is empty.
 */
function fieldAfterLabel($, labelText, valueTag = 'p') {
  let result = null;
  $('label').each((_, el) => {
    const b = $(el).find('b').first();
    if (b.text().trim() !== labelText) return;
    const val = $(el).nextAll(valueTag).first();
    const text = val.text().replace(/\s+/g, ' ').trim();
    result = text || null;
    return false; // stop iterating once found
  });
  return result;
}

function parseAum($) {
  let aum = null;
  $('span').each((_, el) => {
    if ($(el).text().trim() !== '(AUM CR)') return;
    const h4 = $(el).parent().find('h4.pmsum-title').first();
    const num = parseFloat(h4.text().replace(/[₹,]/g, '').trim());
    if (!isNaN(num)) aum = num;
    return false;
  });
  return aum;
}

function parseFundManager($) {
  const card = $('h4.card-title').first();
  if (!card.length) return null;
  const name = card.text().trim();
  if (!name) return null;
  // Work Exp./Email ID/Mobile No use <span class="wrapdata"> as their value
  // tag, not <p> -- see the header comment for the exact markup difference.
  return {
    name,
    workExp: fieldAfterLabel($, 'Work Exp.', 'span.wrapdata') || fieldAfterLabel($, 'Work Exp', 'span.wrapdata'),
    email: fieldAfterLabel($, 'Email ID', 'span.wrapdata'),
    mobile: fieldAfterLabel($, 'Mobile No', 'span.wrapdata'),
  };
}

/**
 * Parses the "Investment Approach Details" + "Turnover Details" +
 * first Fund Manager card sections of an IaInsight.htm page.
 * Returns null if the page doesn't look like a valid IA page at all
 * (e.g. an unknown IAID) -- callers should treat that as "not found".
 */
export function parseIaInsightDetails(html) {
  const $ = cheerio.load(html);

  const providerName = fieldAfterLabel($, 'PMS Provider Name');
  const strategyName = fieldAfterLabel($, 'Strategy Name');
  if (!providerName && !strategyName) return null; // not a real IA page

  const minInvestmentRaw = fieldAfterLabel($, 'Min. Inv. Amount');
  const minInvestment = minInvestmentRaw ? parseFloat(minInvestmentRaw.replace(/[^\d.]/g, '')) : null;

  const turnover1MRaw = fieldAfterLabel($, '1 Month Turnover');
  const turnover1YRaw = fieldAfterLabel($, '1 Year Turnover');

  return {
    iaName: $('#IAName').attr('value') || null,
    providerName,
    benchmark: fieldAfterLabel($, 'Benchmark'),
    strategyName,
    productName: fieldAfterLabel($, 'Product Name'),
    inceptionDate: fieldAfterLabel($, 'Date Of Inception'),
    age: fieldAfterLabel($, 'Age'),
    minInvestment: isNaN(minInvestment) ? null : minInvestment,
    fixedFees: fieldAfterLabel($, 'Fixed Fees Structure'),
    variableFees: fieldAfterLabel($, 'Variable Fees Structure'),
    exitLoad: fieldAfterLabel($, 'Exit Load'),
    purpose: fieldAfterLabel($, 'Purpose'),
    aumCr: parseAum($),
    turnover1M: turnover1MRaw != null ? parseFloat(turnover1MRaw) : null,
    turnover1Y: turnover1YRaw != null ? parseFloat(turnover1YRaw) : null,
    fundManager: parseFundManager($),
  };
}

/** Fetch + parse combined -- the function API routes actually call. */
export async function fetchPmsDetails(iaid) {
  const html = await fetchIaInsightHtml(iaid);
  return parseIaInsightDetails(html);
}

// ── 2. getPerformanceChart.htm -- one month's period-wise performance ──────

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const EARLIEST_YEAR = 2023;
export const EARLIEST_MONTH = 4; // April 2023 -- confirmed floor (March 2023 returns "No Records Found")

/** Inclusive list of {year, month} from (startYear,startMonth) to (endYear,endMonth). */
export function monthsFrom(startYear, startMonth, endYear, endMonth) {
  const out = [];
  let y = startYear, m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Extracts the raw `value` attribute of `<input ... id="perlists" value="...">`
 * from a getPerformanceChart.htm response fragment. Returns null when the
 * month has no data ("No Records Found" page, or the input is simply
 * missing) -- callers must treat that as "no data for this month", not an
 * error.
 */
export function extractPerlistsValue(html) {
  // Try value before id
  let m = html.match(/<input[^>]*value="([^"]*)"[^>]*id="perlists"/);
  if (m && m[1]) {
    return m[1]
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  // Try id before value
  m = html.match(/<input[^>]*id="perlists"[^>]*value="([^"]*)"/);
  if (m && m[1]) {
    return m[1]
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  return null;
}

/**
 * Parses APMI's `perlists` value -- NOT JSON, it's Java's default
 * toString() for a List<Map<String,Object>>:
 *   [{AS_ON_DATE=Apr-2024, IA_ID=327, BENCHMARK_ID=null, MONTH1=5.06, ...}, {...}]
 * Verified live against the real endpoint. Exported standalone (per this
 * plan's testing convention) so it can be checked against a saved fixture
 * without a network call, mirroring `parseQuartileTable` in
 * `app/api/pms-quartile/route.js`.
 */
export function parseAsOnDateObjects(rawValue) {
  if (!rawValue || !rawValue.trim()) return [];
  const blocks = rawValue.match(/\{[^}]*\}/g);
  if (!blocks) return [];
  return blocks.map((block) => {
    const inner = block.slice(1, -1);
    const obj = {};
    inner.split(', ').forEach((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return;
      const key = pair.slice(0, eq).trim();
      const raw = pair.slice(eq + 1).trim();
      obj[key] = raw === 'null' ? null : raw;
    });
    return obj;
  });
}

/**
 * Normalizes the two raw objects (IA + benchmark) from one month's
 * `perlists` array into `{ asOnMonth, ia, benchmark }`. The IA's own row
 * has BENCHMARK_ID=null; the benchmark's row has a numeric BENCHMARK_ID.
 * Returns null if no IA row is present at all.
 */
export function toMonthSnapshot(rawObjects) {
  const numOrNull = (v) => (v == null ? null : parseFloat(v));
  const ia = rawObjects.find((o) => o.BENCHMARK_ID === null);
  const benchmark = rawObjects.find((o) => o.BENCHMARK_ID !== null);
  if (!ia) return null;

  const pick = (o) => (o ? {
    month1: numOrNull(o.MONTH1),
    month3: numOrNull(o.MONTH3),
    month6: numOrNull(o.MONTH6),
    year1: numOrNull(o.YEAR1),
    year2: numOrNull(o.YEAR2),
    year3: numOrNull(o.YEAR3),
    year4: numOrNull(o.YEAR4),
    year5: numOrNull(o.YEAR5),
    sinceInception: numOrNull(o.SINCE_INCEPTION),
  } : null);

  return {
    asOnMonth: ia.AS_ON_DATE, // e.g. "Apr-2024"
    ia: pick(ia),
    benchmark: pick(benchmark),
  };
}

/** Fetch + parse combined for a single month -- the function callers actually use. */
export async function fetchPmsMonthSnapshot(iaid, year, month) {
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-indexed
  const asondate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const params = new URLSearchParams();
  params.append('iaid', String(iaid));
  params.append('serviceType', 'D');
  params.append('asondate', asondate);

  const res = await fetch('https://www.apmiindia.org/apmi/getPerformanceChart.htm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Referer: `https://www.apmiindia.org/apmi/IaInsight.htm?IAID=${iaid}`,
    },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`APMI getPerformanceChart responded ${res.status}`);
  const html = await res.text();
  const rawValue = extractPerlistsValue(html);
  if (!rawValue) return null;
  return toMonthSnapshot(parseAsOnDateObjects(rawValue));
}
