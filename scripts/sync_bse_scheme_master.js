/**
 * scripts/sync_bse_scheme_master.js
 *
 * Downloads and parses BSE StAR MF Scheme Master files (Physical, Demat, Detail)
 * and generates data/isin-scheme-master.json for precise exit load and lock-in
 * determination in the CAS Redemption Planner.
 *
 * Fallback logic:
 * - Attempts to fetch the live report from BSE StAR MF.
 * - If BSE StAR is unavailable, offline, or returns an error for ALL three
 *   report types (e.g. weekends, an outage, or a scrape breaking because BSE
 *   changed its ASP.NET viewstate/markup), the existing
 *   data/isin-scheme-master.json is left untouched rather than being
 *   overwritten with an empty result — this workflow runs on GitHub Actions
 *   (ubuntu-latest, scheduled monthly), so any fallback must work there, not
 *   just on one developer's machine.
 */

const fs = require('fs');
const path = require('path');

// Expected header labels at the column indices parseReportStream reads —
// verified against a real BSE SCHEMEMASTER export. If BSE ever reorders or
// adds columns, this fires a loud warning instead of silently reading the
// wrong field into isin/exitFlag/lockFlag.
const EXPECTED_HEADERS = { 4: 'isin', 37: 'exit load flag', 39: 'lock-in period flag' };

function validateHeader(content, reportLabel) {
  const headerLine = (content.split('\n')[0] || '');
  const cols = headerLine.split('|').map(c => c.trim().toLowerCase());
  for (const [idx, expected] of Object.entries(EXPECTED_HEADERS)) {
    const actual = cols[idx] || '';
    if (!actual.includes(expected)) {
      console.error(
        `[BSE Sync] WARNING: ${reportLabel} column ${idx} header is "${cols[idx] ?? '(missing)'}", ` +
        `expected to contain "${expected}". BSE may have changed the report layout — ` +
        `parseReportStream's column indices likely need updating.`
      );
    }
  }
}

// Special Tiered Schemes Overrides (e.g. Parag Parikh Flexi Cap: 2% < 1y, 1% < 2y, 10% free)
const KNOWN_TIERED_SCHEMES = {
  // Parag Parikh Flexi Cap - Direct & Regular (Growth options)
  'INF879O01027': { tiers: [{ rate: 0.02, days: 365 }, { rate: 0.01, days: 730 }], freePercent: 10 },
  'INF879O01019': { tiers: [{ rate: 0.02, days: 365 }, { rate: 0.01, days: 730 }], freePercent: 10 },
  'INF879O01308': { tiers: [{ rate: 0.02, days: 365 }, { rate: 0.01, days: 730 }], freePercent: 10 },
  'INF879O01324': { tiers: [{ rate: 0.02, days: 365 }, { rate: 0.01, days: 730 }], freePercent: 10 },
};

async function fetchBseReport(option) {
  try {
    const getRes = await fetch('https://www.bsestarmf.in/RptSchemeMaster.aspx', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!getRes.ok) return null;

    const cookies = getRes.headers.getSetCookie ? getRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') : (getRes.headers.get('set-cookie') || '').split(';')[0];
    const html = await getRes.text();

    const viewState = (html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/) || [])[1];
    const generator = (html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/) || [])[1] || '';
    const validation = (html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/) || [])[1];

    if (!viewState || !validation) return null;

    const params = new URLSearchParams();
    params.append('__EVENTTARGET', '');
    params.append('__EVENTARGUMENT', '');
    params.append('__VIEWSTATE', viewState);
    params.append('__VIEWSTATEGENERATOR', generator);
    params.append('__VIEWSTATEENCRYPTED', '');
    params.append('__EVENTVALIDATION', validation);
    params.append('ddlTypeOption', option);
    params.append('btnText', 'Export to Text');

    const postRes = await fetch('https://www.bsestarmf.in/RptSchemeMaster.aspx', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.bsestarmf.in/RptSchemeMaster.aspx',
        'Cookie': cookies,
        'Origin': 'https://www.bsestarmf.in',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(20000)
    });

    if (!postRes.ok) return null;
    const text = await postRes.text();
    return text.length > 5000 ? text : null;
  } catch (e) {
    console.warn(`[BSE Sync] Fetch warning for option ${option}: ${e.message}`);
    return null;
  }
}

function parseReportStream(content, isinMap) {
  const lines = content.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('|');
    const isin = cols[4];
    const type = cols[6];
    const name = cols[8];
    const exitFlag = cols[37];
    const lockFlag = cols[39];

    if (isin && isin.startsWith('INF')) {
      const hasExitLoad = exitFlag === 'Y';
      const isLocked = lockFlag === 'Y';

      if (!isinMap.has(isin)) {
        const entry = {
          name,
          type,
          hasExitLoad,
          isLocked
        };
        if (KNOWN_TIERED_SCHEMES[isin]) {
          Object.assign(entry, KNOWN_TIERED_SCHEMES[isin]);
        }
        isinMap.set(isin, entry);
      } else {
        const existing = isinMap.get(isin);
        if (hasExitLoad) existing.hasExitLoad = true;
        if (isLocked) existing.isLocked = true;
      }
    }
  }
}

async function run() {
  console.log('=== Syncing BSE StAR Scheme Master Database ===');
  const isinMap = new Map();

  const options = ['SCHEMEMASTERPHYSICAL', 'SCHEMEMASTERDEMAT', 'SCHEMEMASTER'];

  for (const opt of options) {
    console.log(`[BSE Sync] Fetching ${opt}...`);
    const content = await fetchBseReport(opt);

    if (content) {
      validateHeader(content, opt);
      parseReportStream(content, isinMap);
      console.log(`[BSE Sync] Successfully parsed ${opt}. Total unique ISINs accumulated: ${isinMap.size}`);
    } else {
      console.warn(`[BSE Sync] Could not retrieve data for ${opt}`);
    }
  }

  if (isinMap.size === 0) {
    console.error('[BSE Sync] Error: No ISIN records could be parsed!');
    const targetFile = path.join(process.cwd(), 'data', 'isin-scheme-master.json');
    if (fs.existsSync(targetFile)) {
      console.log('[BSE Sync] Preserving existing data/isin-scheme-master.json cache.');
      return;
    }
    process.exit(1);
  }

  const outObj = Object.fromEntries(isinMap);
  const targetDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFile = path.join(targetDir, 'isin-scheme-master.json');
  fs.writeFileSync(targetFile, JSON.stringify(outObj), 'utf-8');
  console.log(`[BSE Sync] Successfully wrote ${isinMap.size} ISIN records to ${targetFile}`);
}

run().catch(console.error);
