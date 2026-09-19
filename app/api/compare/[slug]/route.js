/**
 * app/api/compare/[slug]/route.js
 *
 * Dedicated Route Handler returning pure text/markdown for mutual fund comparisons.
 * Used for GEO (Generative Engine Optimization) and AI crawler content negotiation:
 * - ChatGPT Search, Claude, Perplexity
 * - curl / HTTP clients requesting `Accept: text/markdown` or `?format=md`
 *
 * Returns Content-Type: text/markdown; charset=utf-8
 */

import fs from 'fs';
import path from 'path';
import { getScreenerDataset } from '@/lib/screenerData';
import { resolveCompareFunds } from '@/lib/compareSlug';
import { getHoldingsData } from '@/lib/holdingsLookup';
import { computeVerdictScores, overallWinner, pickCommonRankPeriod, categoryPeerRank } from '@/app/screener/compareEngine';

let cachedMasterSchemes = null;
function getMasterSchemeList() {
  if (cachedMasterSchemes) return cachedMasterSchemes;
  try {
    const filePath = path.join(process.cwd(), 'data', 'mf-scheme-list.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cachedMasterSchemes = data.schemes || null;
      return cachedMasterSchemes;
    }
  } catch (err) {
    console.warn('[api/compare] Failed to load master scheme list:', err.message);
  }
  return null;
}

function computePairwiseOverlap(hA, hB) {
  if (!hA?.length || !hB?.length) return null;
  const eqA = hA.filter((h) => h.assetClass === 'EQUITY');
  const eqB = hB.filter((h) => h.assetClass === 'EQUITY');
  if (!eqA.length || !eqB.length) return null;

  const mapB = new Map();
  eqB.forEach((h) => mapB.set((h.securityName || '').toLowerCase().trim(), h.weightagePct || 0));

  let overlap = 0;
  eqA.forEach((h) => {
    const key = (h.securityName || '').toLowerCase().trim();
    if (mapB.has(key)) {
      overlap += Math.min(h.weightagePct || 0, mapB.get(key));
    }
  });
  return Math.round(overlap * 10) / 10;
}

