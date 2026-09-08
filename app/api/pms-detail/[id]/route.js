/**
 * app/api/pms-detail/[id]/route.js
 *
 * GET /api/pms-detail/327
 *
 * Composes the three underlying PMS data sources (details, period history,
 * quartile) behind a single, session-gated response -- the same isPro
 * pattern as app/api/fund-detail/[code]/route.js: a genuinely smaller
 * payload for non-Pro callers, not client-side-hidden data. All three
 * underlying functions are called in-process (direct imports), not via
 * HTTP self-fetch.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';
import { getPmsDetailsCached } from '@/lib/pmsDetailsCache';
import { getPmsPeriodHistoryCached } from '@/lib/pmsPeriodHistoryCache';
import { getPmsQuartileCached } from '@/lib/pmsQuartileCache';
import { getFactsheetsForProvider, getFactsheetDataForStrategy } from '@/lib/pmsFactsheetsCache';
import { MONTH_ABBR } from '@/lib/pmsScrapers';
import { checkRateLimitSafe, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

function parseAsOnMonth(asOnMonth) {
  const [abbr, yearStr] = asOnMonth.split('-');
  return { year: parseInt(yearStr, 10), month: MONTH_ABBR.indexOf(abbr) + 1 };
}

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'Invalid IAID' }, { status: 400 });
  }

  try {
    const session = await auth();
    const isPro = Boolean(
      session?.user?.role === 'admin' ||
      session?.user?.plan === 'pro' ||
      session?.user?.plan === 'pro_lifetime' ||
      session?.user?.plan === 'lifetime' ||
      session?.user?.isPro ||
      (session?.user?.id && (await getUserPlan(session.user.id)) === 'pro')
    );

    const details = await getPmsDetailsCached(id);
    if (!details) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Free for every visitor, Pro or not -- these are just links to PDFs
    // the AMC itself already publishes publicly, no computed/proprietary
    // insight, same reasoning already applied to AUM info elsewhere in
    // this app. null (not an empty array) when this provider isn't one of
    // the small set scripts/sync_pms_factsheets.js currently covers.
    const factsheets = await getFactsheetsForProvider(details.providerName).catch(() => null);

    // The specific strategy's own extracted content (holdings, sector &
    // market-cap allocation, valuation/quality metrics vs benchmark, what
    // changed this month) -- matched to THIS strategy specifically, not
    // just "this provider has some factsheets". null when unmatched or
    // not yet extracted; the UI section simply doesn't render.
    const factsheetData = await getFactsheetDataForStrategy(details.providerName, details.iaName).catch(() => null);

    const publicFields = {
      iaid: id,
      iaName: details.iaName,
      providerName: details.providerName,
      strategyName: details.strategyName,
      productName: details.productName,
      benchmark: details.benchmark,
      aumCr: details.aumCr,
      inceptionDate: details.inceptionDate,
      age: details.age,
      minInvestment: details.minInvestment,
      fixedFees: details.fixedFees,
      variableFees: details.variableFees,
      exitLoad: details.exitLoad,
      purpose: details.purpose,
      factsheets,
      factsheetData,
    };

    if (!isPro) {
      return NextResponse.json({
        data: publicFields,
        performance: null,
        history: null,
        quartile: null,
        isPro: false,
      });
    }

    // Same pattern as app/api/fund-detail/[code]/route.js: only the Pro
    // branch below does the expensive ~40-request APMI period-history walk,
    // so only it needs rate limiting. Staff accounts are exempt.
    if (isPro && session?.user?.id && session.user.role !== 'admin' && session.user.role !== 'distributor') {
      const rl = await checkRateLimitSafe(`user:${session.user.id}`, 'pms-detail-history');
      if (rl.limited) return rateLimitResponse(rl);
    }

    const history = await getPmsPeriodHistoryCached(id);
    const latest = history.length ? history[history.length - 1] : null;

    let quartile = null;
    if (latest && details.providerName) {
      const { year, month } = parseAsOnMonth(latest.asOnMonth);
      quartile = await getPmsQuartileCached(id, details.providerName, details.strategyName || 'Equity', year, month);
    }

    const proFields = {
      ...publicFields,
      turnover1M: details.turnover1M,
      turnover1Y: details.turnover1Y,
      fundManager: details.fundManager,
    };

    return NextResponse.json({
      data: proFields,
      performance: latest,
      history,
      quartile,
      isPro: true,
    });
  } catch (err) {
    console.error('[pms-detail] Route error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
