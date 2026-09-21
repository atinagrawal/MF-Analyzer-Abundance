/**
 * lib/amcProfiles.js
 *
 * Data access and aggregation layer for Mutual Fund AMC Directory & Profile Hubs (§5.2).
 * Reads amc-profiles/<amc-slug>.json from Cloudflare R2 with in-memory caching,
 * computes official AMC AUM from amfi-aum.json, queries mf_screener for scheme
 * listings and category breakdowns, and resolves canonical slugs with 308 alias redirects.
 */

import pool from './db.js';
import { r2Get } from './r2.js';
import { createR2JsonCache } from './r2JsonCache.js';
import { getMFLogo } from './providerLogos.js';

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── KNOWN AMC ALIASES ─────────────────────────────────────────────────────────
export const KNOWN_AMC_ALIASES = {
  hdfc: 'hdfc-mutual-fund',
  sbi: 'sbi-mutual-fund',
  icici: 'icici-prudential-mutual-fund',
  'icici-prudential': 'icici-prudential-mutual-fund',
  kotak: 'kotak-mahindra-mutual-fund',
  'kotak-mahindra': 'kotak-mahindra-mutual-fund',
  nippon: 'nippon-india-mutual-fund',
  'nippon-india': 'nippon-india-mutual-fund',
  ppfas: 'ppfas-mutual-fund',
  'parag-parikh': 'ppfas-mutual-fund',
  mirae: 'mirae-asset-mutual-fund',
  'mirae-asset': 'mirae-asset-mutual-fund',
  tata: 'tata-mutual-fund',
  axis: 'axis-mutual-fund',
  dsp: 'dsp-mutual-fund',
  'motilal-oswal': 'motilal-oswal-mutual-fund',
  motilal: 'motilal-oswal-mutual-fund',
  uti: 'uti-mutual-fund',
  bandhan: 'bandhan-mutual-fund',
  edelweiss: 'edelweiss-mutual-fund',
  invesco: 'invesco-mutual-fund',
  groww: 'groww-mutual-fund',
  'canara-robeco': 'canara-robeco-mutual-fund',
  'franklin-templeton': 'franklin-templeton-mutual-fund',
  franklin: 'franklin-templeton-mutual-fund',
  quant: 'quant-mutual-fund',
  whiteoak: 'whiteoak-capital-mutual-fund',
  'whiteoak-capital': 'whiteoak-capital-mutual-fund',
  sundaram: 'sundaram-mutual-fund',
  lic: 'lic-mutual-fund',
  baroda: 'baroda-bnp-paribas-mutual-fund',
  'baroda-bnp-paribas': 'baroda-bnp-paribas-mutual-fund',
  hsbc: 'hsbc-mutual-fund',
  union: 'union-mutual-fund',
  'mahindra-manulife': 'mahindra-manulife-mutual-fund',
  pgim: 'pgim-india-mutual-fund',
  'pgim-india': 'pgim-india-mutual-fund',
  'bank-of-india': 'bank-of-india-mutual-fund',
  'bajaj-finserv': 'bajaj-finserv-mutual-fund',
  iti: 'iti-mutual-fund',
  'jm-financial': 'jm-financial-mutual-fund',
  navi: 'navi-mutual-fund',
  'jio-blackrock': 'jio-blackrock-mutual-fund',
  quantum: 'quantum-mutual-fund',
  samco: 'samco-mutual-fund',
  trust: 'trust-mutual-fund',
  'the-wealth-company': 'the-wealth-company-mutual-fund',
  '360-one': '360-one-mutual-fund',
  shriram: 'shriram-mutual-fund',
  helios: 'helios-mutual-fund',
  taurus: 'taurus-mutual-fund',
  nj: 'nj-mutual-fund',
  'angel-one': 'angel-one-mutual-fund',
  abakkus: 'abakkus-mutual-fund',
  capitalmind: 'capitalmind-mutual-fund',
  choice: 'choice-mutual-fund',
  'old-bridge': 'old-bridge-mutual-fund',
  unifi: 'unifi-mutual-fund',
  alphagrep: 'alphagrep-mutual-fund',
  ask: 'ask-mutual-fund',
  monarch: 'monarch-mutual-fund',
};

// ── In-memory Profile Cache ──────────────────────────────────────────────────
const profileCache = new Map();
const PROFILE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getAmcProfile(amcSlug) {
  if (!amcSlug) return null;
  const now = Date.now();
  const cached = profileCache.get(amcSlug);
  if (cached && now - cached.ts < PROFILE_TTL_MS) {
    return cached.data;
  }

  try {
    const data = await r2Get(`amc-profiles/${amcSlug}.json`);
    if (data) {
      profileCache.set(amcSlug, { data, ts: now });
      return data;
    }
  } catch (err) {
    console.warn(`[getAmcProfile] Miss for ${amcSlug}:`, err.message);
  }
  return null;
}

const getAmfiAum = createR2JsonCache('amfi-aum.json', 60 * 60 * 1000);

