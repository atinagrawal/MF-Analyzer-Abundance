#!/usr/bin/env node
/**
 * scripts/sync_apmi_vista.mjs
 *
 * Ingestion script for APMI VISTA (SEBI Monthly PMS Compliance Reports).
 * Sourced directly from APMI's official unauthenticated API:
 *   GET https://www.apmiindia.org/vistadashboard/api/dashboard
 *
 * Data source structure:
 *   - data.months[i].report.providerDetails[]: 110+ fields per provider per month
 *   - Covers 553 distinct SEBI-registered portfolio managers across 18 months
 *     (510 active in the latest published month).
 *
 * Features & Safety:
 *   - Idempotency & Early-Exit Guard: checks pms_sync_state before downloading ~38 MB.
 *   - Estimated Turnover Proxy: computes (disc_sales + disc_purchases) / 2 / aum_discretionary
 *     (Note: estimated proxy, not a published or SEBI-mandated methodology).
 *   - Explicit derivative summation (equity + commodity + others).
 *   - Duplicate registrationNo detection and warning logging.
 *   - Dynamic is_active state based on presence in the latest synced month.
 *
 * Usage:
 *   node scripts/sync_apmi_vista.mjs               # Standard scheduled run (respects early-exit)
 *   node scripts/sync_apmi_vista.mjs --dry-run     # Test without writing to DB/R2
 *   node scripts/sync_apmi_vista.mjs --force       # Backfill/re-sync all available months
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI Flags
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// Auto-load .env.local if POSTGRES_URL is not set
if (!process.env.POSTGRES_URL) {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('POSTGRES_URL=')) {
        process.env.POSTGRES_URL = line.slice('POSTGRES_URL='.length).trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }
}

const POSTGRES_URL = process.env.POSTGRES_URL;
const API_URL = 'https://www.apmiindia.org/vistadashboard/api/dashboard';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Returns the target previous calendar month string (YYYY-MM).
 * E.g., if run on 2026-10-08, target is '2026-09'.
 */
