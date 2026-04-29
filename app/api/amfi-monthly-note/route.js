/**
 * app/api/amfi-monthly-note/route.js
 *
 * Scrapes the AMFI Monthly Note page and parses SIP metrics from the PDF.
 *
 * GET /api/amfi-monthly-note              → latest month
 * GET /api/amfi-monthly-note?month=Feb&year=2026 → specific historical month
 *
 * Caching:
 *   latest   → s-maxage=86400, stale-while-revalidate=604800
 *   historical → public, max-age=31536000, immutable  (PDF never changes)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMFI_NOTE_PAGE = 'https://www.amfiindia.com/otherdata/amfi-monthlynote';
const PDF_RE = /href="(https:\/\/www\.amfiindia\.com\/(?:uploads|Themes\/Theme1\/downloads)\/[^"]+?Monthly_?Note[^"]+?\.pdf)"/gi;

// Handles both short (Jan) and full (January) month names in filenames
const MONTH_RE = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[_\-\s]?(\d{4})/i;
const FULL_TO_SHORT = {
  january:'Jan', february:'Feb', march:'Mar', april:'Apr',
  may:'May', june:'Jun', july:'Jul', august:'Aug',
  september:'Sep', october:'Oct', november:'Nov', december:'Dec',
};

function parseMonthFromUrl(url) {
  const fn  = url.split('/').pop();
  const m   = fn.match(MONTH_RE);
  if (!m) return null;
  const raw   = m[1].toLowerCase();
  const short = FULL_TO_SHORT[raw] ?? (m[1].slice(0, 3));
  // Capitalise properly
  const normalised = short.charAt(0).toUpperCase() + short.slice(1).toLowerCase();
  return { short: normalised, year: m[2] };
}

async function fetchAllPdfLinks() {
  const res = await fetch(AMFI_NOTE_PAGE, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`AMFI page returned ${res.status}`);
  const html = await res.text();

  // Use matchAll to get ALL pdf links (not just the first)
  const links = [];
  for (const m of html.matchAll(PDF_RE)) {
    const url   = m[1];
    const month = parseMonthFromUrl(url);
    if (month) links.push({ url, ...month });
  }
  return links;
}

async function extractPdfText(pdfBuffer) {
  const pdfParse = (await import('pdf-parse')).default;
  const result   = await pdfParse(Buffer.from(pdfBuffer));
  return result.text || '';
}

function parseSipMetrics(text, month) {
  const flat = text.replace(/\s+/g, ' ');
  let sipAum = null, sipInflow = null, sipAccounts = null, sipAumPct = null;
  let m;

  // SIP AUM — prose
  m = flat.match(/SIP assets[^.]*?Rs\s+([\d.]+)\s+lakh crore/i);
  if (m) sipAum = m[1] + ' lakh crore';
  if (!sipAum) {
    m = flat.match(/SIP assets\s*\(Rs lakh crore\)\s+([\d.]+)/i);
    if (m) sipAum = m[1] + ' lakh crore';
  }

  // ── SIP Monthly Inflow ─────────────────────────────────────────────────────
  // First, try to match the exact table row pattern which is most reliable
  m = flat.match(/SIP monthly contribution\s*\(crore\)\s*([\d,]+)/i);
  if (m) sipInflow = m[1] + ' crore';

  if (!sipInflow) {
    // If table isn't found, look for the specific text mentions without greedy .*?
    m = flat.match(/registering inflow of Rs\s+([\d,]+)\s+crore/i);
    if (m) sipInflow = m[1] + ' crore';
  }
  
  if (!sipInflow) {
    // Look for text proximity match
    m = flat.match(/SIP monthly contribution[^0-9]*Rs\s*([\d,]+)\s*crore/i);
    if (m) sipInflow = m[1] + ' crore';
  }

  // Raw numeric value for charting
  const sipInflowNum = sipInflow
    ? parseFloat(sipInflow.replace(/,/g, '').replace(' crore', ''))
    : null;

  // Active SIP Accounts
  m = flat.match(/contributing\s*\(active\)\s*SIP accounts[^0-9]*([\d.]+)\s+crore/i);
  if (m) sipAccounts = m[1] + ' crore';
  if (!sipAccounts) {
    m = flat.match(/Number of contributing SIP accounts[^0-9]*([\d.]+)/i);
    if (m) sipAccounts = m[1] + ' crore';
  }
  if (!sipAccounts) {
    m = flat.match(/([\d.]+)\s+crore contributing/i);
    if (m) sipAccounts = m[1] + ' crore';
  }

  // SIP AUM % of industry
  m = flat.match(/representing\s+([\d.]+)%\s+of the total/i);
  if (m) sipAumPct = m[1];
  if (!sipAumPct) {
    m = flat.match(/SIP assets as a percentage of industry assets\s+([\d.]+)/i);
    if (m) sipAumPct = m[1];
  }

  return { sipAum, sipInflow, sipInflowNum, sipAccounts, sipAumPct, month };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const reqMonth = searchParams.get('month'); // e.g. "Feb"
  const reqYear  = searchParams.get('year');  // e.g. "2026"
  const isHistorical = !!(reqMonth && reqYear);

  try {
    // 1. Fetch all PDF links from AMFI page
    const links = await fetchAllPdfLinks();
    if (!links.length) throw new Error('No Monthly Note PDF links found on AMFI page');

    // 2. Find the right PDF
    let target;
    if (isHistorical) {
      // Match by month + year
      const mon = reqMonth.charAt(0).toUpperCase() + reqMonth.slice(1).toLowerCase();
      target = links.find(l =>
        l.short.toLowerCase() === mon.toLowerCase() &&
        l.year === String(reqYear)
      );
      if (!target) {
        return Response.json(
          { ok: false, error: `No PDF found for ${mon} ${reqYear}`, sipAum: null, sipInflow: null, sipInflowNum: null, sipAccounts: null, sipAumPct: null, month: `${mon} ${reqYear}` },
          { status: 200, headers: { 'Cache-Control': 'public, max-age=3600' } }
        );
      }
    } else {
      target = links[0]; // most recent = first match
    }

    console.log(`[amfi-monthly-note] ${isHistorical ? 'historical' : 'latest'} PDF: ${target.url}`);

    // 3. Fetch + parse PDF
    const pdfRes = await fetch(target.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!pdfRes.ok) throw new Error(`PDF fetch returned ${pdfRes.status}`);
    const text = await extractPdfText(await pdfRes.arrayBuffer());
    if (!text) throw new Error('PDF text extraction returned empty');

    const metrics = parseSipMetrics(text, `${target.short} ${target.year}`);

    // 4. Return with appropriate cache headers
    const cacheHeader = isHistorical
      ? 'public, max-age=31536000, immutable'       // historical: permanent
      : `s-maxage=86400, stale-while-revalidate=${86400 * 7}`; // latest: 1 day

    return Response.json(
      { ok: true, pdfUrl: target.url, ...metrics },
      { headers: { 'Cache-Control': cacheHeader } }
    );

  } catch (err) {
    console.error('[amfi-monthly-note]', err.name, err.message);
    return Response.json(
      { ok: false, error: err.message, sipAum: null, sipInflow: null, sipInflowNum: null, sipAccounts: null, sipAumPct: null, month: reqMonth && reqYear ? `${reqMonth} ${reqYear}` : null },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
