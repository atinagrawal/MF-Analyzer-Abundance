/**
 * build-sif-screener.mjs — nightly SIF screener dataset builder.
 *
 * Runs on GitHub Actions, same job as build-screener.mjs (MF). SIF has no
 * bulk NAV-history endpoint like MF's DownloadNAVHistoryReport_Po.aspx, so
 * this fetches each scheme's history individually (only ~31 schemes today,
 * so this is fast) directly from AMFI's undocumented SIF APIs — the same
 * ones app/api/sif-nav/route.js and app/api/sif-history/route.js proxy for
 * the browser, called here directly since this script isn't a browser.
 *
 * Deliberately does NOT import from app/screener/compareEngine.js (or any
 * app/ code) — this codebase's standalone build scripts are self-contained
 * (see build-screener.mjs's own header comment), since the app's `@/` path
 * alias only resolves inside Next.js's bundler, not plain `node script.mjs`.
 * The return/risk math below is an adapted copy of
 * deriveReturnsFromSeries/deriveRiskFromSeries, not the same code — keep
 * them in sync by hand if either changes.
 *
 * Unlike MF, SIF has no pre-AMFI-era funds needing manual inception-date
 * overrides (every SIF was launched entirely within AMFI's current SIF
 * framework) — so there's no equivalent of mf_inception/mfapi.in lookups
 * here; age_years and inception both come directly from each scheme's own
 * first real NAV record.
 *
 * Env:
 *   POSTGRES_URL (optional) -> upsert into sif_screener
 */
import pg from 'pg';
import { fileURLToPath } from 'url';

const DAY_MS = 86400000;
const YEAR_MS = 365 * DAY_MS;
const AMFI_BASE = 'https://www.amfiindia.com/api';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' };

