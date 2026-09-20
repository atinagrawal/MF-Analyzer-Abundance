/**
 * app/api/stocks-in-funds/[ticker]/route.js
 *
 * Dedicated Route Handler returning pure text/markdown institutional stock factsheets.
 * Used for GEO (Generative Engine Optimization) and AI crawler content negotiation:
 * - ChatGPT Search, Claude, Perplexity
 * - curl / HTTP clients requesting `Accept: text/markdown` or `?format=md`
 *
 * Returns Content-Type: text/markdown; charset=utf-8
 * Follows AMFI ARN-251838 / APMI APRN04279 distributor compliance.
 */

import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

function fmtCr(val) {
  const num = parseFloat(val) || 0;
  if (num <= 0) return '—';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

export async function GET(request, { params }) {
  const { ticker } = await params;
  const rawParam = decodeURIComponent(ticker || '').trim();

  if (!rawParam) {
    return new Response('# 400 Bad Request\n\nStock ticker or slug parameter is required.', {
      status: 400,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  let rows = [];
  let stock = null;

  try {
    const res = await pool.query(
      `
      SELECT
        id, stock_slug, ticker, isin, company_name, sector,
        holder_type, scheme_code, scheme_name, provider_name,
        category, weight_pct, market_value_cr, as_of_date
      FROM stock_fund_holdings
      WHERE UPPER(ticker) = UPPER($1) OR LOWER(stock_slug) = LOWER($1)
      ORDER BY weight_pct DESC
      `,
      [rawParam]
    );
    rows = res.rows;

    if (rows.length > 0) {
      const first = rows[0];
      stock = {
        companyName: first.company_name,
        ticker: first.ticker ? first.ticker.toUpperCase().trim() : null,
        slug: first.stock_slug,
        sector: first.sector,
        isin: first.isin,
        asOfDate: first.as_of_date,
      };
    } else {
      // Check stock_signals for graceful zero-holder state
      const sigRes = await pool.query(
        `SELECT symbol, name, sector, isin FROM stock_signals WHERE UPPER(symbol) = UPPER($1) OR LOWER(symbol) = LOWER($1) LIMIT 1`,
        [rawParam]
      );
      if (sigRes.rows.length > 0) {
        const s = sigRes.rows[0];
        const canonicalTicker = s.symbol.toUpperCase().trim();
        stock = {
          companyName: s.name,
          ticker: canonicalTicker,
          slug: canonicalTicker.toLowerCase(),
          sector: s.sector || 'Equities',
          isin: s.isin,
          asOfDate: null,
        };
      }
    }
  } catch (err) {
    console.error('[api/stocks-in-funds] DB error:', err.message);
    return new Response('# 500 Internal Server Error\n\nFailed to query institutional holdings database.', {
      status: 500,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  if (!stock) {
    return new Response('# 404 Stock Not Found\n\nThe requested stock was not found in the institutional holdings database.', {
      status: 404,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  const canonicalCode = stock.ticker || stock.slug;
  const mfHoldings = rows.filter((r) => r.holder_type === 'MF');
  const pmsHoldings = rows.filter((r) => r.holder_type === 'PMS');
  const totalValCr = rows.reduce((s, r) => s + (parseFloat(r.market_value_cr) || 0), 0);
  const avgWeight = rows.length
    ? (rows.reduce((s, r) => s + (parseFloat(r.weight_pct) || 0), 0) / rows.length).toFixed(2)
    : '0.00';
  const topHolding = rows[0] || null;
  const asOfStr = stock.asOfDate
    ? new Date(stock.asOfDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : 'Latest Monthly Disclosures';

  const lines = [];
  lines.push(`# Institutional Stock Ownership: ${stock.companyName} (${stock.ticker || stock.slug})`);
  lines.push('');
  lines.push(`**Canonical Source**: https://mfcalc.getabundance.in/stocks-in-funds/${canonicalCode}`);
  lines.push('**Distributor**: Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)');
  lines.push(`**Data As Of**: ${asOfStr}`);
  lines.push('');

  lines.push('## 1. Ownership Summary');
  lines.push(`- **Company Name**: ${stock.companyName}`);
  lines.push(`- **NSE Ticker**: ${stock.ticker || '—'}`);
  lines.push(`- **ISIN**: ${stock.isin || '—'}`);
  lines.push(`- **Sector**: ${stock.sector || 'Diversified'}`);
  lines.push(`- **Total Institutional Holders Disclosed**: ${rows.length} (${mfHoldings.length} Mutual Funds, ${pmsHoldings.length} PMS Strategies)`);
  lines.push(`- **Total Mutual Fund Holding Value**: ₹${totalValCr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`);
  lines.push(`- **Average Allocation Weight**: ${avgWeight}%`);
  if (topHolding) {
    lines.push(`- **Top Allocation**: ${parseFloat(topHolding.weight_pct).toFixed(2)}% in ${topHolding.scheme_name} (${topHolding.provider_name})`);
  }
  lines.push('');

  lines.push('## 2. Institutional Holders Breakdown');
  if (rows.length === 0) {
    lines.push('No mutual fund or PMS holdings disclosed for this security in the current monthly reporting cycle.');
  } else {
    lines.push('| Scheme / Strategy Name | Type | Category | Provider | Weight (%) | Holding Value |');
    lines.push('| --- | --- | --- | --- | ---: | ---: |');
    for (const h of rows) {
      const weight = parseFloat(h.weight_pct).toFixed(2);
      const val = h.holder_type === 'PMS' ? '—' : fmtCr(h.market_value_cr);
      lines.push(`| ${h.scheme_name} | ${h.holder_type} | ${h.category || '—'} | ${h.provider_name} | ${weight}% | ${val} |`);
    }
  }
  lines.push('');

  lines.push('## 3. Statutory Compliance & Methodology');
  lines.push('Institutional holding data compiled from publicly disclosed mutual fund and PMS monthly factsheets in accordance with SEBI guidelines. For informational and analytical purposes only; does not constitute investment advice, equity research, or a stock recommendation. Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).');
  lines.push('');

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'index, follow',
      'Link': `<https://mfcalc.getabundance.in/stocks-in-funds/${canonicalCode}>; rel="canonical"`,
    },
  });
}
