/**
 * app/api/fund/[code]/route.js
 *
 * Dedicated Route Handler returning pure text/markdown mutual fund factsheets.
 * Used for GEO (Generative Engine Optimization) and AI crawler content negotiation:
 * - ChatGPT Search, Claude, Perplexity
 * - curl / HTTP clients requesting `Accept: text/markdown` or `?format=md`
 *
 * Returns Content-Type: text/markdown; charset=utf-8
 * Follows AMFI ARN-251838 distributor compliance and Option 1 Top 3 holdings teaser.
 */

import fs from 'fs';
import path from 'path';
import LINEAGE from '@/data/scheme-lineage.json';
import { getScreenerDataset } from '@/lib/screenerData';
import { getHoldingsData } from '@/lib/holdingsLookup';
import { resolveCategoryBenchmark, FALLBACK_BENCHMARKS } from '@/app/screener/screenerContent';

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
    console.warn('[api/fund] Failed to load master scheme list:', err.message);
  }
  return null;
}

function cleanSlug(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\s*\([^)]*formerly known as[^)]*\)/gi, '')
    .replace(/\s*-\s*(regular plan|direct plan|regular|direct|growth option|growth|idcw option|idcw|dividend|plan).*/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function fmtPct(val, sign = true) {
  if (val == null || isNaN(val)) return '—';
  const num = Number(val);
  return (sign && num > 0 ? '+' : '') + num.toFixed(1) + '%';
}

function formatFundMarkdown(fund, benchmark, holdingsData, stress, canonicalCode) {
  const lines = [];

  lines.push(`# Mutual Fund Factsheet: ${fund.name}`);
  lines.push('');
  lines.push(`**Canonical Source**: https://mfcalc.getabundance.in/fund/${canonicalCode}`);
  lines.push('**Distributor**: Abundance Financial Services · Atin Kumar Agrawal (AMFI ARN-251838)');
  lines.push('');

  // 1. Scheme Overview
  lines.push('## 1. Scheme Overview');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| AMC / Fund House | ${fund.amc || '—'} |`);
  lines.push(`| Category | ${fund.category || '—'} |`);
  lines.push(`| Structure | ${fund.structure || 'Open Ended'} |`);
  lines.push(`| AMFI Scheme Code | ${canonicalCode} |`);
  lines.push(`| ISIN | ${fund.isin || '—'} |`);
  lines.push(`| Current NAV | ₹${fund.nav != null ? fund.nav.toFixed(2) : '—'} (as of ${fund.nav_date || '—'}) |`);
  lines.push(`| Launch Date | ${fund.inception_date || '—'}${fund.age_years ? ` (${Math.floor(fund.age_years)} years old)` : ''} |`);
  lines.push(`| Total Fund AUM | ₹${holdingsData?.aumCr != null ? Math.round(holdingsData.aumCr).toLocaleString('en-IN') : (fund.aumCr ? Math.round(fund.aumCr).toLocaleString('en-IN') : '—')} Cr |`);
  lines.push(`| Expense Ratio | ${holdingsData?.expenseRatio != null ? holdingsData.expenseRatio + '%' : '—'} |`);
  lines.push(`| Primary Benchmark | ${benchmark?.name || holdingsData?.benchmarkName || 'BSE 500 TRI'} |`);
  lines.push('');

  // 2. Trailing Returns vs Benchmark
  const benchName = benchmark?.name || 'Category Benchmark';
  lines.push('## 2. Trailing Performance vs Benchmark (CAGR %)');
  lines.push(`| Period | ${fund.name} | Benchmark (${benchName}) | Alpha (Outperformance) |`);
  lines.push('| --- | --- | --- | --- |');

  const periods = [
    { label: '1 Month', fundKey: 'ret_1m', benchKey: 'ret_1m' },
    { label: '3 Months', fundKey: 'ret_3m', benchKey: 'ret_3m' },
    { label: '6 Months', fundKey: 'ret_6m', benchKey: 'ret_6m' },
    { label: '1 Year', fundKey: 'ret_1y', benchKey: 'ret_1y' },
    { label: '3 Years', fundKey: 'ret_3y', benchKey: 'ret_3y' },
    { label: '5 Years', fundKey: 'ret_5y', benchKey: 'ret_5y' },
    { label: '7 Years', fundKey: 'ret_7y', benchKey: null },
    { label: '10 Years', fundKey: 'ret_10y', benchKey: null },
    { label: 'Since Inception', fundKey: 'ret_inception', benchKey: null },
  ];

  for (const p of periods) {
    const fVal = fund[p.fundKey];
    const bVal = p.benchKey ? benchmark?.[p.benchKey] : null;
    let alphaStr = '—';
    if (fVal != null && bVal != null) {
      const diff = Number(fVal) - Number(bVal);
      alphaStr = (diff > 0 ? '+' : '') + diff.toFixed(1) + '%';
    }
    lines.push(`| ${p.label} | ${fmtPct(fVal)} | ${p.benchKey ? fmtPct(bVal) : '—'} | ${alphaStr} |`);
  }
  lines.push('');

  // 3. Risk & Volatility Metrics
  lines.push('## 3. Risk & Volatility Metrics');
  lines.push('| Metric | Value | Benchmark / Interpretation |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Annualized Volatility (Std Dev) | ${fund.vol != null ? fund.vol.toFixed(1) + '%' : '—'} | Measure of fund price variability (Lower is less volatile) |`);
  lines.push(`| Maximum Drawdown | ${fund.max_dd != null ? fund.max_dd.toFixed(1) + '%' : '—'} | Largest peak-to-trough drop over available history |`);
  lines.push(`| Return / Risk Ratio | ${fund.ret_per_risk != null ? fund.ret_per_risk.toFixed(2) : '—'} | Trailing return generated per unit of total risk |`);
  lines.push(`| Sharpe Ratio (3Y) | ${fund.sharpe_3y != null ? fund.sharpe_3y.toFixed(2) : '—'} | Risk-adjusted excess return over 6.5% risk-free rate |`);
  lines.push('');

  // 4. Portfolio Holdings (Option 1: Top 3 Teaser + Pro Callout)
  lines.push('## 4. Portfolio Holdings (Top 3 Teaser)');
  const allHoldings = holdingsData?.holdings || [];
  const totalCount = allHoldings.length;

  if (totalCount > 0) {
    const sorted = [...allHoldings].sort((a, b) => (b.weightagePct || 0) - (a.weightagePct || 0));
    const top3 = sorted.slice(0, 3);

    lines.push('| # | Company / Security | Asset Class | Sector | Portfolio Weight (%) |');
    lines.push('| --- | --- | --- | --- | --- |');
    top3.forEach((h, idx) => {
      lines.push(`| ${idx + 1} | ${h.securityName || '—'} | ${h.assetClass || 'EQUITY'} | ${h.sector || '—'} | ${h.weightagePct != null ? h.weightagePct.toFixed(1) + '%' : '—'} |`);
    });
    lines.push('');
    lines.push(`> 🔒 **Pro Member Access**: Complete portfolio holdings (${totalCount} securities), market-cap allocation (Large/Mid/Small Cap), and full sector exposure are available to Abundance Pro members at https://mfcalc.getabundance.in/fund/${canonicalCode}`);
  } else {
    lines.push(`> 🔒 **Pro Member Access**: Complete portfolio holdings, market-cap allocation, and full sector exposure are available to Abundance Pro members at https://mfcalc.getabundance.in/fund/${canonicalCode}`);
  }
  lines.push('');

  // 5. SEBI Liquidity Stress Test
  lines.push('## 5. SEBI Liquidity Stress Test');
  if (stress && (stress.days_50pct != null || stress.days_25pct != null)) {
    lines.push(`- **Days to Liquidate 50% of Portfolio**: **${stress.days_50pct ?? '—'} days**`);
    lines.push(`- **Days to Liquidate 25% of Portfolio**: **${stress.days_25pct ?? '—'} days**`);
    lines.push('- *Regulatory Context*: Mandated by SEBI under the liquidity stress-testing framework specifically for Small Cap and Mid Cap schemes.');
  } else {
    lines.push('- **Status**: Not applicable (SEBI liquidity stress-testing disclosures are mandated specifically for Small Cap and Mid Cap mutual funds).');
  }
  lines.push('');

  // 6. Regulatory Disclosures & Compliance
  lines.push('## 6. Regulatory Disclosures & Statutory Citation');
  lines.push('> **Statutory Warning**: Mutual fund investments are subject to market risks, read all scheme related documents carefully.');
  lines.push('> **Past Performance**: Past performance is not indicative of future returns.');
  lines.push('> **Distributor Disclosure**: Published by **Abundance Financial Services** · Atin Kumar Agrawal (AMFI Registered Mutual Fund Distributor ARN-251838). This factsheet is provided strictly for educational and informational purposes and does not constitute investment advice, research, or a financial recommendation.');
  lines.push(`> **Interactive Tools**: View rolling return charts, peer quartile rankings, and CAS portfolio review at https://mfcalc.getabundance.in`);

  return lines.join('\n');
}

