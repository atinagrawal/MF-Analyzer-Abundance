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

// Column indices are resolved dynamically from each report's own header
// row, by matching against these expected label strings, rather than
// hardcoded as fixed integers. BSE has reordered/inserted columns in this
// report before without warning (confirmed 2026-08: minPurchase, rta,
// both cutoff times, settlement, sip flag and swp flag had all moved from
// the positions this script originally shipped with — a hardcoded-index
// version parsed successfully but silently wrote garbage into every one
// of those fields). Matching is done after stripping all non-alphanumeric
// characters and lowercasing (normalizeHeader), so whitespace/punctuation
// drift in BSE's own header text (e.g. "Cut off" vs "Cutoff", "-" vs the
// en-dash "–" seen in "Redemption Amount – Maximum") doesn't matter — only
// an actual column reorder or a genuine label rename does.
const COLUMN_LABELS = {
  isin: 'ISIN',
  type: 'Scheme Type',
  name: 'Scheme Name',
  minPurchase: 'Minimum Purchase Amount',
  rta: 'RTA Agent Code',
  purchaseCutoff: 'Purchase Cutoff Time',
  redeemCutoff: 'Redemption Cut off Time',
  settlement: 'Settlement Type',
  exitFlag: 'Exit Load Flag',
  lockFlag: 'Lock-in Period Flag',
  sipFlag: 'SIP Flag',
  swpFlag: 'SWP Flag',
  purchaseAllowedFlag: 'Purchase Allowed',
  redemptionAllowedFlag: 'Redemption Allowed',
  stpFlag: 'STP Flag',
  switchFlag: 'Switch Flag',
  divReinvestFlag: 'Dividend Reinvestment Flag',
};

