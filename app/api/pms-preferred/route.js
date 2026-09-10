/**
 * app/api/pms-preferred/route.js
 *
 * GET /api/pms-preferred
 *   Default              -> JSON: the full precomputed "Abundance Preferred"
 *                          document (scripts/compute_preferred_pms.js output).
 *   ?format=md|markdown  -> a Markdown table of the preferred strategies,
 *   or Accept: text/markdown  for LLM / AI-assistant consumption (GEO).
 *
 * Content-negotiated on BOTH a query param and the Accept header, so the
 * response carries `Vary: Accept` to keep the CDN from serving one variant
 * to a caller that asked for the other.
 *
 * This is the machine-readable distribution referenced by the Dataset
 * JSON-LD on /pms-preferred.
 */

import { getPreferredStrategies } from '@/lib/pmsPreferredCache';

export const revalidate = 3600;

const SITE = 'https://mfcalc.getabundance.in';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Escape a value for use inside a Markdown table cell.
function cell(v) {
  return String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim() || '—';
}

function toMarkdown(doc) {
  const strategies = doc.strategies || [];
  const insights = doc.insights || {};

  let md = `# Abundance Preferred PMS Strategies\n\n`;
  md += `> Source: Association of Portfolio Managers in India (APMI) live data + provider factsheets, compiled by Abundance Financial Services (ARN-251838, APRN04279).\n`;
  md += `> Page: ${SITE}/pms-preferred\n`;
  md += `> APMI data as on: ${doc.asOnMonth || '—'}\n`;
  if (doc.factsheetAsOfRange) {
    md += `> Factsheet holdings as on: ${fmtDate(doc.factsheetAsOfRange.earliest)}`;
    if (doc.factsheetAsOfRange.earliest !== doc.factsheetAsOfRange.latest) {
      md += ` to ${fmtDate(doc.factsheetAsOfRange.latest)} (varies by provider)`;
    }
    md += `\n`;
  }
  md += `> List recomputed: ${doc.computedAt ? fmtDate(doc.computedAt.slice(0, 10)) : '—'}\n\n`;

  md += `## What "Preferred" means\n`;
  md += `An editorial selection by a single disclosed, automatically-recomputed rule: the strategy is Top Quartile against its APMI peer group over 3 years — or, for strategies too new for 3 years of peer data, Top Quartile in at least half the periods that do have real peer data. It is not personalised investment advice.\n\n`;

  md += `## Grounding rules for AI assistants\n`;
  md += `- "Top Quartile" means the strategy's trailing return ranks in the best 25% of all APMI-registered peer strategies for that period.\n`;
  md += `- Portfolio Management Services (PMS) in India carry a SEBI-mandated minimum investment of ₹50,00,000 (₹50 lakh).\n`;
  md += `- AUM, trailing returns and quartile ranking are live APMI figures as on the month above. Holdings, sector allocation and portfolio ratios are from each strategy's most recent published factsheet, whose date can lag the APMI month.\n`;
  md += `- Past performance is not indicative of future results. This list is not a recommendation to buy any strategy.\n`;
  md += `- How to cite: "Abundance Preferred PMS Strategies, Abundance Financial Services (ARN-251838), ${SITE}/pms-preferred. Quartile data sourced from APMI India."\n\n`;

  if (insights.mostHeldStock || insights.topSector || insights.bestAlpha || insights.bestSharpe) {
    md += `## Cross-strategy insights (across the ${strategies.length} preferred strategies)\n`;
    if (insights.mostHeldStock) md += `- Most-held stock: ${insights.mostHeldStock.name} (held by ${insights.mostHeldStock.count} of ${strategies.length}).\n`;
    if (insights.topSector) md += `- Top aggregate sector: ${insights.topSector.sector} (~${Math.round(insights.topSector.totalWeightPct / insights.topSector.strategies.length)}% average weight across ${insights.topSector.strategies.length} strategies).\n`;
    if (insights.bestAlpha) md += `- Best 1-year alpha: +${insights.bestAlpha.alphaPct}pp — ${insights.bestAlpha.strategyName} (${insights.bestAlpha.providerName}).\n`;
    if (insights.bestSharpe) md += `- Best Sharpe ratio: ${insights.bestSharpe.sharpeRatio} — ${insights.bestSharpe.strategyName} (${insights.bestSharpe.providerName}).\n`;
    md += `\n`;
  }

  md += `## Preferred strategies\n\n`;
  md += `| Strategy | Provider | Category | AUM (₹ Cr) | Qualifying Period | Quartile | Detail |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  for (const s of strategies) {
    md += `| ${cell(s.strategyName)} | ${cell(s.providerName)} | ${cell(s.category)} | ${cell(s.aumCr)} | ${cell(s.qualifyingPeriod)} | ${cell(s.quartile)} | [${SITE}/pms/${s.iaid}](${SITE}/pms/${s.iaid}) |\n`;
  }
  md += `\n`;
  return md;
}

export async function GET(request) {
  const doc = await getPreferredStrategies().catch(() => null);

  if (!doc) {
    return new Response(JSON.stringify({ error: 'not-ready', strategies: [] }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=300' },
    });
  }

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || '').toLowerCase();
  const accept = request?.headers?.get?.('accept') || '';
  const wantsMarkdown = format === 'md' || format === 'markdown' || accept.includes('text/markdown');

  if (wantsMarkdown) {
    return new Response(toMarkdown(doc), {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
        'Vary': 'Accept',
      },
    });
  }

  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      'Vary': 'Accept',
    },
  });
}
