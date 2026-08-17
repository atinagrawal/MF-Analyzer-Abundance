'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { schemeXirr, manualHoldingXirr, schemeCashFlows, manualHoldingCashFlows, combinedXirr } from '@/lib/xirr';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getSIFLogo, getMFLogoFromSchemeName } from '@/lib/providerLogos';
import growwByAmfiCode from '@/data/groww-exit-loads.json';
import { CAS_FAQ } from './faqData';
import { FundDetailDrawer, SifDetailDrawer } from '@/components/HoldingDetailDrawer';
import { TAX, inferCategory, applyLossOffset } from '@/lib/taxCalc';
import LossAdjustmentPanel from '@/components/LossAdjustmentPanel';
import RedemptionPlanner from '@/components/RedemptionPlanner';
import TransactionHistoryDrawer, { isTransmissionTxn, earliestTxnDate, navHistoryCacheKey } from '@/components/TransactionHistoryDrawer';
import { resolveDistributors, extractArnDigits, formatDistributorName } from '@/lib/distributorResolution';

// isin-scheme-master.json (~8.4MB, ~26k entries) used to be statically
// imported here -- meaning it shipped to every visitor's BROWSER as part of
// this page's JS bundle, not just the server build. Now fetched once from
// /api/scheme-master-facts (R2-backed, see that route) into CasTrackerInner's
// masterFacts state and threaded through as an explicit parameter to every
// function below that needs it, rather than closing over a module-level
// constant -- multiple components (PortfolioRedemptionPlanner, and this
// module's own top-level functions) need the same data, so it can't just be
// a value computed inline in one component's body.

// Builds the same normalized-name -> scheme-master-entry index the old
// module-level IIFE built from the static import, now from the fetched
// byIsin map. Deliberately uses this file's OWN normalization (not
// lib/normalizeSchemeName, which the API route's own byNormName index uses
// for a different consumer) so matching behavior is unchanged from before
// this migration.
function buildNameToSchemeEntry(byIsin) {
  const map = {};
  for (const entry of Object.values(byIsin || {})) {
    if (entry.name) {
      const norm = entry.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (norm && !map[norm]) map[norm] = entry; // first-wins on rare name collisions
    }
  }
  return map;
}

// data/groww-exit-loads.json is keyed by AMFI code only -- derive a
// secondary ISIN index once, mirroring app/api/scheme-master-facts/route.js's
// own dual-indexing so both lookup paths in getExitLoadInfo resolve.
const growwByIsin = (() => {
  const map = {};
  for (const rec of Object.values(growwByAmfiCode)) {
    if (rec.isin) map[rec.isin] = rec;
  }
  return map;
})();

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const CACHE_PREFIX = 'cas_parse_v2_';

function getFileKey(file) {
  return CACHE_PREFIX + [file.name, file.size, file.lastModified].join('|');
}

// Shared by the fund-grid render and the PDF/Excel export functions, so both
// always see the exact same holdings list -- normalises manual holdings into
// the same shape as CAS holdings and tags each with a stable id.
function buildAllHoldings(currentInfo, manualHoldings, sifNavMap, activePan, sifNameMap = {}) {
  const manualMapped = manualHoldings.map(h => {
    const pu = parseFloat(h.purchase_nav);
    const u  = parseFloat(h.units);
    const ln = h.fund_type === 'SIF' ? (sifNavMap[h.amfi_code] ?? null) : null;
    const val = (ln ?? pu) * u;
    return {
      id:            `manual-${h.id}`,
      name:          h.fund_name,
      sifHouseName:  h.fund_type === 'SIF' ? (sifNameMap[h.amfi_code] || null) : null,
      folio:         h.folio || null,
      units:         u,
      liveNav:       ln ?? pu,
      isLive:        ln != null,
      invested:      pu * u,
      value:         val,
      avgPurchaseNav:pu,
      isELSS:        false,
      lockedValue:   0,
      nominee:       null,
      advisor:       null,
      notes:         h.notes || null,
      xirr:          manualHoldingXirr({ purchaseDate: h.purchase_date, invested: pu * u, currentValue: val }),
      xirrFlows:     manualHoldingCashFlows({ purchaseDate: h.purchase_date, invested: pu * u }),
      source:        'manual',
      fund_type:     h.fund_type,
      amfiCode:      h.amfi_code || null,
      // Manually-added holdings (used for SIF and other funds not yet
      // reflected in an uploaded CAS -- SIF itself DOES appear in CAS
      // statements with full transaction history when it's already there,
      // see processCasData's resolveSif) have no real transaction log of
      // their own -- but they DO have exactly one known purchase (date/NAV/
      // units), which is precisely the shape the Transaction History
      // drawer's single-transaction path already handles well (Rate
      // Journey strip + on-demand NAV history). Only synthesized when a
      // purchase date was actually recorded -- without one, `new Date(null)`
      // silently resolves to the 1970 epoch instead of throwing, which
      // would otherwise plot a bogus, decades-early point.
      transactions: (pu > 0 && u > 0 && h.purchase_date)
        ? [{ date: h.purchase_date, type: 'PURCHASE', amount: pu * u, units: u, nav: pu }]
        : [],
    };
  });

  const casHoldings = (currentInfo.holdings || []).map(h => ({
    ...h, source: 'cas',
    // processCasData already resolves each holding's fund_type ('SIF' or
    // 'Mutual Fund') by matching against the AMFI SIF scheme master -- CAS
    // statements DO include SIF holdings with full transaction history,
    // this is only a fallback for holdings processed before that existed.
    fund_type: h.fund_type || 'Mutual Fund',
    // h.__ownerPan is only present in family view (mergeFamilyView tags it)
    // -- falls back to activePan in the normal single-PAN view. Using
    // activePan unconditionally here would collide two different family
    // members' ids for the same fund in family view, since a plain
    // checkbox/redemption selection is keyed by this id.
    id: `cas-${h.__ownerPan || activePan}-${h.folio || ''}-${h.amfiCode || h.name}`,
  }));

  return [...casHoldings, ...manualMapped];
}

function readCache(file) {
  if (typeof window === 'undefined') return null;
  try {
    const cached = sessionStorage.getItem(getFileKey(file));
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(file, data) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(getFileKey(file), JSON.stringify(data));
  } catch (e) {}
}

function isPanLike(str) {
  return PAN_REGEX.test(str);
}

function fmtINR(val) {
  if (val < 0) return fmtINR(Math.abs(val));
  if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
  if (val >= 1000) return (val / 1000).toFixed(2) + ' K';
  return val.toFixed(2);
}

function fmtDec(val, decimals = 4) {
  return val.toFixed(decimals);
}

// FIFO cost basis calculation
function calculateFifoCost(scheme, currentNav, isTransmittedFolio = false) {
  const units = parseFloat(scheme.close) || 0;
  if (units === 0) return { invested: 0, lockedValue: 0 };

  const directCost = parseFloat(scheme.valuation?.cost || scheme.cost || 0);
  let buyLots = [];
  let lockedUnits = 0;
  
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const isELSS = /ELSS|TAX.?SAVER/i.test(scheme.scheme);

  (scheme.transactions || []).forEach(txn => {
    const type = (txn.type || '').toUpperCase();
    const txnUnits = parseFloat(txn.units) || 0;
    const amount = parseFloat(txn.amount) || 0;
    if (txnUnits === 0) return;

    if (/PURCHASE|SIP|SWITCH.?IN|REINVEST/.test(type)) {
      buyLots.push({
        units: txnUnits,
        amount: amount,
        nav: amount / txnUnits,
        date: new Date(txn.date),
        // "Transmission" is flagged either per-transaction, from free-text
        // description wording some AMCs use (casparser gives it no distinct
        // type), or -- when isTransmittedFolio is set -- because the WHOLE
        // folio came via a folio-level "Transmission of Folios" event that
        // other AMCs record instead, invisible on any individual
        // transaction (see api/parse.py's build_folio_transmission_map).
        // Either way lot.nav/lot.date are already this transaction's own
        // preserved original purchase rate and date (verified against real
        // CAS data for both patterns), so no special cost-basis handling is
        // needed here -- just flagged for the Redemption Planner to label
        // informationally.
        isTransmission: isTransmissionTxn(txn.description) || isTransmittedFolio,
      });
    } else if (/REDEMPTION|SWITCH.?OUT|REVERSAL/.test(type)) {
      // REVERSAL voids an earlier purchase attempt (most commonly a SIP
      // instalment that bounced -- "ER04: Insufficient Balance" -- and was
      // retried same-day). Removing FIFO-style, same as a real sell, was
      // verified against a real CAS to reconcile exactly: every scheme with
      // an unhandled reversal was overstating FIFO invested by the full
      // reversed amount (₹3.5K-₹44K on the funds checked), since the
      // voided purchase's lot was never removed.
      let rem = Math.abs(txnUnits);
      while (rem > 0 && buyLots.length > 0) {
        if (buyLots[0].units <= rem) {
          rem -= buyLots[0].units;
          buyLots.shift();
        } else {
          buyLots[0].units -= rem;
          buyLots[0].amount = buyLots[0].units * buyLots[0].nav;
          rem = 0;
        }
      }
    }
  });

  let fifoInvested = 0;
  buyLots.forEach(lot => {
    fifoInvested += lot.amount;
    if (isELSS && lot.date > threeYearsAgo) {
      lockedUnits += lot.units;
    }
  });

  // PARTIAL/TRUNCATED CAS: if sum of buy lots is less than current unit balance,
  // the difference represents opening balance / older holdings before the CAS start date.
  // Prepend as oldest synthetic lot (epoch date = LTCG, 0% exit load safe default).
  const totalBuyUnits = buyLots.reduce((sum, l) => sum + l.units, 0);
  if (units > totalBuyUnits + 0.001) {
    const unaccountedUnits = units - totalBuyUnits;
    const casCost = parseFloat(scheme.valuation?.cost || scheme.cost || 0);
    const unaccountedCost = Math.max(0, casCost - fifoInvested);
    // If the CAS didn't provide a cost basis at all (unaccountedCost is 0),
    // default this synthetic lot's NAV to the CURRENT NAV — i.e. assume the
    // old, unaccounted-for position broke even — rather than implicitly
    // assuming its entire current value is a gain (nav=0), which would
    // overstate LTCG and therefore tax for exactly the truncated-CAS case
    // this lot exists to handle.
    const avgNav = unaccountedCost > 0 ? (unaccountedCost / unaccountedUnits) : currentNav;

    buyLots.unshift({
      units: unaccountedUnits,
      amount: unaccountedCost,
      nav: avgNav,
      date: new Date(0),  // epoch = old opening balance, safe LTCG & 0% exit load
      synthetic: true,    // flag for UI notice
    });
    fifoInvested += unaccountedCost;
  }

  let finalInvested = fifoInvested;
  if (directCost > 0 && (fifoInvested === 0 || fifoInvested < directCost * 0.5)) {
    finalInvested = directCost;
  }

  return {
    invested:   Math.max(0, finalInvested),
    lockedValue: lockedUnits * currentNav,
    buyLots,   // remaining lots (oldest first) — used by FIFO Redemption Planner
  };
}



// ── Exit load rules ──────────────────────────────────────────────────────────
// Returns the exit load RATE (0–1) for a given lot, based on category + scheme name.
// Override: pass overrideRate (decimal, e.g. 0.01) to use a custom rate directly.
//
// Category rules (SEBI/AMFI standard, as of 2024):
//   'liquid'     — 0%      (Liquid, Overnight, Money Market)
//   'ultrashort' — 0–0.07% (varies; using 0 as safe default)
//   'debt'       — 0%      (most debt categories: Short/Medium/Long Duration, Gilt,
//                            Banking & PSU, Corporate Bond, Credit Risk, FMP)
//   'hybrid'     — 1% within 365 days (Aggressive Hybrid, Balanced Advantage,
//                    Multi-Asset, Equity Savings); 0% for Conservative Hybrid & Arbitrage
//   'equity'     — 1% within 365 days (all equity categories incl. Sectoral/Thematic)
//                  Index funds/ETFs often 0% — detected by name
//
// For accurate planning: use the per-fund override in the UI.
// Returns detailed exit load info including auto-detected status label and schedule.
//
// Labels are deliberately prefixed "BSE:" (sourced from the synced scheme
// master, data/isin-scheme-master.json) vs "Guess:" (this file's own
// name-regex heuristic, used only when no BSE record exists for the ISIN) —
// so the UI never implies name-guessed and BSE-confirmed numbers carry the
// same confidence.
function inferExitLoadCategory(fundName) {
  const n = (fundName || '').toUpperCase();
  if (/LIQUID|OVERNIGHT|MONEY.?MARKET/.test(n)) return 'liquid';
  if (/ULTRA.?SHORT|LOW.?DURA/.test(n)) return 'ultrashort';
  if (/GILT|BANKING.?PSU|CORP.?BOND|CREDIT.?RISK|FMP|FIXED.?MATURITY|ARBITRAGE|CONSERVATIVE.?HYBRID/.test(n)) return 'debt';
  if (/SHORT.?DURA|MEDIUM.?DURA|LONG.?DURA/.test(n)) return 'debt';
  if (/INDEX|ETF|NIFTY|SENSEX/.test(n)) return 'index'; // many index funds have 0%
  return 'equity_hybrid'; // default — equity and most hybrid
}

// Formats a tier's day-count as a short period label — months for anything
// under a year (so a 180-day tier reads "<6mo", not the misleading "<0y"
// Math.round(180/365) would otherwise produce), years above that.
function formatTierPeriod(days) {
  if (days < 365) return `${Math.round(days / 30.44)}mo`;
  return `${Math.round(days / 365)}y`;
}

function getExitLoadInfo(fundName, isin, masterFacts) {
  // 1. Verified Groww Exit Loads (Decoupled, high-confidence dataset)
  const growwRec = (isin && growwByIsin[isin]) || (() => {
    const norm = (fundName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!norm) return null;
    return Object.values(growwByAmfiCode).find(r => r.schemeName && r.schemeName.toUpperCase().replace(/[^A-Z0-9]/g, '') === norm);
  })();

  if (growwRec && growwRec.rawText && growwRec.confidence === 'high' && Array.isArray(growwRec.tiers)) {
    const sortedTiers = [...growwRec.tiers].sort((a, b) => a.days - b.days);
    const tierStr = sortedTiers.length === 0
      ? '0% (No Load)'
      : sortedTiers.map(t => `${(t.rate * 100).toFixed(2).replace(/\.00$/, '')}% (<${formatTierPeriod(t.days)})`).join(' / ');
    const freeStr = growwRec.freePercent ? ` (${growwRec.freePercent}% free)` : '';
    const label = `Verified: ${tierStr}${freeStr}`;
    return {
      isLocked: false,
      hasExitLoad: sortedTiers.length > 0,
      schedule: sortedTiers,
      freePercent: growwRec.freePercent || 0,
      label,
      rawText: growwRec.rawText
    };
  }

  // Groww found the real clause but couldn't parse it into numbers with
  // confidence (confidence === 'low'). Do NOT fabricate a schedule here --
  // that would silently compute a wrong exit-load amount from a guess
  // dressed up as "verified" data. Instead fall through to the existing
  // BSE-flag/category-guess logic below for the actual number, and tag
  // whatever it returns with the real clause text so the UI can flag it
  // for manual review instead of trusting the guess unquestioningly.
  const needsReview = !!(growwRec && growwRec.rawText && growwRec.confidence === 'low');
  const withReview = (result) => needsReview
    ? { ...result, label: `${result.label} — Review: "${growwRec.rawText}"`, rawText: growwRec.rawText, needsReview: true }
    : result;

  // 2. Fallback to existing BSE flag logic
  let masterEntry = isin && masterFacts?.byIsin?.[isin];
  if (!masterEntry && fundName) {
    // Name fallback if ISIN is not passed or empty
    const norm = (fundName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm) masterEntry = masterFacts?.byNormName?.[norm];
  }

  if (masterEntry) {
    if (masterEntry.isLocked) {
      return withReview({ isLocked: true, hasExitLoad: false, schedule: [], label: 'BSE: ELSS Locked' });
    }
    if (!masterEntry.hasExitLoad) {
      return withReview({ isLocked: false, hasExitLoad: false, schedule: [], label: 'BSE: 0% (No Load)' });
    }
    if (masterEntry.tiers && masterEntry.tiers.length > 0) {
      // Sort ascending by days — calcLotExitLoad's tier loop assumes this
      // order (first tier whose `days` exceeds the holding period wins), so
      // enforce it here regardless of how upstream data happens to be
      // ordered, rather than trusting every data source to already be sorted.
      const sortedTiers = [...masterEntry.tiers].sort((a, b) => a.days - b.days);
      const tierStr = sortedTiers.map(t => `${(t.rate * 100).toFixed(0)}% (<${formatTierPeriod(t.days)})`).join(' / ');
      const label = masterEntry.freePercent ? `BSE: 0% (${masterEntry.freePercent}% free), ${tierStr}` : `BSE: ${tierStr}`;
      return withReview({ isLocked: false, hasExitLoad: true, schedule: sortedTiers, freePercent: masterEntry.freePercent || 0, label });
    }
    return withReview({ isLocked: false, hasExitLoad: true, schedule: [{ rate: 0.01, days: 365 }], label: 'BSE: load confirmed (~1% <365d)' });
  }

  // 3. Fallback to pre-existing category guess logic
  const cat = inferExitLoadCategory(fundName);
  switch (cat) {
    case 'liquid':       return withReview({ isLocked: false, hasExitLoad: false, schedule: [], label: 'Guess: 0% (Liquid/Overnight)' });
    case 'ultrashort':   return withReview({ isLocked: false, hasExitLoad: false, schedule: [], label: 'Guess: 0% (Ultra Short)' });
    case 'debt':         return withReview({ isLocked: false, hasExitLoad: false, schedule: [], label: 'Guess: 0% (Debt/Gilt)' });
    case 'index':        return withReview({ isLocked: false, hasExitLoad: false, schedule: [], label: 'Guess: 0% (Index/ETF)' });
    case 'equity_hybrid':
    default:
      if (/ELSS|TAX.?SAVER/i.test(fundName || '')) {
        return withReview({ isLocked: true, hasExitLoad: false, schedule: [], label: 'Guess: ELSS Locked' });
      }
      return withReview({ isLocked: false, hasExitLoad: true, schedule: [{ rate: 0.01, days: 365 }], label: 'Guess: 1% (< 365 days)' });
  }
}

