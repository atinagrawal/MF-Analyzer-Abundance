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
 * 7. Writes data/groww-exit-loads.json and logs unverified/unmatched families to data/groww-exit-loads-needs-review.json.
 *
 * Usage:
 *   node scripts/sync_groww_exit_loads.js [--dry-run] [--limit=50]
 */

const fs = require('fs');
const path = require('path');
const { parseExitLoadText } = require('../lib/exitLoadParser');

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

async function run() {
  console.log('=== Syncing Groww Exit Load Database ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  // Load all schemes from NAVAll.txt or isin-scheme-master.json
  const navAllPath = path.join(process.cwd(), 'NAVAll.txt');
  const allRows = [];

  if (fs.existsSync(navAllPath)) {
    const text = fs.readFileSync(navAllPath, 'utf8');
    for (const line of text.split('\n')) {
      const parts = line.split(';');
      if (parts.length >= 6) {
        const code = parts[0].trim();
        const isin1 = parts[1].trim();
        const isin2 = parts[2].trim();
        const name = parts[3].trim();
        if (code && !isNaN(code) && name) {
          const isin = (isin1 && isin1.startsWith('INF')) ? isin1 : ((isin2 && isin2.startsWith('INF')) ? isin2 : null);
          const amc = name.split(' ')[0] || '';
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

  const existingFile = path.join(process.cwd(), 'data', 'groww-exit-loads.json');
  const growwExitLoads = fs.existsSync(existingFile) ? JSON.parse(fs.readFileSync(existingFile, 'utf8')) : {};

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
    const searchRes = await fetchJson(searchUrl);
    await sleep(250); // Pacing delay

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
    const detailRes = await fetchJson(detailUrl);
    await sleep(250); // Pacing delay

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

  if (!DRY_RUN) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(path.join(dataDir, 'groww-exit-loads.json'), JSON.stringify(growwExitLoads, null, 2), 'utf8');
    fs.writeFileSync(path.join(dataDir, 'groww-exit-loads-needs-review.json'), JSON.stringify(unverified, null, 2), 'utf8');
    console.log(`Successfully wrote records to data/groww-exit-loads.json & data/groww-exit-loads-needs-review.json`);
  }
}

run().catch(console.error);