function normalizeHeader(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Resolves each semantic field to its column index for THIS report's
// header row. Throws (rather than warning and continuing) if any field's
// label can't be found — the caller must not parse data rows using
// indices it isn't confident about; that's exactly how the corruption
// above happened.
function resolveColumns(headerLine) {
  const cols = headerLine.split('|').map(normalizeHeader);
  const indices = {};
  const missing = [];
  for (const [field, label] of Object.entries(COLUMN_LABELS)) {
    const idx = cols.indexOf(normalizeHeader(label));
    if (idx === -1) missing.push(`${field} ("${label}")`);
    else indices[field] = idx;
  }
  if (missing.length) {
    throw new Error(
      `Could not locate column(s) by header label: ${missing.join(', ')}. ` +
      `BSE may have renamed these columns (not just reordered them) — COLUMN_LABELS needs updating.`
    );
  }
  return indices;
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

function formatTime12h(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function formatSettlement(settleStr) {
  if (!settleStr) return '';
  const s = settleStr.trim().toUpperCase();
  if (s === 'T1' || s === 'L1') return 'T+1';
  if (s === 'T2') return 'T+2';
  if (s === 'T3') return 'T+3';
  if (s === 'T4') return 'T+4';
  return s.startsWith('T') ? s.replace('T', 'T+') : s;
}

function parseReportStream(content, isinMap) {
  const lines = content.split('\n');
  const idx = resolveColumns(lines[0] || '');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('|');
    const isin = cols[idx.isin];
    const type = cols[idx.type];
    const name = cols[idx.name];
    const minPurRaw = parseFloat(cols[idx.minPurchase]);
    const rtaRaw = cols[idx.rta];
    const purCutoffRaw = cols[idx.purchaseCutoff];
    const redCutoffRaw = cols[idx.redeemCutoff];
    const settleRaw = cols[idx.settlement];
    const exitFlag = cols[idx.exitFlag];
    const lockFlag = cols[idx.lockFlag];
    const sipFlag = cols[idx.sipFlag];
    const swpFlag = cols[idx.swpFlag];
    const purchaseAllowedFlag = cols[idx.purchaseAllowedFlag];
    const redemptionAllowedFlag = cols[idx.redemptionAllowedFlag];
    const stpFlag = cols[idx.stpFlag];
    const switchFlag = cols[idx.switchFlag];
    const divReinvestFlag = cols[idx.divReinvestFlag];

    if (isin && isin.startsWith('INF')) {
      const hasExitLoad = exitFlag === 'Y';
      const isLocked = lockFlag === 'Y';
      const rta = rtaRaw
        ? (/KARVY|KFIN/i.test(rtaRaw) ? 'KFINTECH'
            : /CAMS/i.test(rtaRaw) ? 'CAMS'
            : rtaRaw.trim() || null)
        : null;
      const settlement = formatSettlement(settleRaw);
      const purchaseCutoff = formatTime12h(purCutoffRaw);
      const redeemCutoff = formatTime12h(redCutoffRaw);
      const minPurchase = !isNaN(minPurRaw) && minPurRaw > 0 ? Math.round(minPurRaw) : null;
      const sip = sipFlag === 'Y';
      const swp = swpFlag === 'Y';
      const purchaseAllowed = purchaseAllowedFlag === 'Y';
      const redemptionAllowed = redemptionAllowedFlag === 'Y';
      const stp = stpFlag === 'Y';
      const switchAllowed = switchFlag === 'Y';
      const divReinvest = divReinvestFlag === 'Y';

      if (!isinMap.has(isin)) {
        const entry = {
          name,
          type,
          hasExitLoad,
          isLocked,
          // Purchase/RedemptionAllowed are stored explicitly (true AND
          // false), unlike the true-only flags below -- "not currently
          // redeemable via BSE" is itself a fact worth surfacing, not just
          // the absence of one.
          purchaseAllowed,
          redemptionAllowed,
        };
        if (rta) entry.rta = rta;
        if (settlement) entry.settlement = settlement;
        if (purchaseCutoff) entry.purchaseCutoff = purchaseCutoff;
        if (redeemCutoff) entry.redeemCutoff = redeemCutoff;
        if (minPurchase != null) entry.minPurchase = minPurchase;
        if (sip) entry.sip = true;
        if (swp) entry.swp = true;
        if (stp) entry.stp = true;
        if (switchAllowed) entry.switchAllowed = true;
        if (divReinvest) entry.divReinvest = true;

        if (KNOWN_TIERED_SCHEMES[isin]) {
          Object.assign(entry, KNOWN_TIERED_SCHEMES[isin]);
          // Defense-in-depth: sort ascending by days here too, mirroring the
          // runtime consumer-side sort in cas-tracker's getExitLoadInfo — so
          // the written JSON is guaranteed-correct even if a future edit to
          // KNOWN_TIERED_SCHEMES lists tiers out of order.
          if (entry.tiers) {
            entry.tiers = [...entry.tiers].sort((a, b) => a.days - b.days);
          }
        }
        isinMap.set(isin, entry);
      } else {
        const existing = isinMap.get(isin);
        if (hasExitLoad) existing.hasExitLoad = true;
        if (isLocked) existing.isLocked = true;
        if (!existing.rta && rta) existing.rta = rta;
        if (!existing.settlement && settlement) existing.settlement = settlement;
        if (!existing.purchaseCutoff && purchaseCutoff) existing.purchaseCutoff = purchaseCutoff;
        if (!existing.redeemCutoff && redeemCutoff) existing.redeemCutoff = redeemCutoff;
        if (!existing.minPurchase && minPurchase != null) existing.minPurchase = minPurchase;
        if (sip) existing.sip = true;
        if (swp) existing.swp = true;
        // OR-merge across report types: allowed via ANY channel (physical
        // or demat) counts as allowed overall, matching how every other
        // flag here already merges (true from any report wins, never
        // downgraded back to false by a later report).
        if (purchaseAllowed) existing.purchaseAllowed = true;
        if (redemptionAllowed) existing.redemptionAllowed = true;
        if (stp) existing.stp = true;
        if (switchAllowed) existing.switchAllowed = true;
        if (divReinvest) existing.divReinvest = true;
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
      try {
        parseReportStream(content, isinMap);
        console.log(`[BSE Sync] Successfully parsed ${opt}. Total unique ISINs accumulated: ${isinMap.size}`);
      } catch (e) {
        console.error(`[BSE Sync] ABORTING parse of ${opt}: ${e.message}`);
      }
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