export async function getAllAmcsSummary() {
  const [dbRes, aumRes] = await Promise.all([
    pool.query(`
      SELECT
        amc,
        count(*) as total_schemes,
        count(*) FILTER (WHERE category ILIKE '%equity%') as equity_schemes,
        count(*) FILTER (WHERE category ILIKE '%hybrid%') as hybrid_schemes,
        count(*) FILTER (WHERE category ILIKE '%debt%') as debt_schemes,
        count(*) FILTER (WHERE category ILIKE '%solution%' OR category ILIKE '%children%' OR category ILIKE '%retirement%') as solution_schemes,
        count(*) FILTER (WHERE category ILIKE '%index%' OR category ILIKE '%etf%' OR category ILIKE '%other%' OR category ILIKE '%fund of funds%') as other_schemes,
        round(avg(ret_3y)::numeric, 2) as avg_ret_3y
      FROM mf_screener
      WHERE amc IS NOT NULL
      GROUP BY amc
      ORDER BY total_schemes DESC
    `),
    pool.query(`
      SELECT code, amc
      FROM mf_screener
      WHERE amc IS NOT NULL
    `),
  ]);

  const amfiAum = (await getAmfiAum()) || {};

  // Compute total official AMFI AUM per AMC
  const aumByAmc = {};
  for (const row of aumRes.rows) {
    const aumCr = amfiAum[row.code]?.aumCr || 0;
    aumByAmc[row.amc] = (aumByAmc[row.amc] || 0) + aumCr;
  }

  const summaries = dbRes.rows.map((row) => {
    const amcSlug = slugify(row.amc);
    const totalAumCr = aumByAmc[row.amc] || 0;
    const logoPath = getMFLogo(row.amc);
    return {
      amcName: row.amc,
      amcSlug,
      totalSchemes: parseInt(row.total_schemes, 10) || 0,
      equitySchemes: parseInt(row.equity_schemes, 10) || 0,
      hybridSchemes: parseInt(row.hybrid_schemes, 10) || 0,
      debtSchemes: parseInt(row.debt_schemes, 10) || 0,
      solutionSchemes: parseInt(row.solution_schemes, 10) || 0,
      otherSchemes: parseInt(row.other_schemes, 10) || 0,
      avgRet3y: row.avg_ret_3y ? parseFloat(row.avg_ret_3y) : null,
      totalAumCr: Math.round(totalAumCr * 100) / 100,
      logoPath,
    };
  });

  // Sort by Total AUM descending by default
  summaries.sort((a, b) => b.totalAumCr - a.totalAumCr);
  return summaries;
}

export async function getAmcDetail(slug) {
  const normSlug = String(slug || '').trim().toLowerCase();
  if (!normSlug) return null;

  // 1. Check alias redirection
  if (KNOWN_AMC_ALIASES[normSlug] && KNOWN_AMC_ALIASES[normSlug] !== normSlug) {
    return { redirect: KNOWN_AMC_ALIASES[normSlug] };
  }

  // 2. Fetch AMC schemes from DB matching slugify(amc) = normSlug
  const schemesRes = await pool.query(`
    SELECT code, name, category, nav, ret_1y, ret_3y, ret_5y, ret_inception, amc
    FROM mf_screener
    WHERE amc IS NOT NULL
    ORDER BY ret_3y DESC NULLS LAST, code ASC
  `);

  const matchingSchemes = schemesRes.rows.filter((r) => slugify(r.amc) === normSlug);
  if (matchingSchemes.length === 0) {
    // Check if adding -mutual-fund would match
    const withSuffix = `${normSlug}-mutual-fund`;
    const matchWithSuffix = schemesRes.rows.find((r) => slugify(r.amc) === withSuffix);
    if (matchWithSuffix) {
      return { redirect: withSuffix };
    }
    return null;
  }

  const amcName = matchingSchemes[0].amc;
  const amfiAum = (await getAmfiAum()) || {};

  let totalAumCr = 0;
  const schemesWithAum = matchingSchemes.map((s) => {
    const aum = amfiAum[s.code]?.aumCr || null;
    if (aum) totalAumCr += aum;
    return {
      ...s,
      aumCr: aum,
      ret1y: s.ret_1y ? parseFloat(s.ret_1y) : null,
      ret3y: s.ret_3y ? parseFloat(s.ret_3y) : null,
      ret5y: s.ret_5y ? parseFloat(s.ret_5y) : null,
      retInception: s.ret_inception ? parseFloat(s.ret_inception) : null,
      nav: s.nav ? parseFloat(s.nav) : null,
    };
  });

  // 3. Fetch R2 AMC profile
  const profile = (await getAmcProfile(normSlug)) || {
    amcSlug: normSlug,
    amcName,
    syncedAt: null,
    info: {
      name: amcName,
      legalName: amcName,
      address: null,
      phone: null,
      email: null,
      website: null,
      launchDate: null,
      rank: null,
    },
    managers: [],
  };

  const logoPath = getMFLogo(amcName);

  return {
    amcSlug: normSlug,
    amcName,
    logoPath,
    totalAumCr: Math.round(totalAumCr * 100) / 100,
    schemesCount: matchingSchemes.length,
    schemes: schemesWithAum,
    profile,
  };
}
