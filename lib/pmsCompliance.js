/**
 * lib/pmsCompliance.js
 *
 * Data access and query layer for SEBI Monthly PMS Compliance (APMI VISTA) data.
 * Backed by PostgreSQL (pms_providers, pms_provider_monthly_snapshots, pms_sync_state).
 *
 * Implements:
 * 1. Directory query with mandatory Core PMS AUM default (grand_total_aum - aum_pf_epfo)
 * 2. Provider detail and 18-month historical compliance trajectory
 * 3. Verified SEBI compliance badges for strategy cards on /pms-preferred
 * 4. Sane turnover display formatting (caps/suppresses extreme micro-AUM ratio artifacts)
 */

import pool from './db.js';
import { getPMSLogo } from './providerLogos.js';
import fs from 'fs';
import path from 'path';

// In-memory cache for fast page reloads (10-minute TTL)
let cachedDirectory = null;
let cachedDirectoryTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Formats a raw computed turnover ratio safely.
 * Caps or suppresses extreme values (>20x or micro-AUM baseline) to avoid
 * misleading figures like "47,392x" caused by tiny AUM denominators.
 *
 * @param {number|null} rawRatio
 * @param {number} discAumCr
 * @returns {{ display: string|null, isElevated: boolean, ratio: number|null }}
 */
export function formatTurnoverRatio(rawRatio, discAumCr = 0) {
  if (rawRatio == null || !Number.isFinite(rawRatio)) {
    return { display: null, isElevated: false, ratio: null };
  }

  // Micro-AUM baseline artifact check or extreme trading ratio
  if (rawRatio > 20 || (discAumCr > 0 && discAumCr < 1 && rawRatio > 5)) {
    return { display: '>10x (Elevated)', isElevated: true, ratio: rawRatio };
  }

  if (rawRatio >= 0) {
    return { display: `${rawRatio.toFixed(2)}x`, isElevated: false, ratio: rawRatio };
  }

  return { display: null, isElevated: false, ratio: null };
}

/**
 * Normalizes a raw database row into an application-ready provider compliance object.
 */
