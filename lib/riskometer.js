/**
 * lib/riskometer.js
 *
 * NSE's monthly "Benchmark Riskometer" PDF fetch/parse, extracted from
 * pages/api/index-dashboard.js so Proposal Studio's holdings route can
 * reuse the exact same data for its Risk-o-meter benchmark fallback,
 * without duplicating the PDF-parsing logic or doing a second live PDF
 * fetch+parse on every request (12h in-memory cache, matching this data's
 * actual publish cadence -- it only changes monthly).
 */

import https from 'https';

// Riskometer URL pattern: NSE_Indices_Riskometer_YYYY-MM.pdf
// Try current month, fall back to previous month
function getRiskometerUrl(year, month) {
  // month: 1-12
  const mm = String(month).padStart(2, '0');
  return `https://niftyindices.com/Benchmark_Riskometer/NSE_Indices_Riskometer_${year}-${mm}.pdf`;
}

async function fetchPdfText(url) {
  // Fetch the PDF binary
  const buffer = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' } }, res => {
      const isPdf = res.headers['content-type']?.includes('pdf') || res.headers['content-type']?.includes('octet-stream');
      if (res.statusCode !== 200 || !isPdf) {
        // Drain response
        res.resume();
        return resolve({ status: res.statusCode !== 200 ? res.statusCode : 404, text: null });
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    }).on('error', reject).setTimeout(25000, function() { this.destroy(new Error('PDF fetch timeout')); });
  });

  if (!buffer.buffer) return { status: buffer.status, text: null };

  try {
    // Use pdf-parse to extract text
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer.buffer, {
      // Extract all pages as text
      max: 0,
    });
    return { status: 200, text: data.text };
  } catch (err) {
    console.error(`[fetchPdfText] Error parsing PDF from ${url}:`, err.message);
    return { status: 404, text: null };
  }
}

function parseRiskometer(text) {
  // pdf-parse v1.1.1 renders each row with all columns concatenated, no spaces between fields:
  // "1Nifty 505.33Very HighBroad Market"  (single-digit serials, no space)
  // "119   Nifty100 Enhanced ESG5.37Very HighThematic"  (3-digit serials, trailing spaces)
  // The score is always 1.xx–6.xx (single leading digit), which safely distinguishes
  // it from trailing digits in index names (e.g. "50" in "Nifty 50").
  // Strategy: lowercase the parsed name for case-insensitive matching at enrichment time.
  const result = {};
  const LABELS = 'Very High|Moderately High|Moderately Low|High|Low To Moderate|Moderate|Low';
  const rowRe = new RegExp(`^\\d+\\s*([A-Z].+?)([1-9]\\.\\d{2})(${LABELS})`);
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = rowRe.exec(line);
    if (m) {
      // Store by lowercase key so index names like 'NIFTY 50' match 'Nifty 50'
      result[m[1].trim().toLowerCase()] = { score: parseFloat(m[2]), label: m[3] };
    }
  }
  return result;
}

let riskometerCache = null; // { data, fetchedAt }
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function fetchRiskometer() {
  if (riskometerCache && Date.now() - riskometerCache.fetchedAt < CACHE_TTL_MS) {
    return riskometerCache.data;
  }
  const now = new Date();
  // Try previous month (riskometer typically lags by ~1 month vs dashboard)
  const attempts = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    attempts.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  for (const { year, month } of attempts) {
    const url = getRiskometerUrl(year, month);
    try {
      const { status, text } = await fetchPdfText(url);
      if (status === 200 && text) {
        const data = parseRiskometer(text);
        riskometerCache = { data, fetchedAt: Date.now() };
        return data;
      }
    } catch(e) { /* try next */ }
  }
  return {}; // graceful fallback — riskometer is optional
}

// Normalizes a free-text fund benchmark name (e.g. "NIFTY 50 TRI",
// "Nifty-50 (TRI)") down to the bare index name riskMap is keyed by
// (e.g. "nifty 50"): lowercase, strip a trailing Total-Return-Index
// suffix, strip punctuation.
function normalizeBenchmarkName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\btri\b|\btr\b|\btotal return( index)?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchBenchmarkRisk(benchmarkName, riskMap) {
  if (!benchmarkName || !riskMap) return null;
  const key = normalizeBenchmarkName(benchmarkName);
  if (!key) return null;
  if (riskMap[key]) return riskMap[key];
  // Fallback: some riskMap keys carry their own punctuation variance
  // (already lowercased by parseRiskometer) -- try a normalized-key match.
  const found = Object.keys(riskMap).find((k) => normalizeBenchmarkName(k) === key);
  return found ? riskMap[found] : null;
}

export { fetchPdfText, getRiskometerUrl, parseRiskometer, fetchRiskometer, matchBenchmarkRisk, normalizeBenchmarkName };