// Shared by both PortfolioRedemptionPlanner code paths (target-amount mode's
// `eligible` list and selected-funds mode's row builder) so the "override if
// present, else inferred BSE/name-guess rate" logic can't drift between them
// (a prior version of one path omitted `fund.isin`, silently skipping the
// ISIN-based BSE lookup for that path only).
function getEffectiveExitLoadRate(fund, exitLoadOverrides, masterFacts) {
  return exitLoadOverrides[fund.name] != null
    ? exitLoadOverrides[fund.name]
    : getExitLoadRate(fund.name, fund.isin, masterFacts)[0]?.rate ?? 0;
}

function getExitLoadRate(fundName, isin, masterFacts) {
  return getExitLoadInfo(fundName, isin, masterFacts).schedule;
}

// Calculates estimated bank credit calendar date skipping weekends.
// Does NOT account for market/bank holidays — "Est." in the UI label
// reflects that this is an approximation, not an exact settlement date.
function getEstCreditDate(settlementStr) {
  const days = parseInt((settlementStr || 'T+2').replace(/[^0-9]/g, ''), 10) || 2;
  let d = new Date();
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sat/Sun
      added++;
    }
  }
  return {
    dateStr: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
    daysLabel: `T+${days}`
  };
}

// Compute exact exit load for a consumed portion (`take` units) of a transaction lot,
// taking into account:
// 1. Individual purchase transaction date (heldDays = redeemDate - buyDate)
// 2. Exact tier schedule (e.g., 2% < 365d, 1% < 730d, 0% > 730d)
// 3. Penalty-free exemption quota (e.g., 10% of total units free of exit load)
// 4. User manual override rate per fund card
function calcLotExitLoad({
  lot,
  take,
  currentNav,
  redeemDate,
  fundName,
  isin,
  overrideRate,
  totalFundUnits,
  cumUnitsRedeemed,
  masterFacts
}) {
  if (lot.synthetic || take <= 0) return { exitLoadAmt: 0, effectiveRate: 0 };

  const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
  const heldDays = Math.floor((redeemDate - buyDate) / (24 * 3600 * 1000));
  const info = getExitLoadInfo(fundName, isin, masterFacts);

  // A user-entered override takes precedence over the auto-detected
  // hasExitLoad classification — it exists specifically to correct funds
  // the auto-detection got wrong (e.g. a fund shown as "0% No Load" that
  // actually charges one). ELSS lock-in is still respected since that's a
  // legal restriction, not a rate guess, and this bypasses the free-quota
  // exemption logic below exactly as the pre-override code path already did.
  if (overrideRate != null) {
    if (info.isLocked) {
      return { exitLoadAmt: 0, effectiveRate: 0 };
    }
    const maxDays = (info.schedule && info.schedule.length > 0)
      ? Math.max(...info.schedule.map(s => s.days))
      : 365;
    const rawRate = heldDays < maxDays ? overrideRate : 0;
    if (rawRate === 0) return { exitLoadAmt: 0, effectiveRate: 0 };
    const exitLoadAmt = take * currentNav * rawRate;
    return { exitLoadAmt, effectiveRate: rawRate };
  }

  if (!info.hasExitLoad || info.isLocked) {
    return { exitLoadAmt: 0, effectiveRate: 0 };
  }

  // Determine raw rate for this specific lot's holding period (auto-detected path)
  let rawRate = 0;
  for (const { rate, days } of info.schedule) {
    if (heldDays < days) {
      rawRate = rate;
      break;
    }
  }

  if (rawRate === 0) {
    return { exitLoadAmt: 0, effectiveRate: 0 };
  }

  // Handle penalty-free unit exemption quota (e.g. 10% of total fund units)
  const freePercent = info.freePercent || 0;
  if (freePercent > 0 && totalFundUnits > 0 && overrideRate == null) {
    const freeQuotaUnits = totalFundUnits * (freePercent / 100);
    const prevRedeemed = cumUnitsRedeemed || 0;
    const newRedeemed = prevRedeemed + take;

    if (newRedeemed <= freeQuotaUnits) {
      // Entire take portion is within penalty-free quota!
      return { exitLoadAmt: 0, effectiveRate: 0 };
    } else if (prevRedeemed < freeQuotaUnits) {
      // Partial free: portion up to freeQuotaUnits is 0%, rest incurs rawRate
      const freeUnits = freeQuotaUnits - prevRedeemed;
      const taxableUnits = take - freeUnits;
      const exitLoadAmt = taxableUnits * currentNav * rawRate;
      const denom = take * currentNav;
      const effectiveRate = denom > 0 ? exitLoadAmt / denom : 0;
      return { exitLoadAmt, effectiveRate };
    }
  }

  // All `take` units incur rawRate
  const exitLoadAmt = take * currentNav * rawRate;
  return { exitLoadAmt, effectiveRate: rawRate };
}

// ── Portfolio-level redemption scoring (for sort order) ──────────────────────
function fundScore(holding, strategy, today) {
  const lots  = holding.buyLots || [];
  const ltcgMs = 12 * 30.44 * 24 * 3600 * 1000;
  const gain   = holding.value - holding.invested;
  const hasLoss = gain < 0;
  const allLTCG = lots.length > 0 && lots.every(l => {
    const d = l.date instanceof Date ? l.date : new Date(l.date);
    return (today - d) >= ltcgMs || l.synthetic;
  });
  if (strategy === 'tax') {
    // Loss-making → LTCG → STCG; within each group: sort by gain/loss magnitude
    if (hasLoss)  return -1e12 + gain; // losses first (most negative first)
    if (allLTCG)  return 0 + gain;     // LTCG next (smallest gain first)
    return 1e12 + gain;                // STCG last
  }
  if (strategy === 'exitload') {
    // Prefer funds with oldest lots (minimise exit load)
    if (!lots.length) return 0;
    const oldest = lots.reduce((m, l) => {
      const d = l.date instanceof Date ? l.date : new Date(l.date);
      return d < m ? d : m;
    }, new Date());
    return -(today - oldest); // most negative = oldest = redeem first
  }
  // 'largest': sort by value desc (largest fund first)
  return -holding.value;
}

