/**
 * lib/indexConstituents.js
 *
 * Data Access Layer for 64 Benchmark Index Constituent Pages.
 *
 * Provides:
 * - getIndexConstituents(slug): Reads constituents with multi-tier fallback (Postgres -> R2 -> Local Disk).
 * - getIndexDetail(slug): Merges constituents, trailing performance, valuation ratios, sector distribution.
 * - formatIndexMarkdown(detail): Formats token-dense, authoritative Markdown for LLM/GEO engines.
 */

import fs from 'fs';
import path from 'path';
import { getIndexConfigBySlug } from './indexConstituentsConfig.js';
import { getCombinedIndicesData, getValuationStatus } from './indicesData.js';

// In-memory LRU cache to keep SSR blazing fast (<10ms)
const _memoryCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch raw constituents for a slug via multi-tier fallback:
 * 1. In-memory cache
 * 2. PostgreSQL `index_constituents` table
 * 3. Cloudflare R2 cache `index-constituents/<slug>.json`
 * 4. Local disk cache `data/index-constituents/<slug>.json`
 */
export async function getIndexConstituents(slug) {
  if (!slug) return null;
  const config = getIndexConfigBySlug(slug);
  if (!config) return null;

  const now = Date.now();
  const cached = _memoryCache.get(slug);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Tier 1: PostgreSQL
  if (process.env.POSTGRES_URL) {
    try {
      const { default: pool } = await import('./db.js');
      const query = `
        SELECT
          symbol,
          company_name AS "companyName",
          industry,
          series,
          isin,
          weight,
          source,
          as_of_date::text AS "asOfDate"
        FROM index_constituents
        WHERE index_slug = $1
        ORDER BY weight DESC NULLS LAST, company_name ASC;
      `;
      const res = await pool.query(query, [slug]);
      if (res.rows && res.rows.length > 0) {
        const payload = {
          slug: config.slug,
          name: config.name,
          exchange: config.exchange,
          category: config.category,
          description: config.description,
          asOf: res.rows[0].asOfDate,
          count: res.rows.length,
          constituents: res.rows,
        };
        _memoryCache.set(slug, { data: payload, timestamp: now });
        return payload;
      }
    } catch (dbErr) {
      console.warn(`[indexConstituents] DB read failed for ${slug}:`, dbErr.message);
    }
  }

  // Tier 2: Cloudflare R2
  if (process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME) {
    try {
      const { r2Get } = await import('./r2.js');
      const r2Key = `index-constituents/${slug}.json`;
      const r2Data = await r2Get(r2Key);
      if (r2Data) {
        const payload = JSON.parse(r2Data);
        _memoryCache.set(slug, { data: payload, timestamp: now });
        return payload;
      }
    } catch (r2Err) {
      console.warn(`[indexConstituents] R2 read failed for ${slug}:`, r2Err.message);
    }
  }

  // Tier 3: Local Disk Cache
  try {
    const diskPath = path.resolve(process.cwd(), 'data/index-constituents', `${slug}.json`);
    if (fs.existsSync(diskPath)) {
      const fileData = fs.readFileSync(diskPath, 'utf8');
      const payload = JSON.parse(fileData);
      _memoryCache.set(slug, { data: payload, timestamp: now });
      return payload;
    }
  } catch (fsErr) {
    console.warn(`[indexConstituents] Disk read failed for ${slug}:`, fsErr.message);
  }

  // Default fallback if no data ingested yet
  return {
    slug: config.slug,
    name: config.name,
    exchange: config.exchange,
    category: config.category,
    description: config.description,
    asOf: new Date().toISOString().slice(0, 10),
    count: 0,
    constituents: [],
  };
}

/**
 * Normalizes index names to match across NSE PDF / BSE Dashboard and Config
 */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Returns combined detail for an index including returns, valuation, sector breakdown, and constituents.
 */