function normalizeProviderRow(row) {
  const grandTotalAum = Number(row.grand_total_aum) || 0;
  const aumPfEpfo = Number(row.aum_pf_epfo) || 0;
  const coreAum = Math.max(0, grandTotalAum - aumPfEpfo);

  const clientsTotal = parseInt(row.clients_total, 10) || 0;
  const clientsPfEpfo = parseInt(row.clients_pf_epfo, 10) || 0;
  const coreClients = Math.max(0, clientsTotal - clientsPfEpfo);

  const discAum = Number(row.aum_discretionary) || 0;
  const ndAum = Number(row.aum_non_discretionary) || 0;
  const advisoryAum = Number(row.aum_advisory) || 0;
  const coInvAum = Number(row.aum_co_investment) || 0;

  // Asset allocation components
  const equityListed = Number(row.aum_equity_listed) || 0;
  const equityUnlisted = Number(row.aum_equity_unlisted) || 0;
  const plainDebtListed = Number(row.aum_plain_debt_listed) || 0;
  const plainDebtUnlisted = Number(row.aum_plain_debt_unlisted) || 0;
  const structDebt = (Number(row.aum_struct_debt_listed) || 0) + (Number(row.aum_struct_debt_unlisted) || 0);
  const derivatives = Number(row.aum_derivatives) || 0;
  const mutualFunds = Number(row.aum_mutual_funds) || 0;
  const others = Number(row.aum_others) || 0;

  // Percentage allocations against total regulatory AUM
  const equityListedPct = grandTotalAum > 0 ? Number(((equityListed / grandTotalAum) * 100).toFixed(1)) : 0;
  const equityUnlistedPct = grandTotalAum > 0 ? Number(((equityUnlisted / grandTotalAum) * 100).toFixed(1)) : 0;
  const debtPct = grandTotalAum > 0 ? Number((((plainDebtListed + plainDebtUnlisted + structDebt) / grandTotalAum) * 100).toFixed(1)) : 0;
  const liquidCashPct = Math.max(0, Number((100 - equityListedPct - equityUnlistedPct - debtPct).toFixed(1)));

  // Average ticket size: calculated from Core PMS AUM and Core Clients
  // (AUM in Cr * 100 = Lakhs; Lakhs / Clients = Lakhs per Client)
  const avgTicketLakh = coreClients > 0 ? Number(((coreAum * 100) / coreClients).toFixed(2)) : null;

  // Sane turnover calculation
  const rawTurnover = row.disc_turnover_ratio != null ? Number(row.disc_turnover_ratio) : null;
  const turnover = formatTurnoverRatio(rawTurnover, discAum);

  const logoPath = getPMSLogo(row.name);

  return {
    registrationNo: row.registration_no,
    name: row.name,
    slug: row.normalized_slug,
    status: row.status || 'Registered',
    isActive: Boolean(row.is_active),
    firstSeenMonth: row.first_seen_month,
    latestMonth: row.latest_month || row.month_id,
    monthLabel: row.month_label,

    // Headline AUM (Core Non-EPFO is the primary ranking metric)
    coreAumCr: Number(coreAum.toFixed(2)),
    grandTotalAumCr: Number(grandTotalAum.toFixed(2)),
    aumPfEpfoCr: Number(aumPfEpfo.toFixed(2)),
    isEpfoDominant: grandTotalAum > 0 && (aumPfEpfo / grandTotalAum) > 0.5,
    epfoSharePct: grandTotalAum > 0 ? Number(((aumPfEpfo / grandTotalAum) * 100).toFixed(1)) : 0,

    // Client counts
    coreClients,
    totalClients: clientsTotal,
    clientsPfEpfo,
    clientsDiscretionary: parseInt(row.clients_discretionary, 10) || 0,
    clientsNonDiscretionary: parseInt(row.clients_non_discretionary, 10) || 0,
    clientsAdvisory: parseInt(row.clients_advisory, 10) || 0,
    avgTicketLakh,

    // Service Type Breakdown
    discAumCr: Number(discAum.toFixed(2)),
    ndAumCr: Number(ndAum.toFixed(2)),
    advisoryAumCr: Number(advisoryAum.toFixed(2)),
    coInvAumCr: Number(coInvAum.toFixed(2)),

    // Asset Allocations
    equityListedCr: Number(equityListed.toFixed(2)),
    equityUnlistedCr: Number(equityUnlisted.toFixed(2)),
    debtCr: Number((plainDebtListed + plainDebtUnlisted + structDebt).toFixed(2)),
    structDebtCr: Number(structDebt.toFixed(2)),
    derivativesCr: Number(derivatives.toFixed(2)),
    mutualFundsCr: Number(mutualFunds.toFixed(2)),
    othersCr: Number(others.toFixed(2)),

    equityListedPct,
    equityUnlistedPct,
    debtPct,
    liquidCashPct,
    hasUnlistedEquity: equityUnlisted > 0,
    hasStructuredDebt: structDebt > 0,

    // Flows & Trading
    discInflowMonthCr: Number((Number(row.disc_inflow_month) || 0).toFixed(2)),
    discOutflowMonthCr: Number((Number(row.disc_outflow_month) || 0).toFixed(2)),
    discNetMonthCr: Number((Number(row.disc_net_month) || 0).toFixed(2)),
    discNetFyCr: Number((Number(row.disc_net_fy) || 0).toFixed(2)),
    discSalesCr: Number((Number(row.disc_sales) || 0).toFixed(2)),
    discPurchasesCr: Number((Number(row.disc_purchases) || 0).toFixed(2)),

    // Turnover (estimated computed proxy)
    turnoverDisplay: turnover.display,
    turnoverRatio: turnover.ratio,
    isTurnoverElevated: turnover.isElevated,

    // Complaints
    complaintsPending: parseInt(row.complaints_pending_end, 10) || 0,
    complaintsReceived: parseInt(row.complaints_received, 10) || 0,
    complaintsResolved: parseInt(row.complaints_resolved, 10) || 0,

    // Reported Returns
    return1m: row.return_1m != null ? Number(row.return_1m) : null,
    return1y: row.return_1y != null ? Number(row.return_1y) : null,

    logoPath
  };
}

/**
 * Fetch all PMS providers with their latest monthly compliance snapshot.
 * Default sorts by Core PMS AUM (Ex-EPFO) in descending order.
 *
 * @param {{ includeInactive?: boolean }} options
 * @returns {Promise<Array<object>>}
 */
