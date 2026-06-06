/**
 * build-screener.mjs — nightly MF screener dataset builder.
 *
 * Runs on GitHub Actions (free for public repos, 6h job limit) — NOT on Vercel,
 * because it makes ~60 bulk fetches (~2-3 min wall time) which exceeds Hobby
 * function limits. It writes the precomputed dataset to Postgres (and a JSON
 * fallback); the Vercel app then just does a fast read.
 *
 * Data sources (both bulk — never per-fund):
 *   1. AMFI NAVAll.txt                         -> universe + SEBI category + AMC + latest NAV
 *   2. AMFI DownloadNAVHistoryReport_Po.aspx   -> all-fund NAV for any date (returns + risk)
 *
 * Universe: Regular plan + Growth option only (Direct and income options hidden).
 *
 * Env:
 *   POSTGRES_URL  (optional) -> upsert into mf_screener
 *   MONTHS        (optional, default 60) -> months of month-end history for risk
 *   OUT           (optional, default data/screener.json)
 */
import fs from "fs";
import path from "path";

const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
const MNAME = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const Y = 365.25 * 864e5;
const MONTHS = +(process.env.MONTHS || 60);
const OUT = process.env.OUT || "data/screener.json";

const pd = (s) => { const m = /(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(s); return m ? Date.UTC(+m[3], MON[m[2]], +m[1]) : null; };
const fmt = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2,"0")}-${MNAME[d.getUTCMonth()]}-${d.getUTCFullYear()}`; };

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
    // Regular + Growth only — hide Direct and income/dividend variants
    if (!/growth/i.test(name)) continue;
    if (/direct/i.test(name)) continue;
    if (/(idcw|dividend|payout|re-?invest|bonus|segregated)/i.test(name)) continue;
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

async function main() {
  console.log("[screener] fetching universe…");
  const uni = parseUniverse(await fetchText("https://portal.amfiindia.com/spages/NAVAll.txt"));
  const now = Math.max(...[...uni.values()].map((f) => f.navDate || 0));
  console.log(`[screener] universe = ${uni.size} regular-growth funds, asof ${fmt(now)}`);

  console.log("[screener] fetching return anchors (1Y/3Y/5Y)…");
  const [a1, a3, a5] = await Promise.all([
    navAsOf(now - 1 * Y), navAsOf(now - 3 * Y), navAsOf(now - 5 * Y),
  ]);

  console.log(`[screener] fetching ${MONTHS} month-end snapshots for risk…`);
  const anchors = monthEndAnchors(now, MONTHS);
  const monthly = {}; // code -> [{t,nav}]
  for (const t of anchors) {
    const m = await navAsOf(Math.min(t, now));
    for (const code of Object.keys(m)) (monthly[code] ||= []).push({ t, nav: m[code].nav });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  const rows = [];
  for (const f of uni.values()) {
    const r1 = cagr(f.nav, a1[f.code]?.nav, 1);
    const r3 = cagr(f.nav, a3[f.code]?.nav, 3);
    const r5 = cagr(f.nav, a5[f.code]?.nav, 5);
    const { vol, maxdd } = riskFrom((monthly[f.code] || []).sort((a, b) => a.t - b.t));
    const ser = monthly[f.code] || [];
    const ageYears = ser.length ? (now - ser[0].t) / Y : null;
    rows.push({
      code: f.code, name: f.name, amc: f.amc, category: f.cat, structure: f.structure,
      nav: +f.nav.toFixed(4), nav_date: f.navDate ? fmt(f.navDate) : null,
      ret_1y: r1 == null ? null : +(r1 * 100).toFixed(2),
      ret_3y: r3 == null ? null : +(r3 * 100).toFixed(2),
      ret_5y: r5 == null ? null : +(r5 * 100).toFixed(2),
      vol: vol == null ? null : +(vol * 100).toFixed(2),
      max_dd: maxdd == null ? null : +(maxdd * 100).toFixed(2),
      ret_per_risk: vol && r3 != null ? +(r3 / vol).toFixed(2) : null,
      age_years: ageYears == null ? null : +ageYears.toFixed(1),
      // data-hygiene flag: implausible 1Y move (often a stale/glitched intl-FoF NAV) → review
      flag: (r1 != null && (r1 > 1.5 || r1 < -0.6)) ? "check" : null,
      asof: fmt(now),
    });
  }
  rows.sort((a, b) => (b.ret_3y ?? -999) - (a.ret_3y ?? -999));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ asof: fmt(now), count: rows.length, funds: rows }));
  console.log(`[screener] wrote ${rows.length} funds -> ${OUT}`);

  if (process.env.POSTGRES_URL) {
    const { default: pg } = await import("pg");
    const c = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const COLS = ["code","name","amc","category","structure","nav","nav_date","ret_1y","ret_3y","ret_5y","vol","max_dd","ret_per_risk","age_years","flag","asof"];
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