// ── PortfolioRedemptionPlanner ────────────────────────────────────────────────
// `mode` toggle: 'target' = today's original behaviour (one ₹ figure, auto
// strategy picks funds/lots). 'selected' = user hand-picked specific funds
// (via dashboard checkboxes) and each one redeems its own amount
// independently — no shared "remaining target" counter across funds.
function PortfolioRedemptionPlanner({ holdings, selectedHoldings = [], investorName, initialMode = 'target', onClose, masterFacts }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [mode,            setMode]            = useState(initialMode); // 'target' | 'selected'
  const [targetAmt,       setTargetAmt]       = useState('');
  const [strategy,        setStrategy]        = useState('tax');
  const [slabPct,         setSlabPct]         = useState(30);
  const [skipLocked,      setSkipLocked]      = useState(true);
  const [exitLoadOverrides,  setExitLoadOverrides]  = useState({}); // fund.name → rate (0-1)
  const [exitLoadInputs,     setExitLoadInputs]     = useState({}); // raw strings while typing
  // Per-fund redemption spec for 'selected' mode: fund.name → { mode: 'full'|'custom', unit: 'units'|'amount', value: string }
  const [selectedRedeemSpec, setSelectedRedeemSpec] = useState({});

  const fmt     = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
  const fmtD    = n => parseFloat(n).toFixed(4);
  const fmtPct  = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  const target  = parseFloat(targetAmt) || 0;
  const ltcgMs  = 12 * 30.44 * 24 * 3600 * 1000;

  const plan = useMemo(() => {
    if (target <= 0) return null;

    // Build a working list of eligible holdings (skip zero-value, __manual__)
    let eligible = holdings
      .filter(h => h.value > 0 && (h.buyLots?.length > 0))
      .map(h => ({
        ...h,
        category:     inferCategory(h.name),
        exitLoadRate: getEffectiveExitLoadRate(h, exitLoadOverrides, masterFacts), // inferred default (or override)
        score: fundScore(h, strategy, today),
      }))
      .sort((a, b) => a.score - b.score);

    let remaining = target;
    const rows = [];
    let totalProceeds = 0, totalExitLoad = 0, totalSTCG = 0, totalLTCG = 0, totalNet = 0;
    // Pooled by tax-rate group — equity/hybrid (special rates) vs debt/other
    // (slab rate) — losses only offset gains within the same pool. See
    // docs/superpowers/specs/2026-07-28-capital-loss-offset-design.md.
    let eqSTCG = 0, eqLTCG = 0, otherSTCG = 0, otherLTCG = 0;

    for (const fund of eligible) {
      if (remaining <= 0) break;

      const lots = [...(fund.buyLots || [])];
      const cat  = fund.category;
      const currentNav = fund.liveNav;

      let fundUnits = 0, fundProceeds = 0, fundExitLoad = 0;
      let fundSTCG  = 0, fundLTCG    = 0;
      const lotBreakdown = [];

      for (const lot of lots) {
        if (remaining <= 0) break;

        // Skip ELSS locked units
        const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
        const isELSS  = fund.isELSS;
        if (skipLocked && isELSS && !lot.synthetic) {
          const elssUnlockDate = new Date(buyDate);
          elssUnlockDate.setFullYear(elssUnlockDate.getFullYear() + 3);
          if (today < elssUnlockDate) continue;
        }

        // How many units of this lot to consume?
        const maxFromLot   = lot.units;
        const maxByProceeds = remaining / currentNav;
        const take         = Math.min(maxFromLot, maxByProceeds);
        if (take < 0.0001) continue;

        const saleVal   = take * currentNav;
        const totalFundUnits = fund.units || lots.reduce((s, l) => s + l.units, 0);
        const { exitLoadAmt: exitLoad, effectiveRate: elRate } = calcLotExitLoad({
          lot,
          take,
          currentNav,
          redeemDate: today,
          fundName: fund.name,
          isin: fund.isin,
          overrideRate: exitLoadOverrides[fund.name] != null ? exitLoadOverrides[fund.name] : undefined,
          totalFundUnits,
          cumUnitsRedeemed: fundUnits,
          masterFacts
        });
        const netSale   = saleVal - exitLoad;
        const heldMs    = lot.synthetic ? Infinity : (today - buyDate);
        const isLTCG    = heldMs >= ltcgMs;

        let effectiveNav = lot.nav;
        if (isLTCG && !lot.synthetic && buyDate < new Date('2018-01-31')) {
          // Grandfathering: simplify to purchase nav here (live fetch not available at portfolio level)
          // Flag it in UI
        }
        const gain = take * (currentNav - effectiveNav);

        fundUnits    += take;
        fundProceeds += saleVal;
        fundExitLoad += exitLoad;
        if (isLTCG) fundLTCG += gain; else fundSTCG += gain;
        remaining    -= netSale; // reduce remaining by net (after exit load)
        lotBreakdown.push({ lot, take, saleVal, exitLoad, isLTCG, gain, heldDays: lot.synthetic ? null : Math.floor(heldMs / (24*3600*1000)) });
      }

      if (fundUnits < 0.0001) continue;

      // Per-fund tax uses the same offset rule as the aggregate below (a
      // single fund can independently have an STC loss on some lots and an
      // LTC gain on others) — never shows a negative "tax" for a loss.
      const rateConfig = (cat === 'equity' || cat === 'hybrid')
        ? { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption }
        : { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 };
      const fundOffset  = applyLossOffset({ stcg: fundSTCG, ltcg: fundLTCG }, rateConfig);
      const fundStcgTax = fundOffset.stcgTax;
      const fundLtcgTax = fundOffset.ltcgTax;
      const fundTax     = fundOffset.tax;
      const fundNet     = fundProceeds - fundExitLoad - fundTax;

      rows.push({
        name:         fund.name,
        isin:         fund.isin,
        category:     cat,
        isELSS:       fund.isELSS,
        units:        fundUnits,
        proceeds:     fundProceeds,
        exitLoad:     fundExitLoad,
        exitLoadRate: fund.exitLoadRate ?? 0,  // ← was missing; caused NaN display
        stcg:         fundSTCG,
        ltcg:         fundLTCG,
        stcgTax:      fundStcgTax,
        ltcgTax:      fundLtcgTax,
        tax:          fundTax,
        net:          fundNet,
        lotBreakdown,
        hasSynthetic: (fund.buyLots || []).some(l => l.synthetic),
        hasTransmission: (fund.buyLots || []).some(l => l.isTransmission),
      });

      totalProceeds += fundProceeds;
      totalExitLoad += fundExitLoad;
      totalSTCG     += fundSTCG;
      totalLTCG     += fundLTCG;
      totalNet      += fundNet;
      if (cat === 'equity' || cat === 'hybrid') { eqSTCG += fundSTCG; eqLTCG += fundLTCG; }
      else                                       { otherSTCG += fundSTCG; otherLTCG += fundLTCG; }
    }

    // Aggregate tax comes from the POOLED raw gains (not from summing each
    // fund's own already-offset tax) — a loss in one fund can offset a gain
    // in a DIFFERENT fund of the same rate-group. See
    // docs/superpowers/specs/2026-07-28-capital-loss-offset-design.md.
    const eqOffset    = applyLossOffset({ stcg: eqSTCG, ltcg: eqLTCG }, { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption });
    const otherOffset = applyLossOffset({ stcg: otherSTCG, ltcg: otherLTCG }, { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 });
    const totalStcgTax = eqOffset.stcgTax + otherOffset.stcgTax;
    const totalLtcgTax = eqOffset.ltcgTax + otherOffset.ltcgTax;
    const totalTax      = totalStcgTax + totalLtcgTax;
    const lossNotes = [
      (eqOffset.offsetIntoLTCG || eqOffset.stcgLossCarryForward || eqOffset.ltcgLossCarryForward) ? { poolLabel: 'Equity/Hybrid', ...eqOffset } : null,
      (otherOffset.offsetIntoLTCG || otherOffset.stcgLossCarryForward || otherOffset.ltcgLossCarryForward) ? { poolLabel: 'Debt/Other', ...otherOffset } : null,
    ].filter(Boolean);

    const shortfall = remaining > 0.5; // can't meet target
    return { rows, totalProceeds, totalExitLoad, totalSTCG, totalLTCG, totalTax, totalStcgTax, totalLtcgTax, totalNet, lossNotes, shortfall };
  }, [target, strategy, slabPct, skipLocked, holdings, today, exitLoadOverrides]);

  // 'selected' mode: each hand-picked fund redeems its own amount
  // independently (Full = all currently-redeemable units, respecting
  // skipLocked exactly like Target Amount mode; or a custom units/₹ amount
  // capped at that fund's redeemable units) — no shared running target.
  const planSelected = useMemo(() => {
    if (!selectedHoldings.length) return null;

    const rows = [];
    let totalProceeds = 0, totalExitLoad = 0, totalSTCG = 0, totalLTCG = 0, totalNet = 0;
    let eqSTCG = 0, eqLTCG = 0, otherSTCG = 0, otherLTCG = 0;

    for (const fund of selectedHoldings) {
      const lots = fund.buyLots || [];
      if (!lots.length) continue; // no cost data — nothing to plan for this fund

      const cat = inferCategory(fund.name);
      const currentNav = fund.liveNav;
      const isELSS = fund.isELSS;

      const isRedeemable = (lot) => {
        if (!(skipLocked && isELSS && !lot.synthetic)) return true;
        const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
        const elssUnlockDate = new Date(buyDate);
        elssUnlockDate.setFullYear(elssUnlockDate.getFullYear() + 3);
        return today >= elssUnlockDate;
      };

      const maxRedeemable = lots.reduce((sum, lot) => sum + (isRedeemable(lot) ? lot.units : 0), 0);

      const spec = selectedRedeemSpec[fund.name] || { mode: 'full' };
      let unitsToRedeem;
      if (spec.mode === 'custom') {
        const raw = parseFloat(spec.value) || 0;
        const asUnits = spec.unit === 'amount' ? raw / currentNav : raw;
        unitsToRedeem = Math.min(Math.max(asUnits, 0), maxRedeemable);
      } else {
        unitsToRedeem = maxRedeemable; // 'full'
      }

      if (unitsToRedeem < 0.0001) {
        rows.push({
          name: fund.name, isin: fund.isin, category: cat, isELSS, units: 0, maxRedeemable,
          proceeds: 0, exitLoad: 0, exitLoadRate: 0, stcg: 0, ltcg: 0, tax: 0, net: 0,
          lotBreakdown: [], hasSynthetic: lots.some(l => l.synthetic),
          hasTransmission: lots.some(l => l.isTransmission),
          locked: maxRedeemable < 0.0001,
        });
        continue;
      }

      let remaining = unitsToRedeem;
      let fundUnits = 0, fundProceeds = 0, fundExitLoad = 0, fundSTCG = 0, fundLTCG = 0;
      const lotBreakdown = [];

      for (const lot of lots) {
        if (remaining <= 0) break;
        if (!isRedeemable(lot)) continue;

        const take = Math.min(lot.units, remaining);
        if (take < 0.0001) continue;

        const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
        const saleVal = take * currentNav;
        const totalFundUnits = fund.units || lots.reduce((s, l) => s + l.units, 0);
        const { exitLoadAmt: exitLoad, effectiveRate: elRate } = calcLotExitLoad({
          lot,
          take,
          currentNav,
          redeemDate: today,
          fundName: fund.name,
          isin: fund.isin,
          overrideRate: exitLoadOverrides[fund.name] != null ? exitLoadOverrides[fund.name] : undefined,
          totalFundUnits,
          cumUnitsRedeemed: fundUnits,
          masterFacts
        });
        const heldMs   = lot.synthetic ? Infinity : (today - buyDate);
        const isLTCG   = heldMs >= ltcgMs;
        const gain     = take * (currentNav - lot.nav);

        fundUnits    += take;
        fundProceeds += saleVal;
        fundExitLoad += exitLoad;
        if (isLTCG) fundLTCG += gain; else fundSTCG += gain;
        remaining    -= take;
        lotBreakdown.push({ lot, take, saleVal, exitLoad, isLTCG, gain, heldDays: lot.synthetic ? null : Math.floor(heldMs / (24*3600*1000)) });
      }

      const rateConfig = (cat === 'equity' || cat === 'hybrid')
        ? { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption }
        : { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 };
      const fundOffset  = applyLossOffset({ stcg: fundSTCG, ltcg: fundLTCG }, rateConfig);
      const fundStcgTax = fundOffset.stcgTax;
      const fundLtcgTax = fundOffset.ltcgTax;
      const fundTax     = fundOffset.tax;
      const fundNet     = fundProceeds - fundExitLoad - fundTax;

      rows.push({
        name: fund.name, isin: fund.isin, category: cat, isELSS, units: fundUnits, maxRedeemable,
        proceeds: fundProceeds, exitLoad: fundExitLoad,
        exitLoadRate: getEffectiveExitLoadRate(fund, exitLoadOverrides, masterFacts),
        stcg: fundSTCG, ltcg: fundLTCG, stcgTax: fundStcgTax, ltcgTax: fundLtcgTax, tax: fundTax, net: fundNet,
        lotBreakdown, hasSynthetic: lots.some(l => l.synthetic),
        hasTransmission: lots.some(l => l.isTransmission), locked: false,
      });

      totalProceeds += fundProceeds;
      totalExitLoad += fundExitLoad;
      totalSTCG     += fundSTCG;
      totalLTCG     += fundLTCG;
      totalNet      += fundNet;
      if (cat === 'equity' || cat === 'hybrid') { eqSTCG += fundSTCG; eqLTCG += fundLTCG; }
      else                                       { otherSTCG += fundSTCG; otherLTCG += fundLTCG; }
    }

    const eqOffset    = applyLossOffset({ stcg: eqSTCG, ltcg: eqLTCG }, { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption });
    const otherOffset = applyLossOffset({ stcg: otherSTCG, ltcg: otherLTCG }, { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 });
    const totalStcgTax = eqOffset.stcgTax + otherOffset.stcgTax;
    const totalLtcgTax = eqOffset.ltcgTax + otherOffset.ltcgTax;
    const totalTax      = totalStcgTax + totalLtcgTax;
    const lossNotes = [
      (eqOffset.offsetIntoLTCG || eqOffset.stcgLossCarryForward || eqOffset.ltcgLossCarryForward) ? { poolLabel: 'Equity/Hybrid', ...eqOffset } : null,
      (otherOffset.offsetIntoLTCG || otherOffset.stcgLossCarryForward || otherOffset.ltcgLossCarryForward) ? { poolLabel: 'Debt/Other', ...otherOffset } : null,
    ].filter(Boolean);

    return { rows, totalProceeds, totalExitLoad, totalSTCG, totalLTCG, totalTax, totalStcgTax, totalLtcgTax, totalNet, lossNotes, shortfall: false };
  }, [selectedHoldings, skipLocked, slabPct, exitLoadOverrides, selectedRedeemSpec, today]);

  const activePlan = mode === 'target' ? plan : planSelected;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)' }} />

      {/* Wide panel */}
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 'min(700px, 100vw)',
        height: '100dvh', overflowY: 'auto',
        background: 'var(--surface)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.15)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 28px 16px', borderBottom: '1.5px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                Portfolio Redemption Planner
              </div>
              <div style={{ fontSize: '.9rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.3px' }}>
                {investorName}
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>
                FIFO · Budget 2024 tax rates · Per-category exit load · Override per row
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button
                className="no-print"
                onClick={() => window.print()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 13px', borderRadius: 8,
                  border: '1.5px solid var(--border2)',
                  background: '#fff', color: 'var(--g2)',
                  fontFamily: 'Raleway, sans-serif', fontSize: '.72rem',
                  fontWeight: 700, cursor: 'pointer',
                  letterSpacing: '.3px', transition: 'all .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--g-xlight)'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                🖨 Print
              </button>
              <button onClick={onClose} className="no-print" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--muted)', padding: '4px 8px', marginTop: -4 }}>✕</button>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 0, padding: '0 20px', borderBottom: '1.5px solid var(--border)', background: 'var(--s2)' }}>
          {[['target', '🎯 Target Amount'], ['selected', `☑ Selected Funds${selectedHoldings.length ? ` (${selectedHoldings.length})` : ''}`]].map(([m, label]) => (
            <button key={m} className="no-print" onClick={() => setMode(m)}
              style={{
                padding: '12px 16px', border: 'none', borderBottom: mode === m ? '2.5px solid var(--g1)' : '2.5px solid transparent',
                background: 'none', cursor: 'pointer',
                fontFamily: 'Raleway, sans-serif', fontSize: '.75rem', fontWeight: 800,
                color: mode === m ? 'var(--g1)' : 'var(--muted)', marginBottom: -1.5,
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ padding: '16px 20px', borderBottom: '1.5px solid var(--border)', background: 'var(--s2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>

            {mode === 'target' && (
              <>
                <div>
                  <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>Target Amount (₹)</div>
                  <input type="number" min="0" step="1000" value={targetAmt}
                    onChange={e => setTargetAmt(e.target.value)}
                    placeholder="e.g. 500000"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 9, fontFamily: "'JetBrains Mono', monospace", fontSize: '.82rem', background: 'var(--surface)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>Strategy</div>
                  <select value={strategy} onChange={e => setStrategy(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 9, fontFamily: 'Raleway, sans-serif', fontSize: '.75rem', fontWeight: 700, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}>
                    <option value="tax">Tax-Efficient (Losses → LTCG → STCG)</option>
                    <option value="exitload">Least Exit Load (Oldest lots first)</option>
                    <option value="largest">Largest Fund First</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>Slab (for Debt)</div>
              <select value={slabPct} onChange={e => setSlabPct(Number(e.target.value))}
                style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 9, fontFamily: 'Raleway, sans-serif', fontSize: '.75rem', fontWeight: 700, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}>
                <option value={5}>5%</option>
                <option value={20}>20%</option>
                <option value={30}>30%</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, color: 'var(--text)' }}>
            <input type="checkbox" checked={skipLocked} onChange={e => setSkipLocked(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--g1)', cursor: 'pointer' }} />
            Skip ELSS locked units ({'<'} 3 years from purchase)
          </label>
        </div>

        {/* Results */}
        <div style={{ padding: '20px 28px', flex: 1 }}>

          {mode === 'selected' && selectedHoldings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              No funds selected yet. Close this planner, check the funds you want to redeem on the dashboard, then reopen from the floating selection bar.
            </div>
          )}

          {!activePlan && mode === 'target' && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              Enter a target amount above to see which funds to redeem and the estimated tax impact.
            </div>
          )}

          {activePlan && activePlan.shortfall && (
            <div style={{ padding: '10px 14px', background: '#fff8e1', border: '1.5px solid #ffe082', borderRadius: 10, marginBottom: 16, fontSize: '.72rem', color: '#795548', fontWeight: 600 }}>
              ⚠ Portfolio value is insufficient to meet the full target after exit loads. Showing maximum redeemable.
            </div>
          )}

          {activePlan && activePlan.rows.length === 0 && (
            <div style={{ padding: '10px 14px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 10, fontSize: '.72rem', color: 'var(--neg)', fontWeight: 600 }}>
              No redeemable holdings found. All units may be ELSS-locked or have no cost data.
            </div>
          )}

          {activePlan && activePlan.rows.length > 0 && (
            <>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  ['Gross Proceeds', activePlan.totalProceeds, 'var(--text)'],
                  ['Exit Load',      activePlan.totalExitLoad, 'var(--neg)'],
                  ['Est. Tax',       activePlan.totalTax,      'var(--neg)'],
                  ['Net in Hand',    activePlan.totalNet,       'var(--g1)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: 'var(--s2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>{label}</div>
                    <div style={{ fontSize: '.95rem', fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.5px' }}>
                      {val < 0 ? '−' : ''}{fmt(val)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Redemption Order — card layout: no horizontal scroll, works on all screens */}
              <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
                color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
                Redemption Order
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activePlan.rows.map((row, i) => {
                  const ikey = row.name;
                  const rawStr = exitLoadInputs[ikey];
                  const dispVal = rawStr != null
                    ? rawStr
                    : ((exitLoadOverrides[ikey] ?? row.exitLoadRate) * 100).toFixed(2);
                  return (
                    <div key={i} style={{ border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      {/* Row A: fund name + exit load input */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        gap: 10, padding: '11px 14px 9px', background: 'var(--s2)',
                        borderBottom: '1px solid var(--border)' }}>
                        <div style={{ minWidth: 0, flex: 1, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <ProviderAvatar
                            name={row.name}
                            logoPath={getMFLogoFromSchemeName(row.name)}
                            size={22}
                            radius={5}
                            style={{ marginTop: 1 }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '.72rem',
                            lineHeight: 1.4, wordBreak: 'break-word' }}>
                            {row.name}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                              border: '1px solid var(--border)',
                              background: row.category === 'debt' ? '#e3f2fd' : row.category === 'hybrid' ? '#f3e5f5' : 'var(--g-xlight)',
                              color:      row.category === 'debt' ? '#1565c0' : row.category === 'hybrid' ? '#6a1b9a'  : 'var(--g1)',
                              fontFamily: "'JetBrains Mono', monospace" }}>
                              {row.category.toUpperCase()}
                            </span>
                            {(() => {
                              const masterRec = row.isin && masterFacts?.byIsin?.[row.isin];
                              const rta = masterRec?.rta;
                              const settlement = masterRec?.settlement || (row.category === 'debt' || row.category === 'liquid' ? 'T+1' : 'T+2');
                              const creditInfo = getEstCreditDate(settlement);
                              return (
                                <>
                                  {rta && (
                                    <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                                      border: '1px solid var(--border)',
                                      background: rta === 'CAMS' ? '#e3f2fd' : '#f3e5f5',
                                      color:      rta === 'CAMS' ? '#1565c0' : '#6a1b9a',
                                      fontFamily: "'JetBrains Mono', monospace" }}>
                                      {rta}
                                    </span>
                                  )}
                                  <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                                    border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)',
                                    fontFamily: "'JetBrains Mono', monospace" }}>
                                    ⚡ Est. Credit: {creditInfo.dateStr} ({creditInfo.daysLabel})
                                  </span>
                                </>
                              );
                            })()}
                            {row.isELSS      && <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082', fontFamily: "'JetBrains Mono', monospace" }}>ELSS</span>}
                            {row.hasSynthetic && <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: 'var(--s3)', color: 'var(--muted)', border: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace" }}>SUM CAS</span>}
                            {row.hasTransmission && <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: 'var(--s3)', color: 'var(--muted)', border: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace" }} title="Includes transmitted units -- your CAS preserves the original purchase date and rate for these">TRANSMITTED</span>}
                          </div>
                          </div>
                        </div>

                        {/* Exit load % — text input avoids toFixed fighting typing */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontSize: '.52rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 3 }}>
                            {getExitLoadInfo(row.name, row.isin, masterFacts).label}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <input type="text" inputMode="decimal"
                              value={dispVal}
                              className="no-print"
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw !== '' && !/^\d*\.?\d{0,2}$/.test(raw)) return;
                                setExitLoadInputs(prev => ({ ...prev, [ikey]: raw }));
                                const v = parseFloat(raw);
                                if (!isNaN(v) && v >= 0 && v <= 5) {
                                  setExitLoadOverrides(prev => ({ ...prev, [ikey]: v / 100 }));
                                }
                              }}
                              onBlur={() => {
                                const v = parseFloat(exitLoadInputs[ikey] ?? '');
                                const norm = isNaN(v) ? '0.00' : Math.min(v, 5).toFixed(2);
                                setExitLoadInputs(prev => ({ ...prev, [ikey]: norm }));
                                setExitLoadOverrides(prev => ({ ...prev, [ikey]: parseFloat(norm) / 100 }));
                              }}
                              style={{ width: 54, padding: '4px 6px', textAlign: 'right',
                                border: '1.5px solid var(--border2)', borderRadius: 7,
                                fontFamily: "'JetBrains Mono', monospace", fontSize: '.75rem',
                                background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                            />
                            <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>%</span>
                            <span className="print-only" style={{ display: 'none', fontSize: '.72rem', fontFamily: "'JetBrains Mono', monospace" }}>{dispVal}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Selected-Funds mode: per-fund Redeem Full/Custom control */}
                      {mode === 'selected' && (
                        <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                          {row.locked ? (
                            <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#795548' }}>
                              🔒 Fully ELSS-locked — nothing currently redeemable. Uncheck "Skip ELSS locked units" above to override.
                            </span>
                          ) : (
                            (() => {
                              const spec    = selectedRedeemSpec[row.name] || { mode: 'full', unit: 'units', value: '' };
                              const isFull  = (spec.mode || 'full') === 'full';
                              const setSpec = (patch) => setSelectedRedeemSpec(prev => ({
                                ...prev, [row.name]: { mode: 'full', unit: 'units', value: '', ...prev[row.name], ...patch },
                              }));
                              return (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  {['full', 'custom'].map(m => (
                                    <button key={m} className="no-print" onClick={() => setSpec({ mode: m })}
                                      style={{
                                        padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                                        border: '1.5px solid var(--border2)',
                                        fontFamily: 'Raleway, sans-serif', fontSize: '.68rem', fontWeight: 700,
                                        background: (spec.mode || 'full') === m ? 'var(--g1)' : 'var(--s2)',
                                        color:      (spec.mode || 'full') === m ? '#fff' : 'var(--muted)',
                                      }}>
                                      {m === 'full' ? `Redeem: Full (${fmtD(row.maxRedeemable)} units)` : 'Custom'}
                                    </button>
                                  ))}
                                  {!isFull && (
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      <select className="no-print" value={spec.unit || 'units'} onChange={e => setSpec({ unit: e.target.value })}
                                        style={{ padding: '5px 6px', borderRadius: 7, border: '1.5px solid var(--border2)', fontFamily: 'Raleway, sans-serif', fontSize: '.66rem', fontWeight: 700, background: 'var(--surface)', color: 'var(--text)' }}>
                                        <option value="units">Units</option>
                                        <option value="amount">₹</option>
                                      </select>
                                      <input type="number" min="0" step="any" className="no-print"
                                        value={spec.value || ''}
                                        onChange={e => setSpec({ value: e.target.value })}
                                        placeholder={spec.unit === 'amount' ? 'Amount' : 'Units'}
                                        style={{ width: 90, padding: '5px 8px', borderRadius: 7, border: '1.5px solid var(--border2)', fontFamily: "'JetBrains Mono', monospace", fontSize: '.72rem', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      )}

                      {/* Row B: financial metrics — wraps on narrow screens */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                        gap: 0, padding: '10px 14px 6px' }}>
                        {[
                          ['Units',    fmtD(row.units),                                            'var(--text)'],
                          ['Gross',    fmt(row.proceeds),                                           'var(--text)'],
                          ['Exit Load', row.exitLoad > 0 ? '−' + fmt(row.exitLoad) : '—',          row.exitLoad > 0 ? 'var(--neg)' : 'var(--muted)'],
                          ['Tax',       row.tax > 0 ? '−' + fmt(row.tax) : '—',                   row.tax > 0 ? 'var(--neg)' : 'var(--muted)'],
                          ['Net',       fmt(row.net),                                               'var(--g1)'],
                        ].map(([lbl, val, col]) => (
                          <div key={lbl} style={{ paddingRight: 10, marginBottom: 6 }}>
                            <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                              color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                            <div style={{ fontSize: lbl === 'Net' ? '.78rem' : '.72rem', fontWeight: lbl === 'Net' ? 900 : 700,
                              color: col, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Row C: STCG / LTCG gain, each paired with its own tax so the two
                          never read as one blended figure. Debt has no rate split (same
                          slab either way), so show one honest combined line instead of a
                          fake STCG/LTCG divide. */}
                      {(row.stcg !== 0 || row.ltcg !== 0) && (
                        <div style={{ display: 'flex', gap: 20, padding: '0 14px 10px', flexWrap: 'wrap' }}>
                          {row.category === 'debt' ? (
                            <div>
                              <div style={{ fontSize: '.5rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                                color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 1 }}>Gains</div>
                              <div style={{ fontSize: '.7rem', fontWeight: 700,
                                color: (row.stcg + row.ltcg) < 0 ? 'var(--neg)' : 'var(--text)',
                                fontFamily: "'JetBrains Mono', monospace" }}>
                                {(row.stcg + row.ltcg) < 0 ? '−' : '+'}{fmt(row.stcg + row.ltcg)}
                                <span style={{ color: 'var(--muted)', fontWeight: 600 }}> · tax {fmt(row.tax)} (slab)</span>
                              </div>
                            </div>
                          ) : (
                            [['STCG', row.stcg, row.stcgTax], ['LTCG', row.ltcg, row.ltcgTax]].filter(([, v]) => v !== 0).map(([lbl, val, taxVal]) => (
                              <div key={lbl}>
                                <div style={{ fontSize: '.5rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                                  color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 1 }}>{lbl}</div>
                                <div style={{ fontSize: '.7rem', fontWeight: 700,
                                  color: val < 0 ? 'var(--neg)' : 'var(--text)',
                                  fontFamily: "'JetBrains Mono', monospace" }}>
                                  {val < 0 ? '−' : '+'}{fmt(val)}
                                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}> · tax {fmt(taxVal)}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Totals card */}
                <div style={{ border: '2px solid var(--g-light)', borderRadius: 12,
                  background: 'var(--g-xlight)', padding: '12px 14px' }}>
                  <div style={{ fontSize: '.58rem', fontWeight: 900, color: 'var(--g1)',
                    letterSpacing: '1px', textTransform: 'uppercase',
                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>Total</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 0 }}>
                    {[
                      ['Gross',      fmt(activePlan.totalProceeds),                                           'var(--text)'],
                      ['Exit Load',  activePlan.totalExitLoad > 0 ? '−' + fmt(activePlan.totalExitLoad) : '—',     activePlan.totalExitLoad > 0 ? 'var(--neg)' : 'var(--muted)'],
                    ].map(([lbl, val, col]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: '.78rem', fontWeight: 900, color: col, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.3px' }}>{val}</div>
                      </div>
                    ))}

                    {/* STCG / LTCG — gain as the headline figure, tax as a sub-line,
                        matching the per-fund row pairing (Row C above). */}
                    {[
                      ['STCG', activePlan.totalSTCG, activePlan.totalStcgTax],
                      ['LTCG', activePlan.totalLTCG, activePlan.totalLtcgTax],
                    ].map(([lbl, gainVal, taxVal]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: '.78rem', fontWeight: 900, color: gainVal >= 0 ? 'var(--text)' : 'var(--neg)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.3px' }}>
                          {gainVal >= 0 ? '+' : '−'}{fmt(gainVal)}
                        </div>
                        <div style={{ fontSize: '.62rem', fontWeight: 700, color: taxVal > 0 ? 'var(--neg)' : 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                          tax {taxVal > 0 ? '−' + fmt(taxVal) : '—'}
                        </div>
                      </div>
                    ))}

                    {[
                      ['Total Tax',   activePlan.totalTax > 0 ? '−' + fmt(activePlan.totalTax) : '—', activePlan.totalTax > 0 ? 'var(--neg)' : 'var(--muted)', false],
                      ['Net in Hand', fmt(activePlan.totalNet),                                        'var(--g1)',                                              true],
                    ].map(([lbl, val, col, big]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: big ? '.9rem' : '.78rem', fontWeight: 900, color: col, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.3px' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <LossAdjustmentPanel notes={activePlan.lossNotes} />
                </div>
              </div>

              {/* Footnotes */}
              <div style={{ marginTop: 14, fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.7,
                padding: '12px 14px', background: 'var(--s2)', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                <strong>Notes:</strong> Tax rates per Budget 2024 — Equity STCG 20%, LTCG 12.5% above ₹1.25L annual exemption.
                Debt: all gains at selected slab rate. Exit load inferred by category (Equity/Hybrid 1% within 365 days;
                Liquid/Debt/Index 0%) — override using the Exit Load % input on each card. SUM CAS = purchase date unknown,
                gains treated as LTCG, exit load not applied. Grandfathering not applied at portfolio level.
                This is an estimate only. Consult a tax professional before redeeming.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CasTrackerInner() {
  const [uploadState, setUploadState] = useState('idle'); // idle, loading, error, success
  const [loadingText, setLoadingText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [portfolioDataByPan, setPortfolioDataByPan] = useState({});
  const [activePan, setActivePan] = useState('');
  const [familyPans, setFamilyPans] = useState([]);  // 2+ PANs checked together = combined family view
  const [tabSearch, setTabSearch] = useState('');    // filters the tab list for large families -- doesn't affect familyPans selection
  const [fromCache, setFromCache] = useState(false);
  const [editingPan, setEditingPan] = useState('');   // PAN currently being renamed, or ''
  const [editingName, setEditingName] = useState('');
  const [savingPanName, setSavingPanName] = useState(false);
  const [panNameError, setPanNameError] = useState('');
  const [defaultPan, setDefaultPan] = useState('');      // which PAN opens first in a multi-PAN family CAS
  const [savingDefaultPan, setSavingDefaultPan] = useState('');  // PAN currently being set as default, or ''
  const [defaultPanError, setDefaultPanError] = useState('');
  const [selectedIsXlsx, setSelectedIsXlsx] = useState(false); // MF Central .xlsx report vs CAMS/KFintech .pdf
  const [deletingId, setDeletingId] = useState('');   // saved-portfolio id showing delete confirm, or ''
  const [deleteInFlight, setDeleteInFlight] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Scheme-master facts (RTA/settlement/exit-load/ELSS-lock data), fetched
  // once from /api/scheme-master-facts (R2-backed) instead of the ~8.4MB
  // isin-scheme-master.json this page used to statically import -- that
  // shipped the whole file to every visitor's browser. Empty maps here are
  // a safe default: every consumer below already falls through to a
  // guess-based exit-load estimate when no master-record match is found,
  // so a brief window before this resolves (or a failed fetch) just means a
  // slightly lower-confidence estimate, not a crash or wrong-looking UI.
  const [masterFacts, setMasterFacts] = useState({ byIsin: {}, byNormName: {} });
  useEffect(() => {
    fetch('/api/scheme-master-facts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const byIsin = d?.byIsin || {};
        setMasterFacts({ byIsin, byNormName: buildNameToSchemeEntry(byIsin) });
      })
      .catch(() => { /* keep empty defaults -- existing fallback logic handles this */ });
  }, []);

  async function deleteSavedPortfolio(id) {
    setDeleteInFlight(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/cas/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setSavedPortfolios(prev => prev.filter(p => p.id !== id));
        setDeletingId('');
      } else {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error || 'Could not delete this CAS.');
      }
    } catch {
      setDeleteError('Could not delete this CAS. Please try again.');
    }
    setDeleteInFlight(false);
  }

  async function savePanName(pan) {
    const name = editingName.trim();
    if (!name) { setEditingPan(''); setPanNameError(''); return; }
    setSavingPanName(true);
    setPanNameError('');
    try {
      const res = await fetch('/api/cas/pan-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, name, targetUserId: (isAdmin && viewedUserId) ? viewedUserId : undefined }),
      });
      if (res.ok) {
        setPortfolioDataByPan(prev => ({
          ...prev,
          [pan]: { ...prev[pan], investorName: name },
        }));
        // Only exit edit mode on CONFIRMED success -- previously this ran
        // unconditionally, so a failed save (most commonly a 403 because
        // this CAS was never actually saved to the account in the first
        // place -- pan-name edits are only allowed for a PAN the server has
        // seen in a saved upload) closed the edit box with no feedback,
        // silently reverting to the old name and looking like the edit was
        // simply discarded.
        setEditingPan('');
      } else {
        const body = await res.json().catch(() => ({}));
        setPanNameError(body.error || 'Could not save this name.');
      }
    } catch {
      setPanNameError('Could not save this name -- check your connection and try again.');
    }
    setSavingPanName(false);
  }

  // Marks `pan` as the tab this family CAS should open to by default on
  // future visits (fresh uploads and reloads of a saved CAS both go
  // through processCasData, which is the only place that reads it back).
  async function markPanAsDefault(pan) {
    setSavingDefaultPan(pan);
    setDefaultPanError('');
    try {
      const res = await fetch('/api/cas/default-pan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, targetUserId: (isAdmin && viewedUserId) ? viewedUserId : undefined }),
      });
      if (res.ok) {
        setDefaultPan(pan);
      } else {
        const body = await res.json().catch(() => ({}));
        setDefaultPanError(body.error || 'Could not set this as the default.');
      }
    } catch {
      setDefaultPanError('Could not set this as the default -- check your connection and try again.');
    }
    setSavingDefaultPan('');
  }

  // ── Auth + saved portfolios ──
  const { data: session, status: authStatus } = useSession();
  const isSignedIn = authStatus === 'authenticated' && !!session;
  const isAdmin    = session?.user?.role === 'admin';
  const searchParams = useSearchParams();
  const [savedPortfolios, setSavedPortfolios] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const [pendingSaveRetry, setPendingSaveRetry] = useState(null); // { data, fileName, panCount } when saveStatus === 'error'

  // ── Manual holdings + SIF NAVs ──
  const [manualHoldings, setManualHoldings] = useState([]);
  const [sifNavMap,      setSifNavMap]      = useState({}); // scheme_id → nav
  const [sifNameMap,     setSifNameMap]     = useState({}); // scheme_id → sif_name, for manual SIF holdings' logo lookup
  const [manualLoading,  setManualLoading]  = useState(false);
  const [viewFilter,     setViewFilter]     = useState('all'); // 'all' | 'mf' | 'sif'
  const [viewedUserId,   setViewedUserId]   = useState('');   // client userId when admin viewing
  const [planFund,       setPlanFund]       = useState(null);  // holding object for per-fund planner
  const [planPortfolio,  setPlanPortfolio]  = useState(false); // portfolio-level redemption planner
  const [plannerMode,    setPlannerMode]    = useState('target'); // initial tab when planPortfolio opens
  const [redeemSelection, setRedeemSelection] = useState({}); // fund.id → fund object, checked via dashboard checkboxes
  const [txnDrawerFund,  setTxnDrawerFund]  = useState(null);  // holding object for the Transaction History drawer
  const [navHistoryCache, setNavHistoryCache] = useState({});  // navHistoryCacheKey(fund) → { loading, points, error } -- only populated on demand (see fetchNavHistory)
  const [detailFund,     setDetailFund]     = useState(null);  // holding object for the fund/SIF details drawer (same one screener uses)
  const [distributorCache, setDistributorCache] = useState({}); // ARN (bare digits) → DistributorRecord|null -- see lib/distributorResolution.js

  // Auto-load via ?load=blobKey (admin CAS view) or ?userId= (manual-only client)
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!isAdmin) return;
    const loadKey   = searchParams.get('load');
    const paramUid  = searchParams.get('userId');
    const paramName = decodeURIComponent(searchParams.get('uname') || '');
    if (loadKey) {
      const parts = loadKey.split('/');
      const keyUserId = parts.length >= 2 ? parts[1] : undefined;
      if (keyUserId) setViewedUserId(keyUserId);
      // Passing keyUserId straight into loadSavedPortfolio (rather than
      // having it read viewedUserId off component state once this timeout
      // fires) is deliberate: setViewedUserId above won't have landed by
      // the time this closure was created, no matter the delay -- see
      // processCasData's own comment on effectiveTargetUserId for why.
      const t = setTimeout(() => loadSavedPortfolio(loadKey, keyUserId), 100);
      return () => clearTimeout(t);
    } else if (paramUid) {
      setViewedUserId(paramUid);
      setPortfolioDataByPan({
        '__manual__': { investorName: paramName || 'Client', current: 0, invested: 0, holdings: [] },
      });
      setActivePan('__manual__');
      setUploadState('success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, isAdmin]);

  // Fetch saved portfolios when signed in
  useEffect(() => {
    if (!isSignedIn) return;
    setLoadingSaved(true);
    fetch('/api/cas/list')
      .then(r => r.json())
      .then(d => setSavedPortfolios(d.portfolios || []))
      .catch(() => {})
      .finally(() => setLoadingSaved(false));
  }, [isSignedIn]);

  // Fetch manual holdings + SIF NAVs when signed in
  // Admin viewing a client: use ?userId={clientId} to get their holdings
  //
  // Guarded with `cancelled` because switching between clients (viewedUserId
  // changing) doesn't remount this page — it's a client-side navigation on
  // the same route. Without this guard, a slow response for a PREVIOUSLY
  // viewed client can resolve after a faster response for the client the
  // admin has since switched to, silently overwriting the correct holdings
  // (including admin-added SIF entries) with the wrong client's data.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setManualLoading(true);
    const url = (isAdmin && viewedUserId)
      ? `/api/holdings?userId=${viewedUserId}`
      : '/api/holdings';
    fetch(url)
      .then(r => r.json())
      .then(async d => {
        if (cancelled) return;
        const holdings = d.holdings || [];
        setManualHoldings(holdings);
        const hasSIF = holdings.some(h => h.fund_type === 'SIF');
        if (hasSIF) {
          const r2 = await fetch('/api/sif-nav').catch(() => null);
          if (cancelled) return;
          if (r2?.ok) {
            const sifData = await r2.json();
            const navMap = {};
            const nameMap = {};
            (sifData.schemes || []).forEach(s => {
              navMap[s.scheme_id] = s.nav;
              if (s.isin_po) navMap[s.isin_po] = s.nav;
              nameMap[s.scheme_id] = s.sif_name;
            });
            setSifNavMap(navMap);
            setSifNameMap(nameMap);
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setManualLoading(false); });
    return () => { cancelled = true; };
  }, [isSignedIn, isAdmin, viewedUserId]);

  async function processCasData(data, cached, targetUserIdOverride) {
    // The admin ?load= auto-open effect below calls this (via
    // loadSavedPortfolio) from inside a setTimeout scheduled in the SAME
    // render that also calls setViewedUserId -- that timeout's callback
    // closes over viewedUserId as it was AT SCHEDULING TIME, not after the
    // state update lands, no matter the delay (a classic stale-closure
    // trap, not something a longer timeout fixes). Accepting the resolved
    // target id as an explicit argument sidesteps relying on the closure
    // ever seeing the fresh value. Everywhere else (manual tab clicks,
    // fresh uploads) this is undefined and viewedUserId (already correct
    // by then, since the user is interacting after render) is used as before.
    const effectiveTargetUserId = targetUserIdOverride || ((isAdmin && viewedUserId) ? viewedUserId : undefined);
    const portfolioData = {};
    const panInvestorMap = data.pan_investor_map || {};
    // Folio-level "Transmission of Folios" events (see api/parse.py's
    // build_folio_transmission_map) -- keyed by the base folio number
    // (no "/ 0" suffix some AMCs append), since these are folio lifecycle
    // notes rather than a field on any individual transaction.
    const folioTransmissions = data.folio_transmissions || {};
    
    // Global investor name from casparser (safe for single-PAN CAS)
    const globalName = (data.investor_info?.name || '').trim();

    // Collect all PANs that casparser assigned
    const allPans = {};
    (data.folios || []).forEach(folio => {
      const fp = (folio.PAN || '').toUpperCase().trim();
      if (fp && fp.length === 10 && PAN_REGEX.test(fp)) {
        allPans[fp] = true;
      }
    });

    const panList = Object.keys(allPans);
    const isSinglePan = panList.length <= 1;

    (data.folios || []).forEach(folio => {
      let rawPan = (folio.PAN || '').toUpperCase().trim();
      if (!rawPan || rawPan.length !== 10 || !PAN_REGEX.test(rawPan)) {
        rawPan = 'UNKNOWN';
      }

      // Investor name resolution
      let investorName = panInvestorMap[rawPan] || '';

      // For single-PAN CAS, global investor_info.name is always safe
      if (!investorName && isSinglePan && globalName && !isPanLike(globalName)) {
        investorName = globalName;
      }

      // For multi-PAN: try global name for the first PAN only
      if (!investorName && !isSinglePan && globalName && !isPanLike(globalName)) {
        if (panList.length > 0 && rawPan === panList[0]) {
          investorName = globalName;
        }
      }

      // Last resort: never show PAN, show a human label instead
      if (!investorName || isPanLike(investorName)) {
        if (rawPan !== 'UNKNOWN') {
          investorName = `Investor (${rawPan.substring(0, 5)}****${rawPan.substring(9)})`;
        } else {
          investorName = 'Unknown Investor';
        }
      }

      if (!portfolioData[rawPan]) {
        portfolioData[rawPan] = {
          current: 0,
          invested: 0,
          holdings: [],
          investorName: investorName
        };
      }

      // Base folio number (strip any "/ 0" suffix BSE-routed folios carry)
      // -- api/parse.py's regex on "Folio No: XXXXX" stops at whitespace,
      // so folio_transmissions keys never have that suffix even when
      // folio.folio does.
      const baseFolioNo = (folio.folio || '').split('/')[0].trim();
      const folioTransmission = folioTransmissions[baseFolioNo] || null;

      (folio.schemes || []).forEach(scheme => {
        const units = parseFloat(scheme.close) || 0;
        if (units < 0.001) return;

        // Nominee from casparser's scheme.nominees array
        let nomineeStr = 'Not Specified';
        if (scheme.nominees && scheme.nominees.length > 0) {
          nomineeStr = scheme.nominees.join(', ');
        }

        // Advisor from casparser's scheme.advisor
        const advisorStr = scheme.advisor || 'Direct / N/A';

        portfolioData[rawPan].holdings.push({
          scheme: scheme,
          folio: folio.folio,
          units: units,
          nominee: nomineeStr,
          advisor: advisorStr,
          liveNav: parseFloat(scheme.valuation?.nav || 0),
          isLive: false,
          value: 0,
          invested: 0,
          avgPurchaseNav: 0,
          // casparser's Scheme model exposes a single `isin` field (verified
          // against its actual source — no isin_reinvest/isin_payout exist;
          // each Growth/IDCW/Reinvest variant is its own separate Scheme
          // entry, each with its own single isin).
          isELSS: /ELSS|TAX.?SAVER/i.test(scheme.scheme) || (masterFacts.byIsin[scheme.isin || '']?.isLocked || false),
          lockedValue: 0,
          name: scheme.scheme,
          isin: scheme.isin || '',
          // { from_folio, from_name } when this whole folio originated via
          // a folio-level transmission event (see folioTransmissions above)
          // -- distinct from per-transaction "Transmission In" wording,
          // which some AMCs use instead (see calculateFifoCost).
          folioTransmission,
        });
      });
    });

    // Fetch live NAVs and compute metrics
    const allHoldings = [];
    Object.keys(portfolioData).forEach(pan => {
      portfolioData[pan].holdings.forEach(h => {
        allHoldings.push({ pan, h });
      });
    });

    setLoadingText('Fetching live NAVs…');

    // 1. Collect unique AMFI codes — same fund can appear in multiple folios,
    //    no point fetching the same code more than once.
    const uniqueAmfi = [...new Set(
      allHoldings.map(({ h }) => h.scheme.amfi).filter(Boolean)
    )];

    // 2. Fetch all unique MF NAVs in one round trip (see /api/mf's ?codes=
    //    batch mode), and the full SIF scheme master in parallel -- CAS
    //    statements DO include SIF holdings with full transaction history,
    //    just like any mutual fund scheme, but casparser reports scheme.amfi
    //    as null for them (SIFs have no AMFI scheme code), so they need to
    //    be identified some other way and resolved to their AMFI-assigned
    //    SIF scheme_id (e.g. "SIF-34") for live NAV and history lookups.
    //    Fetched unconditionally (cheap, 4h-cached server-side) since there's
    //    no way to know in advance whether this CAS contains any SIF holdings.
    const [mfNavResult, sifResult] = await Promise.all([
      uniqueAmfi.length > 0
        ? fetch(`/api/mf?codes=${uniqueAmfi.join(',')}&latest=1`).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
      fetch('/api/sif-nav').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const navMap = {};
    if (mfNavResult?.status === 'SUCCESS' && mfNavResult.navs) {
      for (const [amfi, nav] of Object.entries(mfNavResult.navs)) {
        navMap[amfi] = parseFloat(nav);
      }
    }

    // ISIN is the reliable match (unique per scheme); normalised name is a
    // fallback for the rare case a scheme's ISIN isn't in either source.
    const sifByIsin = {};
    const sifByName = {};
    (sifResult?.schemes || []).forEach(s => {
      if (s.isin_po) sifByIsin[s.isin_po] = s;
      if (s.isin_ri) sifByIsin[s.isin_ri] = s;
      const norm = (s.nav_name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (norm) sifByName[norm] = s;
    });
    function resolveSif(scheme) {
      if (scheme.isin && sifByIsin[scheme.isin]) return sifByIsin[scheme.isin];
      const norm = (scheme.scheme || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return sifByName[norm] || null;
    }

    // 3. Apply resolved NAVs and compute metrics for every holding.
    for (const { h, pan } of allHoldings) {
      const scheme = h.scheme;
      const sifMatch = resolveSif(scheme);
      if (sifMatch) {
        h.fund_type = 'SIF';
        h.amfiCode  = sifMatch.scheme_id;  // e.g. "SIF-34" -- used for both live NAV and history lookups
        h.sifHouseName = sifMatch.sif_name;  // e.g. "Altiva SIF" -- the logo lookup key, distinct from the scheme's own display name
        h.liveNav   = sifMatch.nav;
        h.isLive    = true;
      } else {
        h.fund_type = 'Mutual Fund';
        h.amfiCode  = scheme.amfi || null;  // preserved for FIFO planner
        if (scheme.amfi && navMap[scheme.amfi] !== undefined) {
          h.liveNav = navMap[scheme.amfi];
          h.isLive  = true;
        }
      }
      const currentNav = h.liveNav;
      const fifo = calculateFifoCost(scheme, currentNav, !!h.folioTransmission);
      h.value       = h.units * currentNav;
      h.invested    = fifo.invested;
      h.lockedValue = fifo.lockedValue;
      h.buyLots     = fifo.buyLots;  // FIFO lots for redemption planner
      const casCost = parseFloat(scheme.valuation?.cost || 0);
      h.avgPurchaseNav = h.units > 0 && casCost > 0 ? casCost / h.units : 0;
      h.xirr           = schemeXirr(scheme, h.value);  // null if transaction history is incomplete
      h.xirrFlows      = schemeCashFlows(scheme);       // raw flows, pooled for portfolio-level XIRR
      h.transactions   = scheme.transactions || [];      // preserved for the Transaction History drawer
      portfolioData[pan].current  += h.value;
      portfolioData[pan].invested += h.invested;
      delete h.scheme;
    }

    // Sort by value desc
    Object.keys(portfolioData).forEach(pan => {
      portfolioData[pan].holdings.sort((a, b) => b.value - a.value);
    });

    const pans = Object.keys(portfolioData);
    if (pans.length === 0) {
      throw new Error('No active holdings found in this statement.');
    }

    // Saved investor-name labels (set by the user/admin on a previous visit)
    // take priority over whatever the CAS parser guessed.
    try {
      const realPans = pans.filter(p => p !== 'UNKNOWN' && PAN_REGEX.test(p));
      if (realPans.length) {
        const targetQS = effectiveTargetUserId ? `&targetUserId=${effectiveTargetUserId}` : '';
        const res = await fetch(`/api/cas/pan-name?pans=${realPans.join(',')}${targetQS}`);
        const { names } = await res.json();
        Object.entries(names || {}).forEach(([pan, name]) => {
          if (portfolioData[pan] && name) portfolioData[pan].investorName = name;
        });
      }
    } catch { /* non-fatal — fall back to parser-derived names */ }

    // Which tab opens first: the PAN previously marked as default (set by
    // the user/admin on an earlier visit, see markPanAsDefault below) --
    // the first PAN casparser happens to list in a family CAS is not
    // necessarily the actual person using the tool. Self-viewing gets this
    // for free from the session (auth.js's session callback); admin
    // viewing a client fetches THAT client's own default, since it's not
    // on the admin's own session.
    let resolvedDefaultPan = '';
    try {
      if (effectiveTargetUserId) {
        const res = await fetch(`/api/cas/default-pan?targetUserId=${effectiveTargetUserId}`);
        const d = await res.json();
        resolvedDefaultPan = d.defaultPan || '';
      } else {
        resolvedDefaultPan = session?.user?.defaultPan || '';
      }
    } catch { /* non-fatal — fall back to first PAN */ }
    setDefaultPan(resolvedDefaultPan);

    setPortfolioDataByPan(portfolioData);
    setActivePan((resolvedDefaultPan && pans.includes(resolvedDefaultPan)) ? resolvedDefaultPan : pans[0]);
    setFromCache(cached);
    setUploadState('success');
  }

  async function saveToBlobIfSignedIn(data, fileName, panCount) {
    if (!isSignedIn) return;
    setSaveStatus('saving');
    // Admin viewing an existing client (via Users tab → ?userId=) must save
    // under THAT client's account, not the admin's own — otherwise the CAS
    // parses and renders fine (client-side, always works) but silently
    // attaches to the admin's own blob storage, so it never shows up when
    // that client's account is checked afterwards.
    const targetUserId = (isAdmin && viewedUserId) ? viewedUserId : undefined;
    try {
      const res = await fetch('/api/cas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: data, fileName, panCount, targetUserId }),
      });
      if (res.ok) {
        const saved = await res.json();
        // savedPortfolios tracks the SIGNED-IN user's own uploads (fetched via
        // /api/cas/list with no userId). When saving on behalf of a viewed
        // client, this entry belongs to their account, not the admin's — so
        // don't inject it into this local list, or it'd show an upload here
        // that doesn't actually exist under the admin's own account.
        if (!targetUserId) {
          setSavedPortfolios(prev => [
            { id: saved.id, file_name: fileName, pan_count: panCount, uploaded_at: saved.uploadedAt, blob_key: saved.blobKey },
            ...prev,
          ]);
        }
        setSaveStatus('saved');
        setPendingSaveRetry(null);
      } else {
        setSaveStatus('error');
        setPendingSaveRetry({ data, fileName, panCount });
      }
    } catch {
      setSaveStatus('error');
      setPendingSaveRetry({ data, fileName, panCount });
    }
  }

  // Lets the "Retry save" banner re-attempt without asking the user to
  // re-upload/re-decrypt the file -- everything needed is already in memory.
  function retrySave() {
    if (pendingSaveRetry) saveToBlobIfSignedIn(pendingSaveRetry.data, pendingSaveRetry.fileName, pendingSaveRetry.panCount);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setUploadState('loading');
    setErrorText('');

    const formData = new FormData(e.target);
    const pdfFile = formData.get('pdf-file');
    const password = formData.get('pdf-password');
    const isMfCentral = (pdfFile?.name || '').toLowerCase().endsWith('.xlsx');

    try {
      let data = null;
      let cached = false;

      const cachedData = readCache(pdfFile);
      if (cachedData) {
        data = cachedData;
        cached = true;
        setLoadingText('Loading from cache…');
      } else {
        setLoadingText(isMfCentral ? 'Parsing MF Central report…' : 'Decrypting & Parsing…');
        const uploadFormData = new FormData();
        uploadFormData.append('file', pdfFile);
        if (!isMfCentral) uploadFormData.append('password', password);

        const parseRes = await fetch(isMfCentral ? '/api/parse-mfcentral' : '/api/parse', {
          method: 'POST',
          body: uploadFormData
        });

        if (!parseRes.ok) {
          const errBody = await parseRes.json().catch(() => ({}));
          throw new Error(
            errBody.error ||
            (parseRes.status === 401
              ? 'Incorrect password. Try your PAN in ALL CAPS.'
              : 'Failed to decrypt or parse the statement.')
          );
        }

        data = await parseRes.json();
        writeCache(pdfFile, data);
        // Awaited (not fire-and-forget) deliberately: this used to fire the
        // save and move straight on to showing results, which meant a user
        // who navigated away as soon as they saw their portfolio could abort
        // the in-flight save before it ever reached the server -- the parse
        // succeeded, rendered, and then was gone for good on the next visit.
        // Awaiting it here means results only appear once the save has
        // actually resolved (success OR failure), so there's no window where
        // "looks done" and "actually saved" can diverge. A failure doesn't
        // block showing the parsed data (still useful on its own) -- it's
        // surfaced via the saveStatus banner instead, with a retry option.
        const panCount = (data.folios || []).reduce((acc, f) => {
          const pan = (f.PAN || '').toUpperCase().trim();
          return pan && pan.length === 10 ? acc.add(pan) : acc;
        }, new Set()).size;
        await saveToBlobIfSignedIn(data, pdfFile.name, panCount);
      }

      await processCasData(data, cached);
    } catch (err) {
      setErrorText(err.message);
      setUploadState('error');
    }
  }

  function handleNewUpload() {
    setUploadState('idle');
    setPortfolioDataByPan({});
    setActivePan('');
    setFromCache(false);
    setSaveStatus('');
    setSelectedIsXlsx(false);
  }

  // Shared by both export functions: same holdings the fund grid is
  // currently showing (respects the All/MF/SIF filter and family view).
  function getExportRows() {
    const allHoldings = buildAllHoldings(currentInfo, manualHoldings, sifNavMap, activePan);
    return viewFilter === 'sif' ? allHoldings.filter(h => h.fund_type === 'SIF')
         : viewFilter === 'mf'  ? allHoldings.filter(h => h.fund_type !== 'SIF')
         : allHoldings;
  }

  // Historical NAV curve for the Transaction History drawer's optional
  // chart overlay -- deliberately NOT fetched automatically for every
  // holding on every page load (unlike the batched *live* NAV in
  // processCasData above). Only runs on an explicit click, and the result
  // is cached (keyed by navHistoryCacheKey) so re-opening the same fund's
  // drawer never re-fetches.
  //
  // SIF holdings -- whether parsed straight out of a CAS (processCasData
  // resolves these against the AMFI SIF scheme master) or added manually --
  // use AMFI's separate SIF NAV history API, keyed by scheme_id (stored in
  // amfiCode) rather than an AMFI scheme code, and unlike mfapi.in it
  // requires an explicit date range instead of always returning full
  // history -- which conveniently means since-first-purchase scoping is
  // just what we ask for, not something to filter after the fact.
  async function fetchNavHistory(fund) {
    const key = navHistoryCacheKey(fund);
    if (!key || navHistoryCache[key]?.points || navHistoryCache[key]?.loading) return;
    setNavHistoryCache(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const earliest = earliestTxnDate(fund.transactions);
      const cutoffMs = earliest != null ? earliest - 7 * 24 * 3600 * 1000 : null; // small lookback buffer, not full inception
      let points;

      if (fund.fund_type === 'SIF') {
        const iso = (d) => d.toISOString().slice(0, 10);
        const fromDate = new Date(cutoffMs ?? Date.now() - 365 * 24 * 3600 * 1000);
        const res = await fetch(`/api/sif-history?sd_id=${encodeURIComponent(fund.amfiCode)}&from=${iso(fromDate)}&to=${iso(new Date())}`);
        const json = await res.json();
        points = (json.records || [])
          .map(r => ({ t: new Date(r.date).getTime(), nav: parseFloat(r.nav) }))
          .filter(p => Number.isFinite(p.nav) && !isNaN(p.t))
          .sort((a, b) => a.t - b.t);
      } else {
        // mfapi.in's history endpoint has no date-range parameter, so the
        // fetch itself always returns the fund's full inception-to-date
        // series -- years of pre-purchase NAV data is noise here, not
        // signal, so only the window from just before the holding's first
        // real transaction onward is kept.
        const res = await fetch(`/api/mf?code=${fund.amfiCode}`);
        const json = await res.json();
        points = (json.data || [])
          .map(d => {
            const [dd, mm, yyyy] = d.date.split('-').map(Number);
            return { t: new Date(yyyy, mm - 1, dd).getTime(), nav: parseFloat(d.nav) };
          })
          .filter(p => Number.isFinite(p.nav) && (cutoffMs == null || p.t >= cutoffMs))
          .sort((a, b) => a.t - b.t);
      }

      setNavHistoryCache(prev => ({ ...prev, [key]: { loading: false, points } }));
    } catch {
      setNavHistoryCache(prev => ({ ...prev, [key]: { loading: false, error: true } }));
    }
  }

  // Resolves every CAS-derived holding's raw `advisor` string to a real
  // distributor profile, once per portfolioDataByPan change (i.e. whenever
  // new CAS data actually loads) rather than per-render or per-hover.
  // Already-resolved ARNs are skipped on subsequent firings (e.g. loading a
  // second family member's PAN after the first) so re-loading doesn't
  // re-fetch ARNs this page already knows about.
  useEffect(() => {
    const allAdvisorStrings = Object.values(portfolioDataByPan)
      .flatMap(info => (info.holdings || []).map(h => h.advisor));
    const newArns = [...new Set(allAdvisorStrings.map(extractArnDigits).filter(Boolean))]
      .filter(arn => !(arn in distributorCache));
    if (newArns.length === 0) return;
    resolveDistributors(newArns).then(map => {
      setDistributorCache(prev => ({ ...prev, ...map }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioDataByPan]);

  // xlsx is only ever needed here, on an explicit user click -- dynamic
  // import keeps SheetJS's full parser (large; already a dependency for
  // server-side MF Central report parsing) out of this page's normal JS
  // bundle and code-splits it into its own chunk.
  async function exportExcel() {
    const rows = getExportRows();
    if (!rows.length) return;
    const XLSX = await import('xlsx');
    const sheetRows = rows.map(fund => {
      const gain = fund.value - fund.invested;
      const gainPct = fund.invested > 0 ? (gain / fund.invested) * 100 : 0;
      return {
        ...(isFamilyView ? { Member: fund.__ownerName || '' } : {}),
        Fund: fund.name,
        Type: fund.fund_type === 'SIF' ? 'SIF' : (fund.source === 'manual' ? fund.fund_type : 'Mutual Fund'),
        Folio: fund.folio || '',
        Units: fund.units ? Number(fund.units.toFixed(3)) : 0,
        'Avg NAV': fund.avgPurchaseNav ? Number(fund.avgPurchaseNav.toFixed(4)) : 0,
        'Current NAV': fund.liveNav ? Number(fund.liveNav.toFixed(4)) : 0,
        'Invested (Rs)': Math.round(fund.invested),
        'Current Value (Rs)': Math.round(fund.value),
        'Gain (Rs)': Math.round(gain),
        'Gain %': Number(gainPct.toFixed(2)),
        'XIRR %': Number.isFinite(fund.xirr) ? Number((fund.xirr * 100).toFixed(2)) : '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Holdings');
    const safeName = (currentInfo.investorName || 'Portfolio').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40);
    XLSX.writeFile(wb, `${safeName}-holdings-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Branded print window, same pattern as app/backtest/page.js's doExport --
  // an isolated window with its own inline stylesheet prints/saves-as-PDF
  // cleanly without fighting this page's own @media print rules (which are
  // scoped to the Redemption Planner's fixed-position modal only).
  function exportPdf() {
    const rows = getExportRows();
    if (!rows.length) return;
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const totalInvested = rows.reduce((s, f) => s + (f.invested || 0), 0);
    const totalValue    = rows.reduce((s, f) => s + (f.value || 0), 0);
    const totalGain     = totalValue - totalInvested;
    const totalGainPct  = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
    const kpi = (l, v) => `<div class="banner-cell"><div class="banner-lbl">${l}</div><div class="banner-val">${v}</div></div>`;
    const banner = [
      kpi('Invested', '₹' + fmtINR(totalInvested)),
      kpi('Current Value', '₹' + fmtINR(totalValue)),
      kpi('Gain', (totalGain >= 0 ? '+₹' : '−₹') + fmtINR(Math.abs(totalGain))),
      kpi('Gain %', (totalGainPct >= 0 ? '+' : '') + totalGainPct.toFixed(2) + '%'),
    ].join('');
    const rowsHTML = rows.map(fund => {
      const gain = fund.value - fund.invested;
      const gainPct = fund.invested > 0 ? (gain / fund.invested) * 100 : 0;
      return `<tr>
        <td style="text-align:left">${esc(fund.name)}</td>
        ${isFamilyView ? `<td style="text-align:left">${esc(fund.__ownerName || '')}</td>` : ''}
        <td style="text-align:left">${esc(fund.folio || '—')}</td>
        <td>₹${fmtINR(fund.invested)}</td>
        <td>₹${fmtINR(fund.value)}</td>
        <td class="${gain >= 0 ? 'pos' : 'neg'}">${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%</td>
        <td>${Number.isFinite(fund.xirr) ? (fund.xirr * 100).toFixed(1) + '%' : '—'}</td>
      </tr>`;
    }).join('');

    const win = window.open('', '_blank', 'width=960,height=760');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${esc(currentInfo.investorName)} Portfolio | Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #2e7d32;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#2e7d32}.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:16px 0 8px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#c2dfc2}
.banner-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.banner-cell{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:8px;padding:10px 12px;text-align:center}
.banner-lbl{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5e8a5e;margin-bottom:3px}
.banner-val{font-family:"JetBrains Mono",monospace;font-size:.9rem;font-weight:700;color:#1b5e20}
.risk-table{width:100%;border-collapse:collapse;font-size:.62rem}
.risk-table th{background:#1e4d20;color:#fff;font-size:.58rem;font-weight:700;letter-spacing:.5px;padding:6px 8px;text-align:right}
.risk-table th:first-child,.risk-table th:nth-child(2){text-align:left}
.risk-table td{padding:5px 8px;border-bottom:1px solid #e8f5e9;text-align:right;font-family:"JetBrains Mono",monospace;font-size:.65rem;font-weight:600}
.risk-table td:first-child{text-align:left;font-family:"Raleway",sans-serif;font-weight:700;max-width:200px}
.risk-table tr:nth-child(even) td{background:#f5fbf5}
.pos{color:#1b5e20}.neg{color:#b71c1c}
.meta{font-size:.55rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:6px}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}}
</style></head><body>
<div class="ph">
  <div><div class="pt">${esc(currentInfo.investorName)}'s Portfolio — ${rows.length} Holding${rows.length > 1 ? 's' : ''}</div>
  <div class="pa">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds &amp; SIF Distributor</div></div>
  <img class="logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>
<div class="sec">At a Glance</div>
<div class="banner-grid">${banner}</div>
<div class="sec">Holdings</div>
<table class="risk-table"><thead><tr>
  <th style="text-align:left">Fund</th>
  ${isFamilyView ? '<th style="text-align:left">Member</th>' : ''}
  <th style="text-align:left">Folio</th>
  <th>Invested</th><th>Value</th><th>Gain</th><th>XIRR</th>
</tr></thead><tbody>${rowsHTML}</tbody></table>
<div class="meta">Generated ${esc(new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))} · mfcalc.getabundance.in/cas-tracker</div>
<div class="dis">⚠️ <strong style="color:#e65100">Disclaimer:</strong> Figures computed from your uploaded CAS using FIFO accounting and live NAVs; for informational purposes only, not investment advice. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. | ARN-251838 | Abundance Financial Services</div>
</body></html>`);
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 600);
    setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 1400);
  }

  // Redemption-selection checkboxes are scoped to whichever PAN is active —
  // clear them whenever the active PAN changes (new upload, switching tabs,
  // loading a saved portfolio) so a stale fund from a different investor's
  // PAN can never leak into a redemption plan.
  useEffect(() => { setRedeemSelection({}); }, [activePan]);

  function toggleRedeemSelection(fund) {
    setRedeemSelection(prev => {
      const next = { ...prev };
      if (next[fund.id]) delete next[fund.id];
      else next[fund.id] = fund;
      return next;
    });
  }

  async function loadSavedPortfolio(blobKey, targetUserIdOverride) {
    setUploadState('loading');
    setLoadingText('Loading saved portfolio…');
    try {
      // Fetch blob via a signed-read proxy
      const res = await fetch(`/api/cas/load?key=${encodeURIComponent(blobKey)}`);
      if (!res.ok) throw new Error('Could not load saved portfolio.');
      const data = await res.json();
      await processCasData(data, false, targetUserIdOverride);
    } catch (err) {
      setErrorText(err.message);
      setUploadState('error');
    }
  }

  const panKeys = Object.keys(portfolioDataByPan);
  const isFamilyView = familyPans.length > 1;

  // Pools holdings + totals across every checked family member -- each
  // holding keeps its own owner tag (__ownerPan/__ownerName) rather than
  // merging two people's holdings of the same fund into one row, since
  // their FIFO tax lots and capital gains are legally separate per
  // investor. Only used when 2+ members are checked at once; a single
  // check (or none) falls straight through to the normal per-PAN view.
  function mergeFamilyView(pans) {
    let current = 0, invested = 0;
    const holdings = [];
    pans.forEach(pan => {
      const info = portfolioDataByPan[pan];
      if (!info) return;
      current  += info.current  || 0;
      invested += info.invested || 0;
      (info.holdings || []).forEach(h => holdings.push({ ...h, __ownerPan: pan, __ownerName: info.investorName }));
    });
    return { investorName: `${pans.length} Family Members`, current, invested, holdings };
  }

  const currentInfo = isFamilyView
    ? mergeFamilyView(familyPans)
    : (portfolioDataByPan[activePan] || { current: 0, invested: 0, holdings: [], investorName: '' });
  const gain = currentInfo.current - currentInfo.invested;
  const gainPct = currentInfo.invested > 0 ? ((gain / currentInfo.invested) * 100).toFixed(2) : '0.00';
  const isProfit = gain >= 0;

  return (
    <>
      <div className="container">
        <Navbar activePage="cas-tracker" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">CAS Portfolio Tracker</span>
          </div>
          <h1 className="page-title">
            Live <span>NAV</span> & FIFO Wealth Tracker
          </h1>
          <p className="page-subtitle">
            Securely parse your CAMS or KFintech CAS. Multi-PAN family support · ELSS lock-in tracking · FIFO capital gains
          </p>
        </div>

        {uploadState === 'idle' && (
          <section id="upload-section">
            {/* Unauthenticated: show sign-in prompt. Page remains public and crawlable. */}
            {authStatus === 'unauthenticated' && (
              <div className="upload-card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: 16 }}>🔐</div>
                <h2 style={{
                  fontSize: '1.1rem', fontWeight: 800, color: 'var(--g1)',
                  letterSpacing: '-.3px', marginBottom: 8,
                }}>
                  Sign in to use the CAS Tracker
                </h2>
                <p style={{
                  fontSize: '.8rem', color: 'var(--muted)',
                  lineHeight: 1.7, margin: '0 auto 24px', maxWidth: 360,
                }}>
                  Securely parse your CAMS or KFintech CAS PDF. Processed privately
                  and saved to your account for future access.
                </p>
                <a
                  href="/login?from=/cas-tracker"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '12px 28px', borderRadius: 10,
                    background: 'var(--g1)', color: '#fff',
                    fontWeight: 700, fontSize: '.85rem', textDecoration: 'none',
                    fontFamily: 'Raleway, sans-serif',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </a>
                <div style={{
                  marginTop: 28, padding: '16px 20px',
                  background: 'var(--s2)', borderRadius: 10,
                  border: '1px solid var(--border)', textAlign: 'left',
                }}>
                  <div style={{
                    fontSize: '.6rem', fontWeight: 800, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: 'var(--muted)',
                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
                  }}>
                    What you get
                  </div>
                  {['📊 Live NAV tracking across all holdings',
                    '📁 Cloud-saved CAS — no re-upload needed',
                    '🔒 FIFO capital gains & ELSS lock-in analysis',
                    '👨‍👩‍👧 Multi-PAN family CAS support'].map((feat, i, arr) => (
                    <div key={i} style={{
                      fontSize: '.75rem', color: 'var(--text2)',
                      padding: '5px 0', fontWeight: 600,
                      borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      {feat}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 16 }}>
                  Don't have a CAS yet?{' '}
                  <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"
                    target="_blank" rel="noopener noreferrer" style={{ color: 'var(--g1)', fontWeight: 700 }}>
                    Get one free from CAMS →
                  </a>
                </p>
              </div>
            )}

            {/* Session still resolving: show a lightweight placeholder, not the
                form itself. The upload form used to render here too (gated on
                authStatus !== 'unauthenticated', which is also true during
                'loading') -- a user who uploaded in that brief window had
                isSignedIn read false (it requires authStatus === 'authenticated'),
                so the save was silently skipped with no retry, most often
                hitting brand-new signups whose session was still resolving on
                their very first visit to this page. */}
            {authStatus === 'loading' && (
              <div className="upload-card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', color: 'var(--muted)' }}>
                Loading your session…
              </div>
            )}

            {/* Authenticated: show upload form */}
            {authStatus === 'authenticated' && (
            <form id="cas-form" className="upload-card" onSubmit={handleSubmit}>
              <details style={{
                marginBottom: 18, padding: '12px 16px', borderRadius: 10,
                background: 'var(--s2)', border: '1px solid var(--border)',
              }}>
                <summary style={{
                  cursor: 'pointer', fontSize: '.78rem', fontWeight: 800, color: 'var(--g1)',
                  listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  📄 Don't have your CAS yet? Here's how to get one
                </summary>
                <ol style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: '.75rem', color: 'var(--text2)', lineHeight: 1.8 }}>
                  <li>Open CAMS's{' '}
                    <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"
                      target="_blank" rel="noopener noreferrer" style={{ color: 'var(--g1)', fontWeight: 700 }}>
                      Consolidated Account Statement request page
                    </a>{' '}(covers CAMS- and KFintech-serviced folios together).
                  </li>
                  <li>Under <strong>Statement Type</strong>, choose <strong>Detailed</strong> — not Summary. Only
                    Detailed includes the transaction history this tool's FIFO gains, ELSS lock-in, and rate charts need.</li>
                  <li>Enter the <strong>email address registered against your folios</strong> — the statement is sent
                    only there, so a different email won't receive it.</li>
                  <li>Set a <strong>password</strong> when asked (8–15 characters, one uppercase letter, one number, one
                    of @ # $ * _). Write it down — you'll enter this same password below to open the file here.</li>
                  <li>The password-protected PDF arrives by email, usually within a few minutes.</li>
                </ol>
              </details>
              <div style={{ marginBottom: '18px' }}>
                <div className="field-label">CAS PDF or MF Central Excel Report</div>
                <input
                  type="file"
                  name="pdf-file"
                  id="pdf-file"
                  accept=".pdf,.xlsx"
                  required
                  className="file-input"
                  onChange={e => setSelectedIsXlsx((e.target.files?.[0]?.name || '').toLowerCase().endsWith('.xlsx'))}
                />
              </div>

              {!selectedIsXlsx && (
                <div style={{ marginBottom: '18px' }}>
                  <div className="field-label">PAN Password (ALL CAPS)</div>
                  <input
                    type="password"
                    name="pdf-password"
                    id="pdf-password"
                    placeholder="ABCDE1234F"
                    required={!selectedIsXlsx}
                    className="field-input"
                  />
                </div>
              )}

              <button type="submit" className="submit-btn">
                <span>🔓</span>
                <span>{selectedIsXlsx ? 'Parse & Track (MF Central)' : 'Parse & Track'}</span>
              </button>

              <div className="security-note">
                {isSignedIn
                  ? saveStatus === 'saving' ? '☁ Saving to your account…'
                  : saveStatus === 'saved'  ? '✅ Saved to your account'
                  : saveStatus === 'error'  ? '⚠ Could not save (will retry)'
                  : '☁ Uploads saved to your account automatically'
                  : '🔒 100% Local Processing · No Data Stored · Sign in to save'}
              </div>
            </form>
            )} {/* end authenticated form */}

            {/* Saved portfolios */}
            {isSignedIn && (savedPortfolios.length > 0 || loadingSaved) && (
              <div style={{ marginTop: 24, maxWidth: 520, margin: '24px auto 0' }}>
                <div style={{
                  fontSize: '.62rem', fontWeight: 800, letterSpacing: '1.5px',
                  textTransform: 'uppercase', color: 'var(--muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: 10,
                }}>
                  📁 Your Saved Portfolios
                </div>
                {loadingSaved ? (
                  <div className="sk" style={{ height: 44, borderRadius: 10 }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {savedPortfolios.map(p => (
                      <div key={p.id} style={{
                        borderRadius: 10, border: '1.5px solid var(--border)',
                        background: 'var(--s2)', overflow: 'hidden',
                      }}>
                        {deletingId === p.id ? (
                          <div style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ fontSize: '.72rem', color: 'var(--text)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Delete "{p.file_name}"? This can't be undone.
                              </span>
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button
                                  onClick={() => deleteSavedPortfolio(p.id)}
                                  disabled={deleteInFlight}
                                  style={{ fontSize: '.68rem', fontWeight: 800, color: '#fff', background: 'var(--neg)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
                                >
                                  {deleteInFlight ? '…' : 'Delete'}
                                </button>
                                <button
                                  onClick={() => { setDeletingId(''); setDeleteError(''); }}
                                  disabled={deleteInFlight}
                                  style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                            {deleteError && (
                              <div style={{ marginTop: 8, fontSize: '.68rem', color: 'var(--neg)', fontWeight: 600 }}>
                                ⚠ {deleteError}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'stretch' }}>
                            <button
                              onClick={() => loadSavedPortfolio(p.blob_key)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 14px', border: 'none', background: 'none',
                                cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0,
                                transition: 'background .15s',
                                fontFamily: 'Raleway, sans-serif',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--s3)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  📄 {p.file_name}
                                </div>
                                <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                                  {p.pan_count} PAN{p.pan_count !== 1 ? 's' : ''} · {new Date(p.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                              </div>
                              <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--g2)', flexShrink: 0, marginLeft: 8 }}>
                                Load →
                              </span>
                            </button>
                            <button
                              onClick={() => { setDeletingId(p.id); setDeleteError(''); }}
                              title="Delete this saved CAS"
                              style={{
                                border: 'none', borderLeft: '1.5px solid var(--border)', background: 'none',
                                cursor: 'pointer', padding: '0 12px', color: 'var(--muted)', fontSize: '.85rem',
                                flexShrink: 0,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--neg)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {uploadState === 'loading' && (
          <div className="upload-card">
            <div className="loading-box">
              <div className="spinner"></div>
              <div className="loading-text">{loadingText}</div>
              <div className="loading-sub">This may take a moment for large statements</div>
            </div>
          </div>
        )}

        {uploadState === 'error' && (
          <div className="upload-card">
            <div className="error-box">{errorText}</div>
            <button onClick={handleNewUpload} className="submit-btn" style={{ marginTop: '16px' }}>
              Try Again
            </button>
          </div>
        )}

        {uploadState === 'success' && (
          <section id="dashboard-section">
            <div className="dash-header">
              <div>
                <h2 className="dash-title">
                  {isFamilyView ? `👨‍👩‍👧‍👦 Combined Portfolio — ${currentInfo.investorName}` : `${currentInfo.investorName}'s Portfolio`}
                  {fromCache && <span className="cache-badge">⚡ Cached</span>}
                </h2>
                <p className="dash-sub">Computed using FIFO accounting · Live NAVs from AMFI</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => { setPlannerMode('target'); setPlanPortfolio(true); }}
                  disabled={isFamilyView}
                  title={isFamilyView ? 'Check just one family member to plan a redemption -- capital gains and tax lots are per-investor, so a combined plan across people isn\'t meaningful' : undefined}
                  style={{
                    padding: '8px 16px', borderRadius: 9,
                    border: '1.5px solid var(--g2)',
                    background: 'var(--g-xlight)', cursor: isFamilyView ? 'not-allowed' : 'pointer',
                    fontSize: '.72rem', fontWeight: 800,
                    color: 'var(--g1)', fontFamily: 'Raleway, sans-serif',
                    letterSpacing: '-.2px', whiteSpace: 'nowrap',
                    transition: 'all .15s',
                    opacity: isFamilyView ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!isFamilyView) { e.currentTarget.style.background='var(--g1)'; e.currentTarget.style.color='#fff'; } }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--g-xlight)'; e.currentTarget.style.color='var(--g1)'; }}
                >
                  📊 Redemption Planner
                </button>
                <button onClick={exportPdf} className="new-upload-btn" title="Open a printable summary in a new tab (use your browser's Print → Save as PDF)">
                  ⤓ PDF
                </button>
                <button onClick={exportExcel} className="new-upload-btn" title="Download holdings as an Excel spreadsheet">
                  ⊞ Excel
                </button>
                <button onClick={handleNewUpload} className="new-upload-btn">
                  ↑ New Upload
                </button>
              </div>
            </div>

            {/* Save status -- visible where it actually matters now that the
                save is awaited before this view even renders (see
                handleSubmit's comment). 'saving' is normally too brief to
                see here in practice (the user was looking at the parsing
                spinner while it happened); 'error' persists with a retry
                button until it succeeds, rather than silently vanishing. */}
            {isSignedIn && saveStatus === 'error' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                margin: '0 0 16px', padding: '10px 16px',
                background: '#fff8e1', border: '1.5px solid #ffe082', borderRadius: 10,
                fontSize: '.78rem', fontWeight: 600, color: '#7a5b00',
              }}>
                <span>⚠ This CAS was parsed but couldn't be saved to your account -- it will be lost if you leave this page.</span>
                <button
                  onClick={retrySave}
                  style={{
                    flexShrink: 0, padding: '6px 14px', borderRadius: 8,
                    border: '1.5px solid #f57f17', background: '#fff', color: '#7a5b00',
                    fontWeight: 800, fontSize: '.72rem', cursor: 'pointer', fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  Retry Save
                </button>
              </div>
            )}
            {isSignedIn && saveStatus === 'saved' && (
              <div style={{
                margin: '0 0 16px', padding: '8px 16px',
                background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', borderRadius: 10,
                fontSize: '.75rem', fontWeight: 700, color: 'var(--g1)',
              }}>
                ✅ Saved to your account
              </div>
            )}

            {(() => {
              const realPanKeys = panKeys.filter(p => p !== '__manual__');
              if (realPanKeys.length <= 1) return null;
              const q = tabSearch.trim().toLowerCase();
              const visiblePanKeys = q
                ? realPanKeys.filter(pan =>
                    pan.toLowerCase().includes(q) ||
                    (portfolioDataByPan[pan]?.investorName || '').toLowerCase().includes(q)
                  )
                : realPanKeys;

              return (
              <>
              {realPanKeys.length > 5 && (
                <input
                  type="text"
                  value={tabSearch}
                  onChange={e => setTabSearch(e.target.value)}
                  placeholder={`Search ${realPanKeys.length} family members by name or PAN…`}
                  style={{
                    display: 'block', width: '100%', maxWidth: 320, marginBottom: 10,
                    padding: '7px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
                    fontFamily: 'Raleway, sans-serif', fontSize: '.72rem', outline: 'none',
                  }}
                />
              )}
              <div className="pan-tabs" style={{ alignItems: 'center' }}>
                <button
                  className={`pan-tab ${isFamilyView ? 'active' : ''}`}
                  title="Combine every family member's holdings into one pooled view (redemption planning is disabled in this mode, since capital gains are per-investor)"
                  onClick={() => setFamilyPans(prev =>
                    prev.length === realPanKeys.length ? [] : realPanKeys
                  )}
                >
                  <span>👨‍👩‍👧‍👦 All Family</span>
                </button>
                {familyPans.length > 0 && (
                  <button
                    className="pan-tab-rename-btn"
                    title="Exit family view"
                    onClick={() => setFamilyPans([])}
                  >
                    ✕
                  </button>
                )}
                {visiblePanKeys.length === 0 && (
                  <span style={{ fontSize: '.72rem', color: 'var(--muted)', padding: '10px 4px' }}>
                    No family members match "{tabSearch}"
                  </span>
                )}
                {visiblePanKeys.map(pan => {
                  const info = portfolioDataByPan[pan];
                  const firstName = info.investorName.split(' ')[0];
                  const hasRealName = PAN_REGEX.test(pan) && !isPanLike(info.investorName) && info.investorName !== 'Unknown Investor' && !info.investorName.startsWith('Investor (');

                  if (editingPan === pan) {
                    return (
                      <div key={pan} className="pan-tab-editing" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            autoFocus
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') savePanName(pan); if (e.key === 'Escape') { setEditingPan(''); setPanNameError(''); } }}
                            placeholder="Investor name"
                            maxLength={100}
                          />
                          <button className="pte-save" onClick={() => savePanName(pan)} disabled={savingPanName} title="Save">✓</button>
                          <button className="pte-cancel" onClick={() => { setEditingPan(''); setPanNameError(''); }} title="Cancel">✕</button>
                        </div>
                        {panNameError && (
                          <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#c62828', marginTop: 4 }}>
                            ⚠ {panNameError}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={pan} className="pan-tab-outer">
                      <input
                        type="checkbox"
                        checked={familyPans.includes(pan)}
                        onChange={() => setFamilyPans(prev =>
                          prev.includes(pan) ? prev.filter(p => p !== pan) : [...prev, pan]
                        )}
                        title={`Include ${firstName} in a combined family view`}
                        style={{ width: 15, height: 15, accentColor: 'var(--g1)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <button
                        onClick={() => { setActivePan(pan); setFamilyPans([]); }}
                        className={`pan-tab ${!isFamilyView && pan === activePan ? 'active' : ''}`}
                      >
                        <span className="pan-code">{pan}</span>
                        <span>{firstName}'s Portfolio</span>
                      </button>
                      {PAN_REGEX.test(pan) && (
                        <button
                          className="pan-tab-rename-btn"
                          title="Rename investor"
                          onClick={() => { setEditingName(hasRealName ? info.investorName : ''); setEditingPan(pan); setPanNameError(''); }}
                        >
                          ✎
                        </button>
                      )}
                      {PAN_REGEX.test(pan) && (
                        <button
                          className="pan-tab-rename-btn"
                          disabled={savingDefaultPan === pan}
                          title={pan === defaultPan ? 'This tab opens first by default' : 'Open this tab by default from now on'}
                          onClick={() => markPanAsDefault(pan)}
                          style={{ color: pan === defaultPan ? '#f57f17' : undefined }}
                        >
                          {pan === defaultPan ? '★' : '☆'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
              );
            })()}
            {defaultPanError && (
              <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#c62828', margin: '-8px 0 12px' }}>
                ⚠ {defaultPanError}
              </div>
            )}

{/* ── Merged totals including manual holdings ── */}
            {(() => {
              // Map manual holdings to comparable shape for totals
              const manualMapped = manualHoldings.map(h => {
                const pu = parseFloat(h.purchase_nav), u = parseFloat(h.units);
                const ln = h.fund_type === 'SIF' ? (sifNavMap[h.amfi_code] ?? null) : null;
                const value = (ln ?? pu) * u;
                return {
                  value, invested: pu * u,
                  xirrFlows: manualHoldingCashFlows({ purchaseDate: h.purchase_date, invested: pu * u }),
                };
              });
              const totalCurrent  = currentInfo.current  + manualMapped.reduce((s,h) => s + h.value,    0);
              const totalInvested = currentInfo.invested  + manualMapped.reduce((s,h) => s + h.invested, 0);
              const totalGain     = totalCurrent - totalInvested;
              const totalGainPct  = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(2) : '0.00';
              const tProfit       = totalGain >= 0;
              // Portfolio-level XIRR: only shown when every holding — CAS
              // and manual alike — has a trustworthy transaction history.
              const allFlows = [
                ...(currentInfo.holdings || []).map(h => h.xirrFlows),
                ...manualMapped.map(h => h.xirrFlows),
              ];
              const portfolioXirrVal = allFlows.length ? combinedXirr(allFlows, totalCurrent) : null;
              return (
                <div className="stat-grid animate-stagger">
                  <div className="stat-card">
                    <div className="sc-label">Current Value</div>
                    <div className="sc-val">₹{fmtINR(totalCurrent)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-label">Total Invested</div>
                    <div className="sc-val" style={{ color: 'var(--text2)' }}>₹{fmtINR(totalInvested)}</div>
                  </div>
                  <div className="stat-card gain-card">
                    <div className={`gain-accent ${tProfit ? 'pos' : 'neg'}`}></div>
                    <div className="sc-label">Wealth Gain</div>
                    <div className="gain-row">
                      <div className={`sc-val${tProfit ? '' : ' neg'}`} style={{ fontSize: '1.5rem' }}>
                        {tProfit ? '+' : ''}₹{fmtINR(totalGain)}
                      </div>
                      <div className={`gain-pct ${tProfit ? 'pos' : 'neg'}`}>
                        {tProfit ? '+' : ''}{totalGainPct}%
                      </div>
                    </div>
                    {Number.isFinite(portfolioXirrVal) && (
                      <div style={{
                        fontSize: '.65rem', fontWeight: 700, marginTop: 4,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: portfolioXirrVal >= 0 ? 'var(--g1)' : 'var(--neg)',
                      }}>
                        {portfolioXirrVal >= 0 ? '+' : ''}{(portfolioXirrVal * 100).toFixed(1)}% Portfolio XIRR
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── "Who sold this" distributor rollup ── */}
            {(() => {
              const casHoldings = (currentInfo.holdings || []);
              if (casHoldings.length === 0) return null;

              const buckets = {}; // key: resolved ARN or 'DIRECT' → { count, label }
              casHoldings.forEach(h => {
                const arn = extractArnDigits(h.advisor);
                if (!arn) {
                  buckets.DIRECT = buckets.DIRECT || { count: 0, label: 'Direct' };
                  buckets.DIRECT.count++;
                  return;
                }
                const record = distributorCache[arn];
                // A well-formed ARN whose lookup hasn't resolved yet, or
                // whose lookup genuinely failed, is excluded entirely --
                // indistinguishable from "still loading", and bucketing it
                // as Direct would be actively wrong (this holding DOES have
                // a distributor, we just don't know who yet/couldn't verify).
                if (record === undefined) return;
                const key = record ? arn : `UNKNOWN_${arn}`;
                const label = record ? `ARN-${arn} (${formatDistributorName(record.name)})` : `ARN-${arn}`;
                buckets[key] = buckets[key] || { count: 0, label };
                buckets[key].count++;
              });

              const entries = Object.values(buckets).sort((a, b) => b.count - a.count);
              // Nothing to roll up (every holding is Direct, or every
              // non-Direct holding is still unresolved/failed) -- a rollup
              // with nothing informative to add is noise, not information.
              if (entries.length === 0 || (entries.length === 1 && entries[0] === buckets.DIRECT)) return null;

              const summary = entries
                .map(e => `${e.count} CAS holding${e.count === 1 ? '' : 's'} via ${e.label}`)
                .join(' · ');

              return (
                <div style={{
                  marginBottom: 18, padding: '10px 16px', borderRadius: 10,
                  background: 'var(--s2)', border: '1.5px solid var(--border)',
                  fontSize: '.7rem', color: 'var(--text2)', lineHeight: 1.6,
                }}>
                  {summary}
                </div>
              );
            })()}

            {/* ── Filter toggle (only when SIF holdings exist) ── */}
            {(() => {
              const hasSIF = manualHoldings.some(h => h.fund_type === 'SIF');
              if (!hasSIF || manualLoading) return null;
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                  {[['all','All'],['mf','Mutual Funds'],['sif','SIF']].map(([key,label]) => (
                    <button key={key} onClick={() => setViewFilter(key)}
                      style={{
                        padding: '6px 16px', borderRadius: 20, border: '1.5px solid',
                        fontFamily: 'Raleway, sans-serif', fontSize: '.72rem', fontWeight: 700,
                        cursor: 'pointer', transition: 'all .15s',
                        borderColor: viewFilter === key ? 'var(--g2)' : 'var(--border)',
                        background:  viewFilter === key ? 'var(--g-xlight)' : 'var(--s2)',
                        color:       viewFilter === key ? 'var(--g1)' : 'var(--muted)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* ── Unified fund grid: CAS + manual holdings ── */}
            {(() => {
              const allHoldings = buildAllHoldings(currentInfo, manualHoldings, sifNavMap, activePan, sifNameMap);
              const filtered    = viewFilter === 'sif' ? allHoldings.filter(h => h.fund_type === 'SIF')
                                : viewFilter === 'mf'  ? allHoldings.filter(h => h.fund_type !== 'SIF')
                                : allHoldings;

              return (
                <div className="fund-grid animate-stagger">
                  {filtered.map((fund, idx) => {
                    const fGain    = fund.value - fund.invested;
                    const fGainPct = fund.invested > 0 ? ((fGain / fund.invested) * 100).toFixed(1) : '0.0';
                    const fProfit  = fGain >= 0;
                    const avgNavDisplay = fund.avgPurchaseNav > 0 ? `₹${fmtDec(fund.avgPurchaseNav, 2)}` : '—';
                    const isManual = fund.source === 'manual';
                    const advisorArn = !isManual ? extractArnDigits(fund.advisor) : null;
                    const resolvedDistributor = advisorArn ? distributorCache[advisorArn] : null;

                    return (
                      <div key={fund.id || idx} className="fund-card">
                        <div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
                            {!isManual && !isFamilyView && (
                              <input
                                type="checkbox"
                                checked={!!redeemSelection[fund.id]}
                                onChange={() => toggleRedeemSelection(fund)}
                                aria-label={`Select ${fund.name} for redemption planning`}
                                title="Select for multi-fund redemption planning"
                                style={{ width: 16, height: 16, marginTop: 8, accentColor: 'var(--g1)', cursor: 'pointer', flexShrink: 0 }}
                              />
                            )}
                            <ProviderAvatar
                              name={fund.fund_type === 'SIF' ? (fund.sifHouseName || fund.name.split(' - ')[0] || fund.name) : (fund.name.split(' - ')[0] || fund.name)}
                              logoPath={
                                fund.fund_type === 'SIF'
                                  ? getSIFLogo(fund.sifHouseName)
                                  : getMFLogoFromSchemeName(fund.name)
                              }
                              size={32}
                              radius={8}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {fund.amfiCode ? (
                                <button
                                  onClick={() => setDetailFund(fund)}
                                  title="View fund details"
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    background: 'none', border: 0, padding: 0, cursor: 'pointer',
                                    font: 'inherit',
                                  }}
                                  className="fund-name fund-name-link"
                                >
                                  {fund.name}
                                </button>
                              ) : (
                                <div className="fund-name" style={{ marginBottom: 0 }}>{fund.name}</div>
                              )}
                            </div>
                          </div>

                          {/* Type + source badges */}
                          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                            {resolvedDistributor && (
                              <span style={{
                                fontSize: '.52rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: 'var(--g-xlight)', color: 'var(--g2)', border: '1px solid var(--g-light)',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.5px',
                              }} title={`${formatDistributorName(resolvedDistributor.name)}\nARN-${resolvedDistributor.arn}\n📞 ${resolvedDistributor.phone || 'N/A'}\n✉ ${resolvedDistributor.email || 'N/A'}`}>
                                🧑‍💼 {formatDistributorName(resolvedDistributor.name).split(' ')[0]}
                              </span>
                            )}
                            {isFamilyView && fund.__ownerName && (
                              <span style={{
                                fontSize: '.52rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.5px',
                              }}>{fund.__ownerName}</span>
                            )}
                            {fund.fund_type === 'SIF' && (
                              <span style={{
                                fontSize: '.52rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: '#e0f2f1', color: '#00695c', border: '1px solid #b2dfdb',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.5px',
                              }}>SIF</span>
                            )}
                            {(fund.folioTransmission || (fund.transactions || []).some(t => isTransmissionTxn(t.description))) && (
                              <span style={{
                                fontSize: '.52rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: 'var(--s3)', color: 'var(--muted)', border: '1px solid var(--border)',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.5px',
                              }} title="Includes units transmitted in from another folio (e.g. inheritance) -- your CAS preserves the original purchase date and rate for these">
                                🔄 Transmitted
                              </span>
                            )}
                            {/* Admin-only badge: admin can see source, clients cannot */}
                            {isAdmin && isManual && (
                              <span style={{
                                fontSize: '.52rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.5px',
                              }}>Admin Added</span>
                            )}
                          </div>

                          {/* CAS-only metadata */}
                          {!isManual && (
                            <div className="folio-meta">
                              <div className="folio-row">
                                <div>
                                  <span className="label">Folio</span><br />
                                  <span className="value">{fund.folio || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="label">Nominee</span><br />
                                  <span className="value">{fund.nominee}</span>
                                </div>
                                {!resolvedDistributor && (
                                  <div className="folio-full">
                                    <span className="label">Advisor</span><br />
                                    <span className="value">{fund.advisor}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Manual-only: folio if present */}
                          {isManual && fund.folio && (
                            <div className="folio-meta">
                              <div className="folio-row">
                                <div>
                                  <span className="label">Folio</span><br />
                                  <span className="value">{fund.folio}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Manual: notes */}
                          {isManual && fund.notes && (
                            <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
                              {fund.notes}
                            </div>
                          )}

                          {/* ELSS badges (CAS only) */}
                          {!isManual && fund.isELSS && (
                            fund.lockedValue > 0 ? (
                              <div className="elss-badge elss-locked">
                                🔒 ₹{fmtINR(fund.lockedValue)} Locked
                              </div>
                            ) : (
                              <div className="elss-badge elss-unlocked">
                                🔓 ELSS Unlocked
                              </div>
                            )
                          )}
                        </div>

                        {/* Bottom section: nav metrics + Plan Redemption button wrapped together
                             so space-between doesn't push the button to the far bottom in a stretched grid card */}
                        <div>
                          <div className="nav-grid">
                            <div className="nav-left">
                              <div className="nav-item">
                                <div className="ni-label">
                                  {isManual ? 'Purchase NAV' : <>Avg Buy NAV <span className="cas-tag">(CAS)</span></>}
                                </div>
                                <div className="ni-val">{avgNavDisplay}</div>
                              </div>
                              <div className="nav-item">
                                <div className="ni-label">
                                  {isManual && !fund.isLive ? 'Est. NAV' : 'Live NAV'}
                                  {fund.isLive && <span className="live-indicator"></span>}
                                </div>
                                <div className="ni-val">₹{fmtDec(fund.liveNav)}</div>
                              </div>
                              <div className="nav-item">
                                <div className="ni-label">Units</div>
                                <div className="ni-val sm">{fmtDec(fund.units)}</div>
                              </div>
                              <div className="nav-item">
                                <div className="ni-label">Invested</div>
                                <div className="ni-val sm">₹{fmtINR(fund.invested)}</div>
                              </div>
                            </div>
                            <div className="nav-right-col">
                              <div className="ni-label">Current Value</div>
                              <div className="ni-val">₹{fmtINR(fund.value)}</div>
                              <div className={`fund-gain-pct ${fProfit ? 'pos' : 'neg'}`}>
                                {fProfit ? '+' : ''}{fGainPct}%
                              </div>
                              {Number.isFinite(fund.xirr) && (
                                <div style={{
                                  fontSize: '.62rem', fontWeight: 700,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color: fund.xirr >= 0 ? 'var(--g1)' : 'var(--neg)',
                                }}>
                                  {fund.xirr >= 0 ? '+' : ''}{(fund.xirr * 100).toFixed(1)}% XIRR
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Redemption planning needs real FIFO purchase-lot history, which
                              only CAS-derived holdings have (CAS-parsed SIF included -- see
                              processCasData's resolveSif) -- Transactions just needs at least
                              one known purchase, which manually-added holdings also have (a
                              single synthesized entry from their purchase date/NAV/units, see
                              buildAllHoldings), so it's available there too. */}
                          {(!isManual || fund.transactions?.length > 0) && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              {!isManual && (
                                <button
                                  onClick={() => setPlanFund(fund)}
                                  style={{
                                    flex: 1, padding: '9px 0', borderRadius: 8,
                                    border: 'none',
                                    background: 'var(--g1)', cursor: 'pointer',
                                    fontSize: '.72rem', fontWeight: 800,
                                    color: '#fff', fontFamily: 'Raleway, sans-serif',
                                    letterSpacing: '-.2px', transition: 'background .15s',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                                  title="Plan a tax-efficient redemption for this fund"
                                >
                                  📊 Redemption
                                </button>
                              )}
                              {fund.transactions?.length > 0 && (
                                <button
                                  onClick={() => setTxnDrawerFund(fund)}
                                  title="View transaction-by-transaction rate history"
                                  style={{
                                    flex: 1, padding: '9px 0', borderRadius: 8,
                                    border: '1.5px solid var(--border2)',
                                    background: 'var(--s2)', cursor: 'pointer',
                                    fontSize: '.72rem', fontWeight: 800,
                                    color: 'var(--g2)', fontFamily: 'Raleway, sans-serif',
                                    letterSpacing: '-.2px', transition: 'background .15s',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'var(--s2)'}
                                >
                                  📈 Transactions
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        )}
      </div>

      {/* ── Floating redemption-selection bar — mirrors PMSCompareBar's pattern ── */}
      {uploadState === 'success' && Object.keys(redeemSelection).length > 0 && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 9500,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px 10px 18px', borderRadius: 14,
          background: 'var(--g1)', boxShadow: '0 8px 28px rgba(0,0,0,.25)',
          maxWidth: 'calc(100vw - 24px)',
        }}>
          <span style={{ color: '#fff', fontSize: '.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {Object.keys(redeemSelection).length} fund{Object.keys(redeemSelection).length > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => { setPlannerMode('selected'); setPlanPortfolio(true); }}
            style={{
              padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: '#fff', color: 'var(--g1)',
              fontFamily: 'Raleway, sans-serif', fontSize: '.72rem', fontWeight: 800,
              whiteSpace: 'nowrap',
            }}>
            📊 Plan Redemption
          </button>
          <button
            onClick={() => setRedeemSelection({})}
            style={{
              padding: '8px 12px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,.4)', cursor: 'pointer',
              background: 'none', color: '#fff',
              fontFamily: 'Raleway, sans-serif', fontSize: '.72rem', fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
            Clear
          </button>
        </div>
      )}

      {/* ── FIFO Redemption Planner overlays ─────────────────────────────── */}
      {planFund && <RedemptionPlanner fund={planFund} onClose={() => setPlanFund(null)} />}
      {txnDrawerFund && (
        <TransactionHistoryDrawer
          fund={txnDrawerFund}
          navHistory={navHistoryCache[navHistoryCacheKey(txnDrawerFund)]}
          onFetchNavHistory={() => fetchNavHistory(txnDrawerFund)}
          onClose={() => setTxnDrawerFund(null)}
        />
      )}
      {planPortfolio && (
        <PortfolioRedemptionPlanner
          holdings={currentInfo.holdings || []}
          selectedHoldings={Object.values(redeemSelection)}
          initialMode={plannerMode}
          investorName={currentInfo.investorName}
          onClose={() => setPlanPortfolio(false)}
          masterFacts={masterFacts}
        />
      )}
      {detailFund && (
        detailFund.fund_type === 'SIF'
          ? <SifDetailDrawer schemeId={detailFund.amfiCode} onClose={() => setDetailFund(null)} />
          : <FundDetailDrawer code={detailFund.amfiCode} onClose={() => setDetailFund(null)} />
      )}

      {/* ── FAQ — visible to all, crawlable ─────────────────────────────── */}
      <section style={{ padding: '64px 0 0', borderTop: '1px solid var(--border)', marginTop: 64 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px' }}>
          <div className="page-eyebrow" style={{ marginBottom: 10 }}>
            <span className="eyebrow-text">Help & Support</span>
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 28 }}>
            Frequently Asked Questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {CAS_FAQ.map(({ q, a }, i, arr) => (
              <details key={i} style={{
                borderTop: '1px solid var(--border)',
                borderBottom: i === arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <summary style={{
                  padding: '16px 4px', cursor: 'pointer', listStyle: 'none',
                  fontSize: '.82rem', fontWeight: 800, color: 'var(--text)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  {q}
                  <span style={{ fontSize: '1rem', color: 'var(--muted)', flexShrink: 0, marginLeft: 12 }}>+</span>
                </summary>
                <div style={{ padding: '0 4px 16px', fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

export default function CasTrackerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 140, height: 16, borderRadius: 8 }} />
      </div>
    }>
      <CasTrackerInner />
    </Suspense>
  );
    }