export async function getAllPmsDirectoryProviders({ includeInactive = false } = {}) {
  const now = Date.now();
  if (cachedDirectory && !includeInactive && (now - cachedDirectoryTimestamp < CACHE_TTL_MS)) {
    return cachedDirectory;
  }

  try {
    const whereClause = includeInactive ? '' : 'WHERE p.is_active = true';
    const query = `
      SELECT
        p.registration_no,
        p.name,
        p.normalized_slug,
        p.status,
        p.first_seen_month,
        p.latest_month,
        p.is_active,
        s.month_id,
        s.month_label,
        s.grand_total_aum,
        s.aum_discretionary,
        s.aum_non_discretionary,
        s.aum_advisory,
        s.aum_co_investment,
        s.aum_pf_epfo,
        s.clients_total,
        s.clients_pf_epfo,
        s.clients_discretionary,
        s.clients_non_discretionary,
        s.clients_advisory,
        s.clients_domestic,
        s.clients_foreign,
        s.aum_equity_listed,
        s.aum_equity_unlisted,
        s.aum_plain_debt_listed,
        s.aum_plain_debt_unlisted,
        s.aum_struct_debt_listed,
        s.aum_struct_debt_unlisted,
        s.aum_derivatives,
        s.aum_mutual_funds,
        s.aum_others,
        s.disc_inflow_month,
        s.disc_outflow_month,
        s.disc_net_month,
        s.disc_inflow_fy,
        s.disc_outflow_fy,
        s.disc_net_fy,
        s.disc_sales,
        s.disc_purchases,
        s.disc_turnover_ratio,
        s.complaints_pending_start,
        s.complaints_received,
        s.complaints_resolved,
        s.complaints_pending_end,
        s.return_1m,
        s.return_1y
      FROM pms_providers p
      JOIN pms_provider_monthly_snapshots s
        ON p.registration_no = s.registration_no AND p.latest_month = s.month_id
      ${whereClause}
      ORDER BY (s.grand_total_aum - s.aum_pf_epfo) DESC;
    `;

    const res = await pool.query(query);
    const normalized = res.rows.map(normalizeProviderRow);

    if (!includeInactive) {
      cachedDirectory = normalized;
      cachedDirectoryTimestamp = now;
    }

    return normalized;
  } catch (err) {
    console.error('[lib/pmsCompliance] Database query failed:', err.message);

    // Fallback to static summary JSON if database is unreachable
    try {
      const summaryFile = path.resolve(process.cwd(), 'data/pms-compliance-summary.json');
      if (fs.existsSync(summaryFile)) {
        const raw = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
        if (Array.isArray(raw.topProvidersCore)) {
          return raw.topProvidersCore.map(p => ({
            registrationNo: p.registrationNo,
            name: p.name,
            slug: p.registrationNo.toLowerCase(),
            status: 'Registered',
            isActive: true,
            coreAumCr: p.coreAumCr,
            grandTotalAumCr: p.rawAumCr,
            aumPfEpfoCr: p.aumPfEpfoCr,
            totalClients: p.clients,
            coreClients: p.clients,
            discNetMonthCr: p.netFlowMonthCr,
            logoPath: getPMSLogo(p.name)
          }));
        }
      }
    } catch (_) {}

    return [];
  }
}

/**
 * Retrieve a single PMS provider by slug or registration number,
 * along with its full 18-month historical compliance trajectory.
 *
 * @param {string} slugOrRegNo
 * @returns {Promise<{ provider: object, history: Array<object> }|null>}
 */
