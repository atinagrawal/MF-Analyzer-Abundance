/**
 * build-screener.mjs — nightly MF screener dataset builder.
 *
 * Runs on GitHub Actions (free for public repos, 6h job limit) — NOT on Vercel,
 * because it makes ~60 bulk fetches (~2-3 min wall time) which exceeds Hobby
 * function limits. It writes the precomputed dataset to Postgres (and a JSON
 * fallback); the Vercel app then just does a fast read.
 *
 * Data sources (bulk — never per-fund except for new inception lookups):
 *   1. AMFI NAVAll.txt                         -> universe + SEBI category + AMC + latest NAV
 *   2. AMFI DownloadNAVHistoryReport_Po.aspx   -> all-fund NAV for any date (returns + risk)
 *   3. mfapi.in (per-fund, incremental only)   -> oldest NAV record = inception date proxy
 *
 * Universe: Regular plan + Growth option only (Direct and income options hidden).
 *
 * Env:
 *   POSTGRES_URL  (optional) -> upsert into mf_screener + mf_inception
 *   MONTHS        (optional, default 60) -> months of month-end history for risk
 *   OUT           (optional, default data/screener.json)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
const MNAME = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const Y = 365.25 * 864e5;
const MONTHS = +(process.env.MONTHS || 60);
const OUT = process.env.OUT || "data/screener.json";

// AMFI date format DD-MMM-YYYY -> UTC ms
const pd = (s) => { const m = /(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(s); return m ? Date.UTC(+m[3], MON[m[2]], +m[1]) : null; };
const fmt = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2,"0")}-${MNAME[d.getUTCMonth()]}-${d.getUTCFullYear()}`; };
// ISO date YYYY-MM-DD -> UTC ms
const parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-'); return Date.UTC(+y, +m - 1, +d); };
// mfapi.in date DD-MM-YYYY -> YYYY-MM-DD
const toISO = (s) => { if (!s) return null; const [dd, mm, yy] = s.split('-'); return `${yy}-${mm}-${dd}`; };

// Manual inception date overrides for pre-AMFI-records funds (keyed by AMFI scheme code).
// After a first run, check data/mf-inception-needs-review.json for funds needing entries here.
const OVERRIDES_PATH = path.join(__dirname, '..', 'data', 'mf-inception-overrides.json');
let OVERRIDES = {};
try {
  const raw = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  // Support both flat {code:{...}} and nested {overrides:{code:{...}}} formats.
  // Filter to numeric scheme codes only so metadata keys (_comment, _format) are ignored.
  const src = (raw.overrides && Object.keys(raw.overrides).length > 0) ? raw.overrides : raw;
  for (const [k, v] of Object.entries(src)) { if (/^\d+$/.test(k)) OVERRIDES[k] = v; }
} catch (_) {}

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(45000) });
      if (r.ok) { const t = await r.text(); if (t && t.length > 500) return t; }
    } catch (e) { /* retry */ }
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw new Error("fetch failed: " + url);
}

/* ---- 1. latest universe (Regular + Growth) ---- */
function parseUniverse(txt) {
  const out = new Map(); let cat = null, structure = null, amc = null;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("Scheme Code;")) continue;
    if (!line.includes(";")) {
      if (/Schemes?\s*\(/i.test(line)) {
        const m = line.match(/^(.*?Schemes?)\s*\((.*)\)\s*$/i);
        if (m) { structure = m[1].replace(/Schemes?$/i, "").trim(); cat = m[2].trim(); }
        else { cat = line.trim(); structure = ""; }
      } else { amc = line.trim(); }
      continue;
    }
    const p = line.split(";"); if (p.length < 6) continue;
    const name = p[3].replace(/\s+/g, " ").trim();
    if (!/growth/i.test(name)) continue;
    if (/direct/i.test(name)) continue;

    const isDivYield = /dividend yield/i.test(cat);
    if (/(idcw|payout|re-?invest|bonus|segregated)\b/i.test(name)) continue;
    if (!isDivYield && /\bdividend\b/i.test(name)) continue;

    const nav = +p[4]; if (!isFinite(nav) || nav <= 0) continue;
    out.set(p[0], { code: p[0], name, amc, cat, structure, nav, navDate: pd(p[5]), isin: p[1] });
  }
  return out;
}

