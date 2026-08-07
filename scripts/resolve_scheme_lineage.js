/**
 * scripts/resolve_scheme_lineage.js
 *
 * One-time, manually-run script (NOT scheduled -- AMC mergers are rare,
 * discrete events, unlike this repo's other scripts/sync_*.js jobs). For
 * each {oldName, newName, mergerDate} row below, resolves the surviving
 * scheme's current AMFI code(s) via mfapi.in search, resolves the
 * predecessor's dead AMFI code(s) via AMFI's historical NAV report for a
 * window around mergerDate, and pre-flight-checks the boundary with the
 * exact same rule lib/schemeLineage.js's stitchSeries() applies at
 * runtime. Writes a review file -- data/scheme-lineage.review.md -- listing
 * every candidate pairing with its splice date and pass/fail status.
 * NOTHING is written to data/scheme-lineage.json automatically: only
 * entries a human confirms after reading the review file get hand-merged
 * in. See
 * docs/superpowers/specs/2026-08-07-scheme-lineage-backtest-history-design.md.
 *
 * Usage:
 *   node scripts/resolve_scheme_lineage.js
 */

const fs = require('fs');
const path = require('path');
const { stitchSeries } = require('../lib/schemeLineage');

// [oldSchemeName, newSchemeName, mergerDate ("YYYY-MM" or "YYYY")]
// Transcribed from docs/mf-amc-merger-reference.txt. Only "Merged into" /
// "Restructured into" / other non-rename entries are listed here --
// "Renamed to" entries need no lineage entry (same AMFI code, confirmed
// live during design: Bandhan Flexi Cap Fund's history already runs
// continuously back through its 2023 IDFC-era rename). Chains that
// terminate in a wound-up fund with no living successor (Sahara, CRB, and
// First India -> Sahara) are excluded entirely, since there's nothing
// alive to attach history to.
//
// A "newName" that isn't quite the scheme's exact current AMFI-listed name
// is not a correctness risk here -- resolveSurvivingCodes() below only
// ever produces a CANDIDATE if mfapi.in's search actually finds a live
// match AND stitchSeries' boundary check passes; a near-miss name just
// yields an UNRESOLVED row for the reviewer, not a wrong pairing.
const INPUT_PAIRS = [
  // 1. L&T -> HSBC (2022-11)
  ['L&T Midcap Fund', 'HSBC Midcap Fund', '2022-11'],
  ['L&T Flexicap Fund', 'HSBC Flexicap Fund', '2022-11'],
  ['L&T Emerging Businesses Fund', 'HSBC Small Cap Fund', '2022-11'],
  ['L&T Hybrid Equity Fund', 'HSBC Aggressive Hybrid Fund', '2022-11'],
  ['L&T Balanced Advantage Fund', 'HSBC Balanced Advantage Fund', '2022-11'],
  ['L&T Large and Midcap Fund', 'HSBC Large & Mid Cap Fund', '2022-11'],
  ['L&T India Large Cap Fund', 'HSBC Large Cap Fund', '2022-11'],
  ['L&T Short Term Value Fund', 'HSBC Short Duration Fund', '2022-11'],
  ['L&T Resurgent India Corporate Bond Fund', 'HSBC Corporate Bond Fund', '2022-11'],

  // 3. JPMorgan -> Edelweiss (2016-03). The "India Midcap Fund" row may
  // resolve to the same fund as the existing 2-entry seed in
  // data/scheme-lineage.json ("JPMorgan India Mid and Small Cap Fund") --
  // the review step decides whether it's a duplicate or a distinct scheme.
  ['JPMorgan India Equity Fund', 'Edelweiss Large Cap Fund', '2016-03'],
  ['JPMorgan India Top 100 Fund', 'Edelweiss Large Cap Fund', '2016-03'],
  ['JPMorgan India Midcap Fund', 'Edelweiss Mid Cap Fund', '2016-03'],
  ['JPMorgan India Tax Advantage Fund', 'Edelweiss ELSS Tax Saver Fund', '2016-03'],
  ['JPMorgan India Smaller Companies Fund', 'Edelweiss Small Cap Fund', '2016-03'],
  ['JPMorgan India Treasury Fund', 'Edelweiss Liquid Fund', '2016-03'],

  // 5. Principal -> Sundaram (2021-12)
  ['Principal Emerging Bluechip Fund', 'Sundaram Large and Mid Cap Fund', '2021-12'],
  ['Principal Small Cap Fund', 'Sundaram Small Cap Fund', '2021-12'],
  ['Principal Focused Multicap Fund', 'Sundaram Flexi Cap Fund', '2021-12'],
  ['Principal Personal Tax Saver Fund', 'Sundaram Tax Savings Fund', '2021-12'],
  ['Principal Balanced Advantage Fund', 'Sundaram Balanced Advantage Fund', '2021-12'],
  ['Principal Midcap Fund', 'Sundaram Mid Cap Fund', '2021-12'],
  ['Principal Cash Management Fund', 'Sundaram Liquid Fund', '2021-12'],

  // 6. IDBI -> LIC (2023-07)
  ['IDBI Small Cap Fund', 'LIC MF Small Cap Fund', '2023-07'],
  ['IDBI Flexi Cap Fund', 'LIC MF Flexi Cap Fund', '2023-07'],
  ['IDBI Focused 30 Equity Fund', 'LIC MF Focused Fund', '2023-07'],
  ['IDBI Nifty 50 Index Fund', 'LIC MF Nifty 50 Index Fund', '2023-07'],
  ['IDBI Nifty Next 50 Index Fund', 'LIC MF Nifty Next 50 Index Fund', '2023-07'],
  ['IDBI Equity Savings Fund', 'LIC MF Equity Savings Fund', '2023-07'],
  ['IDBI Hybrid Equity Fund', 'LIC MF Aggressive Hybrid Fund', '2023-07'],

  // 7. Benchmark -> Goldman Sachs (2011) -> Reliance (2015). The final
  // Reliance -> Nippon (2019) transition is a pure rename (confirmed in the
  // reference file's section 2, "Renamed to") -- same AMFI code, no lineage
  // entry needed; walkLineage's chain will already find continuous history
  // straight through it once the two hops below verify.
  ['Benchmark Nifty BeES', 'Goldman Sachs Nifty BeES', '2011'],
  ['Goldman Sachs Nifty BeES', 'Reliance ETF Nifty BeES', '2015'],
  ['Benchmark Junior BeES', 'Goldman Sachs Junior BeES', '2011'],
  ['Goldman Sachs Junior BeES', 'Reliance ETF Junior BeES', '2015'],
  ['Benchmark Gold BeES', 'Goldman Sachs Gold BeES', '2011'],
  ['Goldman Sachs Gold BeES', 'Reliance ETF Gold BeES', '2015'],
  ['Benchmark Bank BeES', 'Goldman Sachs Bank BeES', '2011'],
  ['Goldman Sachs Bank BeES', 'Reliance ETF Bank BeES', '2015'],
  ['Benchmark Liquid BeES', 'Goldman Sachs Liquid BeES', '2011'],
  ['Goldman Sachs Liquid BeES', 'Reliance ETF Liquid BeES', '2015'],

  // 9. Escorts -> Quant (2018), labelled "Restructured into" in the source
  // -- treated as a merge-candidate per the spec's resolution rules.
  ['Escorts Growth Fund', 'Quant Active Fund', '2018'],
  ['Escorts Tax Plan', 'Quant ELSS Tax Saver Fund', '2018'],
  ['Escorts Opportunities Fund', 'Quant Small Cap Fund', '2018'],
  ['Escorts High Yield Equity Fund', 'Quant Mid Cap Fund', '2018'],
  ['Escorts Financial Services Fund', 'Quant BFSI Fund', '2018'],
  ['Escorts Infrastructure Fund', 'Quant Infrastructure Fund', '2018'],

  // 10. Morgan Stanley -> HDFC (2014-06)
  ['Morgan Stanley Growth Fund', 'HDFC Large Cap Fund', '2014-06'],
  ['Morgan Stanley Equity Fund', 'HDFC Top 100 Fund', '2014-06'],
  ['Morgan Stanley A.C.E. Fund', 'HDFC Small Cap Fund', '2014-06'],
  ['Morgan Stanley Tax Fund', 'HDFC TaxSaver', '2014-06'],
  ['Morgan Stanley Multi Asset Fund', 'HDFC Dynamic PE Ratio Fund', '2014-06'],

  // 11. Kothari Pioneer -> Franklin Templeton (2002-07)
  ['Kothari Pioneer Internet Opportunities Fund', 'Franklin India Technology Fund', '2002-07'],

  // 12. Zurich India -> HDFC (2003-03) -- target names per the source
  // file's own "(now X)" annotations for funds renamed again since.
  ['Zurich India Equity Fund', 'HDFC Flexi Cap Fund', '2003-03'],
  ['Zurich India Top 200 Fund', 'HDFC Top 100 Fund', '2003-03'],
  ['Zurich India Prudence Fund', 'HDFC Balanced Advantage Fund', '2003-03'],
  ['Zurich India Taxsaver', 'HDFC TaxSaver', '2003-03'],
  ['Zurich India Capital Builder Fund', 'HDFC Capital Builder Fund', '2003-03'],

  // 13. Baroda Pioneer -> Baroda BNP Paribas (2022). Only the two
  // explicitly "Merged into" rows are listed -- the source's ABN AMRO ->
  // Fortis -> BNP Paribas -> Baroda BNP Paribas Large & Mid Cap chain is
  // given as one combined arrow-chain with no per-hop dates. To resolve
  // that one too, add it here as its own {oldName, newName, mergerDate}
  // row after independently researching each hop's approximate date.
  ['Baroda Pioneer Large Cap Fund', 'Baroda BNP Paribas Large Cap Fund', '2022'],
  ['Baroda Pioneer ELSS Fund', 'Baroda BNP Paribas ELSS Tax Saver Fund', '2022'],

  // 14. Alliance Capital -> Birla Sun Life (2005) -- searched under the
  // group's current brand, Aditya Birla Sun Life.
  ['Alliance Equity Fund', 'Aditya Birla Sun Life Frontline Equity Fund', '2005'],
  ['Alliance Buy India Fund', 'Aditya Birla Sun Life India Opportunities Fund', '2005'],
  ['Alliance Taxshield', 'Aditya Birla Sun Life Tax Relief 96', '2005'],
  ['Alliance Dynamic Equity Fund', 'Aditya Birla Sun Life Dynamic Equity Fund', '2005'],

  // 16. ING Vysya -> Birla Sun Life (2014-09)
  ['ING Dividend Yield Fund', 'Aditya Birla Sun Life Dividend Yield Fund', '2014-09'],
  ['ING Core Equity Fund', 'Aditya Birla Sun Life Equity Fund', '2014-09'],
  ['ING Balanced Fund', 'Aditya Birla Sun Life Balanced Advantage Fund', '2014-09'],
  ['ING Liquid Fund', 'Aditya Birla Sun Life Liquid Fund', '2014-09'],

  // 17. PineBridge -> Kotak (2014-09)
  ['PineBridge India Equity Fund', 'Kotak Equity Opportunities Fund', '2014-09'],
  ['PineBridge Infrastructure & Economic Reform Fund', 'Kotak Infrastructure & Economic Reform Fund', '2014-09'],
  ['PineBridge World Gold Fund', 'Kotak World Gold Fund', '2014-09'],

  // 18. Lotus India -> Religare -> Invesco. The source doesn't separate
  // the 2008/2013 intermediate hops by scheme, so each row is resolved
  // directly against the final 2016 Invesco name -- if that fails, it just
  // yields less history for that fund, never wrong history.
  ['Lotus India Equity Fund', 'Invesco India Flexi Cap Fund', '2016'],
  ['Lotus India Tax Plan', 'Invesco India ELSS Tax Saver Fund', '2016'],
  ['Lotus India Growth Fund', 'Invesco India Growth Opportunities Fund', '2016'],

  // 19. Daiwa -> SBI (2013-11)
  ['Daiwa India Equity Fund', 'SBI Magnum Equity ESG Fund', '2013-11'],
  ['Daiwa Industry Leaders Fund', 'SBI Bluechip Fund', '2013-11'],
  ['Daiwa Short Term Income Fund', 'SBI Short Term Fund', '2013-11'],

  // 22. Sun F&C -> Principal (2004). Money Manager Fund's target (Principal
  // Cash Management Fund) is ITSELF one of event 5's rows above, so the
  // runtime multi-hop walker chains straight through to Sundaram Liquid
  // Fund automatically once both hops verify -- no duplicate row needed.
  ['Sun F&C Value Fund', 'Principal Resurgent India Equity Fund', '2004'],
  ['Sun F&C Money Manager Fund', 'Principal Cash Management Fund', '2004'],
  ['Sun F&C Balanced Fund', 'Principal Balanced Advantage Fund', '2004'],

  // 24. ITC Classic -> Prudential ICICI (1997) -- target per the source
  // file's own "(now X)" annotation.
  ['Classic Quantum Fund', 'ICICI Prudential Bluechip Fund', '1997'],
];

