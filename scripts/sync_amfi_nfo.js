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

function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

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
// than inferred, since both endpoints share an identical field set.
function mapDetailItem(raw, type) {
  const schemeName = toTitleCase(raw.SchemeName);
  const closeDate = toDateOnly(raw.NewFundOfferClosureDate) || toDateOnly(raw.NewFundEarliestClosureDate);
  return {
    type,
    schemeId: String(raw.Scheme_Id ?? ''),
    mfId: raw.MF_Id != null ? String(raw.MF_Id) : null,
    amcName: raw.MutualFund || null,
    schemeName,
    slug: slugify(schemeName),
    schemeType: raw.SchemeType || null,
    category: raw.SchemeCategory || null,
    objective: (raw.ObjectiveofScheme || '').trim() || null,
    openDate: toDateOnly(raw.NewFundLaunchDate),
    closeDate,
    offerPrice: toNumber(raw.OfferPriceRs),
    minInvestment: toNumber(raw.MinimumSubscriptionAmount),
    amcWebsite: raw.ForFurtherDetailsPleaseVisitWebsite || null,
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
    if (!item || !item.SchemeName) {
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

function selfTest() {
  const assert = require('assert');

  assert.strictEqual(toTitleCase('BANK OF INDIA VALUE FUND'), 'Bank Of India Value Fund');
  assert.strictEqual(toTitleCase(''), '');
  assert.strictEqual(slugify('Bank Of India Value Fund'), 'bank-of-india-value-fund');
  assert.strictEqual(toDateOnly('2026-08-28T00:00:00.000Z'), '2026-08-28');
  assert.strictEqual(toDateOnly(null), null);
  assert.strictEqual(toNumber('5000'), 5000);
  assert.strictEqual(toNumber(''), null);
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

  console.log('[NFO Sync] Self-test: ALL PASSED');
}

async function run() {
  console.log('=== Syncing AMFI New Fund Offers ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Get, r2Put } = await import('../lib/r2.js');

  const existing = await r2Get(R2_KEY).catch((e) => {
    console.warn(`[NFO Sync] Could not read existing R2 document: ${e.message}`);
    return null;
  });

  const mfResult = await fetchOpenNfos('mf');
  const sifResult = await fetchOpenNfos('sif');

  if (!mfResult.ok || !sifResult.ok) {
    console.error('[NFO Sync] One or both summary endpoints failed -- preserving existing R2 document untouched.');
    process.exit(1);
  }

  const mf = archiveClosedEntries(existing?.mf, mfResult.entries);
  const sif = archiveClosedEntries(existing?.sif, sifResult.entries);

  const result = { syncedAt: new Date().toISOString(), mf, sif };

  console.log(`[NFO Sync] MF: ${mfResult.entries.length} open, ${mf.length - mfResult.entries.length} archived-closed.`);
  console.log(`[NFO Sync] SIF: ${sifResult.entries.length} open, ${sif.length - sifResult.entries.length} archived-closed.`);

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
  computeStatus,
  mapDetailItem,
  archiveClosedEntries,
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