export async function getIndexDetail(slug) {
  if (!slug) return null;
  const config = getIndexConfigBySlug(slug);
  if (!config) return null;

  const [constituentData, combinedIndices] = await Promise.all([
    getIndexConstituents(slug),
    getCombinedIndicesData().catch(() => null),
  ]);

  const constituents = constituentData?.constituents || [];
  const normConfig = normalizeName(config.name);

  // Find index in combined dashboard data
  let marketData = null;
  if (combinedIndices?.allData) {
    marketData = combinedIndices.allData.find(
      (idx) => normalizeName(idx.name) === normConfig || (idx.short && normalizeName(idx.short) === normConfig)
    );
  }

  // Valuation gauge status
  const pe = marketData?.val?.pe ?? null;
  const pb = marketData?.val?.pb ?? null;
  const dy = marketData?.val?.dy ?? null;
  const valuationStatus = pe ? getValuationStatus(config.name, pe) : null;

  // Sector breakdown aggregation
  const sectorCounts = {};
  let totalValidSectors = 0;
  for (const c of constituents) {
    const s = c.industry || 'Other';
    sectorCounts[s] = (sectorCounts[s] || 0) + 1;
    totalValidSectors++;
  }

  const sectorBreakdown = Object.entries(sectorCounts)
    .map(([sector, count]) => ({
      sector,
      count,
      pct: totalValidSectors > 0 ? Number(((count / totalValidSectors) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    slug: config.slug,
    name: config.name,
    exchange: config.exchange,
    category: config.category,
    description: config.description,
    asOf: constituentData?.asOf || '',
    count: constituents.length,
    constituents,
    returns: marketData?.returns || { r1m: null, r3m: null, r1y: null, r3y: null, r5y: null },
    risk: marketData?.risk || { vol: null, beta: null },
    val: { pe, pb, dy },
    valuationStatus,
    sectorBreakdown,
    topSectors: sectorBreakdown.slice(0, 5),
  };
}

/**
 * Generates high-density markdown formatted specifically for AI and GEO search engines.
 */
export function formatIndexMarkdown(detail) {
  if (!detail) return '';

  const {
    name,
    exchange,
    category,
    description,
    asOf,
    count,
    returns,
    val,
    valuationStatus,
    topSectors,
    constituents,
  } = detail;

  const fmt = (v, suffix = '%') => (v !== null && v !== undefined ? `${Number(v).toFixed(2)}${suffix}` : 'N/A');
  const fmtVal = (v) => (v !== null && v !== undefined ? `${Number(v).toFixed(2)}x` : 'N/A');

  let md = `# ${name} (${exchange}) — Complete Index Constituents, Valuation & Returns\n\n`;
  md += `> **Benchmark Overview:** ${description}\n\n`;
  md += `## Key Market Data (As of ${asOf || 'Latest'})\n`;
  md += `- **Exchange:** ${exchange}\n`;
  md += `- **Category:** ${category}\n`;
  md += `- **Total Constituents:** ${count} listed companies\n`;
  md += `- **P/E Ratio:** ${fmtVal(val.pe)}\n`;
  md += `- **P/B Ratio:** ${fmtVal(val.pb)}\n`;
  md += `- **Dividend Yield:** ${fmt(val.dy)}\n`;
  if (valuationStatus) {
    md += `- **Valuation Zone:** ${valuationStatus.label} (${valuationStatus.desc})\n`;
  }
  md += `\n`;

  md += `## Trailing Returns (Total Return Index Basis)\n`;
  md += `| Period | Trailing CAGR / Return |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **1 Month** | ${fmt(returns.r1m)} |\n`;
  md += `| **3 Months** | ${fmt(returns.r3m)} |\n`;
  md += `| **1 Year** | ${fmt(returns.r1y)} |\n`;
  md += `| **3 Years (CAGR)** | ${fmt(returns.r3y)} |\n`;
  md += `| **5 Years (CAGR)** | ${fmt(returns.r5y)} |\n\n`;

  if (topSectors && topSectors.length > 0) {
    md += `## Top Sector Allocation\n`;
    md += `| Sector / Industry | Stocks Count | Sector Weight / Share |\n`;
    md += `| :--- | :--- | :--- |\n`;
    topSectors.forEach((s) => {
      md += `| ${s.sector} | ${s.count} | ${s.pct}% |\n`;
    });
    md += `\n`;
  }

  md += `## Complete Constituent Roster (${count} Stocks)\n`;
  md += `| # | Stock Symbol | Company Name | Industry / Sector | ISIN Code | Mutual Fund Ownership |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  constituents.forEach((c, idx) => {
    const symbolLink = c.symbol ? `[${c.symbol}](https://mfcalc.getabundance.in/stocks-in-funds/${encodeURIComponent(c.symbol.toLowerCase())})` : 'N/A';
    const mfLink = c.symbol ? `[View Fund Holdings ➔](https://mfcalc.getabundance.in/stocks-in-funds/${encodeURIComponent(c.symbol.toLowerCase())})` : '-';
    md += `| ${idx + 1} | ${symbolLink} | ${c.companyName} | ${c.industry || 'Other'} | ${c.isin || '-'} | ${mfLink} |\n`;
  });
  md += `\n`;

  md += `---\n\n`;
  md += `### Source Attribution & Regulatory Disclosures\n`;
  md += `*Constituent data sourced from official index publications (NSE Indices Limited and BSE Limited). Returns and valuation metrics computed on Total Return Index (TRI) and Price Return bases. Published by Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor). Deep-link institutional holdings data powered by the Abundance Reverse Stock Holdings Engine.*\n`;

  return md;
}