// ── NAV history parsing ─────────────────────────────────────────────────────
// Raw AMFI sif-nav-history response shape (same one app/api/sif-history's
// route.js flattens for the browser): { data: { nav_groups: [{
// historical_records: [{ date: "YYYY-MM-DD", nav: "10.1234" }] }] } }, or
// { message: "..." } when there's nothing to display for the range.
export function parseSifHistoryResponse(json) {
  if (json?.message) return [];
  const records = json?.data?.nav_groups?.[0]?.historical_records ?? [];
  return records
    .map((r) => {
      const [y, m, d] = String(r.date).split('-').map(Number);
      return { t: Date.UTC(y, m - 1, d), nav: parseFloat(r.nav) };
    })
    .filter((r) => r.nav > 0 && isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

// ── Return derivation (adapted from compareEngine.js's deriveReturnsFromSeries) ──
const PERIOD_DAYS = {
  ret_1m: 30, ret_3m: 91, ret_6m: 182,
  ret_1y: 365, ret_3y: 365 * 3, ret_5y: 365 * 5, ret_7y: 365 * 7, ret_10y: 365 * 10,
};

export function deriveSifReturns(series, asOfMs) {
  const out = {};
  // last point with t <= asOfMs
  let latest = null;
  for (const p of series) { if (p.t <= asOfMs) latest = p; else break; }
  if (!latest) return out;
  const first = series[0];

  for (const [key, days] of Object.entries(PERIOD_DAYS)) {
    const targetT = asOfMs - days * DAY_MS;
    if (targetT < first.t) { out[key] = null; continue; }
    // first point with t >= targetT
    let past = null;
    for (const p of series) { if (p.t >= targetT) { past = p; break; } }
    if (!past || past.nav <= 0) { out[key] = null; continue; }
    const years = days / 365;
    out[key] = years <= 1
      ? +(((latest.nav - past.nav) / past.nav) * 100).toFixed(2)
      : +((Math.pow(latest.nav / past.nav, 1 / years) - 1) * 100).toFixed(2);
  }
  const inceptionYears = (latest.t - first.t) / YEAR_MS;
  out.ret_inception = first.nav > 0
    ? (inceptionYears <= 1
        ? +(((latest.nav - first.nav) / first.nav) * 100).toFixed(2)
        : +((Math.pow(latest.nav / first.nav, 1 / inceptionYears) - 1) * 100).toFixed(2))
    : null;
  out.ret_inception_annualized = first.nav > 0 ? inceptionYears > 1 : null;
  out.age_years = +((asOfMs - first.t) / YEAR_MS).toFixed(1);
  out.inception_date = new Date(first.t).toISOString().slice(0, 10);
  return out;
}

// ── Risk derivation (adapted from compareEngine.js's deriveRiskFromSeries) ──
export function deriveSifRisk(series) {
  if (!series || series.length < 2) return { vol: null, max_dd: null, ret_per_risk: null };

  const byMonth = new Map();
  for (const p of series) {
    const d = new Date(p.t);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    byMonth.set(key, p);
  }
  const monthly = [...byMonth.values()].sort((a, b) => a.t - b.t);

  let vol = null;
  if (monthly.length >= 3) {
    const rets = [];
    for (let i = 1; i < monthly.length; i++) rets.push((monthly[i].nav - monthly[i - 1].nav) / monthly[i - 1].nav);
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
    vol = +(Math.sqrt(variance) * Math.sqrt(12) * 100).toFixed(2);
  }

  let peak = series[0].nav, maxDd = 0;
  for (const p of series) {
    if (p.nav > peak) peak = p.nav;
    const dd = ((p.nav - peak) / peak) * 100;
    if (dd < maxDd) maxDd = dd;
  }
  const max_dd = +maxDd.toFixed(2);

  const inception = deriveSifReturns(series, series[series.length - 1].t).ret_inception;
  const ret_per_risk = (inception != null && vol) ? +(inception / vol).toFixed(2) : null;

  return { vol, max_dd, ret_per_risk };
}

// ── 1. Scheme list (mirrors app/api/sif-nav/route.js's fetchFromAMFI) ──────
async function fetchSchemeList() {
  const res = await fetch(`${AMFI_BASE}/sif-latest-nav`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`AMFI SIF endpoint returned ${res.status}`);
  const data = await res.json();

  const schemes = [];
  for (const typeGroup of data.data ?? []) {
    for (const cat of typeGroup.categories ?? []) {
      for (const grp of cat.groups ?? []) {
        for (const s of grp.schemes ?? []) {
          if (/direct/i.test(s.NavName)) continue;
          schemes.push({
            sif_name: s.SIFName, scheme_id: s.Sd_Id, nav_name: s.NavName,
            category: s.category, nav: parseFloat(s.NetAssetValue), nav_date: s.Date,
          });
        }
      }
    }
  }
  return schemes;
}

// Same exclusion MF's build script already applies to its own scheme names
// (scripts/build-screener.mjs) -- IDCW/payout/reinvest/bonus/segregated
// plan variants are just a different distribution option on the same
// underlying scheme, not a distinct fund.
function excludeIdcw(schemes) {
  return schemes.filter((s) => !/(idcw|payout|re-?invest|bonus|segregated)\b/i.test(s.nav_name));
}

// ── 2. NAV history, wide-window-first with narrow fallback ─────────────────
// Same resilience pattern as compareEngine.js's fetchNavSeries: AMFI's
// sif-nav-history endpoint rejects a full 5-year-back request outright but
// accepts up to ~4.5 years -- try wide first (picks up a SIF's growing real
// history automatically as it ages), fall back to a safely-within-range
// window if AMFI rejects the wide one.
async function fetchSifHistory(schemeId, daysBack, toStr) {
  const fromStr = new Date(Date.now() - daysBack * DAY_MS).toISOString().slice(0, 10);
  const url = `${AMFI_BASE}/sif-nav-history?query_type=historical_period&from_date=${fromStr}&to_date=${toStr}&sd_id=${schemeId}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const json = await res.json();
  const series = parseSifHistoryResponse(json);
  return series.length >= 2 ? series : null;
}
async function fetchSifHistoryWithFallback(schemeId) {
  const toStr = new Date().toISOString().slice(0, 10);
  try {
    return (await fetchSifHistory(schemeId, 5 * 365, toStr)) || (await fetchSifHistory(schemeId, 400, toStr));
  } catch {
    try { return await fetchSifHistory(schemeId, 400, toStr); } catch { return null; }
  }
}

// Bounded concurrency -- same helper style as build-screener.mjs, keeps this
// polite to AMFI's endpoint even though the scheme count is small.
async function runConcurrent(items, fn, limit = 8) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() { while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  console.log('[sif-screener] fetching scheme list…');
  const all = await fetchSchemeList();
  const schemes = excludeIdcw(all);
  console.log(`[sif-screener] ${schemes.length} schemes after excluding IDCW/payout/reinvest/bonus/segregated (${all.length} total)`);

  console.log(`[sif-screener] fetching NAV history for ${schemes.length} schemes…`);
  let done = 0;
  const results = await runConcurrent(schemes, async (s) => {
    const series = await fetchSifHistoryWithFallback(s.scheme_id);
    process.stdout.write(`\r[sif-screener] history: ${++done}/${schemes.length}   `);
    return { scheme: s, series };
  }, 8);
  process.stdout.write('\n');

  const asOfMs = Date.now();
  const rows = results.map(({ scheme: s, series }) => {
    // Per-scheme isolation: a fetch/derivation failure for one scheme only
    // nulls that scheme's return/risk columns, never blocks the others.
    const returns = series ? deriveSifReturns(series, asOfMs) : {};
    const risk = series ? deriveSifRisk(series) : { vol: null, max_dd: null, ret_per_risk: null };
    return {
      scheme_id: s.scheme_id, nav_name: s.nav_name, sif_name: s.sif_name, category: s.category,
      nav: +s.nav.toFixed(4), nav_date: s.nav_date,
      ret_1m: returns.ret_1m ?? null, ret_3m: returns.ret_3m ?? null, ret_6m: returns.ret_6m ?? null,
      ret_1y: returns.ret_1y ?? null, ret_3y: returns.ret_3y ?? null, ret_5y: returns.ret_5y ?? null,
      ret_7y: returns.ret_7y ?? null, ret_10y: returns.ret_10y ?? null,
      vol: risk.vol, max_dd: risk.max_dd, ret_per_risk: risk.ret_per_risk,
      age_years: returns.age_years ?? null, inception_date: returns.inception_date ?? null,
      ret_inception: returns.ret_inception ?? null,
      ret_inception_annualized: returns.ret_inception_annualized ?? null,
      asof: new Date(asOfMs).toISOString().slice(0, 10),
    };
  });

  if (!process.env.POSTGRES_URL) {
    console.log(`[sif-screener] POSTGRES_URL not set, skipping DB write (${rows.length} rows computed)`);
    return;
  }

  // Safety guard: a transient upstream fetch hiccup can make `results` come
  // back empty/near-empty. Without this check the script would still exit 0
  // after DELETE-ing and committing nothing, silently wiping yesterday's good
  // data. The real universe is ~50-60 SIF schemes -- 15 is a floor well below
  // any legitimate day's count but well above a failed-fetch count of ~0.
  const MIN_EXPECTED_ROWS = 15;
  if (rows.length < MIN_EXPECTED_ROWS) {
    console.error(`[sif-screener] ABORTING: only built ${rows.length} rows (expected >= ${MIN_EXPECTED_ROWS}). Leaving existing sif_screener untouched -- likely a transient fetch failure, not a real universe shrink.`);
    process.exit(1);
  }

  const c = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query(`CREATE TABLE IF NOT EXISTS sif_screener (
    scheme_id TEXT PRIMARY KEY, nav_name TEXT NOT NULL, sif_name TEXT, category TEXT,
    nav NUMERIC, nav_date TEXT,
    ret_1m NUMERIC, ret_3m NUMERIC, ret_6m NUMERIC,
    ret_1y NUMERIC, ret_3y NUMERIC, ret_5y NUMERIC, ret_7y NUMERIC, ret_10y NUMERIC,
    vol NUMERIC, max_dd NUMERIC, ret_per_risk NUMERIC, age_years NUMERIC,
    inception_date TEXT, ret_inception NUMERIC, ret_inception_annualized BOOLEAN,
    asof TEXT
  )`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_sif_screener_category ON sif_screener (category)`);

  const COLS = ['scheme_id','nav_name','sif_name','category','nav','nav_date','ret_1m','ret_3m','ret_6m','ret_1y','ret_3y','ret_5y','ret_7y','ret_10y','vol','max_dd','ret_per_risk','age_years','inception_date','ret_inception','ret_inception_annualized','asof'];
  const N = COLS.length;
  await c.query('BEGIN');
  await c.query('DELETE FROM sif_screener');
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const vals = [], ph = [];
    chunk.forEach((r, j) => {
      ph.push('(' + COLS.map((_, k) => `$${j * N + k + 1}`).join(',') + ')');
      COLS.forEach((col) => vals.push(r[col] ?? null));
    });
    await c.query(`INSERT INTO sif_screener (${COLS.join(',')}) VALUES ${ph.join(',')}`, vals);
  }
  await c.query('COMMIT');
  await c.end();
  console.log(`[sif-screener] upserted ${rows.length} rows into Postgres`);
}
// Only run main() when this file is executed directly (`node
// scripts/build-sif-screener.mjs`), not when merely imported as a module --
// the standalone verify script imports parseSifHistoryResponse/
// deriveSifReturns/deriveSifRisk from this same file to avoid duplicating
// them, and without this guard, ES modules run ALL top-level code
// (including this main() call) on first import, which would trigger a full
// live AMFI fetch -- and, if POSTGRES_URL happened to be set in whatever
// imported this file, an unintended production database write -- as a
// side effect of what looks like a simple function import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
