/**
 * scripts/sync_groww_exit_loads.js
 *
 * Background sync script that:
 * 1. Reads all scheme records from NAVAll.txt / data/isin-scheme-master.json.
 * 2. Groups ISINs into fund families via deriveFundFamilyKey(amc, schemeName).
 * 3. Picks a representative (Direct + Growth) per family and searches Groww API.
 * 4. Validates returned Groww scheme_code / isin matches the target representative.
 * 5. Parses raw exit load text into structured tiers using lib/exitLoadParser.js.
 * 6. Propagates verified results across all family sibling ISINs.
 * 7. Writes the result to R2 (groww-exit-loads.json, read via
 *    app/api/scheme-master-facts) and logs unverified/unmatched families to
 *    the local data/groww-exit-loads-needs-review.json for operator review
 *    (uploaded as a workflow artifact, same pattern as
 *    data/mf-inception-needs-review.json in scripts/build-screener.mjs).
 *
 * Previously wrote data/groww-exit-loads.json locally and committed it to
 * git -- moved to R2 (matching scripts/sync_bse_scheme_master.js) so a
 * routine data refresh doesn't need a git commit + redeploy, and can run
 * unattended on a schedule.
 *
 * Usage:
 *   node scripts/sync_groww_exit_loads.js [--dry-run] [--limit=50]
 */

const fs = require('fs');
const path = require('path');
const { parseExitLoadText } = require('../lib/exitLoadParser');
const { backupThenPut } = require('./lib/r2SyncSafety');

const R2_KEY = 'groww-exit-loads.json';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;

function deriveFundFamilyKey(amc, schemeName) {
  const amcKey = (amc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const stripped = (schemeName || '')
    .toUpperCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(DIRECT|REGULAR)\b/g, ' ')
    .replace(/\bPLAN\b/g, ' ')
    .replace(/\b(GROWTH|IDCW|DIVIDEND)\b/g, ' ')
    .replace(/\b(PAYOUT|REINVESTMENT|REINVEST|BONUS|OPTION|QUARTERLY|MONTHLY|WEEKLY|DAILY|ANNUAL)\b/g, ' ')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  return amcKey + '::' + stripped;
}

function deriveSearchTerm(schemeName) {
  return (schemeName || '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(Direct|Regular)\b/gi, '')
    .replace(/\bPlan\b/gi, '')
    .replace(/\b(Growth|IDCW|Dividend)\b/gi, '')
    .replace(/\b(Payout|Reinvestment|Reinvest|Bonus|Option|Quarterly|Monthly|Weekly|Daily|Annual)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFundFamilies(rows) {
  const families = new Map();
  for (const row of rows) {
    if (!row.code || !row.name) continue;
    const key = deriveFundFamilyKey(row.amc, row.name);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(row);
  }

  const result = new Map();
  for (const [key, members] of families) {
    const upper = (r) => (r.name || '').toUpperCase();
    const representative =
      members.find((r) => /DIRECT/.test(upper(r)) && /GROWTH/.test(upper(r))) ||
      members.find((r) => /REGULAR/.test(upper(r)) && /GROWTH/.test(upper(r))) ||
      members.find((r) => /DIRECT/.test(upper(r))) ||
      members[0];
    result.set(key, { members, representative });
  }
  return result;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://groww.in/mutual-funds'
      }
    });
    if (!res.ok) return { status: res.status, data: null };
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 500, error: err.message };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pacingDelay() {
  return 250 + Math.floor(Math.random() * 150); // randomized 250-400ms, per spec
}

