/**
 * lib/calculatorMath.js
 *
 * Centralized, pure mathematical calculation engine for:
 * - SIP (Systematic Investment Plan) & Step-Up SIP
 * - Lumpsum compound interest
 * - SWP (Systematic Withdrawal Plan) projections & longevity modeling
 * - Real AMFI NAV historical replay / backtesting for SWP & SIP
 * - Newton-Raphson XIRR solver
 * - Currency formatting utilities
 *
 * Sourced directly from public/js/mfcalc-main.js to guarantee 100% mathematical
 * parity with existing tools.
 */

export const FREQ = {
  daily:     { perYear: 252, label: 'Daily' },
  weekly:    { perYear: 52,  label: 'Weekly' },
  monthly:   { perYear: 12,  label: 'Monthly' },
  quarterly: { perYear: 4,   label: 'Quarterly' },
  annually:  { perYear: 1,   label: 'Annually' },
};

export const SWP_FREQ = {
  monthly:   { n: 12, lbl: 'mo',  plbl: 'Monthly' },
  quarterly: { n: 4,  lbl: 'qtr', plbl: 'Quarterly' },
  annually:  { n: 1,  lbl: 'yr',  plbl: 'Annually' },
};

/**
 * Format integer or float to Indian numbering (Lakhs, Crores)
 * e.g. 10000000 -> "1.00 Cr", 500000 -> "5.00 L", 25000 -> "25,000"
 */
