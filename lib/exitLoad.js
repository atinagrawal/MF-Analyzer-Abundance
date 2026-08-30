/**
 * lib/exitLoad.js — Shared exit-load detection + per-lot calculation
 *
 * Extracted from app/cas-tracker/page.js, where this logic used to live as
 * private, non-exported functions -- which meant components/RedemptionPlanner.jsx
 * (the single-fund redemption drawer, shared by both app/portfolio/page.jsx and
 * app/cas-tracker/page.js's individual holding-card "redeem" button) had no way
 * to reach it and showed no exit-load info at all, even though the OTHER
 * redemption UI in this app (PortfolioRedemptionPlanner, cas-tracker-only)
 * already computed it correctly. Centralising here so both consumers use the
 * exact same logic instead of risking a second copy drifting out of sync.
 */

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
  // Groww exit-load data is merged onto the same masterEntry object by
  // app/api/scheme-master-facts/route.js (facts.exitLoadText/exitLoadTiers/
  // exitLoadConfidence/exitLoadFreePercent, alongside the BSE-native fields
  // below) -- no separate lookup needed here.
  let masterEntry = isin && masterFacts?.byIsin?.[isin];
  if (!masterEntry && fundName) {
    // Name fallback if ISIN is not passed or empty
    const norm = (fundName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm) masterEntry = masterFacts?.byNormName?.[norm];
  }

  // 1. Verified Groww Exit Loads (high-confidence dataset)
  if (masterEntry?.exitLoadText && masterEntry.exitLoadConfidence === 'high' && Array.isArray(masterEntry.exitLoadTiers)) {
    const sortedTiers = [...masterEntry.exitLoadTiers].sort((a, b) => a.days - b.days);
    const tierStr = sortedTiers.length === 0
      ? '0% (No Load)'
      : sortedTiers.map(t => `${(t.rate * 100).toFixed(2).replace(/\.00$/, '')}% (<${formatTierPeriod(t.days)})`).join(' / ');
    const freeStr = masterEntry.exitLoadFreePercent ? ` (${masterEntry.exitLoadFreePercent}% free)` : '';
    const label = `Verified: ${tierStr}${freeStr}`;
    return {
      isLocked: false,
      hasExitLoad: sortedTiers.length > 0,
      schedule: sortedTiers,
      freePercent: masterEntry.exitLoadFreePercent || 0,
      label,
      rawText: masterEntry.exitLoadText
    };
  }

  // Groww found the real clause but couldn't parse it into numbers with
  // confidence (confidence === 'low'). Do NOT fabricate a schedule here --
  // that would silently compute a wrong exit-load amount from a guess
  // dressed up as "verified" data. Instead fall through to the existing
  // BSE-flag/category-guess logic below for the actual number, and tag
  // whatever it returns with the real clause text so the UI can flag it
  // for manual review instead of trusting the guess unquestioningly.
  const needsReview = !!(masterEntry?.exitLoadText && masterEntry.exitLoadConfidence === 'low');
  const withReview = (result) => needsReview
    ? { ...result, label: `${result.label} — Review: "${masterEntry.exitLoadText}"`, rawText: masterEntry.exitLoadText, needsReview: true }
    : result;

  // 2. Fallback to existing BSE flag logic
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

export { inferExitLoadCategory, formatTierPeriod, getExitLoadInfo, calcLotExitLoad };