// Retries on 429/5xx with exponential backoff (1s, 2s, 4s) before giving up;
// any other non-ok status (404, etc.) is treated as "no data" immediately.
async function fetchJsonWithRetry(url, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    const result = await fetchJson(url);
    if (result.data || (result.status < 429 && result.status !== 500 && result.status !== 502 && result.status !== 503)) {
      return result;
    }
    if (attempt >= maxRetries) return result;
    const backoffMs = 1000 * Math.pow(2, attempt);
    console.warn(`  [retry] HTTP ${result.status} from ${url} -- backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await sleep(backoffMs);
    attempt++;
  }
}

async function run() {
  console.log('=== Syncing Groww Exit Load Database ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  // Load all schemes from NAVAll.txt or isin-scheme-master.json
  const navAllPath = path.join(process.cwd(), 'NAVAll.txt');
  const allRows = [];

  if (fs.existsSync(navAllPath)) {
    const text = fs.readFileSync(navAllPath, 'utf8');
    // NAVAll.txt interleaves non-scheme lines that name the AMC/category for
    // all scheme rows that follow, until the next such line (the same
    // structure scripts/build-screener.mjs's parseUniverse() already relies
    // on) -- track the current AMC across the file rather than guessing it
    // from a single scheme name's first word, which loses multi-word AMC
    // names (e.g. "Aditya Birla Sun Life" -> just "Aditya").
    let amc = null;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '').trim();
      if (!line || line.startsWith('Scheme Code;')) continue;
      if (!line.includes(';')) {
        if (!/Schemes?\s*\(/i.test(line)) amc = line.trim();
        continue;
      }
      const parts = line.split(';');
      if (parts.length >= 6) {
        const code = parts[0].trim();
        const isin1 = parts[1].trim();
        const isin2 = parts[2].trim();
        const name = parts[3].trim();
        if (code && !isNaN(code) && name) {
          const isin = (isin1 && isin1.startsWith('INF')) ? isin1 : ((isin2 && isin2.startsWith('INF')) ? isin2 : null);
          allRows.push({ code, isin, name, amc });
        }
      }
    }
  }

  console.log(`Loaded ${allRows.length} raw scheme records from NAVAll.txt.`);

  const families = buildFundFamilies(allRows);
  console.log(`Grouped into ${families.size} distinct fund families.`);

  let targetEntries = Array.from(families.entries());
  if (LIMIT > 0) {
    console.log(`Limiting sync run to first ${LIMIT} fund families.`);
    targetEntries = targetEntries.slice(0, LIMIT);
  }

  const { r2Put, r2Get } = await import('../lib/r2.js');
  let existing = null;
  try {
    existing = await r2Get(R2_KEY);
  } catch (e) {
    console.warn(`[Groww Sync] Could not read existing R2 copy: ${e.message}`);
  }
  const existingCount = existing ? Object.keys(existing).length : 0;
  const growwExitLoads = existing ? { ...existing } : {};

  const unverified = [];
  let updatedCount = 0;
  let verifiedFamilies = 0;

  for (let i = 0; i < targetEntries.length; i++) {
    const [key, { members, representative }] = targetEntries[i];
    const searchTerm = deriveSearchTerm(representative.name);

    if ((i + 1) % 5 === 0 || i === 0) {
      console.log(`[${i + 1}/${targetEntries.length}] Processing: "${searchTerm}" (${members.length} sibling ISINs)...`);
    }

    const searchUrl = `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&q=${encodeURIComponent(searchTerm)}&page=0&size=5`;
    const searchRes = await fetchJsonWithRetry(searchUrl);
    await sleep(pacingDelay());

    if (!searchRes.data || !searchRes.data.content || !searchRes.data.content.length) {
      unverified.push({ familyKey: key, representative: representative.name, reason: 'No Groww search results' });
      continue;
    }

    const candidates = searchRes.data.content;
    // AMFI-code / ISIN validation step
    const match = candidates.find(c => c.scheme_code === representative.code || (c.isin && c.isin === representative.isin));

    if (!match) {
      unverified.push({ familyKey: key, representative: representative.name, reason: 'AMFI Code / ISIN validation failed' });
      continue;
    }

    const detailUrl = `https://groww.in/v1/api/data/mf/web/v1/scheme/search/${match.search_id}`;
    const detailRes = await fetchJsonWithRetry(detailUrl);
    await sleep(pacingDelay());

    if (!detailRes.data || detailRes.data.exit_load == null) {
      unverified.push({ familyKey: key, representative: representative.name, reason: 'Missing exit_load in Groww detail payload' });
      continue;
    }

    const rawExitLoad = detailRes.data.exit_load;
    const parsed = parseExitLoadText(rawExitLoad);
    const timestamp = new Date().toISOString();

    verifiedFamilies++;

    // Sibling propagation across all members of the family
    for (const member of members) {
      growwExitLoads[member.code] = {
        amfiCode: member.code,
        isin: member.isin,
        schemeName: member.name,
        rawText: rawExitLoad,
        freePercent: parsed.freePercent,
        confidence: parsed.confidence,
        tiers: parsed.tiers,
        lastUpdated: timestamp,
      };
      updatedCount++;
    }
  }

  console.log(`\n=== Sync Results ===`);
  console.log(`Verified Fund Families: ${verifiedFamilies} / ${targetEntries.length}`);
  console.log(`Total ISIN/AMFI Scheme Records Populated: ${updatedCount}`);
  console.log(`Unverified Families Logged: ${unverified.length}`);

  const newCount = Object.keys(growwExitLoads).length;

  // Partial-failure guard, same reasoning as this project's other R2 sync
  // scripts: this script only ever ADDS/overwrites keys (never deletes), so
  // the one way a bad run could destroy good data is a mostly-empty result
  // (e.g. Groww blocking every request this run) still getting written.
  // Refuse to overwrite good data with a suspiciously smaller one. Skipped
  // for --limit runs, which are expected to add far fewer records than a
  // full run has accumulated.
  if (!DRY_RUN && LIMIT === 0 && existingCount > 0 && newCount < existingCount * 0.9) {
    console.error(`[Groww Sync] Error: new record count (${newCount}) is suspiciously smaller than existing R2 copy's (${existingCount}) -- likely a Groww fetch failure this run.`);
    console.log('[Groww Sync] Preserving existing R2 copy.');
    process.exit(1);
  }

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(growwExitLoads));
    console.log(`Successfully wrote ${newCount} records to R2 (${R2_KEY})`);

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'groww-exit-loads-needs-review.json'), JSON.stringify(unverified, null, 2), 'utf8');
    console.log(`Logged ${unverified.length} unverified families to data/groww-exit-loads-needs-review.json`);
  }
}

run().catch(console.error);
