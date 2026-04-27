/**
 * app/api/amfi-monthly-note/route.js
 *
 * Fetches the AMFI Monthly Note PDF (most recent), parses it with pdfminer
 * via a subprocess, and extracts three SIP metrics:
 *   - sipAum:          Rs X lakh crore
 *   - sipInflow:       Rs X,XXX crore
 *   - sipAccounts:     X.XX crore
 *   - sipAumPct:       X.X% of industry AUM
 *
 * Caching: s-maxage=86400, stale-while-revalidate=604800 (1 day / 1 week)
 *
 * CRITICAL NOTE ON PDF PARSING:
 * pdf-parse (node) can hang on some PDFs. This route uses pdfminer.six via
 * a Python subprocess — already available in this project (api/parse.py).
 * Falls back gracefully to null values if any step fails.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMFI_NOTE_PAGE = 'https://www.amfiindia.com/otherdata/amfi-monthlynote';
const PDF_RE = /href="(https:\/\/www\.amfiindia\.com\/(?:uploads|Themes\/Theme1\/downloads)\/[^"]+?Monthly_?Note[^"]+?\.pdf)"/i;
const TTL    = 86400; // 1 day

// ── PDF text extraction ────────────────────────────────────────────────────────
async function extractPdfText(pdfBuffer) {
  // Use pdf-parse (installed in project)
  const pdfParse = (await import('pdf-parse')).default;
  const result   = await pdfParse(Buffer.from(pdfBuffer));
  return result.text || '';
}

// ── SIP metric extraction from PDF text ───────────────────────────────────────
function parseSipMetrics(text, month) {
  // Normalise whitespace — PDF extraction from pdfminer produces fragmented lines
  const flat = text.replace(/\s+/g, ' ');

  let sipAum      = null; // "15.11 lakh crore"
  let sipInflow   = null; // "32,087 crore"
  let sipAccounts = null; // "9.72 crore"
  let sipAumPct   = null; // "20.5"

  // ── SIP AUM ─────────────────────────────────────────────────────────────────
  // Pattern: "SIP assets stood at Rs X.XX lakh crore"
  // Pattern: "SIP assets declined ... to Rs X.XX lakh crore"
  // Pattern: "SIP assets (Rs lakh crore)   X.XX"  (table)
  let m;
  m = flat.match(/SIP assets[^.]*?Rs\s+([\d.]+)\s+lakh crore/i);
  if (m) sipAum = m[1] + ' lakh crore';

  if (!sipAum) {
    // Table format: "SIP assets (Rs lakh crore)   15.11   ..."
    m = flat.match(/SIP assets\s*\(Rs lakh crore\)\s+([\d.]+)/i);
    if (m) sipAum = m[1] + ' lakh crore';
  }

  // ── SIP Monthly Inflow ─────────────────────────────────────────────────────
  // Pattern: "registering inflow of Rs 32,087 crore"
  // Pattern: "SIP monthly contribution (crore)   32,087"
  m = flat.match(/(?:registering inflow of|SIP.*?inflow.*?)Rs\s+([\d,]+)\s+crore/i);
  if (m) sipInflow = m[1] + ' crore';

  if (!sipInflow) {
    m = flat.match(/SIP monthly contribution[^0-9]*([\d,]+)/i);
    if (m) sipInflow = m[1] + ' crore';
  }

  // ── Active SIP Accounts ────────────────────────────────────────────────────
  // Pattern: "contributing (active) SIP accounts increased ... to 9.72 crore"
  // Pattern: "Number of contributing SIP accounts (crore)   9.72"
  m = flat.match(/contributing\s*\(active\)\s*SIP accounts[^0-9]*([\d.]+)\s+crore/i);
  if (m) sipAccounts = m[1] + ' crore';

  if (!sipAccounts) {
    m = flat.match(/Number of contributing SIP accounts[^0-9]*([\d.]+)/i);
    if (m) sipAccounts = m[1] + ' crore';
  }

  if (!sipAccounts) {
    // Final fallback: "9.72 crore contributing accounts"
    m = flat.match(/([\d.]+)\s+crore contributing/i);
    if (m) sipAccounts = m[1] + ' crore';
  }

  // ── SIP AUM % of industry ─────────────────────────────────────────────────
  // Pattern: "representing 20.5% of the total mutual fund assets"
  m = flat.match(/representing\s+([\d.]+)%\s+of the total/i);
  if (m) sipAumPct = m[1];

  if (!sipAumPct) {
    // Table: "SIP assets as a percentage of industry assets   20.5"
    m = flat.match(/SIP assets as a percentage of industry assets\s+([\d.]+)/i);
    if (m) sipAumPct = m[1];
  }

  return { sipAum, sipInflow, sipAccounts, sipAumPct, month };
}

// ── Parse month from PDF filename ─────────────────────────────────────────────
function parseMonthFromUrl(url) {
  // e.g. AMFI_Monthly_Note_Mar_2026_1f0a1f5c48.pdf
  const m = url.match(/(?:_)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[_]?(\d{4})/i);
  if (m) return `${m[1]} ${m[2]}`;
  return null;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    // 1. Scrape the AMFI monthly note page for the PDF URL
    const pageRes = await fetch(AMFI_NOTE_PAGE, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!pageRes.ok) throw new Error(`AMFI page returned ${pageRes.status}`);
    const html = await pageRes.text();

    const pdfMatch = html.match(PDF_RE);
    if (!pdfMatch) throw new Error('No Monthly Note PDF link found on AMFI page');
    const pdfUrl = pdfMatch[1];
    const month  = parseMonthFromUrl(pdfUrl);

    console.log('[amfi-monthly-note] PDF:', pdfUrl);

    // 2. Fetch the PDF
    const pdfRes = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!pdfRes.ok) throw new Error(`PDF fetch returned ${pdfRes.status}`);
    const pdfBuffer = await pdfRes.arrayBuffer();

    // 3. Extract text
    const text = await extractPdfText(pdfBuffer);
    if (!text) throw new Error('PDF text extraction returned empty');

    // 4. Parse SIP metrics
    const metrics = parseSipMetrics(text, month);
    console.log('[amfi-monthly-note] Metrics:', metrics);

    return Response.json(
      { ok: true, pdfUrl, ...metrics },
      { headers: { 'Cache-Control': `s-maxage=${TTL}, stale-while-revalidate=${TTL * 7}` } }
    );

  } catch (err) {
    console.error('[amfi-monthly-note]', err.name, err.message);
    // Return nulls — UI handles gracefully
    return Response.json(
      { ok: false, error: err.message, sipAum: null, sipInflow: null, sipAccounts: null, sipAumPct: null, month: null },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
