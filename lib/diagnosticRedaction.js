/**
 * lib/diagnosticRedaction.js
 *
 * Client-safe pure functions for the CAS Portfolio Diagnostic.
 * Performs whitelist-only structural projection, dimensionally sound
 * weighted overlap calculations, and a rigorous 5-phase PII assertion gate.
 *
 * ZERO Node-only imports (no crypto, fs, path, https) — safe to import
 * in both client ('use client') components and server routes.
 * See docs/superpowers/specs/2026-09-20-cas-portfolio-diagnostic-shareable-card-design.md.
 */

export class PrivacyViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrivacyViolationError';
  }
}

// Immutable whitelist of allowed JSON keys across the entire diagnostic payload
export const ALLOWED_KEYS = new Set([
  'title',
  'schemes',
  'amfiCode',
  'name',
  'category',
  'weightPct',
  'metrics',
  'schemesCount',
  'weightedOverlapPct',
  'quartileDistribution',
  'q1Count',
  'q2Count',
  'q3Count',
  'q4Count',
  'unrankedCount',
  'mCapAllocation',
  'large',
  'mid',
  'small',
  'unclassified',
  'derivatives',
  'topOverlapPairs',
  'amfiCodeA',
  'amfiCodeB',
  'overlapPct',
  'asOfDate',
]);

// Keys explicitly allowed to contain integer values > 100
export const INTEGER_EXEMPT_KEYS = new Set([
  'amfiCode',
  'amfiCodeA',
  'amfiCodeB',
  'schemesCount',
  'q1Count',
  'q2Count',
  'q3Count',
  'q4Count',
  'unrankedCount',
]);

// Blacklisted keys that denote absolute monetary balances, units, or account details
const FORBIDDEN_KEYS_RE = /^(value|cost|totalcost|units|nav|balance|gain|unrealizedgain|pan|folio|folio_no|account_no|accountnumber)$/i;

// Regex patterns for Indian PANs
const PAN_RE = /[A-Z]{5}[0-9]{4}[A-Z]/i;
const MASKED_PAN_RE = /[A-Z]{2,5}[*X]{4,6}[A-Z0-9]/i;

// Regex patterns for standalone folio numbers (avoiding decimal fraction digits)
const FOLIO_RE = /(?:^|[^\d.])\d{7,14}(?:[^\d.]|$)/;
const SLASH_FOLIO_RE = /\b\d{3,6}\/\d{2,6}\b/;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculates the product-weighted average portfolio overlap across all unique pairs (i < j).
 * Formula:
 *   w_i = weightPct_i / 100 (where sum(w_i) = 1)
 *   Weighted Overlap % = sum_{i < j} (w_i * w_j * Overlap(i,j)) / sum_{i < j} (w_i * w_j)
 *
 * Guard: If the denominator is < 1e-6 (e.g. N = 1, or near-all-in-one-fund portfolios
 * where all other holdings round to 0.00%), returns null.
 *
 * @param {Array<{ weightPct: number }>} schemes
 * @param {number[][]} overlapMatrix - N x N matrix with overlap percentages [0, 100]
 * @returns {number|null} Bounded in [0, 100], rounded to 2 decimals, or null
 */
export function computeWeightedOverlap(schemes, overlapMatrix) {
  if (!Array.isArray(schemes) || !Array.isArray(overlapMatrix)) return null;
  const n = schemes.length;
  if (n < 2) return null;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const wi = (schemes[i]?.weightPct || 0) / 100;
    for (let j = i + 1; j < n; j++) {
      const wj = (schemes[j]?.weightPct || 0) / 100;
      const pairWeight = wi * wj;
      const pairOverlap = overlapMatrix[i]?.[j] ?? 0;
      numerator += pairWeight * pairOverlap;
      denominator += pairWeight;
    }
  }

  // Epsilon guard: prevents division-by-zero for N=1 or single-dominant-fund portfolios
  if (denominator < 1e-6) {
    return null;
  }

  const result = numerator / denominator;
  return Math.round(result * 100) / 100;
}

/**
 * Whitelist-only structural projection. Converts raw holdings into a sanitized
 * diagnostic structure with rounded 2-decimal weights, stripping all PII and
 * absolute monetary balances.
 *
 * @param {Array<object>} holdings - Raw CAS holdings
 * @param {object} options - Optional title and asOfDate overrides
 * @returns {object} Redacted diagnostic payload
 */