function formatComparisonMarkdown(funds, allMfFunds, holdingsMap, canonicalSlug) {
  const names = funds.map((f) => f.name).join(' vs ');
  const lines = [];

  lines.push(`# Mutual Fund Comparison: ${names}`);
  lines.push('');
  lines.push(`**Canonical Source**: https://mfcalc.getabundance.in/compare/${canonicalSlug}`);
  lines.push('**Distributor**: Abundance Financial Services · Atin Kumar Agrawal (AMFI ARN-251838)');
  lines.push('');

  // Overview Table
  lines.push('## 1. Scheme Overview');
  lines.push('| Field | ' + funds.map((f) => f.name).join(' | ') + ' |');
  lines.push('| --- | ' + funds.map(() => '---').join(' | ') + ' |');
  lines.push('| AMC / Fund House | ' + funds.map((f) => f.amc).join(' | ') + ' |');
  lines.push('| Category | ' + funds.map((f) => f.category).join(' | ') + ' |');
  lines.push('| AMFI Scheme Code | ' + funds.map((f) => f.code).join(' | ') + ' |');
  lines.push('| Current NAV | ' + funds.map((f) => (f.nav != null ? '₹' + f.nav.toFixed(2) : '—')).join(' | ') + ' |');
  lines.push('| NAV Date | ' + funds.map((f) => f.nav_date || '—').join(' | ') + ' |');
  lines.push('');

  // Performance Table
  lines.push('## 2. Performance Comparison (CAGR %)');
  lines.push('| Period | ' + funds.map((f) => f.name).join(' | ') + ' |');
  lines.push('| --- | ' + funds.map(() => '---').join(' | ') + ' |');
  lines.push('| 1 Month | ' + funds.map((f) => (f.ret_1m != null ? (f.ret_1m > 0 ? '+' : '') + f.ret_1m.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| 3 Months | ' + funds.map((f) => (f.ret_3m != null ? (f.ret_3m > 0 ? '+' : '') + f.ret_3m.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| 6 Months | ' + funds.map((f) => (f.ret_6m != null ? (f.ret_6m > 0 ? '+' : '') + f.ret_6m.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| 1 Year | ' + funds.map((f) => (f.ret_1y != null ? (f.ret_1y > 0 ? '+' : '') + f.ret_1y.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| 3 Years | ' + funds.map((f) => (f.ret_3y != null ? (f.ret_3y > 0 ? '+' : '') + f.ret_3y.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| 5 Years | ' + funds.map((f) => (f.ret_5y != null ? (f.ret_5y > 0 ? '+' : '') + f.ret_5y.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| 7 Years | ' + funds.map((f) => (f.ret_7y != null ? (f.ret_7y > 0 ? '+' : '') + f.ret_7y.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| 10 Years | ' + funds.map((f) => (f.ret_10y != null ? (f.ret_10y > 0 ? '+' : '') + f.ret_10y.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('| Since Inception | ' + funds.map((f) => (f.ret_inception != null ? (f.ret_inception > 0 ? '+' : '') + f.ret_inception.toFixed(1) + '%' : '—')).join(' | ') + ' |');
  lines.push('');

  // Risk Metrics Table
  lines.push('## 3. Risk & Volatility Metrics');
  lines.push('| Metric | ' + funds.map((f) => f.name).join(' | ') + ' | Better |');
  lines.push('| --- | ' + funds.map(() => '---').join(' | ') + ' | --- |');
  lines.push('| Annualized Volatility | ' + funds.map((f) => (f.vol != null ? f.vol.toFixed(1) + '%' : '—')).join(' | ') + ' | Lower is better |');
  lines.push('| Maximum Drawdown | ' + funds.map((f) => (f.max_dd != null ? f.max_dd.toFixed(1) + '%' : '—')).join(' | ') + ' | Lower drop is better |');
  lines.push('| Return / Risk Ratio | ' + funds.map((f) => (f.ret_per_risk != null ? f.ret_per_risk.toFixed(2) : '—')).join(' | ') + ' | Higher is better |');
  lines.push('');

  // Category Peer Rank
  const rankPeriod = pickCommonRankPeriod(funds.map((f) => ({ ...f, type: 'mf' })));
  if (rankPeriod) {
    lines.push(`## 4. Category Peer-Rank (${rankPeriod.label} Return)`);
    funds.forEach((f) => {
      const rank = categoryPeerRank({ ...f, type: 'mf' }, allMfFunds, rankPeriod.key);
      if (rank) {
        lines.push(`- **${f.name}**: #${rank.rank} of ${rank.of} funds in ${f.category}`);
      }
    });
    lines.push('');
  }

  // Portfolio Overlap & Holdings
  if (funds.length >= 2) {
    const h1 = holdingsMap[funds[0].code]?.holdings;
    const h2 = holdingsMap[funds[1].code]?.holdings;
    if (h1 && h2) {
      const overlap = computePairwiseOverlap(h1, h2);
      lines.push('## 5. Portfolio Overlap Analysis');
      lines.push(`- **Common Holdings Overlap**: **${overlap != null ? overlap + '%' : 'Data pending'}** between ${funds[0].name} and ${funds[1].name}.`);
      if (overlap != null && overlap >= 35) {
        lines.push(`- *Insight*: An overlap of ${overlap}% indicates significant shared underlying exposure. Holding both funds concurrently offers reduced diversification benefit.`);
      } else if (overlap != null) {
        lines.push(`- *Insight*: An overlap of ${overlap}% indicates healthy portfolio diversification between these schemes.`);
      }
      lines.push('');
    }
  }

  // Verdict Summary
  const scores = computeVerdictScores(funds.map((f) => ({ ...f, type: 'mf', ret_inception_annualized: true })));
  const winner = overallWinner(funds.map((f) => ({ ...f, type: 'mf' })), scores);
  if (winner) {
    lines.push('## 6. Quantitative Verdict & Leader');
    if (winner.tie) {
      lines.push(`- **Result**: Evenly matched across analyzed metrics.`);
    } else {
      lines.push(`- **Overall Leader**: **${winner.fund.name}** ranks highest across long-term return consistency and risk-adjusted metrics.`);
    }
    lines.push('');
  }

  // Regulatory Citation Block
  lines.push('## 7. Regulatory Disclosures & Compliance');
  lines.push('> **Important Disclosure**: This comparison is strictly for informational and educational purposes and does not constitute investment advice or a personal recommendation.');
  lines.push('> Mutual fund investments are subject to market risks. Read all scheme-related documents carefully before investing.');
  lines.push('> Past performance is not indicative of future returns.');
  lines.push('> Published by **Abundance Financial Services** (AMFI Registered Mutual Fund & SIF Distributor ARN-251838).');
  lines.push('> Access full interactive analytics, NAV rolling charts and CAS portfolio tracking at: https://mfcalc.getabundance.in');

  return lines.join('\n');
}

export async function GET(request, { params }) {
  const { slug } = await params;

  let dataset = null;
  try {
    dataset = await getScreenerDataset();
  } catch (err) {
    return new Response('# Service Unavailable\n\nFailed to load mutual fund dataset.', {
      status: 503,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  const masterSchemes = getMasterSchemeList();
  const res = resolveCompareFunds(slug, dataset?.funds || [], masterSchemes);

  if (!res || !res.funds || res.funds.length < 2) {
    return new Response('# 404 Comparison Not Found\n\nUnable to resolve one or more mutual funds in the requested comparison slug.', {
      status: 404,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  const { funds, canonicalSlug } = res;

  // Fetch holdings safely
  const holdingsMap = {};
  await Promise.all(
    funds.map(async (f) => {
      try {
        const h = await Promise.race([
          getHoldingsData(f.code, f.name),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        if (h) holdingsMap[f.code] = h;
      } catch {
        // Continue without holdings if timeout
      }
    })
  );

  const markdown = formatComparisonMarkdown(funds, dataset.funds, holdingsMap, canonicalSlug);

  return new Response(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'all',
      'Link': `<https://mfcalc.getabundance.in/compare/${canonicalSlug}>; rel="canonical"`,
    },
  });
}