function getTargetMonth(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

async function run() {
  console.log('=== APMI VISTA PMS Compliance Sync ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active — no database or R2 writes]');
  if (FORCE) console.log('[Force Mode Active — processing all historical months]');

  let pool = null;
  if (!DRY_RUN) {
    if (!POSTGRES_URL) {
      console.error('[APMI VISTA Sync] FATAL: POSTGRES_URL environment variable is required.');
      process.exit(1);
    }
    pool = new pg.Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  }

  const targetMonth = getTargetMonth();
  console.log(`[APMI VISTA Sync] Target calendar month: ${targetMonth}`);

  // Step 1: Early-Exit Check
  if (!FORCE && !DRY_RUN) {
    try {
      const res = await pool.query("SELECT value FROM pms_sync_state WHERE key = 'latest_synced_month'");
      const latestSynced = res.rows[0]?.value;
      if (latestSynced && latestSynced >= targetMonth) {
        console.log(`[APMI VISTA Sync] Already have data for ${latestSynced} (target is ${targetMonth}) — skipping download & exiting early.`);
        await pool.end();
        return;
      }
    } catch (err) {
      console.warn(`[APMI VISTA Sync] Warning checking pms_sync_state: ${err.message}. Proceeding with fetch.`);
    }
  }

  // Step 2: Fetch Live Payload
  console.log(`[APMI VISTA Sync] Fetching ${API_URL}...`);
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  let response;
  try {
    response = await fetch(API_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[APMI VISTA Sync] Fetch failed: ${err.message}`);
    if (pool) await pool.end();
    process.exit(1);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    console.error(`[APMI VISTA Sync] HTTP error ${response.status}: ${response.statusText}`);
    if (pool) await pool.end();
    process.exit(1);
  }

  const payload = await response.json();
  const fetchDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[APMI VISTA Sync] Received payload in ${fetchDuration}s. Total months available: ${payload.months?.length || 0}`);

  if (!payload.months || !Array.isArray(payload.months) || payload.months.length === 0) {
    console.error('[APMI VISTA Sync] Payload contains no valid months array.');
    if (pool) await pool.end();
    process.exit(1);
  }

  // Determine months to process
  let monthsToProcess = [];
  const latestAvailableMonth = payload.months[payload.months.length - 1]?.id;

  if (FORCE) {
    monthsToProcess = payload.months;
    console.log(`[APMI VISTA Sync] Force mode: processing all ${monthsToProcess.length} months (${monthsToProcess[0]?.id} to ${latestAvailableMonth})`);
  } else {
    const targetMonthEntry = payload.months.find(m => m.id === targetMonth);
    if (!targetMonthEntry) {
      console.log(`[APMI VISTA Sync] Target month ${targetMonth} is not yet published by APMI (latest available: ${latestAvailableMonth}).`);
      console.log(`[APMI VISTA Sync] Clean exit. Next scheduled run will check again.`);
      if (pool) await pool.end();
      return;
    }
    monthsToProcess = [targetMonthEntry];
    console.log(`[APMI VISTA Sync] Target month ${targetMonth} found! Processing single month update.`);
  }

  // Step 3: Parse and Extract Providers & Snapshots
  const providersMap = new Map(); // registration_no -> provider object
  const snapshotsList = [];       // array of snapshot objects
  let duplicateCount = 0;

  for (const monthEntry of monthsToProcess) {
    const monthId = monthEntry.id;
    const monthLabel = monthEntry.label;
    const providerDetails = monthEntry.report?.providerDetails || [];

    console.log(`[APMI VISTA Sync] Processing month ${monthId} (${monthLabel}): ${providerDetails.length} providers`);
    const seenInThisMonth = new Set();

    for (const p of providerDetails) {
      const regNo = (p.registrationNo || '').trim();
      const name = (p.name || '').trim();

      if (!regNo || !name) continue;

      if (seenInThisMonth.has(regNo)) {
        console.warn(`[APMI VISTA Sync][WARN] Duplicate registrationNo in month ${monthId}: ${regNo} ("${name}")`);
        duplicateCount++;
        continue;
      }
      seenInThisMonth.add(regNo);

      // Track master provider
      const grandAum = Number(p.grandTotalAum) || 0;
      const clientsTotal = parseInt(p.clientsTotal, 10) || 0;
      const status = (p.status || 'Registered').trim();

      if (!providersMap.has(regNo)) {
        providersMap.set(regNo, {
          registration_no: regNo,
          name,
          normalized_slug: slugify(name),
          status,
          first_seen_month: monthId,
          latest_month: monthId,
          latest_aum_cr: grandAum,
          latest_clients: clientsTotal
        });
      } else {
        const prev = providersMap.get(regNo);
        prev.name = name; // keep most recent name
        prev.status = status;
        prev.latest_month = monthId;
        prev.latest_aum_cr = grandAum;
        prev.latest_clients = clientsTotal;
      }

      // Compute estimated turnover proxy: (sales + purchases) / 2 / aumDiscretionary
      const discAum = Number(p.aumDiscretionaryTotal) || 0;
      const discSales = Number(p.discSales) || 0;
      const discPurchases = Number(p.discPurchases) || 0;
      let discTurnoverRatio = null;
      if (discAum > 0 && (discSales > 0 || discPurchases > 0)) {
        discTurnoverRatio = Number((((discSales + discPurchases) / 2) / discAum).toFixed(4));
      }

      // Sum derivatives: equity + commodity + others
      const derivSum = (Number(p.aumTotalDerivEquity) || 0) +
                       (Number(p.aumTotalDerivCommodity) || 0) +
                       (Number(p.aumTotalDerivOthers) || 0);

      // EPFO / Provident Fund mandates (added in v2.1.0)
      const aumPfEpfo = (Number(p.discPfEpfoAum) || 0) +
                        (Number(p.ndPfEpfoAum) || 0) +
                        (Number(p.advisoryPfEpfoAum) || 0);
      const clientsPfEpfo = (parseInt(p.discPfEpfoClients, 10) || 0) +
                            (parseInt(p.ndPfEpfoClients, 10) || 0) +
                            (parseInt(p.advisoryPfEpfoClients, 10) || 0);

      // Reported returns
      const r1m = (p.return1Month != null && p.return1Month !== '' && p.return1Month !== '-') ? Number(p.return1Month) : null;
      const r1y = (p.return1Year != null && p.return1Year !== '' && p.return1Year !== '-') ? Number(p.return1Year) : null;

      snapshotsList.push({
        registration_no: regNo,
        month_id: monthId,
        month_label: monthLabel,
        grand_total_aum: grandAum,
        aum_discretionary: discAum,
        aum_non_discretionary: Number(p.aumNonDiscretionaryTotal) || 0,
        aum_advisory: Number(p.advisoryAum) || 0,
        aum_co_investment: Number(p.coInvTotal) || 0,
        clients_total: clientsTotal,
        clients_discretionary: parseInt(p.clientsDiscretionary, 10) || 0,
        clients_non_discretionary: parseInt(p.clientsNonDiscretionary, 10) || 0,
        clients_advisory: parseInt(p.clientsAdvisory, 10) || 0,
        clients_co_investment: parseInt(p.clientsCoInvestment, 10) || 0,
        clients_domestic: parseInt(p.totalDomesticClients, 10) || 0,
        clients_foreign: parseInt(p.totalForeignClients, 10) || 0,
        aum_pf_epfo: aumPfEpfo,
        clients_pf_epfo: clientsPfEpfo,
        aum_equity_listed: Number(p.aumTotalEquityListed) || 0,
        aum_equity_unlisted: Number(p.aumTotalEquityUnlisted) || 0,
        aum_plain_debt_listed: Number(p.aumTotalPlainDebtListed) || 0,
        aum_plain_debt_unlisted: Number(p.aumTotalPlainDebtUnlisted) || 0,
        aum_struct_debt_listed: Number(p.aumTotalStructDebtListed) || 0,
        aum_struct_debt_unlisted: Number(p.aumTotalStructDebtUnlisted) || 0,
        aum_derivatives: derivSum,
        aum_mutual_funds: Number(p.aumTotalMutualFund) || 0,
        aum_others: Number(p.aumTotalOthers) || 0,
        disc_inflow_month: Number(p.discInflowMonth) || 0,
        disc_outflow_month: Number(p.discOutflowMonth) || 0,
        disc_net_month: Number(p.discNetMonth) || 0,
        disc_inflow_fy: Number(p.discInflowFY) || 0,
        disc_outflow_fy: Number(p.discOutflowFY) || 0,
        disc_net_fy: Number(p.discNetFY) || 0,
        disc_sales: discSales,
        disc_purchases: discPurchases,
        disc_turnover_ratio: discTurnoverRatio,
        complaints_pending_start: parseInt(p.complaintsPendingStart, 10) || 0,
        complaints_received: parseInt(p.complaintsReceived, 10) || 0,
        complaints_resolved: parseInt(p.complaintsResolved, 10) || 0,
        complaints_pending_end: parseInt(p.complaintsPendingEnd, 10) || 0,
        return_1m: isNaN(r1m) ? null : r1m,
        return_1y: isNaN(r1y) ? null : r1y
      });
    }
  }

  // Disambiguate slugs if multiple SEBI registrations share the exact same entity name
  const slugBuckets = new Map();
  for (const p of providersMap.values()) {
    const baseSlug = slugify(p.name);
    if (!slugBuckets.has(baseSlug)) slugBuckets.set(baseSlug, []);
    slugBuckets.get(baseSlug).push(p);
  }

  for (const [baseSlug, list] of slugBuckets.entries()) {
    if (list.length === 1) {
      list[0].normalized_slug = baseSlug;
    } else {
      list.sort((a, b) => b.latest_month.localeCompare(a.latest_month));
      list.forEach((p, idx) => {
        if (idx === 0 && list.filter(x => x.latest_month === p.latest_month).length === 1) {
          p.normalized_slug = baseSlug;
        } else {
          p.normalized_slug = `${baseSlug}-${p.registration_no.toLowerCase()}`;
        }
      });
    }
  }

  console.log(`\n=== Extraction Summary ===`);
  console.log(`Unique Providers Parsed: ${providersMap.size}`);
  console.log(`Monthly Snapshots Generated: ${snapshotsList.length}`);
  console.log(`Duplicate Registrations Handled: ${duplicateCount}`);

  // Summary statistics for dry-run inspection
  const latestMonthSnapshotList = snapshotsList.filter(s => s.month_id === latestAvailableMonth);
  const activeProvidersInLatest = latestMonthSnapshotList.length;
  const totalIndustryAum = latestMonthSnapshotList.reduce((acc, s) => acc + s.grand_total_aum, 0);
  const totalIndustryEpfoAum = latestMonthSnapshotList.reduce((acc, s) => acc + s.aum_pf_epfo, 0);
  const totalIndustryCoreAum = totalIndustryAum - totalIndustryEpfoAum;
  const totalIndustryClients = latestMonthSnapshotList.reduce((acc, s) => acc + s.clients_total, 0);
  const totalIndustryEpfoClients = latestMonthSnapshotList.reduce((acc, s) => acc + s.clients_pf_epfo, 0);

  console.log(`Active Providers in Latest Month (${latestAvailableMonth}): ${activeProvidersInLatest}`);
  console.log(`Total Industry Raw AUM: ₹${Math.round(totalIndustryAum).toLocaleString('en-IN')} Cr`);
  console.log(`Total Industry EPFO/PF AUM: ₹${Math.round(totalIndustryEpfoAum).toLocaleString('en-IN')} Cr (${((totalIndustryEpfoAum / totalIndustryAum) * 100).toFixed(1)}% of total industry)`);
  console.log(`Total Industry Core PMS AUM (Ex-EPFO): ₹${Math.round(totalIndustryCoreAum).toLocaleString('en-IN')} Cr`);
  console.log(`Total Industry Clients: ${totalIndustryClients.toLocaleString('en-IN')} (EPFO Mandate Clients: ${totalIndustryEpfoClients})`);

  console.log('\n--- Institutional EPFO AMCs Audit (Latest Month ' + latestAvailableMonth + ') ---');
  const epfoBig4 = [
    { nameQuery: 'SBI FUNDS MANAGEMENT', reg: 'INP000000852' },
    { nameQuery: 'UTI ASSET MANAGEMENT', reg: 'INP000000860' },
    { nameQuery: 'HDFC ASSET MANAGEMENT', reg: 'INP000000506' },
    { nameQuery: 'Aditya Birla Sun Life AMC', reg: 'INP000000597' }
  ];
  epfoBig4.forEach(b => {
    const s = latestMonthSnapshotList.find(x => x.registration_no === b.reg);
    if (s) {
      const epfoPct = s.grand_total_aum > 0 ? ((s.aum_pf_epfo / s.grand_total_aum) * 100).toFixed(1) : '0';
      const coreAum = s.grand_total_aum - s.aum_pf_epfo;
      console.log(`- ${b.nameQuery} (${b.reg}):`);
      console.log(`    Raw AUM: ₹${Math.round(s.grand_total_aum).toLocaleString('en-IN')} Cr | Clients: ${s.clients_total}`);
      console.log(`    EPFO AUM: ₹${Math.round(s.aum_pf_epfo).toLocaleString('en-IN')} Cr (${epfoPct}%) | EPFO Clients: ${s.clients_pf_epfo}`);
      console.log(`    Core PMS AUM: ₹${Math.round(coreAum).toLocaleString('en-IN')} Cr`);
    }
  });

  console.log('\nTop 5 Providers by CORE PMS AUM (Ex-EPFO) in ' + latestAvailableMonth + ':');
  const top5Core = [...latestMonthSnapshotList]
    .map(s => ({ ...s, coreAum: s.grand_total_aum - s.aum_pf_epfo }))
    .sort((a, b) => b.coreAum - a.coreAum)
    .slice(0, 5);
  top5Core.forEach((p, i) => {
    const prov = providersMap.get(p.registration_no);
    console.log(`  ${i + 1}. ${prov.name} (${p.registration_no}): ₹${Math.round(p.coreAum).toLocaleString('en-IN')} Cr Core AUM | ${p.clients_total} clients | Net Flow: ₹${p.disc_net_month} Cr`);
  });

  console.log('\nTop 5 Providers by RAW Regulatory AUM in ' + latestAvailableMonth + ':');
  const top5Raw = [...latestMonthSnapshotList].sort((a, b) => b.grand_total_aum - a.grand_total_aum).slice(0, 5);
  top5Raw.forEach((p, i) => {
    const prov = providersMap.get(p.registration_no);
    console.log(`  ${i + 1}. ${prov.name} (${p.registration_no}): ₹${Math.round(p.grand_total_aum).toLocaleString('en-IN')} Cr Raw AUM | ${p.clients_total} clients`);
  });

  if (DRY_RUN) {
    console.log('\n[Dry Run] Database write skipped. All records validated cleanly.');
    return;
  }

  // Step 4: Database Ingestion in a Transaction
  console.log('\n[APMI VISTA Sync] Writing to PostgreSQL...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert pms_providers in multi-row batches
    console.log(`[APMI VISTA Sync] Upserting ${providersMap.size} providers into pms_providers...`);
    const providerValues = [...providersMap.values()];
    const PROVIDER_BATCH_SIZE = 50;
    for (let i = 0; i < providerValues.length; i += PROVIDER_BATCH_SIZE) {
      const batch = providerValues.slice(i, i + PROVIDER_BATCH_SIZE);
      const params = [];
      const valueClauses = [];

      batch.forEach((p, idx) => {
        const offset = idx * 9;
        const isActive = p.latest_month === latestAvailableMonth;
        valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, NOW())`);
        params.push(p.registration_no, p.name, p.normalized_slug, p.status, p.first_seen_month, p.latest_month, p.latest_aum_cr, p.latest_clients, isActive);
      });

      await client.query(`
        INSERT INTO pms_providers (
          registration_no, name, normalized_slug, status, first_seen_month, latest_month, latest_aum_cr, latest_clients, is_active, updated_at
        ) VALUES ${valueClauses.join(', ')}
        ON CONFLICT (registration_no) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          latest_month = EXCLUDED.latest_month,
          latest_aum_cr = EXCLUDED.latest_aum_cr,
          latest_clients = EXCLUDED.latest_clients,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
      `, params);
    }

    // 2. Batch upsert pms_provider_monthly_snapshots using multi-row chunks
    console.log(`[APMI VISTA Sync] Upserting ${snapshotsList.length} rows into pms_provider_monthly_snapshots...`);
    const SNAPSHOT_BATCH_SIZE = 40;
    for (let i = 0; i < snapshotsList.length; i += SNAPSHOT_BATCH_SIZE) {
      const batch = snapshotsList.slice(i, i + SNAPSHOT_BATCH_SIZE);
      const params = [];
      const valueClauses = [];

      batch.forEach((s, idx) => {
        const offset = idx * 41;
        const placeholders = Array.from({ length: 41 }, (_, k) => `$${offset + k + 1}`).join(', ');
        valueClauses.push(`(${placeholders}, NOW())`);

        params.push(
          s.registration_no, s.month_id, s.month_label, s.grand_total_aum, s.aum_discretionary, s.aum_non_discretionary,
          s.aum_advisory, s.aum_co_investment, s.clients_total, s.clients_discretionary, s.clients_non_discretionary,
          s.clients_advisory, s.clients_co_investment, s.clients_domestic, s.clients_foreign,
          s.aum_pf_epfo, s.clients_pf_epfo,
          s.aum_equity_listed, s.aum_equity_unlisted, s.aum_plain_debt_listed, s.aum_plain_debt_unlisted,
          s.aum_struct_debt_listed, s.aum_struct_debt_unlisted, s.aum_derivatives, s.aum_mutual_funds, s.aum_others,
          s.disc_inflow_month, s.disc_outflow_month, s.disc_net_month, s.disc_inflow_fy, s.disc_outflow_fy, s.disc_net_fy,
          s.disc_sales, s.disc_purchases, s.disc_turnover_ratio, s.complaints_pending_start, s.complaints_received,
          s.complaints_resolved, s.complaints_pending_end, s.return_1m, s.return_1y
        );
      });

      await client.query(`
        INSERT INTO pms_provider_monthly_snapshots (
          registration_no, month_id, month_label, grand_total_aum, aum_discretionary, aum_non_discretionary,
          aum_advisory, aum_co_investment, clients_total, clients_discretionary, clients_non_discretionary,
          clients_advisory, clients_co_investment, clients_domestic, clients_foreign,
          aum_pf_epfo, clients_pf_epfo,
          aum_equity_listed, aum_equity_unlisted, aum_plain_debt_listed, aum_plain_debt_unlisted,
          aum_struct_debt_listed, aum_struct_debt_unlisted, aum_derivatives, aum_mutual_funds, aum_others,
          disc_inflow_month, disc_outflow_month, disc_net_month, disc_inflow_fy, disc_outflow_fy, disc_net_fy,
          disc_sales, disc_purchases, disc_turnover_ratio, complaints_pending_start, complaints_received,
          complaints_resolved, complaints_pending_end, return_1m, return_1y, updated_at
        ) VALUES ${valueClauses.join(', ')}
        ON CONFLICT (registration_no, month_id) DO UPDATE SET
          month_label = EXCLUDED.month_label,
          grand_total_aum = EXCLUDED.grand_total_aum,
          aum_discretionary = EXCLUDED.aum_discretionary,
          aum_non_discretionary = EXCLUDED.aum_non_discretionary,
          aum_advisory = EXCLUDED.aum_advisory,
          aum_co_investment = EXCLUDED.aum_co_investment,
          clients_total = EXCLUDED.clients_total,
          clients_discretionary = EXCLUDED.clients_discretionary,
          clients_non_discretionary = EXCLUDED.clients_non_discretionary,
          clients_advisory = EXCLUDED.clients_advisory,
          clients_co_investment = EXCLUDED.clients_co_investment,
          clients_domestic = EXCLUDED.clients_domestic,
          clients_foreign = EXCLUDED.clients_foreign,
          aum_pf_epfo = EXCLUDED.aum_pf_epfo,
          clients_pf_epfo = EXCLUDED.clients_pf_epfo,
          aum_equity_listed = EXCLUDED.aum_equity_listed,
          aum_equity_unlisted = EXCLUDED.aum_equity_unlisted,
          aum_plain_debt_listed = EXCLUDED.aum_plain_debt_listed,
          aum_plain_debt_unlisted = EXCLUDED.aum_plain_debt_unlisted,
          aum_struct_debt_listed = EXCLUDED.aum_struct_debt_listed,
          aum_struct_debt_unlisted = EXCLUDED.aum_struct_debt_unlisted,
          aum_derivatives = EXCLUDED.aum_derivatives,
          aum_mutual_funds = EXCLUDED.aum_mutual_funds,
          aum_others = EXCLUDED.aum_others,
          disc_inflow_month = EXCLUDED.disc_inflow_month,
          disc_outflow_month = EXCLUDED.disc_outflow_month,
          disc_net_month = EXCLUDED.disc_net_month,
          disc_inflow_fy = EXCLUDED.disc_inflow_fy,
          disc_outflow_fy = EXCLUDED.disc_outflow_fy,
          disc_net_fy = EXCLUDED.disc_net_fy,
          disc_sales = EXCLUDED.disc_sales,
          disc_purchases = EXCLUDED.disc_purchases,
          disc_turnover_ratio = EXCLUDED.disc_turnover_ratio,
          complaints_pending_start = EXCLUDED.complaints_pending_start,
          complaints_received = EXCLUDED.complaints_received,
          complaints_resolved = EXCLUDED.complaints_resolved,
          complaints_pending_end = EXCLUDED.complaints_pending_end,
          return_1m = EXCLUDED.return_1m,
          return_1y = EXCLUDED.return_1y,
          updated_at = NOW()
      `, params);
    }

    // 3. Update pms_sync_state
    console.log(`[APMI VISTA Sync] Updating sync state latest_synced_month = ${latestAvailableMonth}...`);
    await client.query(`
      INSERT INTO pms_sync_state (key, value, updated_at)
      VALUES ('latest_synced_month', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [latestAvailableMonth]);

    await client.query('COMMIT');
    console.log('[APMI VISTA Sync] Transaction committed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[APMI VISTA Sync] Transaction rolled back due to error:', err);
    throw err;
  } finally {
    client.release();
    if (pool) await pool.end();
  }

  // Step 5: Save Static Summary JSON for fast frontend consumption
  const summaryData = {
    latestMonth: latestAvailableMonth,
    asOfDate: new Date().toISOString(),
    totalProvidersActive: activeProvidersInLatest,
    totalIndustryRawAumCr: Math.round(totalIndustryAum),
    totalIndustryPfEpfoAumCr: Math.round(totalIndustryEpfoAum),
    totalIndustryCoreAumCr: Math.round(totalIndustryCoreAum),
    totalIndustryClients: totalIndustryClients,
    totalIndustryEpfoClients: totalIndustryEpfoClients,
    topProvidersCore: top5Core.map(p => ({
      name: providersMap.get(p.registration_no)?.name,
      registrationNo: p.registration_no,
      coreAumCr: Math.round(p.coreAum),
      rawAumCr: Math.round(p.grand_total_aum),
      aumPfEpfoCr: Math.round(p.aum_pf_epfo),
      clients: p.clients_total,
      netFlowMonthCr: p.disc_net_month
    })),
    topProvidersRaw: top5Raw.map(p => ({
      name: providersMap.get(p.registration_no)?.name,
      registrationNo: p.registration_no,
      rawAumCr: Math.round(p.grand_total_aum),
      coreAumCr: Math.round(p.grand_total_aum - p.aum_pf_epfo),
      aumPfEpfoCr: Math.round(p.aum_pf_epfo),
      clients: p.clients_total,
      netFlowMonthCr: p.disc_net_month
    }))
  };

  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const summaryPath = path.join(dataDir, 'pms-compliance-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
  console.log(`[APMI VISTA Sync] Saved static summary to ${summaryPath}`);

  // Optional: Upload to R2 if configured
  if (process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME) {
    try {
      const { r2Put } = await import('../lib/r2.js');
      await r2Put('pms-compliance-summary.json', JSON.stringify(summaryData, null, 2));
      console.log('[APMI VISTA Sync] Uploaded summary to Cloudflare R2.');
    } catch (r2Err) {
      console.warn(`[APMI VISTA Sync] R2 upload skipped/failed: ${r2Err.message}`);
    }
  }

  console.log('=== Sync completed successfully ===');
}

run().catch(err => {
  console.error('[APMI VISTA Sync] Fatal error:', err);
  process.exit(1);
});
