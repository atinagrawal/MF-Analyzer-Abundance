/**
 * scripts/sync_amfi_nfo.js
 *
 * Syncs currently-open New Fund Offers (NFOs) -- both regular Mutual Funds
 * and SIFs -- from AMFI's own public JSON API into one R2-cached document,
 * consumed by lib/nfoData.js. See docs/superpowers/specs/
 * 2026-09-06-nfo-tracker-design.md for the full design rationale.
 *
 * Endpoints (no auth, no referer needed -- verified live):
 *   GET /api/new-fund-offer                  -> summary of every open MF NFO
 *   GET /api/new-fund-offer?Scheme_Id=X       -> detail for one MF NFO
 *   GET /api/sif-nfo                          -> summary of every open SIF NFO
 *   GET /api/sif-nfo?Scheme_Id=X              -> detail for one SIF NFO
 *
 * Unlike sync_amfi_aum.js's count-based partial-failure guard (a shrinking
 * count is itself suspicious there, since AUM never legitimately drops to
 * zero), an NFO list legitimately shrinking to zero is a valid, expected
 * outcome -- all NFOs closed, nothing new open. The correct guard here is
 * at the HTTP-response level: a non-200 or unparsable body from either
 * summary endpoint aborts the whole run and preserves the existing R2
 * document untouched (see fetchOpenNfos()).
 *
 * The SIF detail endpoint's field shape was never directly observed at
 * spec time (zero SIF NFOs were open) -- mapDetailItem()/fetchOpenNfos()
 * are deliberately defensive about missing fields for BOTH types, not
 * just SIF, so this isn't a special case that could silently rot.
 *
 * Usage:
 *   node scripts/sync_amfi_nfo.js [--dry-run]
 *   node scripts/sync_amfi_nfo.js --self-test
 */

const { backupThenPut } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'amfi-nfo.json';
const ARCHIVE_DAYS = 30;
const PACING_MS = 200;

const AMFI_BASE = 'https://www.amfiindia.com/api';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null };
  }
}

