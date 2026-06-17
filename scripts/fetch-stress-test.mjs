/**
 * scripts/fetch-stress-test.mjs
 * 
 * Fetches monthly Stress Test & Liquidity Analysis data from AMFI for
 * Mid Cap (Cat ID 17) and Small Cap (Cat ID 18) funds.
 * 
 * API: GET https://www.amfiindia.com/api/risk-parameter-data-revised?strCatId=<id>&date=<01-Mon-YYYY>
 * 
 * Upserts into mf_stress_test table. SchemeID in AMFI response == fund code in our DB.
 * 
 * Run: node scripts/fetch-stress-test.mjs
 * Or via env: STRESS_TEST_MONTH=01-Jan-2026 node scripts/fetch-stress-test.mjs
 */

import pg from 'pg';

const { Pool } = pg;

const AMFI_API = 'https://www.amfiindia.com/api/risk-parameter-data-revised';
const CATS = [
  { id: 17, name: 'Mid Cap Fund' },
  { id: 18, name: 'Small Cap Fund' },
];

// Format a date as "01-Mar-2026" (what AMFI expects)
function fmtDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `01-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// Get the latest completed month (last month's data is published by 15th of this month)
function latestMonth() {
  const override = process.env.STRESS_TEST_MONTH;
  if (override) return override;
  const now = new Date();
  // If we're past the 15th, last month's data should be available
  // Otherwise use two months ago to be safe
  const lag = now.getDate() >= 15 ? 1 : 2;
  const d = new Date(now.getFullYear(), now.getMonth() - lag, 1);
  return fmtDate(d);
}

async function fetchCat(catId, dateStr) {
  const url = `${AMFI_API}?strCatId=${catId}&date=${encodeURIComponent(dateStr)}`;
  console.log(`[stress-test] Fetching ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MF-Analyzer-Bot/1.0)',
      'Referer': 'https://www.amfiindia.com/risk-parameters',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for catId=${catId}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Unexpected response format for catId=${catId}`);
  return data;
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS mf_stress_test (
      scheme_code       INTEGER     NOT NULL,
      scheme_name       TEXT        NOT NULL,
      amc_name          TEXT,
      category          TEXT        NOT NULL,  -- 'mid_cap' | 'small_cap'
      month             DATE        NOT NULL,
      aum_cr            NUMERIC,
      days_50pct        NUMERIC,               -- days to liquidate 50% of portfolio
      days_25pct        NUMERIC,               -- days to liquidate 25% of portfolio
      top10_investors_pct NUMERIC,             -- liability side concentration
      large_cap_pct     NUMERIC,
      mid_cap_pct       NUMERIC,
      small_cap_pct     NUMERIC,
      cash_pct          NUMERIC,
      std_dev_portfolio NUMERIC,
      std_dev_benchmark NUMERIC,
      beta              NUMERIC,
      pe_portfolio      NUMERIC,
      pe_benchmark      NUMERIC,
      pe_benchmark_1ya  NUMERIC,
      pe_benchmark_2ya  NUMERIC,
      turnover_ratio    NUMERIC,
      fetched_at        TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (scheme_code, month)
    )
  `);
  console.log('[stress-test] Table mf_stress_test ready');
}

async function upsertRecords(client, records) {
  let upserted = 0;
  for (const r of records) {
    await client.query(`
      INSERT INTO mf_stress_test (
        scheme_code, scheme_name, amc_name, category, month, aum_cr,
        days_50pct, days_25pct, top10_investors_pct,
        large_cap_pct, mid_cap_pct, small_cap_pct, cash_pct,
        std_dev_portfolio, std_dev_benchmark, beta,
        pe_portfolio, pe_benchmark, pe_benchmark_1ya, pe_benchmark_2ya,
        turnover_ratio, fetched_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW()
      )
      ON CONFLICT (scheme_code, month) DO UPDATE SET
        scheme_name       = EXCLUDED.scheme_name,
        amc_name          = EXCLUDED.amc_name,
        aum_cr            = EXCLUDED.aum_cr,
        days_50pct        = EXCLUDED.days_50pct,
        days_25pct        = EXCLUDED.days_25pct,
        top10_investors_pct = EXCLUDED.top10_investors_pct,
        large_cap_pct     = EXCLUDED.large_cap_pct,
        mid_cap_pct       = EXCLUDED.mid_cap_pct,
        small_cap_pct     = EXCLUDED.small_cap_pct,
        cash_pct          = EXCLUDED.cash_pct,
        std_dev_portfolio = EXCLUDED.std_dev_portfolio,
        std_dev_benchmark = EXCLUDED.std_dev_benchmark,
        beta              = EXCLUDED.beta,
        pe_portfolio      = EXCLUDED.pe_portfolio,
        pe_benchmark      = EXCLUDED.pe_benchmark,
        pe_benchmark_1ya  = EXCLUDED.pe_benchmark_1ya,
        pe_benchmark_2ya  = EXCLUDED.pe_benchmark_2ya,
        turnover_ratio    = EXCLUDED.turnover_ratio,
        fetched_at        = NOW()
    `, [
      r.SchemeID,
      r.SchemeName,
      r.MF_Name,
      r.Cat_ID === 17 ? 'mid_cap' : 'small_cap',
      r.month,
      r.AUM || null,
      r.stressTest?.StressTest_portfolio_50 ?? null,
      r.stressTest?.StressTest_portfolio_25 ?? null,
      r.concentration?.LiabilitySide ?? null,
      r.concentration?.AssetSide?.AssetSide_LargeCap ?? null,
      r.concentration?.AssetSide?.AssetSide_MidCap ?? null,
      r.concentration?.AssetSide?.AssetSide_SmallCap ?? null,
      r.concentration?.AssetSide?.AssetSide_Cash ?? null,
      r.volatility?.Volatility_PortfolioASD || null,
      r.volatility?.Volatility_BenchmarkASD || null,
      r.volatility?.Volatility_PortfolioBeta || null,
      r.valuation?.Valuation_PortfolioTrailing12mPE || null,
      r.valuation?.BenchMark?.Valuation_BenchmarkTrailing12mPE || null,
      r.valuation?.BenchMark?.Valuation_BenchmarkTrailing12mPE_1YA || null,
      r.valuation?.BenchMark?.Valuation_BenchmarkTrailing12mPE_2YA || null,
      r.valuation?.Valuation_PortfolioTurnoverRatio ?? null,
    ]);
    upserted++;
  }
  return upserted;
}

(async () => {
  const dateStr = latestMonth();
  console.log(`[stress-test] Fetching data for: ${dateStr}`);

  // Parse date for DB storage
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const [, mon, yr] = dateStr.split('-');
  const monthDate = new Date(Date.UTC(+yr, months[mon], 1)).toISOString().slice(0, 10);

  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const client = await pool.connect();

  try {
    await ensureTable(client);

    let totalUpserted = 0;
    for (const cat of CATS) {
      const records = await fetchCat(cat.id, dateStr);
      console.log(`[stress-test] ${cat.name}: ${records.length} records`);
      
      // Annotate with parsed month date
      const annotated = records.map(r => ({ ...r, month: monthDate }));
      const count = await upsertRecords(client, annotated);
      totalUpserted += count;
      console.log(`[stress-test] ${cat.name}: upserted ${count} rows`);
    }

    console.log(`[stress-test] Done! Total upserted: ${totalUpserted} rows for ${dateStr}`);
  } finally {
    client.release();
    await pool.end();
  }
})();
