/**
 * app/api/parse-mfc/route.js
 * MF Central Detailed CAS PDF parser — Next.js App Router API route.
 * Replaces the api/parse-mfc.py Python function so it works in local dev too.
 *
 * POST /api/parse-mfc
 *   Content-Type: multipart/form-data, field: file (PDF)
 *   Returns: { pan, name, period, holdings[] }
 */

import pdf from 'pdf-parse';

export const maxDuration = 60;

// ── AMFI ISIN map (module-level cache within a warm instance) ────────────────
let _isinCache = null;
let _cacheTime = 0;

async function loadAmfiIsinMap() {
  const now = Date.now();
  if (_isinCache && now - _cacheTime < 3_600_000) return _isinCache;

  const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
    headers: { 'User-Agent': 'MFCalc/2.0' },
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  const map = {};
  for (const line of text.split('\n')) {
    const parts = line.trim().split(';');
    if (parts.length < 5) continue;
    const [code, isinG, isinD, name, nav] = parts;
    if (isinG.includes('INF')) map[isinG.trim()] = { code: code.trim(), name: name.trim(), nav: nav.trim() };
    if (isinD.includes('INF')) map[isinD.trim()] = { code: code.trim(), name: name.trim(), nav: nav.trim() };
  }
  _isinCache = map;
  _cacheTime = now;
  return map;
}

// ── Parser ───────────────────────────────────────────────────────────────────
function parseMFCText(text) {
  // PAN
  const panM = text.match(/PAN\s*:\s*([A-Z]{5}\d{4}[A-Z])/);
  const pan = panM ? panM[1] : '';

  // Investor name — on the line immediately after PAN
  let name = '';
  if (panM) {
    const nearby = text.slice(panM.index + panM[0].length, panM.index + panM[0].length + 200);
    for (const line of nearby.split('\n')) {
      const l = line.trim();
      if (l && /^[A-Za-z][A-Za-z\s.]{2,49}$/.test(l)) { name = l; break; }
    }
  }

  // Statement period
  const dateM = text.match(/From\s+Date\s*:\s*([\d\-\/A-Za-z]+)[\s\S]*?To\s+Date\s*:\s*([\d\-\/A-Za-z]+)/);
  const period = {
    from: dateM ? dateM[1].trim() : '',
    to: dateM ? dateM[2].trim() : '',
  };

  // Holdings — split on FOLIO NO:
  const folioBlocks = text.split(/\bFOLIO\s+NO\s*:\s*/i).slice(1);
  const holdings = [];

  for (const block of folioBlocks) {
    const folioM = block.match(/^(\S+)/);
    if (!folioM) continue;
    const folio = folioM[1];

    const isinM = block.match(/\b(INF[A-Z0-9]{9})\b/);
    if (!isinM) continue;
    const isin = isinM[1];

    // Scheme name — text on the same line before "ISIN:"
    let schemeLineM = block.match(new RegExp(`([^\\n]+?)\\s+ISIN\\s*:\\s*${isin}`));
    if (!schemeLineM) {
      schemeLineM = block.match(new RegExp(`([^\\n]{5,120})\\n[^\\n]*ISIN\\s*:\\s*${isin}`));
    }
    if (!schemeLineM) continue;

    // Strip advisor tag — allow unclosed paren (some AMCs break the line mid-paren)
    let schemeName = schemeLineM[1]
      .replace(/\s*\(Advisor:[^)]*\)?\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Closing balance — \s* (not \s+) handles pdf-parse collapsing newlines
    const closingM = block.match(
      /Closing Unit Balance\s*:\s*([\d,\.]+)\s*Nav as on\s+([\d\w\-\/\.]+)\s*:\s*INR\s*([\d,\.]+)/
    );
    if (!closingM) continue;

    const units = parseFloat(closingM[1].replace(/,/g, ''));
    if (units === 0) continue;
    const navPrice = parseFloat(closingM[3].replace(/,/g, ''));

    holdings.push({
      folio,
      scheme_name: schemeName,
      isin,
      units,
      nav_pdf: navPrice,
      nav_date_pdf: closingM[2],
      value_pdf: Math.round(units * navPrice * 100) / 100,
    });
  }

  return { pan, name, period, holdings };
}

// ── Route handlers ───────────────────────────────────────────────────────────
export async function GET() {
  return Response.json({ status: 'ok', service: 'mfc-parser' });
}

export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ detail: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ detail: 'No file uploaded' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return Response.json({ detail: 'Only PDF files are accepted' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);

  if (buf.length > 20 * 1024 * 1024) {
    return Response.json({ detail: 'File too large (max 20MB)' }, { status: 400 });
  }

  // Extract text
  let text;
  try {
    const data = await pdf(buf);
    text = data.text;
  } catch (e) {
    return Response.json({ detail: `Could not read PDF: ${e.message}` }, { status: 400 });
  }

  if (!text.includes('MFCentralDetailCAS') && !text.includes('Consolidated Account Statement')) {
    return Response.json({
      detail: "This doesn't appear to be an MF Central Consolidated Account Statement. Please download a Detailed CAS from app.mfcentral.com.",
    }, { status: 400 });
  }

  // Parse
  let result;
  try {
    result = parseMFCText(text);
  } catch (e) {
    return Response.json({ detail: `Parsing error: ${e.message}` }, { status: 500 });
  }

  if (!result.holdings.length) {
    return Response.json({
      detail: 'No holdings found in this statement. Ensure you are uploading a Detailed (not Summary) statement with non-zero balances.',
    }, { status: 422 });
  }

  // Enrich with live AMFI NAVs
  try {
    const isinMap = await loadAmfiIsinMap();
    for (const h of result.holdings) {
      const amfi = isinMap[h.isin];
      if (amfi) {
        h.scheme_code = amfi.code;
        h.amfi_name = amfi.name;
        const navLive = parseFloat(amfi.nav);
        h.nav_live = isNaN(navLive) ? h.nav_pdf : navLive;
        h.value_live = Math.round(h.units * h.nav_live * 100) / 100;
      } else {
        h.scheme_code = '';
        h.amfi_name = h.scheme_name;
        h.nav_live = h.nav_pdf;
        h.value_live = h.value_pdf;
      }
    }
  } catch {
    for (const h of result.holdings) {
      h.scheme_code = h.scheme_code ?? '';
      h.amfi_name = h.amfi_name ?? h.scheme_name;
      h.nav_live = h.nav_live ?? h.nav_pdf;
      h.value_live = h.value_live ?? h.value_pdf;
    }
  }

  return Response.json(result);
}