// "BANK OF INDIA VALUE FUND" -> "Bank Of India Value Fund". Deliberately
// simple (no acronym exception list, no small-word lowercasing) -- matches
// the spec's own worked example exactly and avoids guessing at AMC-name
// casing conventions (ICICI, SBI, UTI, etc.) that would need a maintained
// exception list to get "right".
function toTitleCase(raw) {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Bank Of India Value Fund" -> "bank-of-india-value-fund"
function slugify(titleCased) {
  return (titleCased || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toDateOnly(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.split('T')[0] || null;
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  let str = String(raw).trim().toLowerCase();

  // Check for Lakhs / Lacs (e.g. "Rs. 10 lacs" -> 10,00,000)
  const lacMatch = str.match(/([\d\.]+)\s*(?:lakhs?|lacs?)/i);
  if (lacMatch) {
    const num = parseFloat(lacMatch[1]);
    return Number.isFinite(num) ? Math.round(num * 100000) : null;
  }

  // Check for Crores / Cr (e.g. "1.5 cr" -> 15,000,000)
  const crMatch = str.match(/([\d\.]+)\s*(?:crores?|cr)/i);
  if (crMatch) {
    const num = parseFloat(crMatch[1]);
    return Number.isFinite(num) ? Math.round(num * 10000000) : null;
  }

  // Clean string: remove leading "rs.", "rs", "inr", "₹", and trailing "/-", "/="
  str = str
    .replace(/^[\s₹]*(?:rs\.?|inr)\s*/i, '')
    .replace(/[\/\-=]+$/g, '')
    .replace(/,/g, '')
    .trim();

  const numMatch = str.match(/[\d]+(?:\.\d+)?/);
  if (numMatch) {
    const n = Number(numMatch[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const toNumber = parseAmount;

// No closeDate to judge by -> default to 'open' rather than guessing
// 'closed'; the summary-list membership (handled in fetchOpenNfos) is the
// real source of truth for what counts as open.
function computeStatus(closeDate, todayStr = new Date().toISOString().split('T')[0]) {
  if (!closeDate) return 'open';
  return todayStr <= closeDate ? 'open' : 'closed';
}

// Maps one AMFI detail-endpoint item (the raw `items[0]` object from either
// /api/new-fund-offer?Scheme_Id=X or /api/sif-nfo?Scheme_Id=X) to this app's
// normalized shape. `type` is 'mf' or 'sif', passed in by the caller rather
// than inferred. SIF endpoints use alternative keys (Investment_Strategy,
// Category, Type, Offer_Price_Rs, Minimum_Subscription_Amount, etc.).
function mapDetailItem(raw, type) {
  const rawName = raw.SchemeName || raw.Investment_Strategy || raw.Specialized_Investment_Fund || '';
  const schemeName = toTitleCase(rawName);
  const closeDate = toDateOnly(
    raw.NewFundOfferClosureDate ||
    raw.New_Fund_Offer_Closure_Date ||
    raw.NewFundEarliestClosureDate ||
    raw.New_Fund_Earliest_Closure_Date
  );
  const openDate = toDateOnly(raw.NewFundLaunchDate || raw.New_Fund_Launch_Date);

  return {
    type,
    schemeId: String(raw.Scheme_Id ?? ''),
    mfId: raw.MF_Id != null ? String(raw.MF_Id) : (raw.sifId != null ? String(raw.sifId) : null),
    amcName: raw.MutualFund || raw.Specialized_Investment_Fund || null,
    schemeName,
    slug: slugify(schemeName),
    schemeType: raw.SchemeType || raw.Type || null,
    category: raw.SchemeCategory || raw.Category || null,
    objective: (raw.ObjectiveofScheme || raw.Objective_of_Investment_Strategy || '').trim() || null,
    openDate,
    closeDate,
    offerPrice: parseAmount(raw.OfferPriceRs || raw.Offer_Price_Rs),
    minInvestment: parseAmount(raw.MinimumSubscriptionAmount || raw.Minimum_Subscription_Amount),
    amcWebsite: raw.ForFurtherDetailsPleaseVisitWebsite || raw.For_Further_Details_Please_Visit_Website || null,
    infoDocumentUrl: raw.infoDocumentUrl || null,
    status: computeStatus(closeDate),
  };
}

// Fetches every currently-open NFO of one type ('mf' or 'sif') as fully
// normalized entries. Returns { ok: true, entries } on success, or
// { ok: false, entries: [] } if the SUMMARY call itself failed (network,
// non-200, or unparsable body) -- callers must treat ok:false as "abort,
// don't touch R2 for this type", never as "empty list". A single detail
// fetch failing for one scheme_id only skips that one entry (logged), it
// does not abort the whole type.
async function fetchOpenNfos(type) {
  const summaryPath = type === 'sif' ? '/sif-nfo' : '/new-fund-offer';
  const summaryRes = await fetchJson(`${AMFI_BASE}${summaryPath}`);
  if (!summaryRes.ok || !Array.isArray(summaryRes.data?.NewFundOffer)) {
    console.error(`[NFO Sync] ${type}: summary fetch failed (status ${summaryRes.status}) -- aborting this type.`);
    return { ok: false, entries: [] };
  }

  const refs = [];
  for (const group of summaryRes.data.NewFundOffer) {
    for (const item of group.items || []) {
      if (item.Scheme_Id != null) refs.push(item.Scheme_Id);
    }
  }

  const entries = [];
  for (const schemeId of refs) {
    const detailRes = await fetchJson(`${AMFI_BASE}${summaryPath}?Scheme_Id=${encodeURIComponent(schemeId)}`);
    await sleep(PACING_MS);
    if (!detailRes.ok || !Array.isArray(detailRes.data?.NewFundOffer)) {
      console.warn(`[NFO Sync] ${type} Scheme_Id=${schemeId}: detail fetch failed, skipping this one entry.`);
      continue;
    }
    const item = detailRes.data.NewFundOffer[0]?.items?.[0];
    if (!item || (!item.SchemeName && !item.Investment_Strategy && !item.Specialized_Investment_Fund)) {
      console.warn(`[NFO Sync] ${type} Scheme_Id=${schemeId}: detail response missing expected fields, skipping.`);
      continue;
    }
    entries.push(mapDetailItem(item, type));
  }

  return { ok: true, entries };
}

// Archival rule: an entry present in `previousEntries` but absent from
// `newOpenEntries` (matched by schemeId) is carried forward with
// status:'closed' as long as its closeDate is within ARCHIVE_DAYS of
// today; anything closed longer than that -- or with no closeDate to
// judge by at all -- is dropped. Pure function, no I/O, so it can be
// checked with fixtures in isolation (see selfTest() below).
function archiveClosedEntries(previousEntries, newOpenEntries, todayStr = new Date().toISOString().split('T')[0]) {
  const openIds = new Set(newOpenEntries.map((e) => e.schemeId));
  const cutoff = new Date(todayStr);
  cutoff.setDate(cutoff.getDate() - ARCHIVE_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const carried = (previousEntries || [])
    .filter((e) => {
      if (openIds.has(e.schemeId)) return false; // still open -- the new fetch already has it
      if (!e.closeDate) return false; // no date to judge staleness by -- drop rather than keep forever
      return e.closeDate >= cutoffStr;
    })
    .map((e) => ({ ...e, status: 'closed' }));

  return [...newOpenEntries, ...carried];
}

// An entry's slug, once assigned for a given schemeId, must never change --
// even if AMFI edits the scheme name mid-offer (a real occurrence: typo
// fixes, name clarifications). Matches by schemeId against the PREVIOUS
// document; a schemeId with no prior entry gets its freshly-derived slug
// (the normal, first-time case).
function preserveSlugs(newEntries, previousEntries) {
  const bySchemeId = new Map((previousEntries || []).map((e) => [e.schemeId, e.slug]));
  return newEntries.map((e) => {
    const prevSlug = bySchemeId.get(e.schemeId);
    return prevSlug && prevSlug !== e.slug ? { ...e, slug: prevSlug } : e;
  });
}

function selfTest() {
  const assert = require('assert');

  assert.strictEqual(toTitleCase('BANK OF INDIA VALUE FUND'), 'Bank Of India Value Fund');
  assert.strictEqual(toTitleCase(''), '');
  assert.strictEqual(slugify('Bank Of India Value Fund'), 'bank-of-india-value-fund');
  assert.strictEqual(toDateOnly('2026-08-28T00:00:00.000Z'), '2026-08-28');
  assert.strictEqual(toDateOnly(null), null);
  assert.strictEqual(parseAmount('5000'), 5000);
  assert.strictEqual(parseAmount('Rs. 10/-'), 10);
  assert.strictEqual(parseAmount('Rs. 10 lacs'), 1000000);
  assert.strictEqual(parseAmount('2.5 Lakhs'), 250000);
  assert.strictEqual(parseAmount(''), null);
  assert.strictEqual(computeStatus('2099-01-01', '2026-09-06'), 'open');
  assert.strictEqual(computeStatus('2000-01-01', '2026-09-06'), 'closed');
  assert.strictEqual(computeStatus(null, '2026-09-06'), 'open');

  const mapped = mapDetailItem(
    {
      Scheme_Id: '14562',
      MF_Id: '46',
      MutualFund: 'Bank of India Mutual Fund',
      SchemeName: 'BANK OF INDIA VALUE FUND',
      SchemeType: 'Open Ended',
      SchemeCategory: 'Equity Schemes - Value Fund',
      ObjectiveofScheme: 'The investment objective of the scheme is to generate long-term capital appreciation.',
      NewFundLaunchDate: '2026-08-28T00:00:00.000Z',
      NewFundOfferClosureDate: '2026-09-11T00:00:00.000Z',
      OfferPriceRs: '10',
      MinimumSubscriptionAmount: '5000',
      ForFurtherDetailsPleaseVisitWebsite: 'https://www.boimf.in',
      infoDocumentUrl: 'https://portal.amfiindia.com/spages/14562.pdf',
    },
    'mf'
  );
  assert.strictEqual(mapped.schemeName, 'Bank Of India Value Fund');
  assert.strictEqual(mapped.slug, 'bank-of-india-value-fund');
  assert.strictEqual(mapped.offerPrice, 10);
  assert.strictEqual(mapped.minInvestment, 5000);
  assert.strictEqual(mapped.openDate, '2026-08-28');
  assert.strictEqual(mapped.closeDate, '2026-09-11');
  assert.strictEqual(mapped.type, 'mf');

  // Real SIF fixture from AMFI API
  const sifMapped = mapDetailItem(
    {
      Scheme_Id: 'S-34',
      sifId: '47',
      Specialized_Investment_Fund: 'Altiva SIF',
      Investment_Strategy: 'Altiva Equity Long-Short Fund',
      Type: 'Open Ended',
      Category: 'Equity Oriented Investment Strategies - Equity Long-Short Fund',
      Objective_of_Investment_Strategy: 'To generate long-term capital appreciation by predominantly investing in listed equity.',
      New_Fund_Launch_Date: '2026-09-10T00:00:00.000Z',
      New_Fund_Offer_Closure_Date: '2026-09-24T00:00:00.000Z',
      Offer_Price_Rs: 'Rs. 10/-',
      Minimum_Subscription_Amount: 'Rs. 10 lacs',
      For_Further_Details_Please_Visit_Website: 'https://www.edelweissmf.com',
      infoDocumentUrl: 'https://portal.amfiindia.com/spages/S-34.pdf',
    },
    'sif'
  );
  assert.strictEqual(sifMapped.schemeName, 'Altiva Equity Long-Short Fund');
  assert.strictEqual(sifMapped.slug, 'altiva-equity-long-short-fund');
  assert.strictEqual(sifMapped.offerPrice, 10);
  assert.strictEqual(sifMapped.minInvestment, 1000000);
  assert.strictEqual(sifMapped.openDate, '2026-09-10');
  assert.strictEqual(sifMapped.closeDate, '2026-09-24');
  assert.strictEqual(sifMapped.type, 'sif');
  assert.strictEqual(sifMapped.amcName, 'Altiva SIF');
  assert.strictEqual(sifMapped.category, 'Equity Oriented Investment Strategies - Equity Long-Short Fund');

  // Defensive mapping: a detail response missing a required field never
  // throws -- fetchOpenNfos() is what actually skips it, mapDetailItem()
  // itself just needs to not blow up on sparse input.
  const sparse = mapDetailItem({ SchemeName: 'X', Scheme_Id: '1' }, 'sif');
  assert.strictEqual(sparse.offerPrice, null);
  assert.strictEqual(sparse.amcWebsite, null);

  const today = '2026-09-06';

  // A previously-open entry no longer in the new open list, closed 10 days
  // ago, carries forward as 'closed'.
  const recentlyClosed = [{ schemeId: 'X1', schemeName: 'Old Fund', closeDate: '2026-08-27', status: 'open' }];
  const carried = archiveClosedEntries(recentlyClosed, [], today);
  assert.strictEqual(carried.length, 1);
  assert.strictEqual(carried[0].status, 'closed');

  // An entry closed more than 30 days ago is dropped, not carried forever.
  const staleClosed = [{ schemeId: 'X2', schemeName: 'Ancient Fund', closeDate: '2026-06-01', status: 'open' }];
  assert.strictEqual(archiveClosedEntries(staleClosed, [], today).length, 0);

  // An entry still present in the new open list is not duplicated via the
  // carry-forward path.
  const stillOpen = [{ schemeId: 'X3', schemeName: 'Still Open Fund', closeDate: '2026-09-20', status: 'open' }];
  assert.strictEqual(archiveClosedEntries(stillOpen, stillOpen, today).length, 1);

  // preserveSlugs: a schemeId already seen before keeps its ORIGINAL slug,
  // even when the freshly-derived slug differs (AMFI edited the scheme name).
  const previousSlugs = [{ schemeId: 'X1', slug: 'original-name-fund' }];
  const renamedFresh = [{ schemeId: 'X1', slug: 'renamed-fund' }];
  const preserved = preserveSlugs(renamedFresh, previousSlugs);
  assert.strictEqual(preserved[0].slug, 'original-name-fund');

  // A genuinely-new schemeId (absent from previousEntries) keeps its
  // freshly-derived slug unchanged.
  const brandNewFresh = [{ schemeId: 'Y1', slug: 'brand-new-fund' }];
  const preservedNew = preserveSlugs(brandNewFresh, previousSlugs);
  assert.strictEqual(preservedNew[0].slug, 'brand-new-fund');

  console.log('[NFO Sync] Self-test: ALL PASSED');
}

async function run() {
  console.log('=== Syncing AMFI New Fund Offers ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Get, r2Put } = await import('../lib/r2.js');

  // A genuine read ERROR (network blip, auth issue) must be distinguished
  // from a legitimately-missing key (a real null return from r2Get, per
  // lib/r2.js) -- both collapsing to `existing = null` would silently drop
  // the closed-archive carry-forward AND make backupThenPut() skip writing
  // the .backup rollback file (it only backs up when existingValue != null).
  let existing = null;
  let existingReadFailed = false;
  try {
    existing = await r2Get(R2_KEY);
  } catch (e) {
    console.error(`[NFO Sync] Could not read existing R2 document (real error, not simply a missing key): ${e.message}`);
    existingReadFailed = true;
  }

  const mfResult = await fetchOpenNfos('mf');
  const sifResult = await fetchOpenNfos('sif');

  if (!mfResult.ok || !sifResult.ok) {
    console.error('[NFO Sync] One or both summary endpoints failed -- preserving existing R2 document untouched.');
    process.exit(1);
  }

  if (existingReadFailed) {
    console.error('[NFO Sync] Aborting: could not read the existing R2 document due to a real error -- refusing to write a version that would silently drop the closed-archive carry-forward and skip the .backup rollback write.');
    process.exit(1);
  }

  const mfOpen = preserveSlugs(mfResult.entries, existing?.mf);
  const sifOpen = preserveSlugs(sifResult.entries, existing?.sif);

  const mf = archiveClosedEntries(existing?.mf, mfOpen);
  const sif = archiveClosedEntries(existing?.sif, sifOpen);

  const result = { syncedAt: new Date().toISOString(), mf, sif };

  console.log(`[NFO Sync] MF: ${mfOpen.length} open, ${mf.length - mfOpen.length} archived-closed.`);
  console.log(`[NFO Sync] SIF: ${sifOpen.length} open, ${sif.length - sifOpen.length} archived-closed.`);

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[NFO Sync] Successfully wrote to R2 (${R2_KEY}).`);
  }
}

module.exports = {
  toTitleCase,
  slugify,
  toDateOnly,
  toNumber,
  parseAmount,
  computeStatus,
  mapDetailItem,
  archiveClosedEntries,
  preserveSlugs,
};

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    run().catch((e) => {
      console.error('[NFO Sync] Fatal error:', e);
      process.exit(1);
    });
  }
}
