import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';
import pool from '@/lib/db';
import { getHoldingsData, getAumInfo } from '@/lib/holdingsLookup';
import { checkRateLimitSafe, rateLimitResponse } from '@/lib/rateLimit';
import { sharpeRatio } from '@/lib/riskFreeRate';
import { getTickertapeRatios } from '@/lib/tickertapeMfRatios';

export const dynamic = 'force-dynamic';

// This route is hit on every single /fund/[code] page view and screener
// drawer open, with no caching of any kind -- unlike every other
// Postgres-backed data route in this codebase (getScreenerDataset(),
// lib/holdingsLookup.js, lib/tickertapeMfRatios.js all cache). The fund
// row and stress-test row below were doing 1-2 fresh pool.query() calls
// per request regardless of how recently the same fund was looked up.
// Can't fix this with an HTTP Cache-Control header -- the response
// content below is plan-gated (Pro vs free get different fields) on the
// SAME URL, so a shared/CDN cache would risk serving one plan's response
// to the other. Instead, cache just the Postgres-sourced data in-process,
// keyed by fund code; the isPro gating still happens fresh every request,
// after the cache lookup. 15 min TTL: NAV/stress data only changes once a
// day (EOD), so this is purely about absorbing repeat views within a
// browsing session, not a freshness tradeoff anyone would notice.
const FUND_CACHE_TTL_MS = 15 * 60 * 1000;
const fundRowCache = new Map();   // code -> { data: { fundRows, siblingResolved }, ts }
const stressRowCache = new Map(); // code -> { data: stressRows, ts }
const fundInflight = new Map();   // code -> Promise, dedupes concurrent requests for the same uncached code
const stressInflight = new Map();

function isFresh(ts) {
  return ts && Date.now() - ts < FUND_CACHE_TTL_MS;
}

async function getCachedFundRow(code, selectCols) {
  const cached = fundRowCache.get(code);
  if (isFresh(cached?.ts)) return cached.data;
  if (fundInflight.has(code)) return fundInflight.get(code);

  const promise = (async () => {
    const { rows: fundRows } = await pool.query(
      `SELECT ${selectCols} FROM mf_screener WHERE code = $1`,
      [Number(code)]
    );

    let siblingResolved = false;
    if (!fundRows.length) {
      try {
        const { rows: idxRows } = await pool.query(
          `SELECT name, amc FROM mf_code_index WHERE code = $1`,
          [String(code)]
        );
        if (idxRows.length) {
          const { name, amc } = idxRows[0];
          const { rows: siblingRows } = await pool.query(
            `SELECT ${selectCols} FROM mf_screener WHERE name = $1 AND amc = $2 LIMIT 1`,
            [name, amc]
          );
          if (siblingRows.length) {
            fundRows.push(siblingRows[0]);
            siblingResolved = true;
          }
        }
      } catch (err) {
        console.error('[api/fund-detail] sibling-plan lookup failed:', err.message);
      }
    }

    const data = { fundRows, siblingResolved };
    fundRowCache.set(code, { data, ts: Date.now() });
    return data;
  })();

  fundInflight.set(code, promise);
  promise.finally(() => fundInflight.delete(code));
  return promise;
}

async function getCachedStressRow(code) {
  const cached = stressRowCache.get(code);
  if (isFresh(cached?.ts)) return cached.data;
  if (stressInflight.has(code)) return stressInflight.get(code);

  const promise = (async () => {
    const { rows: stressRows } = await pool.query(
      `SELECT scheme_code, month, aum_cr, days_50pct, days_25pct,
              top10_investors_pct, large_cap_pct, mid_cap_pct, small_cap_pct, cash_pct,
              std_dev_portfolio, std_dev_benchmark, beta,
              pe_portfolio, pe_benchmark, pe_benchmark_1ya, pe_benchmark_2ya,
              turnover_ratio
       FROM mf_stress_test WHERE scheme_code = $1 ORDER BY month DESC LIMIT 1`,
      [Number(code)]
    );
    stressRowCache.set(code, { data: stressRows, ts: Date.now() });
    return stressRows;
  })();

  stressInflight.set(code, promise);
  promise.finally(() => stressInflight.delete(code));
  return promise;
}