export function sanitizeDiagnosticPayload(holdings, options = {}) {
  // Filter out non-positive entries (zero balances, accounting reversals, negative correction lines)
  const validHoldings = holdings.filter((h) => (Number(h.value) || 0) > 0);
  if (validHoldings.length === 0) {
    throw new Error('Portfolio contains no positive-value holdings to analyze');
  }

  const totalValue = validHoldings.reduce((s, h) => s + (Number(h.value) || 0), 0);
  if (totalValue <= 0) {
    throw new Error('Total portfolio value must be greater than zero');
  }

  // Clean title: alphanumeric, spaces, hyphens, parentheses only (max 60 chars)
  const rawTitle = options.title ? String(options.title) : 'Mutual Fund Portfolio Diagnostic';
  const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9\s\-()]/g, '').slice(0, 60).trim() || 'Mutual Fund Portfolio Diagnostic';

  // Strict whitelist mapping with 2-decimal weight rounding
  const schemes = validHoldings.map((h) => {
    const rawWeight = ((Number(h.value) || 0) / totalValue) * 100;
    const roundedWeight = Math.round(rawWeight * 100) / 100;

    return {
      amfiCode: Number(h.amfiCode) || 0,
      name: String(h.name || h.schemeName || '').replace(/[-–—]\s*(Regular|Direct|Growth|IDCW|Dividend|Plan|Option).*/gi, '').trim(),
      category: String(h.category || '').trim(),
      weightPct: roundedWeight,
    };
  });

  // Rebalance residual penny rounding difference on the largest scheme so sum is exactly 100.00
  const currentSum = schemes.reduce((s, x) => s + x.weightPct, 0);
  const diff = Math.round((100 - currentSum) * 100) / 100;
  if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.5 && schemes.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < schemes.length; i++) {
      if (schemes[i].weightPct > schemes[maxIdx].weightPct) maxIdx = i;
    }
    schemes[maxIdx].weightPct = Math.round((schemes[maxIdx].weightPct + diff) * 100) / 100;
  }

  return {
    title: cleanTitle,
    schemes,
    metrics: {
      schemesCount: schemes.length,
      weightedOverlapPct: null, // populated by caller via computeWeightedOverlap
      quartileDistribution: {
        q1Count: 0,
        q2Count: 0,
        q3Count: 0,
        q4Count: 0,
        unrankedCount: 0,
      },
      mCapAllocation: {
        large: 0,
        mid: 0,
        small: 0,
        unclassified: 0,
        derivatives: 0,
      },
      topOverlapPairs: [],
    },
    asOfDate: options.asOfDate || new Date().toISOString().split('T')[0],
  };
}

/**
 * 5-Phase Pre-flight Assertion Gate.
 * Validates that the payload contains zero PANs, zero folios, zero personal names,
 * zero monetary currency values (> 100 for non-exempt keys), and only whitelisted keys.
 *
 * Throws PrivacyViolationError on any violation.
 *
 * @param {object} payload
 * @param {object} context - Context containing investorName, familyName, etc.
 */
export function assertZeroPII(payload, context = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new PrivacyViolationError('Payload must be a non-null object');
  }

  const rawJson = JSON.stringify(payload);

  // Phase 1: PAN Pattern Regex Scan
  if (PAN_RE.test(rawJson)) {
    throw new PrivacyViolationError('PAN pattern detected in diagnostic payload');
  }
  if (MASKED_PAN_RE.test(rawJson)) {
    throw new PrivacyViolationError('Masked PAN pattern detected in diagnostic payload');
  }

  // Phase 2: Folio Pattern Regex Scan
  // Forward-compatibility: AMFI scheme codes are currently 5-6 digits (max ~155,000 as of 2026).
  // We strip legitimate "amfiCode", "amfiCodeA", "amfiCodeB" properties before running the 7-14 digit folio regex,
  // guaranteeing that future 7-digit AMFI codes (e.g. 1000000+) never false-positive as folio numbers.
  const strippedForFolio = rawJson.replace(/"amfiCode[AB]?":\s*\d+/g, '');
  if (FOLIO_RE.test(strippedForFolio)) {
    throw new PrivacyViolationError('Folio number pattern detected in diagnostic payload');
  }
  if (SLASH_FOLIO_RE.test(rawJson)) {
    throw new PrivacyViolationError('Slash folio pattern detected in diagnostic payload');
  }

  // Phase 3: Investor & Family Name Word-Boundary Matching
  const candidateNames = [
    context.investorName,
    context.familyName,
    context.userName,
    context.clientName,
  ].filter(Boolean);

  for (const rawName of candidateNames) {
    const tokens = String(rawName)
      .split(/[\s,._\-()]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3);

    for (const token of tokens) {
      const boundaryRe = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
      if (boundaryRe.test(rawJson)) {
        throw new PrivacyViolationError(`Personal name token "${token}" detected in diagnostic payload`);
      }
    }
  }

  // Phase 4 & Phase 5: Recursive Whitelist & Numeric Boundary Check
  function walk(obj, parentKey = '') {
    if (obj === null || obj === undefined) return;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        walk(obj[i], parentKey);
      }
      return;
    }

    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        // Check for forbidden currency/account property names first
        if (FORBIDDEN_KEYS_RE.test(k)) {
          throw new PrivacyViolationError(`Forbidden account/currency key "${k}" detected in diagnostic payload`);
        }

        // Phase 5: Key Whitelist Check
        if (!ALLOWED_KEYS.has(k)) {
          throw new PrivacyViolationError(`Unauthorized key "${k}" detected in diagnostic payload`);
        }

        // Phase 4: Numeric boundary check
        if (typeof v === 'number') {
          if (INTEGER_EXEMPT_KEYS.has(k)) {
            if (!Number.isInteger(v) || v < 0) {
              throw new PrivacyViolationError(`Integer field "${k}" must be a non-negative integer (got ${v})`);
            }
          } else {
            // Percentage / ratio values must be strictly in [0, 100]
            if (v < 0 || v > 100) {
              throw new PrivacyViolationError(`Percentage field "${k}" must be bounded in [0, 100] (got ${v})`);
            }
          }
        }

        walk(v, k);
      }
    }
  }

  walk(payload);

  // Cross-check: Sum of schemes weightPct must be 100 +/- 0.5%
  if (Array.isArray(payload.schemes) && payload.schemes.length > 0) {
    const sum = payload.schemes.reduce((acc, s) => acc + (Number(s.weightPct) || 0), 0);
    if (Math.abs(sum - 100) > 0.5) {
      throw new PrivacyViolationError(`Schemes weightPct sum must equal 100% +/- 0.5% (got ${sum}%)`);
    }
  }

  return true;
}
