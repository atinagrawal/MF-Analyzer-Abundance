/**
 * lib/screenerData.js
 *
 * Server-only module for fetching, caching, and preparing the mutual fund screener dataset.
 * Used by:
 *   - app/screener/page.js (SSR / initial data hydration)
 *   - app/api/screener/route.js (API endpoint for client fallback / external consumers)
 *
 * Caches in-memory for 1 hour to eliminate cold-start DB latency during repeated SSR renders.
 */

import pool from '@/lib/db';
import { getBenchmarkDataset, FALLBACK_BENCHMARKS } from '@/lib/benchmarks';
import { sharpeRatio } from '@/lib/riskFreeRate';

let cachedDataset = null;
let cachedTs = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const COLS = 'code,name,amc,category,structure,isin,nav,nav_date,ret_1m,ret_3m,ret_6m,ret_1y,ret_3y,ret_5y,ret_7y,ret_10y,vol,max_dd,ret_per_risk,age_years,vol_1y,vol_3y,vol_5y,inception_date,ret_inception,flag,asof';

export async function getScreenerDataset(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDataset && (now - cachedTs < CACHE_TTL_MS)) {
    return cachedDataset;
  }

  try {
    const [screenerRes, stressRes, benchmarks] = await Promise.all([
      pool.query(`SELECT ${COLS} FROM mf_screener ORDER BY ret_3y DESC NULLS LAST`),
      pool.query(`
        SELECT scheme_code, days_50pct, days_25pct
        FROM mf_stress_test
        WHERE month = (SELECT MAX(month) FROM mf_stress_test)
      `).catch((err) => {
        console.warn('[getScreenerDataset] Stress test query failed:', err.message);
        return { rows: [] };
      }),
      getBenchmarkDataset().catch((err) => {
        console.warn('[getScreenerDataset] Benchmark query failed:', err.message);
        return FALLBACK_BENCHMARKS;
      }),
    ]);

    // node-postgres returns NUMERIC columns as STRINGS (to preserve precision).
    // Coerce to numbers so client formatting and math work reliably.
    const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

    const funds = (screenerRes.rows || []).map((r) => {
      const ret_1y = num(r.ret_1y), ret_3y = num(r.ret_3y), ret_5y = num(r.ret_5y);
      const vol_1y = num(r.vol_1y), vol_3y = num(r.vol_3y), vol_5y = num(r.vol_5y);
      return {
        code: r.code,
        name: r.name,
        amc: r.amc,
        category: r.category,
        structure: r.structure,
        isin: r.isin,
        nav: num(r.nav),
        nav_date: r.nav_date,
        ret_1m: num(r.ret_1m),
        ret_3m: num(r.ret_3m),
        ret_6m: num(r.ret_6m),
        ret_1y,
        ret_3y,
        ret_5y,
        ret_7y: num(r.ret_7y),
        ret_10y: num(r.ret_10y),
        vol: num(r.vol),
        max_dd: num(r.max_dd),
        ret_per_risk: num(r.ret_per_risk),
        age_years: num(r.age_years),
        vol_1y,
        vol_3y,
        vol_5y,
        sharpe_1y: sharpeRatio(ret_1y, vol_1y),
        sharpe_3y: sharpeRatio(ret_3y, vol_3y),
        sharpe_5y: sharpeRatio(ret_5y, vol_5y),
        inception_date: r.inception_date || null,
        ret_inception: num(r.ret_inception),
        flag: r.flag,
        asof: r.asof,
      };
    });

    const stressMap = {};
    for (const r of (stressRes.rows || [])) {
      stressMap[r.scheme_code] = {
        days_50pct: num(r.days_50pct),
        days_25pct: num(r.days_25pct),
      };
    }

    const asof = funds.length ? funds[0].asof : null;

    cachedDataset = {
      asof,
      count: funds.length,
      funds,
      benchmarks: benchmarks || FALLBACK_BENCHMARKS,
      stressMap,
    };
    cachedTs = now;
    return cachedDataset;
  } catch (err) {
    console.error('[getScreenerDataset] Database fetch failed:', err);
    if (cachedDataset) {
      console.warn('[getScreenerDataset] Serving stale dataset from cache.');
      return cachedDataset;
    }
    // Fallback to local data/screener.json if DB is unavailable on cold start
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'data', 'screener.json');
      if (fs.existsSync(filePath)) {
        console.warn('[getScreenerDataset] Serving fallback dataset from data/screener.json');
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const fallbackFunds = (raw.funds || []).map((f) => {
          const r1 = num(f.ret_1y), r3 = num(f.ret_3y), r5 = num(f.ret_5y);
          const v1 = num(f.vol_1y), v3 = num(f.vol_3y), v5 = num(f.vol_5y);
          return {
            ...f,
            ret_1y: r1,
            ret_3y: r3,
            ret_5y: r5,
            vol_1y: v1,
            vol_3y: v3,
            vol_5y: v5,
            sharpe_1y: sharpeRatio(r1, v1),
            sharpe_3y: sharpeRatio(r3, v3),
            sharpe_5y: sharpeRatio(r5, v5),
          };
        });
        cachedDataset = {
          asof: raw.asof || null,
          count: fallbackFunds.length,
          funds: fallbackFunds,
          benchmarks: FALLBACK_BENCHMARKS,
          stressMap: {},
        };
        cachedTs = now;
        return cachedDataset;
      }
    } catch (fallbackErr) {
      console.error('[getScreenerDataset] Local fallback failed:', fallbackErr.message);
    }
    throw err;
  }
}