export async function GET(req, { params }) {
  try {
    const { code } = await params;
    if (!code || isNaN(Number(code))) {
      return Response.json({ error: 'Invalid scheme code' }, { status: 400 });
    }

    const session = await auth();
    const isPro = Boolean(
      session?.user?.role === 'admin' ||
      session?.user?.plan === 'pro' ||
      session?.user?.plan === 'pro_lifetime' ||
      session?.user?.plan === 'lifetime' ||
      session?.user?.isPro ||
      (session?.user?.id && (await getUserPlan(session.user.id)) === 'pro')
    );

    const SELECT_FUND_COLS = `code, name, amc, category, structure, isin, nav, nav_date,
              inception_date, age_years, flag, asof,
              ret_1m, ret_3m, ret_6m, ret_1y, ret_3y, ret_5y, ret_7y, ret_10y,
              ret_inception, vol, max_dd, ret_per_risk, vol_1y, vol_3y, vol_5y`;

    const { fundRows, siblingResolved } = await getCachedFundRow(code, SELECT_FUND_COLS);

    if (!fundRows.length) {
      return Response.json({ error: 'Fund not found' }, { status: 404 });
    }

    const fund = fundRows[0];

    // Only the Pro branch below does expensive work (getHoldingsData plus the
    // mf_stress_test query), and it's only reachable by a caller whose own
    // session resolves to Pro -- which is exactly the abuse case here: a
    // paying user scripting requests against their own account. The non-Pro
    // path returns immediately and is cheap, so it isn't charged a counter
    // round-trip. Staff accounts are exempt, matching
    // app/api/distributor/route.js.
    if (isPro && session?.user?.id && session.user.role !== 'admin' && session.user.role !== 'distributor') {
      const rl = await checkRateLimitSafe(`user:${session.user.id}`, 'fund-detail-holdings');
      if (rl.limited) return rateLimitResponse(rl);
    }

    const num = (x) => (x == null ? null : Number(x));

    // Cheap regardless of plan (two already-warm R2-cached JSON reads, no
    // external vendor call) -- unlike getHoldingsData() below, which is
    // Pro-gated for cost reasons. AUM is basic fund-size info, not a
    // performance insight, so every visitor gets it, same tier as
    // category/AMC/NAV/inception date.
    const aumInfo = await getAumInfo(String(fund.code));

    const publicFields = {
      code: String(fund.code),
      name: fund.name,
      amc: fund.amc,
      category: fund.category,
      structure: fund.structure,
      isin: fund.isin || null,
      nav: num(fund.nav),
      nav_date: fund.nav_date || null,
      inception_date: fund.inception_date || null,
      age_years: num(fund.age_years),
      flag: fund.flag || null,
      asof: fund.asof || null,
      aumCr: aumInfo.aumCr,
      aumAsOf: aumInfo.aumAsOf,
      siblingResolved,
    };

    if (!isPro) {
      return Response.json({ fund: publicFields, stress: null, holdings: null, marketRatios: null, isPro: false });
    }

    const ret_1y = num(fund.ret_1y), ret_3y = num(fund.ret_3y), ret_5y = num(fund.ret_5y);
    const vol_1y = num(fund.vol_1y), vol_3y = num(fund.vol_3y), vol_5y = num(fund.vol_5y);

    const proFields = {
      ...publicFields,
      ret_1m: num(fund.ret_1m),
      ret_3m: num(fund.ret_3m),
      ret_6m: num(fund.ret_6m),
      ret_1y, ret_3y, ret_5y,
      ret_7y: num(fund.ret_7y),
      ret_10y: num(fund.ret_10y),
      ret_inception: num(fund.ret_inception),
      vol: num(fund.vol),
      max_dd: num(fund.max_dd),
      ret_per_risk: num(fund.ret_per_risk),
      // Real Std Dev / Sharpe Ratio per period -- see lib/riskFreeRate.js.
      // Distinct from ret_per_risk above (a disclosed, simpler proxy with
      // no risk-free rate subtracted).
      vol_1y, vol_3y, vol_5y,
      sharpe_1y: sharpeRatio(ret_1y, vol_1y),
      sharpe_3y: sharpeRatio(ret_3y, vol_3y),
      sharpe_5y: sharpeRatio(ret_5y, vol_5y),
    };

    // Holdings for Pro users only -- fetched server-side (not via the public
    // /api/proposal-studio/holdings route, which always returns full data
    // regardless of the caller's own plan) so a non-Pro visitor's browser
    // never receives the full holdings list even via direct API inspection.
    // Matches this page's existing all-or-nothing UX: the whole holdings
    // section is hidden client-side for non-Pro, so there's no "top 10
    // preview" tier here (unlike the SIF page) -- non-Pro gets null, Pro
    // gets everything.
    let holdings = null;
    try {
      holdings = await getHoldingsData(String(fund.code), fund.name);
    } catch (err) {
      console.error('[api/fund-detail] holdings lookup failed:', err.message);
    }

    const stressRows = await getCachedStressRow(code);

    const stress = stressRows.length ? Object.fromEntries(
      Object.entries(stressRows[0]).map(([k, v]) =>
        ['scheme_code', 'month'].includes(k) ? [k, v] : [k, num(v)]
      )
    ) : null;

    // PE Ratio via Tickertape only when SEBI's own stress-test disclosure
    // (mf_stress_test.pe_portfolio, above) doesn't already cover this
    // scheme -- that disclosure only applies to small/mid-cap funds
    // (SEBI's 2021 stress-test mandate), so most funds have nothing there.
    // Never let a slow/failing third-party lookup block the response --
    // getTickertapeRatios already degrades to null internally, but the
    // await itself is wrapped too as defense in depth.
    let marketRatios = null;
    if (stress?.pe_portfolio == null) {
      try {
        marketRatios = await getTickertapeRatios(fund.name);
      } catch (err) {
        console.error('[api/fund-detail] Tickertape ratios lookup failed:', err.message);
      }
    }

    return Response.json({ fund: proFields, stress, holdings, marketRatios, isPro: true });

  } catch (err) {
    console.error('[api/fund-detail]', err.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