export function fmtINR(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return sign + (a / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return sign + (a / 1e5).toFixed(2) + ' L';
  return sign + a.toLocaleString('en-IN');
}

/**
 * Full INR format with Rupee symbol
 * e.g. 5000000 -> "₹50,00,000"
 */
export function fmtINRFull(n) {
  const isNeg = n < 0;
  return (isNeg ? '-₹' : '₹') + Math.round(Math.abs(n)).toLocaleString('en-IN');
}

/**
 * Compact INR format with Rupee symbol
 * e.g. 5000000 -> "₹50.00 L", 12000000 -> "₹1.20 Cr", 25000 -> "₹25.0k"
 */
export function fmtINRShort(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return sign + '₹' + (a / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return sign + '₹' + (a / 1e5).toFixed(2) + ' L';
  if (a >= 1e3) return sign + '₹' + (a / 1e3).toFixed(1) + 'k';
  return sign + '₹' + Math.round(a).toLocaleString('en-IN');
}

/**
 * Simulate SIP / Lumpsum investment trajectory
 *
 * @param {Object} params
 * @param {string} params.mode 'sip' | 'lump' | 'both'
 * @param {string} params.freq 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
 * @param {number} params.sipAmt Periodic investment amount
 * @param {number} params.lumpAmt One-time lumpsum investment amount
 * @param {number} params.totalYears Duration in years (can be fractional)
 * @param {number} params.annualRate Expected annual return rate in % (e.g. 12)
 * @param {number} params.stepupPct Annual step-up percentage (e.g. 10 for 10% annual increase)
 *
 * @returns {Object} { snaps, totalInvested, finalCorpus, totalGain, wealthGainPct }
 */
export function simulateSIP({
  mode = 'sip',
  freq = 'monthly',
  sipAmt = 10000,
  lumpAmt = 0,
  totalYears = 10,
  annualRate = 12,
  stepupPct = 0,
}) {
  const isLump = mode === 'lump';
  const isBoth = mode === 'both';
  const cfg = FREQ[freq] || FREQ.monthly;
  const ipy = cfg.perYear;
  const totalInstallments = Math.round(totalYears * ipy);
  const ratePerPeriod = Math.pow(1 + annualRate / 100, 1 / ipy) - 1;

  if (isLump) {
    // Pure lumpsum compounding
    const snaps = [{ label: 'Start', year: 0, corpus: Math.round(lumpAmt), invested: Math.round(lumpAmt) }];
    for (let y = 1; y <= Math.ceil(totalYears); y++) {
      const yr = Math.min(y, totalYears);
      snaps.push({
        label: yr + 'Y',
        year: yr,
        corpus: Math.round(lumpAmt * Math.pow(1 + annualRate / 100, yr)),
        invested: Math.round(lumpAmt),
      });
    }
    const finalCorpus = snaps[snaps.length - 1].corpus;
    const totalInvested = lumpAmt;
    const totalGain = finalCorpus - totalInvested;
    const wealthGainPct = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(1) : 0;
    return { snaps, totalInvested, finalCorpus, totalGain, wealthGainPct };
  }

  // SIP (with optional lump top-up at start)
  const lumpStart = isBoth ? lumpAmt : 0;
  const snaps = [{ label: 'Start', year: 0, corpus: Math.round(lumpStart), invested: Math.round(lumpStart) }];
  let corpus = lumpStart;
  let invested = 0;
  let amt = sipAmt;

  for (let i = 1; i <= totalInstallments; i++) {
    corpus = (corpus + amt) * (1 + ratePerPeriod);
    invested += amt;
    if (stepupPct > 0 && i % ipy === 0) {
      amt *= 1 + stepupPct / 100;
    }
    if (i % ipy === 0) {
      snaps.push({
        label: i / ipy + 'Y',
        year: i / ipy,
        corpus: Math.round(corpus),
        invested: Math.round(invested + lumpStart),
      });
    }
  }

  if (totalInstallments % ipy !== 0) {
    snaps.push({
      label: totalYears.toFixed(1) + 'Y',
      year: totalYears,
      corpus: Math.round(corpus),
      invested: Math.round(invested + lumpStart),
    });
  }

  const finalCorpus = snaps[snaps.length - 1].corpus;
  const totalInvested = snaps[snaps.length - 1].invested;
  const totalGain = finalCorpus - totalInvested;
  const wealthGainPct = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(1) : 0;

  return { snaps, totalInvested, finalCorpus, totalGain, wealthGainPct };
}

/**
 * Present value of a growing annuity
 * Formula: PV = pmt * (1 - ((1+g)/(1+r))^n) / (r - g)
 */
export function pvGrowingAnnuity(pmt, r, g, n) {
  if (Math.abs(r - g) < 1e-9) return (pmt * n) / (1 + r);
  return (pmt * (1 - Math.pow((1 + g) / (1 + r), n))) / (r - g);
}

/**
 * Step through periodic SWP withdrawals and compute longevity
 *
 * @param {number} startCorpus Initial investment corpus
 * @param {number} annRate Expected annual return rate in %
 * @param {number} freqN Frequency periods per year (12=monthly, 4=quarterly, 1=annual)
 * @param {number} withdrawalPerPeriod Amount withdrawn each period
 * @param {number} stepupPct Annual step-up in withdrawal %
 * @param {number} totalPeriods Total number of periods to simulate
 *
 * @returns {Object} { snaps, depleted, totalWithdrawn, finalCorpus }
 */
export function runSWPSim(startCorpus, annRate, freqN, withdrawalPerPeriod, stepupPct, totalPeriods) {
  const rpp = Math.pow(1 + annRate / 100, 1 / freqN) - 1;
  let corpus = startCorpus;
  let totalW = 0;
  let amt = withdrawalPerPeriod;
  let depleted = -1;

  const snaps = [
    { period: 0, corpus: Math.round(startCorpus), totalWithdrawn: 0, payout: Math.round(amt) },
  ];

  for (let i = 1; i <= totalPeriods; i++) {
    corpus *= 1 + rpp;
    const w = Math.min(corpus, amt);
    corpus -= w;
    totalW += w;

    if (i % freqN === 0 || i === totalPeriods) {
      snaps.push({
        period: i / freqN,
        corpus: Math.round(corpus),
        totalWithdrawn: Math.round(totalW),
        payout: Math.round(w),
      });
    }

    if (corpus <= 0 && depleted < 0) {
      depleted = i / freqN;
      corpus = 0;
    }
    if (corpus <= 0) break;

    if (stepupPct > 0 && i % freqN === 0) {
      amt *= 1 + stepupPct / 100;
    }
  }

  return {
    snaps,
    depleted,
    totalWithdrawn: Math.round(totalW),
    finalCorpus: Math.round(corpus),
  };
}

/**
 * High-level SWP Calculator handler for both "haveCorpus" and "needIncome"
 */
export function calculateSWP({
  mode = 'haveCorpus',
  corpus = 5000000,
  withdrawal = 30000,
  targetIncome = 30000,
  rate = 10,
  freq = 'monthly',
  durationYears = 20,
  stepup = 0,
  inflation = 6,
  delayOn = false,
  delayMonths = 0,
  delayRate = 10,
}) {
  const freqCfg = SWP_FREQ[freq] || SWP_FREQ.monthly;
  const totalPeriods = Math.round(durationYears * freqCfg.n);

  let startCorpus = corpus;
  let corpusNeeded = corpus;
  let actualWithdrawal = withdrawal;

  if (mode === 'haveCorpus') {
    startCorpus = delayOn && delayMonths > 0
      ? corpus * Math.pow(1 + delayRate / 100, delayMonths / 12)
      : corpus;
    const withdrawalPerPeriod = actualWithdrawal * (12 / freqCfg.n);
    const sim = runSWPSim(startCorpus, rate, freqCfg.n, withdrawalPerPeriod, stepup, totalPeriods);

    const survives = sim.depleted < 0;
    const annualIncome = actualWithdrawal * 12;
    const yieldPct = startCorpus > 0 ? ((annualIncome / startCorpus) * 100).toFixed(2) : 0;
    const sustWithdrawal = (startCorpus * (rate / 100)) / 12;
    const perpetualW = (startCorpus * (rate / 100)) / freqCfg.n;
    const realPct = (annualIncome / Math.pow(1 + inflation / 100, durationYears / 2) / startCorpus * 100).toFixed(2);
    const wealthMultiple = startCorpus > 0 ? ((sim.totalWithdrawn + sim.finalCorpus) / startCorpus).toFixed(2) : 0;

    return {
      mode,
      startCorpus: Math.round(startCorpus),
      initialCorpus: corpus,
      sim,
      survives,
      depleted: sim.depleted,
      finalCorpus: sim.finalCorpus,
      totalWithdrawn: sim.totalWithdrawn,
      annualIncome,
      yieldPct,
      sustWithdrawal: Math.round(sustWithdrawal),
      perpetualW: Math.round(perpetualW),
      realPct,
      wealthMultiple,
      freqCfg,
      durationYears,
    };
  } else {
    // Need Income Mode
    const incomePerPeriod = targetIncome * (12 / freqCfg.n);
    const rpp = Math.pow(1 + rate / 100, 1 / freqCfg.n) - 1;
    const gpp = stepup > 0 ? Math.pow(1 + stepup / 100, 1 / freqCfg.n) - 1 : 0;

    corpusNeeded = stepup > 0
      ? pvGrowingAnnuity(incomePerPeriod, rpp, gpp, totalPeriods)
      : (rpp > 0 ? incomePerPeriod * (1 - Math.pow(1 + rpp, -totalPeriods)) / rpp : incomePerPeriod * totalPeriods);

    startCorpus = delayOn && delayMonths > 0
      ? corpusNeeded / Math.pow(1 + delayRate / 100, delayMonths / 12)
      : corpusNeeded;

    const sim = runSWPSim(Math.round(corpusNeeded), rate, freqCfg.n, incomePerPeriod, stepup, totalPeriods);
    const annualIncome = targetIncome * 12;
    const yieldPct = corpusNeeded > 0 ? ((annualIncome / corpusNeeded) * 100).toFixed(2) : 0;
    const sustWithdrawal = (corpusNeeded * (rate / 100)) / 12;
    const perpetualW = (corpusNeeded * (rate / 100)) / freqCfg.n;
    const wealthMultiple = corpusNeeded > 0 ? ((sim.totalWithdrawn + sim.finalCorpus) / corpusNeeded).toFixed(2) : 0;

    return {
      mode,
      startCorpus: Math.round(corpusNeeded),
      corpusNow: Math.round(startCorpus),
      sim,
      survives: sim.depleted < 0,
      depleted: sim.depleted,
      finalCorpus: sim.finalCorpus,
      totalWithdrawn: sim.totalWithdrawn,
      annualIncome,
      yieldPct,
      sustWithdrawal: Math.round(sustWithdrawal),
      perpetualW: Math.round(perpetualW),
      wealthMultiple,
      freqCfg,
      durationYears,
    };
  }
}

/**
 * Builds order-independent { 'YYYY-MM': nav } keeping the chronologically
 * latest NAV in each calendar month.
 */
export function buildMonthlyNavMap(records) {
  const navMap = {};
  const latestTsForKey = {};

  if (!Array.isArray(records)) return navMap;

  records.forEach((d) => {
    if (!d || !d.date || !d.nav) return;
    const parts = d.date.split('-');
    if (parts.length !== 3) return;

    let yyyy, mm, dd;
    // Check if format is DD-MM-YYYY or YYYY-MM-DD
    if (parts[0].length === 4) {
      [yyyy, mm, dd] = parts;
    } else {
      [dd, mm, yyyy] = parts;
    }

    const key = yyyy + '-' + String(mm).padStart(2, '0');
    const t = Date.UTC(+yyyy, +mm - 1, +dd);
    const navVal = parseFloat(d.nav);

    if (isNaN(navVal) || navVal <= 0) return;

    if (latestTsForKey[key] === undefined || t > latestTsForKey[key]) {
      latestTsForKey[key] = t;
      navMap[key] = navVal;
    }
  });

  return navMap;
}

/**
 * XIRR calculation via Newton-Raphson with step damping
 *
 * @param {Array<{ t: number, v: number }>} cashflows Where t is time in years, v is cashflow
 * @param {number} guess Initial guess (default 0.1)
 * @returns {string|null} Annualized return percentage e.g. "14.25"
 */
export function calcXIRR(cashflows, guess = 0.1) {
  if (!cashflows || cashflows.length < 2) return null;

  function npv(r) {
    return cashflows.reduce((s, cf) => s + cf.v / Math.pow(1 + r, cf.t), 0);
  }
  function dnpv(r) {
    return cashflows.reduce((s, cf) => s - (cf.t * cf.v) / Math.pow(1 + r, cf.t + 1), 0);
  }

  let r = guess;
  for (let i = 0; i < 100; i++) {
    const n = npv(r);
    const d = dnpv(r);
    if (Math.abs(d) < 1e-12) break;
    const nr = r - n / d;
    if (Math.abs(nr - r) < 1e-8) {
      r = nr;
      break;
    }
    r = nr;
    if (r < -0.99) r = -0.99;
  }

  return isFinite(r) ? (r * 100).toFixed(2) : null;
}

/**
 * Replays monthly SWP redemptions on historical AMFI NAV data
 */
export function runNAVBacktest(
  navMap,
  startYear,
  startMonth,
  corpus,
  monthlyWithdrawal,
  stepupPct = 0,
  inflationPct = 6,
  delayMonths = 0,
  endYear = null,
  endMonth = null
) {
  delayMonths = delayMonths || 0;

  let units = null;
  let currentWithdrawal = monthlyWithdrawal;
  const snaps = [];
  let totalWithdrawn = 0;
  let depleted = null;
  let month = startMonth;
  let year = startYear;
  let monthsRun = 0;

  function getNAV(y, m) {
    for (let offset = 0; offset < 5; offset++) {
      let mm = m + offset;
      let yy = y;
      if (mm > 12) {
        mm -= 12;
        yy++;
      }
      const key = yy + '-' + String(mm).padStart(2, '0');
      if (navMap[key]) return { nav: navMap[key], key };
    }
    return null;
  }

  const startEntry = getNAV(year, month);
  if (!startEntry) return null;

  units = corpus / startEntry.nav;
  snaps.push({
    label: startEntry.key,
    corpus: Math.round(corpus),
    withdrawn: 0,
    nav: startEntry.nav,
    units: Math.round(units * 100) / 100,
    payout: 0,
    phase: delayMonths > 0 ? 'delay' : 'withdraw',
  });

  const maxMonths = 50 * 12;
  while (monthsRun < maxMonths) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    monthsRun++;

    if (endYear && endMonth) {
      if (year > endYear || (year === endYear && month > endMonth)) break;
    }

    const entry = getNAV(year, month);
    if (!entry) break;

    if (monthsRun <= delayMonths) {
      // Delay phase: units compound with market NAV, no redemption
      snaps.push({
        label: entry.key,
        corpus: Math.round(units * entry.nav),
        withdrawn: 0,
        nav: entry.nav,
        units: Math.round(units * 100) / 100,
        payout: 0,
        phase: 'delay',
      });
      continue;
    }

    // Withdrawal phase
    const withdrawalMonth = monthsRun - delayMonths;
    if (withdrawalMonth % 12 === 0 && stepupPct > 0) {
      currentWithdrawal *= 1 + stepupPct / 100;
    }

    const corpusNow = units * entry.nav;
    const actualWithdrawal = Math.min(corpusNow, currentWithdrawal);
    const unitsToSell = actualWithdrawal / entry.nav;
    units -= unitsToSell;
    totalWithdrawn += actualWithdrawal;

    snaps.push({
      label: entry.key,
      corpus: Math.round(units * entry.nav),
      withdrawn: Math.round(totalWithdrawn),
      nav: entry.nav,
      units: Math.round(units * 100) / 100,
      payout: Math.round(actualWithdrawal),
      phase: 'withdraw',
    });

    if (units <= 0) {
      depleted = withdrawalMonth;
      break;
    }
  }

  const finalCorpus = units > 0 ? Math.round(units * snaps[snaps.length - 1].nav) : 0;
  const totalMonths = monthsRun;
  const withdrawalMonths = Math.max(0, totalMonths - delayMonths);
  const durationYrs = totalMonths / 12;

  // XIRR: corpus out at t=0, each monthly payout in, final corpus in at end
  const cashflows = [{ t: 0, v: -corpus }];
  snaps.slice(1).forEach((s, i) => {
    if (s.payout > 0) cashflows.push({ t: (i + 1) / 12, v: s.payout });
  });
  if (finalCorpus > 0) cashflows.push({ t: durationYrs, v: finalCorpus });
  const xirr = cashflows.length > 1 ? calcXIRR(cashflows) : null;

  const delayEndSnap = delayMonths > 0 ? snaps[Math.min(delayMonths, snaps.length - 1)] : null;
  const corpusAfterDelay = delayEndSnap ? delayEndSnap.corpus : corpus;

  return {
    snaps,
    depleted,
    totalWithdrawn: Math.round(totalWithdrawn),
    finalCorpus,
    durationYrs,
    withdrawalMonths,
    delayMonths,
    xirr,
    startNAV: startEntry.nav,
    corpusAfterDelay,
  };
}

/**
 * Replays monthly SIP investments on historical AMFI NAV data
 */
export function runSIPBacktest(
  navMap,
  startYear,
  startMonth,
  monthlySIP,
  stepupPct = 0,
  endYear = null,
  endMonth = null
) {
  let currentSIP = monthlySIP;
  const snaps = [];
  let totalInvested = 0;
  let units = 0;
  let month = startMonth;
  let year = startYear;

  function getNAV(y, m) {
    for (let offset = 0; offset < 5; offset++) {
      let mm = m + offset;
      let yy = y;
      if (mm > 12) {
        mm -= 12;
        yy++;
      }
      const key = yy + '-' + String(mm).padStart(2, '0');
      if (navMap[key]) return { nav: navMap[key], key };
    }
    return null;
  }

  const startEntry = getNAV(year, month);
  if (!startEntry) return null;

  // Buy first instalment
  units += currentSIP / startEntry.nav;
  totalInvested += currentSIP;
  snaps.push({
    label: startEntry.key,
    corpus: Math.round(units * startEntry.nav),
    invested: Math.round(totalInvested),
    nav: startEntry.nav,
    units: Math.round(units * 100) / 100,
    sip: currentSIP,
  });

  const maxMonths = 50 * 12;
  let monthsRun = 0;

  while (monthsRun < maxMonths) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    monthsRun++;
    if (endYear && endMonth && (year > endYear || (year === endYear && month > endMonth))) break;

    const entry = getNAV(year, month);
    if (!entry) break;

    // Annual step-up
    if (monthsRun % 12 === 0 && stepupPct > 0) {
      currentSIP *= 1 + stepupPct / 100;
    }

    units += currentSIP / entry.nav;
    totalInvested += currentSIP;

    snaps.push({
      label: entry.key,
      corpus: Math.round(units * entry.nav),
      invested: Math.round(totalInvested),
      nav: entry.nav,
      units: Math.round(units * 100) / 100,
      sip: Math.round(currentSIP),
    });
  }

  const finalCorpus = snaps[snaps.length - 1].corpus;
  const finalNAV = snaps[snaps.length - 1].nav;
  const totalMonths = snaps.length;
  const absoluteGain = finalCorpus - totalInvested;
  const multiple = totalInvested > 0 ? (finalCorpus / totalInvested).toFixed(2) : 0;

  // XIRR: each SIP instalment is a cashflow out, final corpus is in
  const cashflows = snaps.map((s, i) => ({ t: i / 12, v: -s.sip }));
  cashflows.push({ t: (totalMonths - 1) / 12, v: finalCorpus });
  const xirr = cashflows.length > 1 ? calcXIRR(cashflows) : null;

  return {
    snaps,
    totalInvested: Math.round(totalInvested),
    finalCorpus: Math.round(finalCorpus),
    finalNAV,
    absoluteGain: Math.round(absoluteGain),
    multiple,
    xirr,
    totalMonths,
    startNAV: startEntry.nav,
    units: Math.round(units * 100) / 100,
  };
}
