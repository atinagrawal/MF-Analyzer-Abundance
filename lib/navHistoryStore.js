/**
 * Turso-backed store for the mf_nav_history table. This is the only file that
 * talks to the `mf-nav-history` Turso database directly.
 * See docs/superpowers/specs/2026-08-26-turso-nav-stock-migration-design.md.
 */

import { createClient } from '@tursodatabase/serverless/compat';

let _client = null;
function db() {
  if (!_client) {
    const url = process.env.TURSO_NAV_HISTORY_URL;
    const authToken = process.env.TURSO_NAV_HISTORY_TOKEN;
    if (!url || !authToken) throw new Error('TURSO_NAV_HISTORY_URL / TURSO_NAV_HISTORY_TOKEN required');
    _client = createClient({ url, authToken });
  }
  return _client;
}

let _ready = null;
function ensureTable() {
  if (_ready) return _ready;
  _ready = db()
    .execute(`
      CREATE TABLE IF NOT EXISTS mf_nav_history (
        code     TEXT NOT NULL,
        nav_date TEXT NOT NULL,
        nav      REAL NOT NULL,
        PRIMARY KEY (code, nav_date)
      )
    `)
    .then(() => db().execute(`CREATE INDEX IF NOT EXISTS idx_nav_history_code ON mf_nav_history (code, nav_date)`));
  return _ready;
}

export async function getLatestNav(code) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav, nav_date FROM mf_nav_history WHERE code = ? ORDER BY nav_date DESC LIMIT 1`,
    [String(code)]
  );
  return rows.length ? { nav: parseFloat(rows[0].nav), navDate: rows[0].nav_date } : null;
}

export async function getOldestNav(code) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav, nav_date FROM mf_nav_history WHERE code = ? ORDER BY nav_date ASC LIMIT 1`,
    [String(code)]
  );
  return rows.length ? { nav: parseFloat(rows[0].nav), navDate: rows[0].nav_date } : null;
}

export async function getNavAsOf(code, dateIso) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav, nav_date FROM mf_nav_history WHERE code = ? AND nav_date <= ? ORDER BY nav_date DESC LIMIT 1`,
    [String(code), dateIso]
  );
  return rows.length ? { nav: parseFloat(rows[0].nav), navDate: rows[0].nav_date } : null;
}

export async function getSeriesForCode(code) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav_date, nav FROM mf_nav_history WHERE code = ? ORDER BY nav_date ASC`,
    [String(code)]
  );
  return rows.map((r) => ({ navDate: r.nav_date, nav: parseFloat(r.nav) }));
}

export async function getSeriesForCodes(codes) {
  await ensureTable();
  if (!codes || !codes.length) return [];
  const CHUNK = 300;
  const out = [];
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK).map(String);
    const ph = slice.map(() => '?').join(',');
    const { rows } = await db().execute(
      `SELECT code, nav_date, nav FROM mf_nav_history WHERE code IN (${ph}) ORDER BY code, nav_date ASC`,
      slice
    );
    for (const r of rows) out.push({ code: r.code, navDate: r.nav_date, nav: parseFloat(r.nav) });
  }
  return out;
}

export async function getGlobalStats() {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT COUNT(*) AS total_rows, COUNT(DISTINCT code) AS total_funds, MAX(nav_date) AS latest_date FROM mf_nav_history`
  );
  const r = rows[0] || {};
  return {
    totalRows: Number(r.total_rows) || 0,
    totalFunds: Number(r.total_funds) || 0,
    latestDate: r.latest_date || null,
  };
}

export async function getDistinctCodes() {
  await ensureTable();
  const { rows } = await db().execute(`SELECT DISTINCT code FROM mf_nav_history`);
  return rows.map((r) => r.code);
}

export async function upsertRows(rows) {
  if (!rows || !rows.length) return 0;
  await ensureTable();
  const CHUNK = 300; // 3 params/row -> 900 params/chunk
  let count = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const vals = [];
    const ph = slice
      .map((r) => {
        vals.push(String(r.code), r.navDate, +Number(r.nav).toFixed(4));
        return '(?,?,?)';
      })
      .join(',');
    await db().execute(
      `INSERT INTO mf_nav_history (code, nav_date, nav) VALUES ${ph}
       ON CONFLICT (code, nav_date) DO UPDATE SET nav = excluded.nav`,
      vals
    );
    count += slice.length;
  }
  return count;
}

export async function getDb() {
  await ensureTable();
  return db();
}
