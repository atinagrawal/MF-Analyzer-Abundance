/**
 * app/api/parse-mfcentral/route.js
 *
 * POST /api/parse-mfcentral   (multipart/form-data: file=<.xlsx>)
 *
 * Parses MF Central's "Consolidated Account Statement — Detailed Report"
 * Excel export (2 sheets: "Portfolio Details", "Transaction Details") into
 * the same JSON shape casparser produces for CAMS/KFintech PDFs, so the
 * existing FIFO/ELSS/live-NAV pipeline in app/cas-tracker/page.js's
 * processCasData() works completely unchanged.
 *
 * Unlike CAMS/KFintech PDFs, MF Central's export isn't password-protected
 * and has no AMFI scheme code column — each scheme name is fuzzy-matched
 * against mfapi.in's search to enable live NAV lookups. An unmatched or
 * low-confidence match just means that fund falls back to the report's
 * own valuation (the same non-live path casparser-sourced schemes already
 * use when a live NAV fetch fails), never a wrong fund's NAV.
 */

import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Sheet parsing helpers ───────────────────────────────────────────────

function findHeaderRow(rows, firstCol) {
  return rows.findIndex(r => (r[0] || '').toString().trim() === firstCol);
}

function findLabelValue(rows, label) {
  const row = rows.find(r => (r[0] || '').toString().trim().toLowerCase() === label.toLowerCase());
  return row ? (row[1] || '').toString().trim() : '';
}

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/** "30-SEP-2024" → ISO "2024-09-30" */
function parseMfcDate(str) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec((str || '').trim());
  if (!m) return null;
  const mon = MONTHS[m[2].toUpperCase()];
  if (mon === undefined) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