export async function GET(request, { params }) {
  const { code } = await params;

  if (!code || isNaN(Number(code))) {
    return new Response('# 400 Invalid Scheme Code\n\nPlease provide a valid numeric AMFI scheme code.', {
      status: 400,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  const strCode = String(code);

  // 1. Check predecessor scheme in scheme-lineage.json
  const succEntry = Object.entries(LINEAGE || {}).find(
    ([, entry]) => String(entry.pred) === strCode
  );
  if (succEntry) {
    const succCode = succEntry[0];
    const url = new URL(request.url);
    const redirectUrl = new URL(`/fund/${succCode}${url.search || '?format=md'}`, request.url);
    return Response.redirect(redirectUrl, 308);
  }

  // 2. Fetch screener dataset (1h cached)
  let dataset = null;
  try {
    dataset = await getScreenerDataset();
  } catch (err) {
    return new Response('# 503 Service Unavailable\n\nFailed to load mutual fund dataset.', {
      status: 503,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  const allFunds = dataset?.funds || [];

  // Find fund by code
  let fund = allFunds.find((f) => String(f.code) === strCode);

  // If not found in screener dataset directly, try mapping via master scheme list
  if (!fund) {
    const masterSchemes = getMasterSchemeList();
    if (masterSchemes && masterSchemes[strCode]) {
      const masterName = masterSchemes[strCode];
      const masterSlug = cleanSlug(masterName);
      fund = allFunds.find((f) => cleanSlug(f.name) === masterSlug);
    }
  }

  if (!fund) {
    return new Response('# 404 Fund Not Found\n\nThe requested scheme code was not found in the mutual fund database.', {
      status: 404,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  const canonicalCode = String(fund.code);

  // 3. Fetch holdings & AUM with 2.5s safety timeout
  let holdingsData = null;
  try {
    holdingsData = await Promise.race([
      getHoldingsData(canonicalCode, fund.name),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
  } catch {
    // Graceful degradation on cold lookup
  }

  // 4. Resolve category benchmark
  const benchmark = resolveCategoryBenchmark(fund.category, dataset.benchmarks) ||
    dataset.benchmarks?.BSE500 ||
    FALLBACK_BENCHMARKS.BSE500;

  // 5. Stress test data
  const stress = dataset.stressMap?.[canonicalCode] || dataset.stressMap?.[fund.code] || null;

  // 6. Format Markdown output
  const markdown = formatFundMarkdown(fund, benchmark, holdingsData, stress, canonicalCode);

  return new Response(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'index, follow',
      'Link': `<https://mfcalc.getabundance.in/fund/${canonicalCode}>; rel="canonical"`,
    },
  });
}
