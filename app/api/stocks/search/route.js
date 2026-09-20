import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const queryTerm = `%${q}%`;
  const exactTerm = q.toUpperCase();
  const startsWithTerm = `${q}%`;

  try {
    const res = await pool.query(
      `
      WITH matched_holdings AS (
        SELECT
          COALESCE(ticker, stock_slug) as symbol,
          MAX(ticker) as ticker,
          (ARRAY_AGG(stock_slug ORDER BY market_value_cr DESC NULLS LAST, weight_pct DESC NULLS LAST))[1] as stock_slug,
          (ARRAY_AGG(company_name ORDER BY market_value_cr DESC NULLS LAST, weight_pct DESC NULLS LAST))[1] as company_name,
          COALESCE((ARRAY_AGG(sector) FILTER (WHERE sector IS NOT NULL AND sector != 'Unknown' AND sector != 'Diversified'))[1], MAX(sector), 'Diversified') as sector,
          count(*) as holder_count,
          count(*) FILTER (WHERE holder_type = 'MF') as mf_count,
          count(*) FILTER (WHERE holder_type = 'PMS') as pms_count,
          COALESCE(sum(market_value_cr), 0) as total_val_cr
        FROM stock_fund_holdings
        WHERE ticker ILIKE $1
           OR stock_slug ILIKE $1
           OR company_name ILIKE $1
        GROUP BY COALESCE(ticker, stock_slug)
        ORDER BY
          CASE WHEN UPPER(COALESCE(MAX(ticker), '')) = $2 THEN 0
               WHEN MAX(ticker) ILIKE $3 THEN 1
               WHEN (ARRAY_AGG(company_name ORDER BY market_value_cr DESC NULLS LAST, weight_pct DESC NULLS LAST))[1] ILIKE $3 THEN 2
               ELSE 3 END,
          holder_count DESC
        LIMIT 10
      )
      SELECT * FROM matched_holdings;
      `,
      [queryTerm, exactTerm, startsWithTerm]
    );

    return NextResponse.json({ results: res.rows });
  } catch (err) {
    console.error('[StockSearchAPI] Error:', err.message);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
