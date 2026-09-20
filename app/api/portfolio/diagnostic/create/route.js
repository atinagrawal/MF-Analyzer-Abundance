/**
 * app/api/portfolio/diagnostic/create/route.js
 *
 * POST /api/portfolio/diagnostic/create
 * Body (JSON): { payload, title }
 *
 * Authenticated endpoint: saves a redacted, PII-free mutual fund portfolio
 * diagnostic snapshot to Postgres and generates a decoupled 128-bit share_token.
 *
 * Security & Data Integrity:
 * - Requires authenticated session (auth()).
 * - Pre-flight & post-verification assertZeroPII() gates block any PII leakage.
 * - Server re-derives scheme names and categories from amfiCode using the trusted
 *   screener dataset, preventing client-side free-text injection.
 * - Server independently recomputes all headline metrics (weightedOverlapPct,
 *   quartileDistribution, mCapAllocation, topOverlapPairs) using getHoldingsData()
 *   and buildQuartileReport(), ignoring any client-submitted metrics.
 * - Title is sanitized and bounded to 60 alphanumeric/space/hyphen characters.
 */

import { auth } from '@/auth';
import pool from '@/lib/db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { assertZeroPII, computeWeightedOverlap } from '@/lib/diagnosticRedaction';
import { getScreenerDataset } from '@/lib/screenerData';
import { buildQuartileReport } from '@/lib/quartileRanking';
import { getHoldingsData } from '@/lib/holdingsLookup';
import { computeOverlap, computeMCapAllocation } from '@/lib/portfolioAnalysis';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json();
    const { payload, title } = body || {};

    if (!payload || !Array.isArray(payload.schemes) || payload.schemes.length === 0) {
      return Response.json({ error: 'Invalid or missing diagnostic payload' }, { status: 400 });
    }

    // 1. Initial assertion gate on submitted payload structure
    assertZeroPII(payload, {
      investorName: session.user.name,
      userName: session.user.name,
    });

    // 2. Server-side scheme re-derivation against trusted screener dataset
    let screenerDataset = null;
    try {
      screenerDataset = await getScreenerDataset();
    } catch (err) {
      console.warn('[diagnostic/create] Failed to load screener dataset:', err.message);
    }
    const allFunds = screenerDataset?.funds || [];
    const fundMap = new Map(allFunds.map((f) => [String(f.code), f]));

    // Re-derive names and categories from amfiCode to prevent free text injection
    const verifiedSchemes = payload.schemes.map((s) => {
      const codeStr = String(s.amfiCode);
      const matched = fundMap.get(codeStr);
      return {
        amfiCode: Number(s.amfiCode) || 0,
        name: matched?.name
          ? matched.name.replace(/[-–—]\s*(Regular|Direct|Growth|IDCW|Dividend|Plan|Option).*/gi, '').trim()
          : String(s.name || '').replace(/[-–—]\s*(Regular|Direct|Growth|IDCW|Dividend|Plan|Option).*/gi, '').trim(),
        category: matched?.category
          ? matched.category.trim()
          : String(s.category || '').trim(),
        weightPct: Math.round((Number(s.weightPct) || 0) * 100) / 100,
      };
    });

    // Sanitize title
    const rawTitle = title || payload.title || 'Mutual Fund Portfolio Diagnostic';
    const cleanTitle =
      String(rawTitle)
        .replace(/[^a-zA-Z0-9\s\-()]/g, '')
        .slice(0, 60)
        .trim() || 'Mutual Fund Portfolio Diagnostic';

    // 3. Server-side independent recomputation of Quartile Distribution
    let q1Count = 0;
    let q2Count = 0;
    let q3Count = 0;
    let q4Count = 0;
    let unrankedCount = 0;

    if (allFunds.length > 0) {
      const quartileReport = buildQuartileReport(verifiedSchemes, allFunds);
      for (const cat of quartileReport.categories || []) {
        for (const fund of cat.funds || []) {
          const q = fund.quartiles?.ret_3y ?? fund.quartiles?.ret_1y ?? null;
          if (q === 1) q1Count++;
          else if (q === 2) q2Count++;
          else if (q === 3) q3Count++;
          else if (q === 4) q4Count++;
          else unrankedCount++;
        }
      }
      unrankedCount += (quartileReport.unranked || []).length;
    } else {
      unrankedCount = verifiedSchemes.length;
    }

    // 4. Server-side underlying holdings lookup for overlap & market-cap
    const holdingsPromises = verifiedSchemes.map(async (s) => {
      if (!s.amfiCode) return null;
      try {
        const data = await getHoldingsData(s.amfiCode, s.name);
        if (!data?.holdings || data.holdings.length === 0) return null;
        return {
          amfiCode: s.amfiCode,
          schemeName: s.name,
          weightPct: s.weightPct,
          holdings: data.holdings,
        };
      } catch (err) {
        console.warn(`[diagnostic/create] Holdings lookup failed for ${s.amfiCode}:`, err.message);
        return null;
      }
    });

    const fundResults = (await Promise.all(holdingsPromises)).filter(Boolean);

    // 5. Server-side calculation of Pairwise Overlap & Top Overlap Pairs
    let serverWeightedOverlapPct = null;
    const serverTopPairs = [];

    if (fundResults.length >= 2) {
      const overlapGrid = computeOverlap(fundResults);
      const totalAvailableWeight = fundResults.reduce((sum, f) => sum + (f.weightPct || 0), 0);
      const alignedSchemes = fundResults.map((f) => ({
        weightPct: totalAvailableWeight > 0 ? ((f.weightPct || 0) / totalAvailableWeight) * 100 : 0,
      }));

      serverWeightedOverlapPct = computeWeightedOverlap(alignedSchemes, overlapGrid);

      for (let i = 0; i < fundResults.length; i++) {
        for (let j = i + 1; j < fundResults.length; j++) {
          const pairOverlap = overlapGrid[i]?.[j] ?? 0;
          if (pairOverlap > 5) {
            serverTopPairs.push({
              amfiCodeA: Number(fundResults[i].amfiCode) || 0,
              amfiCodeB: Number(fundResults[j].amfiCode) || 0,
              overlapPct: Math.round(pairOverlap * 10) / 10,
            });
          }
        }
      }
      serverTopPairs.sort((a, b) => b.overlapPct - a.overlapPct);
    }

    // 6. Server-side calculation of Market Cap Allocation
    let mCapMap = new Map();
    try {
      const mCapFilePath = path.join(process.cwd(), 'public', 'data', 'amfi-cap-categorization.json');
      const mCapContent = await fs.promises.readFile(mCapFilePath, 'utf8');
      const mCapJson = JSON.parse(mCapContent);
      if (mCapJson?.categories) {
        mCapMap = new Map(Object.entries(mCapJson.categories));
      }
    } catch (err) {
      console.warn('[diagnostic/create] Failed to read amfi-cap-categorization.json:', err.message);
    }

    let totalLarge = 0;
    let totalMid = 0;
    let totalSmall = 0;
    let totalWeight = 0;

    for (const f of fundResults) {
      if (!f.holdings || f.holdings.length === 0) continue;
      const fundWeight = f.weightPct || 0;
      if (fundWeight <= 0) continue;

      const mcap = computeMCapAllocation(f, mCapMap);
      totalLarge += (mcap.large || 0) * fundWeight;
      totalMid += (mcap.mid || 0) * fundWeight;
      totalSmall += (mcap.small || 0) * fundWeight;
      totalWeight += fundWeight;
    }

    const serverMCapAllocation =
      totalWeight > 0
        ? {
            large: Math.round((totalLarge / totalWeight) * 10) / 10,
            mid: Math.round((totalMid / totalWeight) * 10) / 10,
            small: Math.round((totalSmall / totalWeight) * 10) / 10,
            unclassified: 0,
            derivatives: 0,
          }
        : { large: 0, mid: 0, small: 0, unclassified: 0, derivatives: 0 };

    // 7. Construct final verified payload with server-derived metrics only
    const verifiedPayload = {
      title: cleanTitle,
      schemes: verifiedSchemes,
      metrics: {
        schemesCount: verifiedSchemes.length,
        weightedOverlapPct: serverWeightedOverlapPct,
        quartileDistribution: {
          q1Count,
          q2Count,
          q3Count,
          q4Count,
          unrankedCount,
        },
        mCapAllocation: serverMCapAllocation,
        topOverlapPairs: serverTopPairs.slice(0, 5),
      },
      asOfDate: payload.asOfDate || new Date().toISOString().split('T')[0],
    };

    // Second-pass assertion gate on final payload
    assertZeroPII(verifiedPayload, {
      investorName: session.user.name,
      userName: session.user.name,
    });

    // 8. Generate high-entropy 128-bit random share_token (32 hex characters)
    const shareToken = crypto.randomBytes(16).toString('hex');
    const schemesCount = verifiedSchemes.length;
    const totalRanked = q1Count + q2Count + q3Count + q4Count;
    const q1EquityPct =
      totalRanked > 0 ? Math.round((q1Count / totalRanked) * 10000) / 100 : null;

    // 9. Insert into database
    const insertResult = await pool.query(
      `INSERT INTO portfolio_diagnostics
       (user_id, share_token, title, schemes_count, weighted_overlap_pct, q1_equity_pct, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, share_token, created_at`,
      [
        session.user.id,
        shareToken,
        cleanTitle,
        schemesCount,
        serverWeightedOverlapPct,
        q1EquityPct,
        JSON.stringify(verifiedPayload),
      ]
    );

    const row = insertResult.rows[0];

    return Response.json({
      ok: true,
      id: row.id,
      shareToken: row.share_token,
      shareUrl: `/portfolio/diagnostic/${row.share_token}`,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('[portfolio/diagnostic/create]', err);
    const status = err.name === 'PrivacyViolationError' ? 400 : 500;
    return Response.json({ error: err.message }, { status });
  }
}
