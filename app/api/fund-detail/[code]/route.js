import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';
import pool from '@/lib/db';
import { getHoldingsData, getAumInfo } from '@/lib/holdingsLookup';
import { checkRateLimitSafe, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

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
              ret_inception, vol, max_dd, ret_per_risk`;

    const { rows: fundRows } = await pool.query(
      `SELECT ${SELECT_FUND_COLS} FROM mf_screener WHERE code = $1`,
      [Number(code)]
    );

    let siblingResolved = false;
    if (!fundRows.length) {
      // mf_screener only carries Regular Plan + Growth Option rows
      // (scripts/build-screener.mjs). A code that misses here is almost
      // always a Direct-plan (or non-Growth-option) holding from a user's
      // CAS -- resolve it to the same fund's Regular Growth Plan sibling
      // via mf_code_index (built from the full, unfiltered AMFI universe),
      // since AMFI's current feed gives both variants the identical
      // (name, amc) pair. The client labels this clearly rather than
      // presenting it as the holding's own plan.
      try {
        const { rows: idxRows } = await pool.query(
          `SELECT name, amc FROM mf_code_index WHERE code = $1`,
          [String(code)]
        );
        if (idxRows.length) {
          const { name, amc } = idxRows[0];
          const { rows: siblingRows } = await pool.query(
            `SELECT ${SELECT_FUND_COLS} FROM mf_screener WHERE name = $1 AND amc = $2 LIMIT 1`,
            [name, amc]
          );
          if (siblingRows.length) {
            fundRows.push(siblingRows[0]);
            siblingResolved = true;
          }
        }
      } catch (err) {
        // mf_code_index may not exist yet on a deploy that lands before the
        // next nightly build-screener.mjs run -- degrade to today's 404
        // rather than a 500.
        console.error('[api/fund-detail] sibling-plan lookup failed:', err.message);
      }
    }

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
      return Response.json({ fund: publicFields, stress: null, holdings: null, isPro: false });
    }

    const proFields = {
      ...publicFields,
      ret_1m: num(fund.ret_1m),
      ret_3m: num(fund.ret_3m),
      ret_6m: num(fund.ret_6m),
      ret_1y: num(fund.ret_1y),
      ret_3y: num(fund.ret_3y),
      ret_5y: num(fund.ret_5y),
      ret_7y: num(fund.ret_7y),
      ret_10y: num(fund.ret_10y),
      ret_inception: num(fund.ret_inception),
      vol: num(fund.vol),
      max_dd: num(fund.max_dd),
      ret_per_risk: num(fund.ret_per_risk),
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

    const { rows: stressRows } = await pool.query(
      `SELECT scheme_code, month, aum_cr, days_50pct, days_25pct,
              top10_investors_pct, large_cap_pct, mid_cap_pct, small_cap_pct, cash_pct,
              std_dev_portfolio, std_dev_benchmark, beta,
              pe_portfolio, pe_benchmark, pe_benchmark_1ya, pe_benchmark_2ya,
              turnover_ratio
       FROM mf_stress_test WHERE scheme_code = $1 ORDER BY month DESC LIMIT 1`,
      [Number(code)]
    );

    const stress = stressRows.length ? Object.fromEntries(
      Object.entries(stressRows[0]).map(([k, v]) =>
        ['scheme_code', 'month'].includes(k) ? [k, v] : [k, num(v)]
      )
    ) : null;

    return Response.json({ fund: proFields, stress, holdings, isPro: true });

  } catch (err) {
    console.error('[api/fund-detail]', err.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