export async function getPmsProviderBySlug(slugOrRegNo) {
  if (!slugOrRegNo) return null;
  const lookup = slugOrRegNo.trim();

  try {
    const provRes = await pool.query(`
      SELECT * FROM pms_providers
      WHERE normalized_slug = $1 OR registration_no = $2
      LIMIT 1;
    `, [lookup.toLowerCase(), lookup.toUpperCase()]);

    if (provRes.rows.length === 0) return null;
    const providerMaster = provRes.rows[0];

    const snapRes = await pool.query(`
      SELECT * FROM pms_provider_monthly_snapshots
      WHERE registration_no = $1
      ORDER BY month_id ASC;
    `, [providerMaster.registration_no]);

    const history = snapRes.rows.map(row => {
      const grandTotalAum = Number(row.grand_total_aum) || 0;
      const aumPfEpfo = Number(row.aum_pf_epfo) || 0;
      const coreAum = Math.max(0, grandTotalAum - aumPfEpfo);
      const clientsTotal = parseInt(row.clients_total, 10) || 0;
      const clientsPfEpfo = parseInt(row.clients_pf_epfo, 10) || 0;
      const coreClients = Math.max(0, clientsTotal - clientsPfEpfo);
      const discAum = Number(row.aum_discretionary) || 0;

      const rawTurnover = row.disc_turnover_ratio != null ? Number(row.disc_turnover_ratio) : null;
      const turnover = formatTurnoverRatio(rawTurnover, discAum);

      return {
        monthId: row.month_id,
        monthLabel: row.month_label,
        coreAumCr: Number(coreAum.toFixed(2)),
        grandTotalAumCr: Number(grandTotalAum.toFixed(2)),
        aumPfEpfoCr: Number(aumPfEpfo.toFixed(2)),
        discAumCr: Number(discAum.toFixed(2)),
        ndAumCr: Number((Number(row.aum_non_discretionary) || 0).toFixed(2)),
        advisoryAumCr: Number((Number(row.aum_advisory) || 0).toFixed(2)),
        coreClients,
        totalClients: clientsTotal,
        equityListedCr: Number((Number(row.aum_equity_listed) || 0).toFixed(2)),
        debtCr: Number(((Number(row.aum_plain_debt_listed) || 0) + (Number(row.aum_plain_debt_unlisted) || 0) + (Number(row.aum_struct_debt_listed) || 0) + (Number(row.aum_struct_debt_unlisted) || 0)).toFixed(2)),
        discInflowMonthCr: Number((Number(row.disc_inflow_month) || 0).toFixed(2)),
        discOutflowMonthCr: Number((Number(row.disc_outflow_month) || 0).toFixed(2)),
        discNetMonthCr: Number((Number(row.disc_net_month) || 0).toFixed(2)),
        turnoverDisplay: turnover.display,
        turnoverRatio: turnover.ratio,
        complaintsPending: parseInt(row.complaints_pending_end, 10) || 0,
        complaintsReceived: parseInt(row.complaints_received, 10) || 0,
        complaintsResolved: parseInt(row.complaints_resolved, 10) || 0,
        return1m: row.return_1m != null ? Number(row.return_1m) : null,
        return1y: row.return_1y != null ? Number(row.return_1y) : null
      };
    });

    const latestRow = snapRes.rows[snapRes.rows.length - 1];
    const latestNorm = latestRow ? normalizeProviderRow({ ...providerMaster, ...latestRow }) : null;

    return {
      provider: latestNorm,
      history
    };
  } catch (err) {
    console.error(`[lib/pmsCompliance] Error fetching provider ${slugOrRegNo}:`, err.message);
    return null;
  }
}

/**
 * Match a strategy provider name (e.g. from /pms-preferred: "Abakkus", "Marcellus",
 * "ValueQuest", "ASK Investment", "Carnelian") to its SEBI compliance record.
 *
 * @param {string} providerName
 * @returns {Promise<object|null>}
 */
export async function getComplianceBadgeForProvider(providerName) {
  if (!providerName) return null;
  const providers = await getAllPmsDirectoryProviders({ includeInactive: false });
  if (!providers || providers.length === 0) return null;

  const cleanQuery = providerName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const queryTokens = cleanQuery.split(' ').filter(w => w.length > 2);

  // Exact match first
  let match = providers.find(p => p.name.toLowerCase() === providerName.toLowerCase());

  // Substring or token match
  if (!match) {
    match = providers.find(p => {
      const pName = p.name.toLowerCase();
      return queryTokens.every(token => pName.includes(token));
    });
  }

  // Fallback to first significant token match (e.g. "Abakkus", "Carnelian", "ValueQuest")
  if (!match && queryTokens.length > 0) {
    const primaryToken = queryTokens[0];
    match = providers.find(p => p.name.toLowerCase().includes(primaryToken));
  }

  if (!match) return null;

  return {
    matched: true,
    registrationNo: match.registrationNo,
    name: match.name,
    slug: match.slug,
    status: match.status,
    asOfMonth: match.monthLabel || match.latestMonth,
    coreAumCr: match.coreAumCr,
    grandTotalAumCr: match.grandTotalAumCr,
    aumPfEpfoCr: match.aumPfEpfoCr,
    isEpfoDominant: match.isEpfoDominant,
    coreClients: match.coreClients,
    totalClients: match.totalClients,
    equityListedPct: match.equityListedPct,
    debtPct: match.debtPct,
    liquidCashPct: match.liquidCashPct,
    turnoverDisplay: match.turnoverDisplay,
    turnoverRatio: match.turnoverRatio,
    isTurnoverElevated: match.isTurnoverElevated,
    discNetMonthCr: match.discNetMonthCr,
    complaintsPending: match.complaintsPending
  };
}