function num(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── AMFI scheme matching ────────────────────────────────────────────────
// MF Central doesn't provide an AMFI scheme code, so we search mfapi.in by
// name and score candidates by word overlap against the full scheme name.
// A low-confidence match is left unmatched rather than risk pulling a
// different fund's NAV.

// Words that vary in phrasing across AMCs (or are near-universal, like "fund")
// and are excluded from the SEARCH query — mfapi.in's search requires every
// query word to appear literally in the scheme name, and plan/option wording
// ("Regular", "Growth Option" vs "Growth") is exactly where AMCs disagree,
// so including them in the search itself risks a false zero-result. They're
// still used for precision SCORING below, just not for casting the net.
const SEARCH_STOPWORDS = new Set(['regular', 'plan', 'option', 'growth', 'idcw', 'dividend', 'reinvestment', 'payout']);

function normalizeWords(name) {
  return (name || '')
    .replace(/\(formerly[^)]*\)/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** 'direct' | 'institutional' | 'regular' — unspecified defaults to 'regular', the
 *  overwhelmingly common case for a retail investor's CAS, since AMCs only ever
 *  spell out "Direct"/"Institutional" explicitly, never "Regular" itself. */
function detectPlanType(words) {
  if (words.includes('direct')) return 'direct';
  if (words.includes('institutional') || words.includes('instl')) return 'institutional';
  return 'regular';
}

/** Jaccard similarity, with a heavy penalty when the plan type (Direct/Institutional/
 *  Regular) disagrees — two funds can otherwise share every other word yet carry a
 *  different expense ratio and NAV, so this must never be treated as a near-match. */
function scoreMatch(queryWords, candidateWords) {
  const qSet = new Set(queryWords);
  const cSet = new Set(candidateWords);
  const intersection = [...qSet].filter(w => cSet.has(w)).length;
  const union = new Set([...qSet, ...cSet]).size;
  let score = union ? intersection / union : 0;
  if (detectPlanType(queryWords) !== detectPlanType(candidateWords)) score *= 0.3;
  return score;
}

async function matchAmfiCode(schemeName) {
  const allWords = normalizeWords(schemeName);
  const searchWords = allWords.filter(w => w.length > 2 && !SEARCH_STOPWORDS.has(w)).slice(0, 6);
  if (!searchWords.length) return null;
  try {
    const r = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(searchWords.join(' '))}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const results = await r.json();
    if (!Array.isArray(results) || !results.length) return null;

    let best = null, bestScore = 0;
    for (const cand of results) {
      const score = scoreMatch(allWords, normalizeWords(cand.schemeName));
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    return bestScore >= 0.6 ? best.schemeCode : null;
  } catch {
    return null;
  }
}

// ── Main parse ───────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return Response.json({ error: 'Missing file' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    if (!wb.SheetNames.includes('Portfolio Details') || !wb.SheetNames.includes('Transaction Details')) {
      return Response.json({
        error: 'This does not look like an MF Central detailed report — expected "Portfolio Details" and "Transaction Details" sheets.',
      }, { status: 400 });
    }

    const portfolioRows   = XLSX.utils.sheet_to_json(wb.Sheets['Portfolio Details'], { header: 1, raw: false, defval: '' });
    const transactionRows = XLSX.utils.sheet_to_json(wb.Sheets['Transaction Details'], { header: 1, raw: false, defval: '' });

    const investorName = findLabelValue(portfolioRows, 'Name');
    const pan = findLabelValue(portfolioRows, 'PAN').toUpperCase();

    // ── Portfolio Details: one row per scheme ──
    const pHeaderIdx = findHeaderRow(portfolioRows, 'Scheme Name');
    if (pHeaderIdx === -1) {
      return Response.json({ error: 'Could not find the "Scheme Name" table in Portfolio Details.' }, { status: 400 });
    }
    const schemeRows = portfolioRows.slice(pHeaderIdx + 1).filter(r => (r[0] || '').toString().trim());
    if (!schemeRows.length) {
      return Response.json({ error: 'No schemes found in Portfolio Details.' }, { status: 400 });
    }

    // ── Transaction Details: group by Scheme Name, skip non-financial rows ──
    // (Registration of Nominee, Address Updated from KRA Data etc. all carry
    // zero units — filtering on units also naturally drops them.)
    const tHeaderIdx = findHeaderRow(transactionRows, 'Scheme Name');
    const txnsByScheme = {};
    if (tHeaderIdx !== -1) {
      transactionRows.slice(tHeaderIdx + 1).forEach(r => {
        const [schemeNameRaw, desc, dateStr, , unitsStr, amountStr] = r;
        const schemeName = (schemeNameRaw || '').toString().trim();
        const units = num(unitsStr);
        if (!schemeName || units === 0) return;
        const date = parseMfcDate(dateStr);
        if (!date) return;
        (txnsByScheme[schemeName] ||= []).push({
          type:   (desc || '').toUpperCase(),
          units,
          amount: num(amountStr),
          date,
        });
      });
    }

    // ── Match each distinct scheme name to an AMFI code (in parallel) ──
    const schemeNames = [...new Set(schemeRows.map(r => (r[0] || '').toString().trim()))];
    const amfiMatches = {};
    await Promise.all(schemeNames.map(async name => {
      amfiMatches[name] = await matchAmfiCode(name);
    }));

    // ── Group schemes by Folio No. (one folio can hold multiple schemes) ──
    const folioMap = {};
    schemeRows.forEach(r => {
      const [schemeNameRaw, , , folioNoRaw, investedStr, currentStr, , unitsStr] = r;
      const name = (schemeNameRaw || '').toString().trim();
      if (!name) return;
      const folioNo = (folioNoRaw || '').toString().trim() || 'UNKNOWN';
      const units = num(unitsStr);
      const invested = num(investedStr);
      const current = num(currentStr);
      const nav = units > 0 ? current / units : 0;

      (folioMap[folioNo] ||= []).push({
        scheme: name,
        close: String(units),
        valuation: { nav: String(nav), cost: String(invested) },
        amfi: amfiMatches[name] || null,
        nominees: [],
        advisor: 'Direct / N/A',
        transactions: txnsByScheme[name] || [],
      });
    });

    const folios = Object.entries(folioMap).map(([folioNo, schemes]) => ({
      PAN: pan,
      folio: folioNo,
      schemes,
    }));

    return Response.json({
      folios,
      investor_info: { name: investorName },
      pan_investor_map: (pan && investorName) ? { [pan]: investorName } : {},
      _source: 'mfcentral-xlsx',
    });

  } catch (err) {
    console.error('[parse-mfcentral]', err.message);
    return Response.json({
      error: 'Could not parse this file. Make sure it is an MF Central detailed report (.xlsx) with Portfolio Details and Transaction Details sheets.',
    }, { status: 500 });
  }
}
