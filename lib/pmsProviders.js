/**
 * lib/pmsProviders.js
 *
 * Data access and resolution layer for PMS Provider Directory & Profile Hubs (§5.2).
 * Reads pms-factsheets.json from Cloudflare R2, provides slug canonicalization with
 * 308 redirects, and maps strategy documents to APMI IAIDs for deep-linking to /pms/[id].
 */

import { r2Get } from './r2.js';
import { getPmsFactsheetsData } from './pmsFactsheetsCache.js';
import { getPMSLogo } from './providerLogos.js';

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const KNOWN_PMS_ALIASES = {
  'green-lantern': 'greenlantern',
  'icici-prudential': 'iciciprudential',
  'icici-pru': 'iciciprudential',
  'motilal-oswal': 'motilaloswal',
  'green-portfolio': 'greenportfolio',
  'aditya-birla': 'adityabirla',
  absl: 'adityabirla',
  'abakkus-asset-manager': 'abakkus',
  'carnelian-capital': 'carnelian',
  'stallion-asset': 'stallion',
  'renaissance-investment': 'renaissance',
  'sundaram-alternates': 'sundaram',
  'alchemy-capital': 'alchemy',
  'dezerv-investments': 'dezerv',
  'negen-capital': 'negen',
  'invesco-asset': 'invesco',
  'incred-asset': 'incred',
  'equitree-capital': 'equitree',
};

const STOPWORDS = new Set([
  'pvt', 'ltd', 'llp', 'limited', 'private', 'asset', 'assets', 'management', 'advisors', 'advisor',
  'managers', 'manager', 'investment', 'investments', 'services', 'financial', 'capital',
  'strategy', 'strategies', 'portfolio', 'portfolios', 'fund', 'funds', 'pms', 'scheme', 'approach',
  'the', 'and', 'of',
]);

function significantWords(str) {
  return (str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function normalizeStrategyName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function iaidFromRow(row) {
  if (row.id && typeof row.id === 'number') return row.id;
  if (!row.apmiLink) return null;
  const match = row.apmiLink.match(/IAID=(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ── In-memory Leaderboard Cache ──────────────────────────────────────────────
let cachedLeaderboard = null;
let cachedLeaderboardTime = 0;
const LEADERBOARD_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getLatestLeaderboard() {
  const now = Date.now();
  if (cachedLeaderboard && now - cachedLeaderboardTime < LEADERBOARD_TTL_MS) {
    return cachedLeaderboard;
  }

  const nowDate = new Date();
  for (let back = 0; back <= 4; back++) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - back, 1);
    const key = `pms-cache/pms-equity-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.json`;
    try {
      const payload = await r2Get(key);
      if (Array.isArray(payload?.data) && payload.data.length > 0) {
        cachedLeaderboard = payload.data;
        cachedLeaderboardTime = now;
        return cachedLeaderboard;
      }
    } catch {
      // try previous month
    }
  }
  return [];
}

/**
 * Resolve a candidate strategy document to an APMI IAID.
 */
function resolveStrategyIaid(strategyName, providerRows) {
  if (!strategyName || !providerRows || providerRows.length === 0) return null;

  const wantNorm = normalizeStrategyName(strategyName);
  const exact = providerRows.find((r) => normalizeStrategyName(r.strategyName) === wantNorm);
  if (exact) return iaidFromRow(exact);

  const candWords = significantWords(strategyName);
  if (candWords.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const row of providerRows) {
    const targetWords = significantWords(row.strategyName);
    const targetSet = new Set(targetWords);
    const matched = candWords.filter((w) => targetSet.has(w)).length;
    const score = matched / Math.max(candWords.length, targetWords.length || 1);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (best && bestScore >= 0.4) {
    return iaidFromRow(best);
  }
  return null;
}

/**
 * Get summary list of all 18 PMS providers.
 */
export async function getAllPmsProvidersSummary() {
  const data = await getPmsFactsheetsData();
  const providers = data?.providers || {};

  const summaries = Object.entries(providers).map(([slug, p]) => {
    const docs = p.documents || [];
    const latestPeriod = docs.find((d) => d.period)?.period || null;
    const logoPath = getPMSLogo(p.displayName);
    return {
      providerSlug: slug,
      displayName: p.displayName || slug,
      strategyCount: docs.length,
      latestPeriod,
      logoPath,
      syncedAt: data.syncedAt,
    };
  });

  // Sort alphabetically by displayName
  summaries.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return summaries;
}

/**
 * Get detailed profile and strategies for an individual PMS provider.
 */
export async function getPmsProviderDetail(slug) {
  const normSlug = String(slug || '').trim().toLowerCase();
  if (!normSlug) return null;

  // 1. Check alias redirection
  if (KNOWN_PMS_ALIASES[normSlug] && KNOWN_PMS_ALIASES[normSlug] !== normSlug) {
    return { redirect: KNOWN_PMS_ALIASES[normSlug] };
  }

  const [factsheetsData, leaderboard] = await Promise.all([
    getPmsFactsheetsData(),
    getLatestLeaderboard(),
  ]);

  const provider = factsheetsData?.providers?.[normSlug];
  if (!provider) return null;

  const fragments = provider.matchFragments || [normSlug];
  const providerRows = (leaderboard || []).filter((row) => {
    const name = (row.portfolioManager || '').toLowerCase();
    return fragments.some((f) => name.includes(f.toLowerCase()));
  });

  const docs = provider.documents || [];
  const strategies = docs.map((doc) => {
    const iaid = resolveStrategyIaid(doc.strategyName, providerRows);
    return {
      strategyName: doc.strategyName,
      docType: doc.docType || 'factsheet',
      period: doc.period || null,
      title: doc.title || doc.strategyName,
      url: doc.url,
      iaid,
      extracted: doc.extracted
        ? {
            asOfDate: doc.extracted.asOfDate || null,
            topHoldings: Array.isArray(doc.extracted.topHoldings) ? doc.extracted.topHoldings.slice(0, 5) : [],
            sectorAllocation: Array.isArray(doc.extracted.sectorAllocation) ? doc.extracted.sectorAllocation.slice(0, 5) : [],
          }
        : null,
    };
  });

  const logoPath = getPMSLogo(provider.displayName);

  return {
    providerSlug: normSlug,
    displayName: provider.displayName,
    logoPath,
    strategyCount: docs.length,
    apmiRowsCount: providerRows.length,
    syncedAt: factsheetsData.syncedAt,
    strategies,
  };
}