/* ---- 2. all-fund NAV as-of a date (last NAV <= anchor within a small window) ---- */
async function navAsOf(anchorMs) {
  const to = anchorMs, from = anchorMs - 8 * 864e5;
  const txt = await fetchText(`https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=${fmt(from)}&todt=${fmt(to)}`);
  const map = {};
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/\r$/, ""); if (!line.includes(";")) continue;
    const p = line.split(";"); if (p.length < 8) continue;
    const code = p[0], nav = +p[4], d = pd(p[7]);
    if (!isFinite(nav) || nav <= 0 || !d || d > anchorMs) continue;
    if (!map[code] || d > map[code].d) map[code] = { nav, d };
  }
  return map;
}

const lastOfMonth = (y, m) => Date.UTC(y, m + 1, 0);
function monthEndAnchors(now, n) {
  const d = new Date(now), out = [];
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  for (let i = 0; i < n; i++) { out.push(lastOfMonth(y, m)); if (--m < 0) { m = 11; y--; } }
  return out.reverse(); // oldest -> newest
}

const cagr = (now, then, yrs) => (then && now ? Math.pow(now / then, 1 / yrs) - 1 : null);

function riskFrom(series) { // series: [{t,nav}] ascending, month-end
  if (series.length < 13) return { vol: null, maxdd: null };
  const rets = [];
  for (let i = 1; i < series.length; i++) rets.push(series[i].nav / series[i - 1].nav - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(12);
  let peak = series[0].nav, maxdd = 0;
  for (const s of series) { if (s.nav > peak) peak = s.nav; const dd = s.nav / peak - 1; if (dd < maxdd) maxdd = dd; }
  return { vol, maxdd };
}

/* ---- 3. mfapi.in inception date fetcher (per fund, used only for new codes) ---- */
async function fetchMfapiInception(code) {
  try {
    const r = await fetch(`https://api.mfapi.in/mf/${code}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 'SUCCESS' || !j.data?.length) return null;
    const oldest = j.data[j.data.length - 1]; // data is newest-first; last = oldest
    const nav = parseFloat(oldest.nav);
    if (!isFinite(nav) || nav <= 0) return null;
    return { date: toISO(oldest.date), nav };
  } catch (_) { return null; }
}

// Bounded concurrency runner — avoids slamming mfapi.in
async function runConcurrent(items, fn, limit = 10) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  // ---- inceptionMap: code -> { date: 'YYYY-MM-DD', nav: number, source: 'manual'|'mfapi'|'estimated' } ----
  const inceptionMap = {};
  for (const [code, ov] of Object.entries(OVERRIDES)) {
    inceptionMap[code] = { date: ov.inception_date, nav: ov.inception_nav ?? 10, source: 'manual' };
  }

  // ---- connect to Postgres early so we can load existing inception records ----
  let c = null;
  if (process.env.POSTGRES_URL) {
    const { default: pg } = await import("pg");
    c = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();

    await c.query(`CREATE TABLE IF NOT EXISTS mf_inception (
      code           TEXT PRIMARY KEY,
      inception_date TEXT    NOT NULL,
      inception_nav  NUMERIC NOT NULL,
      source         TEXT    NOT NULL
    )`);

    const { rows: existing } = await c.query(
      `SELECT code, inception_date, inception_nav::float AS inception_nav, source FROM mf_inception`
    );
    for (const r of existing) {
      // Skip DB records that have an April 2006 date as source='mfapi' — these are funds that
      // predate AMFI's digital records and need to be re-evaluated with the corrected logic.
      if (!inceptionMap[r.code] && !(r.source === 'mfapi' && r.inception_date.startsWith('2006-04'))) {
        inceptionMap[r.code] = { date: r.inception_date, nav: r.inception_nav, source: r.source };
      }
    }
    console.log(`[screener] loaded ${existing.length} existing inception records`);

    // Upsert manual overrides so the DB reflects the correct date/source even for funds
    // that were already stored as source='estimated' from a previous run.
    const overrideEntries = Object.entries(OVERRIDES);
    if (c && overrideEntries.length > 0) {
      await c.query('BEGIN');
      for (const [code, ov] of overrideEntries) {
        await c.query(
          `INSERT INTO mf_inception (code, inception_date, inception_nav, source)
           VALUES ($1,$2,$3,'manual')
           ON CONFLICT (code) DO UPDATE SET inception_date=$2, inception_nav=$3, source='manual'`,
          [code, ov.inception_date, ov.inception_nav ?? 10]
        );
      }
      await c.query('COMMIT');
      console.log(`[screener] upserted ${overrideEntries.length} manual inception overrides`);
    }
  }

  // ---- 1. universe ----
  console.log("[screener] fetching universe…");
  const uni = parseUniverse(await fetchText("https://portal.amfiindia.com/spages/NAVAll.txt"));
  const now = Math.max(...[...uni.values()].map((f) => f.navDate || 0));

  let removed = 0;
  for (const [code, f] of uni.entries()) {
    if (!f.navDate || (now - f.navDate) > 14 * 864e5) { uni.delete(code); removed++; }
  }
  console.log(`[screener] universe = ${uni.size} regular-growth funds (removed ${removed} inactive), asof ${fmt(now)}`);

  // ---- fetch inception from mfapi.in for codes not yet in our map ----
  const toFetch = [...uni.keys()].filter((code) => !inceptionMap[code]);
  if (toFetch.length > 0) {
    console.log(`[screener] fetching inception dates for ${toFetch.length} new funds from mfapi.in…`);
    let done = 0;
    const results = await runConcurrent(toFetch, async (code) => {
      const data = await fetchMfapiInception(code);
      process.stdout.write(`\r[screener] inception: ${++done}/${toFetch.length}   `);
      if (!data) return { code, data: null };
      // AMFI digital records begin in April 2006. Any fund whose oldest mfapi.in date
      // falls in that month almost certainly predates those records — flag as estimated
      // so the true inception date can be looked up and added to the overrides file.
      const isAmfiRecordsStart = data.date.startsWith('2006-04');
      const source = (data.nav <= 10.2 && !isAmfiRecordsStart) ? 'mfapi' : 'estimated';
      return { code, data, source };
    }, 10);
    process.stdout.write('\n');

    const newEntries = [];
    const needsReview = [];
    for (const { code, data, source } of results) {
      if (!data) continue;
      inceptionMap[code] = { date: data.date, nav: data.nav, source };
      newEntries.push({ code, date: data.date, nav: data.nav, source });
      // Anything > 10.05 should be manually verified just to be safe
      if (source === 'estimated' || data.nav > 10.05) {
        needsReview.push({ code, name: uni.get(code)?.name, oldest_amfi_date: data.date, oldest_amfi_nav: data.nav });
      }
    }

    // write needs-review list so operator can add manual overrides
    if (needsReview.length > 0) {
      const reviewPath = path.join(__dirname, '..', 'data', 'mf-inception-needs-review.json');
      fs.writeFileSync(reviewPath, JSON.stringify(needsReview, null, 2));
      console.log(`[screener] ${needsReview.length} funds need manual inception dates → data/mf-inception-needs-review.json`);
    }

    // upsert new inception entries into Postgres
    if (c && newEntries.length > 0) {
      await c.query('BEGIN');
      for (const { code, date, nav, source } of newEntries) {
        await c.query(
          `INSERT INTO mf_inception (code, inception_date, inception_nav, source)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (code) DO UPDATE SET inception_date=$2, inception_nav=$3, source=$4`,
          [code, date, nav, source]
        );
      }
      await c.query('COMMIT');
      console.log(`[screener] upserted ${newEntries.length} inception records`);
    }
  }

  // ---- 2. return anchors ----
  console.log("[screener] fetching return anchors (1M…10Y)…");
  const D = 864e5;
  const ANCHORS = [
    { key: "ret_1m", t: now - 30 * D, yrs: null },
    { key: "ret_3m", t: now - 91 * D, yrs: null },
    { key: "ret_6m", t: now - 182 * D, yrs: null },
    { key: "ret_1y", t: now - 1 * Y, yrs: 1 },
    { key: "ret_3y", t: now - 3 * Y, yrs: 3 },
    { key: "ret_5y", t: now - 5 * Y, yrs: 5 },
    { key: "ret_7y", t: now - 7 * Y, yrs: 7 },
    { key: "ret_10y", t: now - 10 * Y, yrs: 10 },
  ];
  const aMap = {};
  for (const a of ANCHORS) { aMap[a.key] = await navAsOf(a.t); process.stdout.write("."); }
  process.stdout.write("\n");

  // ---- 3. monthly risk snapshots ----
  console.log(`[screener] fetching ${MONTHS} month-end snapshots for risk…`);
  const anchors = monthEndAnchors(now, MONTHS);
  const monthly = {}; // code -> [{t,nav}]
  for (const t of anchors) {
    const m = await navAsOf(Math.min(t, now));
    for (const code of Object.keys(m)) (monthly[code] ||= []).push({ t, nav: m[code].nav });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  // ---- 4. build rows ----
  const rows = [];
  for (const f of uni.values()) {
    const ret = {};
    for (const a of ANCHORS) {
      const then = aMap[a.key][f.code]?.nav;
      ret[a.key] = then ? (a.yrs ? Math.pow(f.nav / then, 1 / a.yrs) - 1 : f.nav / then - 1) : null;
    }
    const { vol, maxdd } = riskFrom((monthly[f.code] || []).sort((a, b) => a.t - b.t));
    const ser = monthly[f.code] || [];
    const pc = (x) => (x == null ? null : +(x * 100).toFixed(2));
    const r3 = ret.ret_3y;

    // since-inception CAGR: (current_nav / inception_nav)^(1/years) - 1
    const inc = inceptionMap[f.code];
    const incTs = inc ? parseISO(inc.date) : null;
    const incYears = incTs ? (now - incTs) / Y : null;
    const retInception = (inc && incYears > 0.5) ? pc(Math.pow(f.nav / inc.nav, 1 / incYears) - 1) : null;
    // age from true inception if available, otherwise from oldest monthly snapshot
    const ageYears = incTs ? (now - incTs) / Y : (ser.length ? (now - ser[0].t) / Y : null);

    rows.push({
      code: f.code, name: f.name, amc: f.amc, category: f.cat, structure: f.structure,
      nav: +f.nav.toFixed(4), nav_date: f.navDate ? fmt(f.navDate) : null,
      ret_1m: pc(ret.ret_1m), ret_3m: pc(ret.ret_3m), ret_6m: pc(ret.ret_6m),
      ret_1y: pc(ret.ret_1y), ret_3y: pc(r3), ret_5y: pc(ret.ret_5y),
      ret_7y: pc(ret.ret_7y), ret_10y: pc(ret.ret_10y),
      vol: vol == null ? null : +(vol * 100).toFixed(2),
      max_dd: maxdd == null ? null : +(maxdd * 100).toFixed(2),
      ret_per_risk: vol && r3 != null ? +(r3 / vol).toFixed(2) : null,
      age_years: ageYears == null ? null : +ageYears.toFixed(1),
      inception_date: inc?.date || null,
      ret_inception: retInception,
      // data-hygiene flag: implausible 1Y move (often a stale/glitched intl-FoF NAV) → review
      flag: (ret.ret_1y != null && (ret.ret_1y > 1.5 || ret.ret_1y < -0.6)) ? "check" : null,
      asof: fmt(now),
    });
  }
  rows.sort((a, b) => (b.ret_3y ?? -999) - (a.ret_3y ?? -999));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ asof: fmt(now), count: rows.length, funds: rows }));
  console.log(`[screener] wrote ${rows.length} funds -> ${OUT}`);

  if (c) {
    await c.query(`CREATE TABLE IF NOT EXISTS mf_screener (
      code TEXT PRIMARY KEY, name TEXT NOT NULL, amc TEXT, category TEXT, structure TEXT,
      nav NUMERIC, nav_date TEXT,
      ret_1m NUMERIC, ret_3m NUMERIC, ret_6m NUMERIC,
      ret_1y NUMERIC, ret_3y NUMERIC, ret_5y NUMERIC, ret_7y NUMERIC, ret_10y NUMERIC,
      vol NUMERIC, max_dd NUMERIC, ret_per_risk NUMERIC, age_years NUMERIC,
      inception_date TEXT, ret_inception NUMERIC,
      flag TEXT, asof TEXT
    )`);
    // migrate existing tables that predate these columns
    for (const [col, type] of [
      ["ret_1m","NUMERIC"],["ret_3m","NUMERIC"],["ret_6m","NUMERIC"],
      ["ret_7y","NUMERIC"],["ret_10y","NUMERIC"],
      ["inception_date","TEXT"],["ret_inception","NUMERIC"],
    ]) {
      await c.query(`ALTER TABLE mf_screener ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }
    await c.query(`CREATE INDEX IF NOT EXISTS idx_mf_screener_category ON mf_screener (category)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_mf_screener_structure ON mf_screener (structure)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_mf_screener_ret3y ON mf_screener (ret_3y)`);

    const COLS = ["code","name","amc","category","structure","nav","nav_date","ret_1m","ret_3m","ret_6m","ret_1y","ret_3y","ret_5y","ret_7y","ret_10y","vol","max_dd","ret_per_risk","age_years","inception_date","ret_inception","flag","asof"];
    const N = COLS.length;
    await c.query("BEGIN");
    await c.query("DELETE FROM mf_screener");
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const vals = [], ph = [];
      chunk.forEach((r, j) => {
        ph.push("(" + COLS.map((_, k) => `$${j * N + k + 1}`).join(",") + ")");
        COLS.forEach((col) => vals.push(r[col] ?? null));
      });
      await c.query(`INSERT INTO mf_screener (${COLS.join(",")}) VALUES ${ph.join(",")}`, vals);
    }
    await c.query("COMMIT");
    await c.end();
    console.log(`[screener] upserted ${rows.length} rows into Postgres`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
