import pg from 'pg';
import fs from 'fs';
import path from 'path';

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

async function main() {
  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const lineagePath = path.join(process.cwd(), 'data', 'scheme-lineage.json');
  const LINEAGE = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));

  const overridesPath = path.join(process.cwd(), 'data', 'mf-inception-overrides.json');
  const OVERRIDES = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

  const codes = Object.keys(LINEAGE);
  console.log(`Checking ${codes.length} lineage codes in mf_screener...`);

  const D = 864e5;
  const Y = 365.25 * D;

  for (const code of codes) {
    const scrRes = await client.query('SELECT * FROM mf_screener WHERE code = $1', [code]);
    if (!scrRes.rows.length) continue;
    const f = scrRes.rows[0];

    const histRes = await client.query(
      'SELECT nav_date, nav FROM mf_nav_history WHERE code = $1 ORDER BY nav_date ASC',
      [code]
    );
    if (!histRes.rows.length) continue;

    // Fetch live mfapi series for current modern NAVs
    let mfapiData = [];
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${code}`);
      const json = await res.json();
      if (json && json.data) {
        mfapiData = json.data.map(d => {
          const [dd, mm, yy] = d.date.split('-').map(Number);
          return { t: Date.UTC(yy, mm - 1, dd), nav: parseFloat(d.nav), date: d.date };
        }).filter(p => !isNaN(p.nav) && p.nav > 0);
      }
    } catch (e) {}

    const dbData = histRes.rows.map(r => ({
      t: new Date(r.nav_date).getTime(),
      nav: parseFloat(r.nav),
      date: r.nav_date
    })).filter(r => !isNaN(r.nav) && r.nav > 0);

    const tMap = new Map();
    for (const p of dbData) tMap.set(p.t, p);
    for (const p of mfapiData) tMap.set(p.t, p);
    const series = Array.from(tMap.values()).sort((a, b) => a.t - b.t);

    if (!series.length) continue;

    const latest = series[series.length - 1];
    const now = latest.t;
    const currentNav = parseFloat(f.nav) || latest.nav;

    function getNavAtOrBefore(targetT) {
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i].t <= targetT) {
          // Within 14 days
          if (targetT - series[i].t <= 14 * D) {
            return series[i].nav;
          }
          return null;
        }
      }
      return null;
    }

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

    const ret = {};
    const pc = (x) => (x == null ? null : +(x * 100).toFixed(2));

    for (const a of ANCHORS) {
      const then = getNavAtOrBefore(a.t);
      ret[a.key] = then ? pc(a.yrs ? Math.pow(currentNav / then, 1 / a.yrs) - 1 : currentNav / then - 1) : null;
    }

    // Inception
    const override = OVERRIDES[code];
    let incDate = override?.inception_date || (series.length ? new Date(series[0].t).toISOString().slice(0, 10) : null);
    let incNav = override?.inception_nav ?? (series.length ? series[0].nav : 10);
    const incTs = incDate ? new Date(incDate).getTime() : series[0].t;
    const incYears = (now - incTs) / Y;
    const retInception = incYears > 0.5 ? pc(Math.pow(currentNav / incNav, 1 / incYears) - 1) : null;
    const ageYears = +incYears.toFixed(1);

    console.log(`[recalc] Code ${code} (${f.name}):`);
    console.log(`  1Y: ${ret.ret_1y}%, 3Y: ${ret.ret_3y}%, 5Y: ${ret.ret_5y}%, 7Y: ${ret.ret_7y}%, 10Y: ${ret.ret_10y}%`);
    console.log(`  Inception: ${incDate} (${ageYears} yrs) -> ${retInception}% CAGR`);

    await client.query(
      `UPDATE mf_screener SET
        ret_1m = COALESCE($1, ret_1m),
        ret_3m = COALESCE($2, ret_3m),
        ret_6m = COALESCE($3, ret_6m),
        ret_1y = COALESCE($4, ret_1y),
        ret_3y = COALESCE($5, ret_3y),
        ret_5y = COALESCE($6, ret_5y),
        ret_7y = COALESCE($7, ret_7y),
        ret_10y = COALESCE($8, ret_10y),
        age_years = $9,
        inception_date = $10,
        ret_inception = COALESCE($11, ret_inception)
      WHERE code = $12`,
      [
        ret.ret_1m, ret.ret_3m, ret.ret_6m,
        ret.ret_1y, ret.ret_3y, ret.ret_5y, ret.ret_7y, ret.ret_10y,
        ageYears, incDate, retInception, code
      ]
    );
  }

  // Also write to data/screener.json
  const allScr = await client.query('SELECT * FROM mf_screener ORDER BY ret_3y DESC NULLS LAST');
  const screenerPath = path.join(process.cwd(), 'data', 'screener.json');
  fs.writeFileSync(screenerPath, JSON.stringify(allScr.rows, null, 2), 'utf8');
  console.log(`Updated data/screener.json with ${allScr.rows.length} rows.`);

  await client.end();
}

main().catch(console.error);