const MFAPI_SEARCH = (q) => `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`;
const MFAPI_CODE = (c) => `https://api.mfapi.in/mf/${c}`;
const AMFI_HISTORY = (from, to) => `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=${from}&todt=${to}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Parses AMFI's whole-market historical NAV report (semicolon-delimited,
// with blank/section-header lines interspersed) into structured records.
// Pure function -- no network -- exported for testing.
function parseAmfiHistoricalReport(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const parts = line.split(';');
    if (parts.length < 8) continue;
    const code = parts[0].trim();
    if (!/^\d+$/.test(code)) continue;
    const name = parts[1].trim();
    const isinGrowth = parts[2].trim();
    const isinDiv = parts[3].trim();
    const nav = parseFloat(parts[4].trim());
    const date = parts[7].trim();
    if (!isFinite(nav) || nav <= 0) continue;
    records.push({ code, name, isinGrowth: isinGrowth || null, isinDiv: isinDiv || null, nav, date });
  }
  return records;
}

// Finds every record whose name contains `schemeName` (case-insensitive
// substring). Pure function -- exported for testing.
function findMatchingRecords(records, schemeName) {
  const needle = schemeName.toLowerCase();
  return records.filter((r) => r.name.toLowerCase().includes(needle));
}

// "YYYY-MM" -> a full-month AMFI-format date window; "YYYY" -> January of
// that year. Either way this only needs to land inside the merger's actual
// month -- AMFI publishes on trading days, so a full month is generous.
// Pure function -- exported for testing.
function toAmfiDate(dateStr) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = dateStr.split('-');
  const month = m ? MONTHS[parseInt(m, 10) - 1] : 'Jan';
  return { from: `01-${month}-${y}`, to: `28-${month}-${y}` };
}

async function resolveSurvivingCodes(newName) {
  const results = await fetch(MFAPI_SEARCH(newName), { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
  return Array.isArray(results) ? results : [];
}

async function verifyStillLive(code) {
  try {
    const data = await fetch(MFAPI_CODE(code), { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    return Array.isArray(data?.data) && data.data.length > 0 ? data.data : null;
  } catch {
    return null;
  }
}

function isRegularPlan(name) { return !/direct/i.test(name); }
function isGrowthPlan(name) { return !/idcw|dividend|bonus|payout|reinvest/i.test(name); }

function normalizeMfapiSeries(raw) {
  return raw
    .map((r) => { const [d, m, y] = r.date.split('-').map(Number); return { t: Date.UTC(y, m - 1, d), nav: parseFloat(r.nav) }; })
    .filter((r) => r.nav > 0 && isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

async function run() {
  console.log(`=== Resolving ${INPUT_PAIRS.length} scheme lineage candidates ===`);

  // Group by distinct merger date so each AMFI historical window is
  // downloaded once and reused for every scheme sharing that date -- the
  // endpoint returns the whole market per window (confirmed ~13.5MB for an
  // 11-month range during design), so this must stay one fetch per date,
  // never one per scheme, and never span more than a few weeks.
  const byDate = new Map();
  for (const [oldName, newName, date] of INPUT_PAIRS) {
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ oldName, newName });
  }

  const results = [];
  for (const [date, pairs] of byDate) {
    const { from, to } = toAmfiDate(date);
    console.log(`\nFetching AMFI historical NAV report ${from} to ${to} (${pairs.length} scheme(s))...`);
    let historyText;
    try {
      historyText = await fetchText(AMFI_HISTORY(from, to));
    } catch (e) {
      for (const { oldName, newName } of pairs) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: `AMFI history fetch failed: ${e.message}` });
      }
      continue;
    }
    const records = parseAmfiHistoricalReport(historyText);

    for (const { oldName, newName } of pairs) {
      const oldMatches = findMatchingRecords(records, oldName);
      if (!oldMatches.length) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: 'Old scheme name not found in the AMFI historical window' });
        continue;
      }

      let survivingCandidates;
      try {
        survivingCandidates = await resolveSurvivingCodes(newName);
      } catch (e) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: `mfapi.in search failed: ${e.message}` });
        continue;
      }
      if (!survivingCandidates.length) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: 'Surviving scheme not found on mfapi.in' });
        continue;
      }

      // Match old/new plan variants (Direct-Growth, Regular-Growth, etc.)
      // by whether each name looks Direct/Regular and Growth/IDCW, since
      // AMFI's and mfapi.in's naming isn't perfectly consistent otherwise.
      for (const oldRec of oldMatches) {
        const wantRegular = isRegularPlan(oldRec.name);
        const wantGrowth = isGrowthPlan(oldRec.name);
        const newRec = survivingCandidates.find((c) => isRegularPlan(c.schemeName) === wantRegular && isGrowthPlan(c.schemeName) === wantGrowth);
        if (!newRec) {
          results.push({ oldName: oldRec.name, newName, date, status: 'UNRESOLVED', reason: 'No matching plan variant found on the surviving scheme' });
          continue;
        }

        const oldSeries = await verifyStillLive(oldRec.code);
        if (!oldSeries) {
          results.push({ oldName: oldRec.name, newName: newRec.schemeName, date, status: 'UNRESOLVED', reason: `Old code ${oldRec.code} no longer resolves via mfapi.in` });
          continue;
        }
        const newSeries = await verifyStillLive(newRec.schemeCode);
        if (!newSeries) {
          results.push({ oldName: oldRec.name, newName: newRec.schemeName, date, status: 'UNRESOLVED', reason: `New code ${newRec.schemeCode} did not resolve via mfapi.in` });
          continue;
        }

        const st = stitchSeries(normalizeMfapiSeries(newSeries), normalizeMfapiSeries(oldSeries));
        if (!st) {
          results.push({ oldName: oldRec.name, newName: newRec.schemeName, oldCode: oldRec.code, newCode: newRec.schemeCode, date, status: 'REJECTED', reason: 'Boundary check failed (gap or ratio out of bounds)' });
          continue;
        }

        results.push({
          oldName: oldRec.name,
          newName: newRec.schemeName,
          oldCode: oldRec.code,
          newCode: newRec.schemeCode,
          date,
          status: 'CANDIDATE',
          spliceDate: new Date(st.spliceDate).toISOString().slice(0, 10),
        });
      }
    }
  }

  const candidates = results.filter((r) => r.status === 'CANDIDATE');
  const rejected = results.filter((r) => r.status === 'REJECTED');
  const unresolved = results.filter((r) => r.status === 'UNRESOLVED');

  const lines = ['# Scheme Lineage Resolution — Review', '', `Generated ${new Date().toISOString()}`, ''];
  lines.push(`## Candidates to review (${candidates.length}) — boundary check passed`, '');
  lines.push('Copy the ones you confirm into data/scheme-lineage.json:', '');
  for (const c of candidates) {
    lines.push(`- \`"${c.newCode}": { "pred": ${c.oldCode}, "from": "${c.oldName}" }\`  — ${c.oldName} → ${c.newName}, spliced at ${c.spliceDate}`);
  }
  lines.push('', `## Rejected (${rejected.length}) — resolved but failed the boundary check, NOT safe to add`, '');
  for (const r of rejected) lines.push(`- ${r.oldName} → ${r.newName}: ${r.reason}`);
  lines.push('', `## Unresolved (${unresolved.length}) — could not resolve at all`, '');
  for (const u of unresolved) lines.push(`- ${u.oldName} → ${u.newName} (${u.date}): ${u.reason}`);

  const outPath = path.join(process.cwd(), 'data', 'scheme-lineage.review.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\n=== Done. ${candidates.length} candidates, ${rejected.length} rejected, ${unresolved.length} unresolved. ===`);
  console.log(`Review file written to ${outPath}`);
  console.log('Nothing was written to data/scheme-lineage.json -- copy confirmed entries in by hand after reading the review file.');
}

module.exports = { parseAmfiHistoricalReport, findMatchingRecords, toAmfiDate };

if (require.main === module) {
  run().catch((e) => { console.error('[resolve_scheme_lineage] Fatal error:', e); process.exit(1); });
}
