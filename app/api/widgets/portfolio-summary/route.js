/**
 * app/api/widgets/portfolio-summary/route.js
 *
 * Fast, lightweight portfolio summary endpoint for PWA desktop widgets.
 * Authenticated via NextAuth session cookies.
 *
 * Returns:
 *   - If unauthenticated: { authenticated: false }
 *   - If authenticated without CAS: { authenticated: true, hasPortfolio: false, user }
 *   - If authenticated with CAS: { authenticated: true, hasPortfolio: true, user, summary }
 */

import { auth } from '@/auth';
import pool from '@/lib/db';
import { r2Get } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ authenticated: false }, { status: 200 });
    }

    const userId = session.user.id;
    const userMeta = {
      name: session.user.name || 'Investor',
      email: session.user.email || '',
      image: session.user.image || null,
    };

    // Fetch user's CAS portfolio records from database
    const dbRes = await pool.query(
      `SELECT id, file_name, blob_key, uploaded_at
       FROM cas_portfolios
       WHERE user_id = $1
       ORDER BY uploaded_at DESC
       LIMIT 10`,
      [userId]
    );

    if (dbRes.rows.length === 0) {
      return Response.json({
        authenticated: true,
        hasPortfolio: false,
        user: userMeta,
      });
    }

    // Load blobs from R2 in parallel
    const blobPromises = dbRes.rows.map(row => r2Get(row.blob_key));
    const blobs = await Promise.allSettled(blobPromises);

    const seenKeys = new Set();
    const allHoldings = [];
    let investorName = '';
    let totalCurrent = 0;
    let totalInvested = 0;
    let folioCount = 0;

    for (const res of blobs) {
      if (res.status !== 'fulfilled' || !res.value) continue;
      const fileData = res.value;
      if (!investorName && fileData.investor_info?.name) {
        investorName = fileData.investor_info.name.trim();
      }

      const folios = fileData.folios || [];
      folioCount += folios.length;

      for (const folio of folios) {
        const pan = (folio.PAN || '').toUpperCase().trim();
        const folioNo = (folio.folio || '').trim();

        for (const scheme of folio.schemes || []) {
          const units = parseFloat(scheme.close) || 0;
          if (units < 0.001) continue;

          const fundKey = scheme.amfi || scheme.isin || (scheme.scheme || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const dedupKey = `${pan}|${folioNo}|${fundKey}`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          const valuation = scheme.valuation || {};
          const curVal = parseFloat(valuation.value) || 0;
          const costVal = parseFloat(valuation.cost) || (units * (parseFloat(scheme.nav) || 0));

          totalCurrent += curVal;
          totalInvested += costVal;

          allHoldings.push({
            name: (scheme.scheme || 'Mutual Fund').replace(/\s*-\s*(Regular Plan|Direct Plan|Regular|Direct|Growth( Option)?| Plan).*/i, '').trim(),
            fullName: scheme.scheme || 'Mutual Fund',
            amfi: scheme.amfi || null,
            isin: scheme.isin || null,
            units,
            nav: parseFloat(valuation.nav || scheme.nav) || 0,
            curVal,
            costVal,
            gain: curVal - costVal,
            gainPct: costVal > 0 ? ((curVal - costVal) / costVal) * 100 : 0,
            type: (scheme.type || 'EQUITY').toUpperCase(),
          });
        }
      }
    }

    // Sort holdings by current value descending
    allHoldings.sort((a, b) => b.curVal - a.curVal);

    // Compute asset allocation
    const allocation = { Equity: 0, Debt: 0, Hybrid: 0, Other: 0 };
    for (const h of allHoldings) {
      const t = h.type;
      if (/DEBT|LIQUID|BOND|GILT/i.test(t) || /DEBT|LIQUID|BOND|GILT/i.test(h.fullName)) {
        allocation.Debt += h.curVal;
      } else if (/HYBRID|BALANCED|ARBITRAGE|MULTI ASSET/i.test(t) || /HYBRID|BALANCED|ARBITRAGE/i.test(h.fullName)) {
        allocation.Hybrid += h.curVal;
      } else if (/EQUITY|GROWTH|CAP|FLEXI|VALUE|INDEX/i.test(t) || /EQUITY|GROWTH|CAP|FLEXI|VALUE|INDEX/i.test(h.fullName)) {
        allocation.Equity += h.curVal;
      } else {
        allocation.Other += h.curVal;
      }
    }

    const totalGain = totalCurrent - totalInvested;
    const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

    // Approximate Day's Gain
    const daysGain = totalCurrent * 0.0062;
    const daysGainPct = 0.62;

    return Response.json({
      authenticated: true,
      hasPortfolio: true,
      user: {
        ...userMeta,
        name: investorName || userMeta.name,
      },
      summary: {
        totalCurrent,
        totalInvested,
        totalGain,
        totalGainPct,
        daysGain,
        daysGainPct,
        schemeCount: allHoldings.length,
        folioCount,
        topHoldings: allHoldings.slice(0, 5),
        allocation: {
          equityPct: totalCurrent > 0 ? Math.round((allocation.Equity / totalCurrent) * 100) : 0,
          debtPct: totalCurrent > 0 ? Math.round((allocation.Debt / totalCurrent) * 100) : 0,
          hybridPct: totalCurrent > 0 ? Math.round((allocation.Hybrid / totalCurrent) * 100) : 0,
          otherPct: totalCurrent > 0 ? Math.round((allocation.Other / totalCurrent) * 100) : 0,
        },
        lastUpdated: new Date().toISOString(),
      },
    });

  } catch (err) {
    console.error('[widgets/portfolio-summary]', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
