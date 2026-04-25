'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const CACHE_PREFIX = 'cas_parse_v2_';

function getFileKey(file) {
  return CACHE_PREFIX + [file.name, file.size, file.lastModified].join('|');
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
function calculateFifoCost(scheme, currentNav) {
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
        date: new Date(txn.date)
      });
    } else if (/REDEMPTION|SWITCH.?OUT/.test(type)) {
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

  let finalInvested = fifoInvested;
  if (directCost > 0 && (fifoInvested === 0 || fifoInvested < directCost * 0.5)) {
    finalInvested = directCost;
  }

  // SUMMARY CAS: no transaction history → synthesise a single lot from CAS cost basis.
  // Date set to epoch (Jan 1 1970) → always classified as LTCG, which is a safe default.
  if (buyLots.length === 0 && units > 0) {
    const casCost = parseFloat(scheme.valuation?.cost || 0);
    if (casCost > 0) {
      buyLots.push({
        units,
        amount: casCost,
        nav: casCost / units,
        date: new Date(0),  // epoch = very old, always LTCG
        synthetic: true,    // flag for UI notice
      });
    }
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
function inferExitLoadCategory(fundName) {
  const n = (fundName || '').toUpperCase();
  if (/LIQUID|OVERNIGHT|MONEY.?MARKET/.test(n)) return 'liquid';
  if (/ULTRA.?SHORT|LOW.?DURA/.test(n)) return 'ultrashort';
  if (/GILT|BANKING.?PSU|CORP.?BOND|CREDIT.?RISK|FMP|FIXED.?MATURITY|ARBITRAGE|CONSERVATIVE.?HYBRID/.test(n)) return 'debt';
  if (/SHORT.?DURA|MEDIUM.?DURA|LONG.?DURA/.test(n)) return 'debt';
  if (/INDEX|ETF|NIFTY|SENSEX/.test(n)) return 'index'; // many index funds have 0%
  return 'equity_hybrid'; // default — equity and most hybrid
}

function getExitLoadRate(fundName) {
  const cat = inferExitLoadCategory(fundName);
  // Rate per period: [rate, days] — rate applied if held < days
  switch (cat) {
    case 'liquid':       return [];                      // 0% always
    case 'ultrashort':   return [];                      // 0% (conservative)
    case 'debt':         return [];                      // 0% for most debt
    case 'index':        return [];                      // 0% for most index/ETF
    case 'equity_hybrid':return [{ rate: 0.01, days: 365 }]; // 1% within 1yr
    default:             return [{ rate: 0.01, days: 365 }];
  }
}

// Compute actual exit load rate for a specific lot
function calcExitLoad(lot, redeemDate, fundName, overrideRate) {
  if (overrideRate != null) {
    // User-specified override — still apply holding-period logic
    if (lot.synthetic) return 0;
    const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
    const heldDays = Math.floor((redeemDate - buyDate) / (24 * 3600 * 1000));
    return heldDays < 365 ? overrideRate : 0;
  }
  if (lot.synthetic) return 0; // unknown purchase date
  const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
  const heldDays = Math.floor((redeemDate - buyDate) / (24 * 3600 * 1000));
  const schedule = getExitLoadRate(fundName);
  for (const { rate, days } of schedule) {
    if (heldDays < days) return rate;
  }
  return 0;
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
function PortfolioRedemptionPlanner({ holdings, investorName, onClose }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [targetAmt,       setTargetAmt]       = useState('');
  const [strategy,        setStrategy]        = useState('tax');
  const [slabPct,         setSlabPct]         = useState(30);
  const [skipLocked,      setSkipLocked]      = useState(true);
  const [exitLoadOverrides,  setExitLoadOverrides]  = useState({}); // fund.name → rate (0-1)
  const [exitLoadInputs,     setExitLoadInputs]     = useState({}); // raw strings while typing

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
        exitLoadRate: exitLoadOverrides[h.name] != null
          ? exitLoadOverrides[h.name]
          : getExitLoadRate(h.name)[0]?.rate ?? 0, // inferred default
        score: fundScore(h, strategy, today),
      }))
      .sort((a, b) => a.score - b.score);

    let remaining = target;
    const rows = [];
    let totalProceeds = 0, totalExitLoad = 0, totalSTCG = 0, totalLTCG = 0;
    let totalTax = 0, totalNet = 0;

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
        const elRate    = calcExitLoad(lot, today, fund.name,
                            exitLoadOverrides[fund.name] != null ? exitLoadOverrides[fund.name] : undefined);
        const exitLoad  = elRate * saleVal;
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

      // Tax for this fund
      let fundTax = 0;
      if (cat === 'equity' || cat === 'hybrid') {
        fundTax  = fundSTCG * TAX.equity.stcg;
        const taxableLTCG = Math.max(0, fundLTCG - TAX.equity.exemption);
        fundTax += taxableLTCG * TAX.equity.ltcg;
      } else {
        fundTax = (fundSTCG + fundLTCG) * (slabPct / 100);
      }
      const fundNet = fundProceeds - fundExitLoad - fundTax;

      rows.push({
        name:       fund.name,
        category:   cat,
        isELSS:     fund.isELSS,
        units:      fundUnits,
        proceeds:   fundProceeds,
        exitLoad:   fundExitLoad,
        stcg:       fundSTCG,
        ltcg:       fundLTCG,
        tax:        fundTax,
        net:        fundNet,
        lotBreakdown,
        hasSynthetic: (fund.buyLots || []).some(l => l.synthetic),
      });

      totalProceeds += fundProceeds;
      totalExitLoad += fundExitLoad;
      totalSTCG     += fundSTCG;
      totalLTCG     += fundLTCG;
      totalTax      += fundTax;
      totalNet      += fundNet;
    }

    const shortfall = remaining > 0.5; // can't meet target
    return { rows, totalProceeds, totalExitLoad, totalSTCG, totalLTCG, totalTax, totalNet, shortfall };
  }, [target, strategy, slabPct, skipLocked, holdings, today, exitLoadOverrides]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
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

        {/* Controls */}
        <div style={{ padding: '16px 20px', borderBottom: '1.5px solid var(--border)', background: 'var(--s2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>

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

          {!plan && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              Enter a target amount above to see which funds to redeem and the estimated tax impact.
            </div>
          )}

          {plan && plan.shortfall && (
            <div style={{ padding: '10px 14px', background: '#fff8e1', border: '1.5px solid #ffe082', borderRadius: 10, marginBottom: 16, fontSize: '.72rem', color: '#795548', fontWeight: 600 }}>
              ⚠ Portfolio value is insufficient to meet the full target after exit loads. Showing maximum redeemable.
            </div>
          )}

          {plan && plan.rows.length === 0 && (
            <div style={{ padding: '10px 14px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 10, fontSize: '.72rem', color: 'var(--neg)', fontWeight: 600 }}>
              No redeemable holdings found. All units may be ELSS-locked or have no cost data.
            </div>
          )}

          {plan && plan.rows.length > 0 && (
            <>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  ['Gross Proceeds', plan.totalProceeds, 'var(--text)'],
                  ['Exit Load',      plan.totalExitLoad, 'var(--neg)'],
                  ['Est. Tax',       plan.totalTax,      'var(--neg)'],
                  ['Net in Hand',    plan.totalNet,       'var(--g1)'],
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
                {plan.rows.map((row, i) => {
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
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '.72rem',
                            lineHeight: 1.4, wordBreak: 'break-word' }}>
                            {row.name}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                              border: '1px solid var(--border)',
                              background: row.category === 'debt' ? '#e3f2fd' : row.category === 'hybrid' ? '#f3e5f5' : 'var(--g-xlight)',
                              color:      row.category === 'debt' ? '#1565c0' : row.category === 'hybrid' ? '#6a1b9a'  : 'var(--g1)',
                              fontFamily: "'JetBrains Mono', monospace" }}>
                              {row.category.toUpperCase()}
                            </span>
                            {row.isELSS      && <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082', fontFamily: "'JetBrains Mono', monospace" }}>ELSS</span>}
                            {row.hasSynthetic && <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: 'var(--s3)', color: 'var(--muted)', border: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace" }}>SUM CAS</span>}
                          </div>
                        </div>

                        {/* Exit load % — text input avoids toFixed fighting typing */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontSize: '.52rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 3 }}>Exit Load %</div>
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

                      {/* Row C: STCG / LTCG (only when non-zero) */}
                      {(row.stcg !== 0 || row.ltcg !== 0) && (
                        <div style={{ display: 'flex', gap: 20, padding: '0 14px 10px', flexWrap: 'wrap' }}>
                          {[['STCG', row.stcg], ['LTCG', row.ltcg]].filter(([, v]) => v !== 0).map(([lbl, val]) => (
                            <div key={lbl}>
                              <div style={{ fontSize: '.5rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                                color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 1 }}>{lbl}</div>
                              <div style={{ fontSize: '.7rem', fontWeight: 700,
                                color: val < 0 ? 'var(--neg)' : 'var(--text)',
                                fontFamily: "'JetBrains Mono', monospace" }}>
                                {val < 0 ? '−' : '+'}{fmt(val)}
                              </div>
                            </div>
                          ))}
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
                      ['Gross',      fmt(plan.totalProceeds),                                           'var(--text)'],
                      ['Exit Load',  plan.totalExitLoad > 0 ? '−' + fmt(plan.totalExitLoad) : '—',     plan.totalExitLoad > 0 ? 'var(--neg)' : 'var(--muted)'],
                      ['Total Tax',  plan.totalTax > 0 ? '−' + fmt(plan.totalTax) : '—',               plan.totalTax > 0 ? 'var(--neg)' : 'var(--muted)'],
                      ['Net in Hand',fmt(plan.totalNet),                                                'var(--g1)'],
                    ].map(([lbl, val, col]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: lbl === 'Net in Hand' ? '.9rem' : '.78rem',
                          fontWeight: 900, color: col, fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '-.3px' }}>{val}</div>
                      </div>
                    ))}
                  </div>
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


// ── FIFO Tax constants (Budget 2024, effective July 23, 2024) ─────────────────
const TAX = {
  equity:     { stcg: 0.20, ltcg: 0.125, ltcgMonths: 12,  exemption: 125000 },
  debt:       { stcg: null,  ltcg: null,  ltcgMonths: 36,  exemption: 0 },    // slab for all
  hybrid:     { stcg: 0.20, ltcg: 0.125, ltcgMonths: 12,  exemption: 125000 }, // equity-oriented default
};

function inferCategory(name) {
  const n = (name || '').toUpperCase();
  if (/LIQUID|OVERNIGHT|ULTRA.?SHORT|LOW.?DURA|SHORT.?DURA|MEDIUM.?DURA|LONG.?DURA|GILT|MONEY.?MARKET|BANKING.?PSU|CORPORATE.?BOND|CREDIT.?RISK|FMP|FIXED.?MATURITY/.test(n)) return 'debt';
  if (/BALANCED|HYBRID|ARBITRAGE|DYNAMIC.?ASSET|MULTI.?ASSET|EQUITY.?SAVINGS|CONSERVATIVE/.test(n)) return 'hybrid';
  return 'equity'; // default — covers large/mid/small/flexi/ELSS/index
}

function RedemptionPlanner({ fund, onClose }) {
  const maxUnits = fund.units;
  const currentNav = fund.liveNav;
  const today = new Date();
  today.setHours(0,0,0,0);

  const [redeemUnits, setRedeemUnits] = useState('');
  const [inputMode, setInputMode]     = useState('units'); // 'units' | 'amount'
  const [category, setCategory]       = useState(() => inferCategory(fund.name));
  const [slabPct,  setSlabPct]        = useState(30); // assumed slab rate %

  // Derive units from amount input
  const unitsToRedeem = inputMode === 'units'
    ? Math.min(parseFloat(redeemUnits) || 0, maxUnits)
    : Math.min((parseFloat(redeemUnits) || 0) / currentNav, maxUnits);

  // ── FIFO lot consumption ─────────────────────────────────────────────────
  // Fetch Jan 31 2018 grandfathering NAV when any lot predates that date
  const [gran18Nav, setGran18Nav] = useState(null);  // { nav, fetching }
  const GRAN_DATE = new Date('2018-01-31');

  useEffect(() => {
    if (!fund.amfiCode) return;
    const hasPreGran = (fund.buyLots || []).some(l => {
      const d = l.date instanceof Date ? l.date : new Date(l.date);
      return d < GRAN_DATE;
    });
    if (!hasPreGran) return;
    setGran18Nav({ nav: null, fetching: true });
    fetch(`https://api.mfapi.in/mf/${fund.amfiCode}`)
      .then(r => r.json())
      .then(d => {
        const rows = d.data || [];
        // Find closest date on or before Jan 31 2018 (data is newest-first)
        const target = 20180131; // YYYYMMDD for comparison
        for (const row of rows) {
          const parts = row.date.split('-'); // DD-MM-YYYY
          const ymd = parseInt(parts[2] + parts[1] + parts[0]);
          if (ymd <= target) {
            setGran18Nav({ nav: parseFloat(row.nav), fetching: false });
            return;
          }
        }
        setGran18Nav({ nav: null, fetching: false }); // fund too new
      })
      .catch(() => setGran18Nav({ nav: null, fetching: false }));
  }, [fund.amfiCode, fund.buyLots]);

  const result = useMemo(() => {
    if (unitsToRedeem <= 0) return null;
    const lots  = fund.buyLots || [];
    const rule  = TAX[category] || TAX.equity;
    const cutoffMs = rule.ltcgMonths * 30.44 * 24 * 3600 * 1000;

    let remaining  = unitsToRedeem;
    let stcgGain   = 0;
    let ltcgGain   = 0;
    let proceeds   = 0;
    const lotRows  = [];
    let granApplied = false;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const take   = Math.min(lot.units, remaining);
      remaining   -= take;
      const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
      const heldMs  = today - buyDate;
      const isLTCG  = heldMs >= cutoffMs;
      const saleVal = take * currentNav;
      proceeds     += saleVal;

      // Grandfathering: for equity LTCG units purchased before Jan 31 2018,
      // effective cost = max(purchase nav, jan31_2018 nav) per Section 112A
      let effectiveNav = lot.nav;
      let isGrandfathered = false;
      if ((category === 'equity' || category === 'hybrid') && isLTCG && buyDate < GRAN_DATE) {
        const g18 = gran18Nav?.nav;
        if (g18 != null && g18 > lot.nav) {
          effectiveNav = g18;
          isGrandfathered = true;
          granApplied = true;
        }
      }

      const gain    = take * (currentNav - effectiveNav);
      if (isLTCG) ltcgGain += gain; else stcgGain += gain;
      const heldDays = Math.floor(heldMs / (24*3600*1000));
      lotRows.push({
        date: buyDate.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }),
        buyNav: lot.nav,
        effectiveNav,
        units: take,
        gain,
        isLTCG,
        heldDays,
        isGrandfathered,
      });
    }

    let stcgTax = 0, ltcgTax = 0;
    if (category === 'equity' || category === 'hybrid') {
      stcgTax = stcgGain * TAX[category].stcg;
      const taxableLTCG = Math.max(0, ltcgGain - TAX[category].exemption);
      ltcgTax = taxableLTCG * TAX[category].ltcg;
    } else {
      stcgTax = stcgGain * (slabPct / 100);
      ltcgTax = ltcgGain * (slabPct / 100);
    }
    const totalTax = stcgTax + ltcgTax;
    const postTax  = proceeds - totalTax;

    return { lotRows, stcgGain, ltcgGain, stcgTax, ltcgTax, totalTax, proceeds, postTax, granApplied };
  }, [unitsToRedeem, category, slabPct, fund, currentNav, today, gran18Nav]);

  const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const fmtD = (n) => n.toFixed(4);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 480,
          height: '100dvh', overflowY: 'auto',
          background: 'var(--surface)',
          boxShadow: '-8px 0 40px rgba(0,0,0,.15)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1.5px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                FIFO Redemption Planner
              </div>
              <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, maxWidth: 340 }}>
                {fund.name}
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
                {fund.units.toFixed(4)} units · Live NAV ₹{currentNav.toFixed(4)}
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--muted)', padding: '4px 8px', marginTop: -4 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', flex: 1 }}>

          {/* Summary CAS notice — no transaction history available */}
          {fund.buyLots?.every(l => l.synthetic) && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: '#fff8e1', border: '1.5px solid #ffe082',
              borderRadius: 10, fontSize: '.7rem', lineHeight: 1.6,
            }}>
              <strong style={{ color: '#f57f17' }}>⚠ Summary CAS detected</strong>
              <div style={{ color: '#795548', marginTop: 3 }}>
                Your CAS has no transaction history — results use the CAS cost basis and
                classify all gains as LTCG (purchase date unknown).
                For accurate FIFO lot-level analysis, download a <strong>Detailed CAS</strong> from{' '}
                <a href="https://www.camsonline.com" target="_blank" rel="noopener noreferrer"
                  style={{ color: '#f57f17' }}>camsonline.com</a> or{' '}
                <a href="https://www.kfintech.com" target="_blank" rel="noopener noreferrer"
                  style={{ color: '#f57f17' }}>kfintech.com</a>.
              </div>
            </div>
          )}

          {/* No cost data at all */}
          {(!fund.buyLots || fund.buyLots.length === 0) && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2',
              borderRadius: 10, fontSize: '.7rem', color: 'var(--neg)',
            }}>
              No cost data available for this fund. Download a Detailed CAS to use this planner.
            </div>
          )}

          {/* Input toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--border)' }}>
            {[['units','Units'],['amount','₹ Amount']].map(([m,l]) => (
              <button key={m} onClick={() => { setInputMode(m); setRedeemUnits(''); }}
                style={{
                  flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif', fontSize: '.72rem', fontWeight: 700,
                  background: inputMode===m ? 'var(--g1)' : 'var(--s2)',
                  color: inputMode===m ? '#fff' : 'var(--muted)',
                }}>
                Redeem by {l}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <input
              type="number" min="0" step="any"
              value={redeemUnits}
              onChange={e => setRedeemUnits(e.target.value)}
              placeholder={inputMode === 'units' ? `Max ${maxUnits.toFixed(4)} units` : `Max ${fmt(maxUnits * currentNav)}`}
              style={{
                flex: 1, padding: '11px 14px',
                border: '1.5px solid var(--border2)', borderRadius: 10,
                fontFamily: "'JetBrains Mono', monospace", fontSize: '.82rem',
                background: 'var(--s2)', color: 'var(--text)', outline: 'none',
              }}
            />
            <button onClick={() => { setInputMode('units'); setRedeemUnits(maxUnits.toFixed(4)); }}
              style={{
                padding: '11px 14px', borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'var(--s2)', cursor: 'pointer',
                fontFamily: 'Raleway, sans-serif', fontSize: '.72rem', fontWeight: 700,
                color: 'var(--g2)', whiteSpace: 'nowrap',
              }}>
              Max
            </button>
          </div>

          {/* Category + slab */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>Fund Category</div>
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 9, fontFamily: 'Raleway, sans-serif', fontSize: '.75rem', fontWeight: 700, background: 'var(--s2)', color: 'var(--text)', outline: 'none' }}>
                <option value="equity">Equity (&gt;65%)</option>
                <option value="hybrid">Hybrid / Equity-oriented</option>
                <option value="debt">Debt</option>
              </select>
            </div>
            {category === 'debt' && (
              <div>
                <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>Your Tax Slab</div>
                <select value={slabPct} onChange={e => setSlabPct(Number(e.target.value))}
                  style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 9, fontFamily: 'Raleway, sans-serif', fontSize: '.75rem', fontWeight: 700, background: 'var(--s2)', color: 'var(--text)', outline: 'none' }}>
                  <option value={5}>5%</option>
                  <option value={20}>20%</option>
                  <option value={30}>30%</option>
                </select>
              </div>
            )}
          </div>

          {/* Lot table */}
          {result && result.lotRows.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
                FIFO Lots Consumed
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.65rem', minWidth: 380 }}>
                  <thead>
                    <tr style={{ background: 'var(--s2)' }}>
                      {['Purchase Date','Units','Buy NAV','Gain / Loss','Holding','Type'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Units' || h === 'Gain / Loss' ? 'right' : 'left', fontWeight: 800, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '.55rem', letterSpacing: '.5px', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.lotRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: i < result.lotRows.length-1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{row.date}</td>
                        <td style={{ padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>{fmtD(row.units)}</td>
                        <td style={{ padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace" }}>
                          ₹{row.buyNav.toFixed(4)}
                          {row.isGrandfathered && (
                            <div style={{ fontSize: '.48rem', color: 'var(--g1)', fontWeight: 800 }}>
                              G ₹{row.effectiveNav.toFixed(4)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', color: row.gain >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>
                          {row.gain >= 0 ? '+' : ''}{fmt(row.gain)}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{row.heldDays}d</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontSize: '.52rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: row.isLTCG ? 'var(--g-xlight)' : '#fff3e0', color: row.isLTCG ? 'var(--g1)' : '#e65100', border: `1px solid ${row.isLTCG ? 'var(--g-light)' : '#ffe0b2'}`, fontFamily: "'JetBrains Mono', monospace" }}>
                            {row.isLTCG ? 'LTCG' : 'STCG'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tax summary */}
          {result && (
            <div style={{ background: 'var(--s2)', borderRadius: 12, border: '1.5px solid var(--border)', padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>Tax Summary</div>
              {[
                ['Gross Proceeds', result.proceeds, 'var(--text)'],
                ['STCG Gains', result.stcgGain, result.stcgGain >= 0 ? 'var(--pos)' : 'var(--neg)'],
                ...(category !== 'debt' ? [['LTCG Gains', result.ltcgGain, result.ltcgGain >= 0 ? 'var(--pos)' : 'var(--neg)']] : []),
                ['Est. Tax', -result.totalTax, 'var(--neg)'],
                ['Post-Tax Proceeds', result.postTax, 'var(--g1)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: label === 'Est. Tax' ? '1px solid var(--border)' : 'none', marginBottom: label === 'Est. Tax' ? 4 : 0 }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: label === 'Post-Tax Proceeds' ? 800 : 600 }}>{label}</span>
                  <span style={{ fontSize: label === 'Post-Tax Proceeds' ? '.85rem' : '.75rem', fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {val >= 0 ? '' : '−'}{fmt(Math.abs(val))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tax rule context */}
          <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.6, padding: '12px 14px', background: 'var(--s2)', borderRadius: 10, border: '1.5px solid var(--border)' }}>
            {category === 'equity' || category === 'hybrid' ? (
              <>
                <strong>Rates (Budget 2024, w.e.f. July 23 2024):</strong> STCG 20% · LTCG 12.5% above ₹1.25L annual exemption. LTCG exemption shown here per redemption — actual exemption is shared across all equity gains in the FY.
                {result?.stcgGain === 0 && result?.ltcgGain === 0 ? null : (
                  <div style={{ marginTop: 6, color: 'var(--g2)', fontWeight: 700 }}>
                    {gran18Nav?.fetching
                      ? '⏳ Fetching Jan 31 2018 NAV for grandfathering…'
                      : result?.granApplied
                        ? '✓ Grandfathering applied (Jan 31 2018 NAV) for pre-2018 lots. Effective cost shown as "G ₹nav" in the lot table.'
                        : gran18Nav?.nav == null && (fund.buyLots||[]).some(l => (l.date instanceof Date ? l.date : new Date(l.date)) < new Date('2018-01-31'))
                          ? '⚠ Could not fetch Jan 31 2018 NAV — grandfathering not applied.'
                          : '✓ No pre-2018 lots — grandfathering not applicable.'
                    }
                  </div>
                )}
              </>
            ) : (
              <>
                <strong>Debt funds:</strong> Purchases after April 1, 2023 — all gains taxed at slab rate. Purchases before April 1, 2023 — STCG at slab, LTCG (≥3 years) at 20% with indexation (V2 feature — using slab for all here).
              </>
            )}
          </div>

          {!result && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              Enter units or amount to redeem above to see the FIFO breakdown and estimated tax.
            </div>
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
  const [fromCache, setFromCache] = useState(false);

  // ── Auth + saved portfolios ──
  const { data: session, status: authStatus } = useSession();
  const isSignedIn = authStatus === 'authenticated' && !!session;
  const isAdmin    = session?.user?.role === 'admin';
  const searchParams = useSearchParams();
  const [savedPortfolios, setSavedPortfolios] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'

  // ── Manual holdings + SIF NAVs ──
  const [manualHoldings, setManualHoldings] = useState([]);
  const [sifNavMap,      setSifNavMap]      = useState({}); // scheme_id → nav
  const [manualLoading,  setManualLoading]  = useState(false);
  const [viewFilter,     setViewFilter]     = useState('all'); // 'all' | 'mf' | 'sif'
  const [viewedUserId,   setViewedUserId]   = useState('');   // client userId when admin viewing
  const [planFund,       setPlanFund]       = useState(null);  // holding object for per-fund planner
  const [planPortfolio,  setPlanPortfolio]  = useState(false); // portfolio-level redemption planner

  // Auto-load via ?load=blobKey (admin CAS view) or ?userId= (manual-only client)
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!isAdmin) return;
    const loadKey   = searchParams.get('load');
    const paramUid  = searchParams.get('userId');
    const paramName = decodeURIComponent(searchParams.get('uname') || '');
    if (loadKey) {
      const parts = loadKey.split('/');
      if (parts.length >= 2) setViewedUserId(parts[1]);
      const t = setTimeout(() => loadSavedPortfolio(loadKey), 100);
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
  useEffect(() => {
    if (!isSignedIn) return;
    setManualLoading(true);
    const url = (isAdmin && viewedUserId)
      ? `/api/holdings?userId=${viewedUserId}`
      : '/api/holdings';
    fetch(url)
      .then(r => r.json())
      .then(async d => {
        const holdings = d.holdings || [];
        setManualHoldings(holdings);
        const hasSIF = holdings.some(h => h.fund_type === 'SIF');
        if (hasSIF) {
          const r2 = await fetch('/api/sif-nav').catch(() => null);
          if (r2?.ok) {
            const sifData = await r2.json();
            const navMap = {};
            (sifData.schemes || []).forEach(s => {
              navMap[s.scheme_id] = s.nav;
              if (s.isin_po) navMap[s.isin_po] = s.nav;
            });
            setSifNavMap(navMap);
          }
        }
      })
      .catch(() => {})
      .finally(() => setManualLoading(false));
  }, [isSignedIn, isAdmin, viewedUserId]);

  async function processCasData(data, cached) {
    const portfolioData = {};
    const panInvestorMap = data.pan_investor_map || {};
    
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
          isELSS: /ELSS|TAX.?SAVER/i.test(scheme.scheme),
          lockedValue: 0,
          name: scheme.scheme
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

    // 2. Fetch all unique NAVs concurrently. allSettled so one failure
    //    doesn't abort the rest. Build amfiCode → nav lookup map.
    const navMap = {};
    await Promise.allSettled(
      uniqueAmfi.map(async (amfi) => {
        try {
          const navRes = await fetch(`/api/mf?code=${amfi}&latest=1`);
          if (navRes.ok) {
            const resJson = await navRes.json();
            if (resJson.status === 'SUCCESS' && resJson.data?.length > 0) {
              navMap[amfi] = parseFloat(resJson.data[0].nav);
            }
          }
        } catch {
          // Non-fatal — holdings for this fund will use CAS-reported NAV
        }
      })
    );

    // 3. Apply resolved NAVs and compute metrics for every holding.
    for (const { h, pan } of allHoldings) {
      const scheme = h.scheme;
      if (scheme.amfi && navMap[scheme.amfi] !== undefined) {
        h.liveNav = navMap[scheme.amfi];
        h.isLive  = true;
      }
      const currentNav = h.liveNav;
      const fifo = calculateFifoCost(scheme, currentNav);
      h.value       = h.units * currentNav;
      h.invested    = fifo.invested;
      h.lockedValue = fifo.lockedValue;
      h.buyLots     = fifo.buyLots;  // FIFO lots for redemption planner
      const casCost = parseFloat(scheme.valuation?.cost || 0);
      h.avgPurchaseNav = h.units > 0 && casCost > 0 ? casCost / h.units : 0;
      h.amfiCode       = scheme.amfi || null;  // preserved for FIFO planner
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

    setPortfolioDataByPan(portfolioData);
    setActivePan(pans[0]);
    setFromCache(cached);
    setUploadState('success');
  }

  async function saveToBlobIfSignedIn(data, fileName, panCount) {
    if (!isSignedIn) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/cas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: data, fileName, panCount }),
      });
      if (res.ok) {
        const saved = await res.json();
        setSavedPortfolios(prev => [
          { id: saved.id, file_name: fileName, pan_count: panCount, uploaded_at: saved.uploadedAt, blob_key: saved.blobKey },
          ...prev,
        ]);
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setUploadState('loading');
    setErrorText('');

    const formData = new FormData(e.target);
    const pdfFile = formData.get('pdf-file');
    const password = formData.get('pdf-password');

    try {
      let data = null;
      let cached = false;
      
      const cachedData = readCache(pdfFile);
      if (cachedData) {
        data = cachedData;
        cached = true;
        setLoadingText('Loading from cache…');
      } else {
        setLoadingText('Decrypting & Parsing…');
        const uploadFormData = new FormData();
        uploadFormData.append('file', pdfFile);
        uploadFormData.append('password', password);

        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          body: uploadFormData
        });

        if (!parseRes.ok) {
          throw new Error(
            parseRes.status === 401
              ? 'Incorrect password. Try your PAN in ALL CAPS.'
              : 'Failed to decrypt or parse the statement.'
          );
        }

        data = await parseRes.json();
        writeCache(pdfFile, data);
        // Auto-save to Vercel Blob (fire-and-forget, non-blocking)
        const panCount = (data.folios || []).reduce((acc, f) => {
          const pan = (f.PAN || '').toUpperCase().trim();
          return pan && pan.length === 10 ? acc.add(pan) : acc;
        }, new Set()).size;
        saveToBlobIfSignedIn(data, pdfFile.name, panCount);
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
  }

  async function loadSavedPortfolio(blobKey) {
    setUploadState('loading');
    setLoadingText('Loading saved portfolio…');
    try {
      // Fetch blob via a signed-read proxy
      const res = await fetch(`/api/cas/load?key=${encodeURIComponent(blobKey)}`);
      if (!res.ok) throw new Error('Could not load saved portfolio.');
      const data = await res.json();
      await processCasData(data, false);
    } catch (err) {
      setErrorText(err.message);
      setUploadState('error');
    }
  }

  const panKeys = Object.keys(portfolioDataByPan);
  const currentInfo = portfolioDataByPan[activePan] || { current: 0, invested: 0, holdings: [], investorName: '' };
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
              </div>
            )}

            {/* Authenticated (or loading): show upload form */}
            {authStatus !== 'unauthenticated' && (
            <form id="cas-form" className="upload-card" onSubmit={handleSubmit}>
              <div style={{ marginBottom: '18px' }}>
                <div className="field-label">CAS PDF File</div>
                <input
                  type="file"
                  name="pdf-file"
                  id="pdf-file"
                  accept=".pdf"
                  required
                  className="file-input"
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <div className="field-label">PAN Password (ALL CAPS)</div>
                <input
                  type="password"
                  name="pdf-password"
                  id="pdf-password"
                  placeholder="ABCDE1234F"
                  required
                  className="field-input"
                />
              </div>

              <button type="submit" className="submit-btn">
                <span>🔓</span>
                <span>Parse & Track</span>
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
                      <button
                        key={p.id}
                        onClick={() => loadSavedPortfolio(p.blob_key)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', borderRadius: 10,
                          border: '1.5px solid var(--border)', background: 'var(--s2)',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                          transition: 'border-color .15s, background .15s',
                          fontFamily: 'Raleway, sans-serif',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--s3)'; e.currentTarget.style.borderColor = 'var(--border2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--s2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        <div>
                          <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
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
                  {currentInfo.investorName}'s Portfolio
                  {fromCache && <span className="cache-badge">⚡ Cached</span>}
                </h2>
                <p className="dash-sub">Computed using FIFO accounting · Live NAVs from AMFI</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => setPlanPortfolio(true)}
                  style={{
                    padding: '8px 16px', borderRadius: 9,
                    border: '1.5px solid var(--g2)',
                    background: 'var(--g-xlight)', cursor: 'pointer',
                    fontSize: '.72rem', fontWeight: 800,
                    color: 'var(--g1)', fontFamily: 'Raleway, sans-serif',
                    letterSpacing: '-.2px', whiteSpace: 'nowrap',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--g1)'; e.currentTarget.style.color='#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--g-xlight)'; e.currentTarget.style.color='var(--g1)'; }}
                >
                  📊 Redemption Planner
                </button>
                <button onClick={handleNewUpload} className="new-upload-btn">
                  ↑ New Upload
                </button>
              </div>
            </div>

            {panKeys.filter(p => p !== '__manual__').length > 1 && (
              <div className="pan-tabs">
                {panKeys.filter(p => p !== '__manual__').map(pan => {
                  const info = portfolioDataByPan[pan];
                  const firstName = info.investorName.split(' ')[0];
                  return (
                    <button
                      key={pan}
                      onClick={() => setActivePan(pan)}
                      className={`pan-tab ${pan === activePan ? 'active' : ''}`}
                    >
                      <span className="pan-code">{pan}</span>
                      <span>{firstName}'s Portfolio</span>
                    </button>
                  );
                })}
              </div>
            )}

{/* ── Merged totals including manual holdings ── */}
            {(() => {
              // Map manual holdings to comparable shape for totals
              const manualMapped = manualHoldings.map(h => {
                const pu = parseFloat(h.purchase_nav), u = parseFloat(h.units);
                const ln = h.fund_type === 'SIF' ? (sifNavMap[h.amfi_code] ?? null) : null;
                return { value: (ln ?? pu) * u, invested: pu * u };
              });
              const totalCurrent  = currentInfo.current  + manualMapped.reduce((s,h) => s + h.value,    0);
              const totalInvested = currentInfo.invested  + manualMapped.reduce((s,h) => s + h.invested, 0);
              const totalGain     = totalCurrent - totalInvested;
              const totalGainPct  = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(2) : '0.00';
              const tProfit       = totalGain >= 0;
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
                  </div>
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
              // Normalise manual holdings into the same shape as CAS holdings
              const manualMapped = manualHoldings.map(h => {
                const pu = parseFloat(h.purchase_nav);
                const u  = parseFloat(h.units);
                const ln = h.fund_type === 'SIF' ? (sifNavMap[h.amfi_code] ?? null) : null;
                const val = (ln ?? pu) * u;
                return {
                  // shared display fields
                  name:          h.fund_name,
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
                  // classification
                  source:        'manual',
                  fund_type:     h.fund_type,
                };
              });

              const casHoldings = (currentInfo.holdings || []).map(h => ({
                ...h, source: 'cas', fund_type: 'Mutual Fund',
              }));

              const allHoldings = [...casHoldings, ...manualMapped];
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

                    return (
                      <div key={idx} className="fund-card">
                        <div>
                          <div className="fund-name">{fund.name}</div>

                          {/* Type + source badges */}
                          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                            {fund.fund_type === 'SIF' && (
                              <span style={{
                                fontSize: '.52rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: '#e0f2f1', color: '#00695c', border: '1px solid #b2dfdb',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.5px',
                              }}>SIF</span>
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
                                <div className="folio-full">
                                  <span className="label">Advisor</span><br />
                                  <span className="value">{fund.advisor}</span>
                                </div>
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
                            </div>
                          </div>

                          {/* Plan Redemption button — CAS holdings only, always visible */}
                          {!isManual && (
                            <button
                              onClick={() => setPlanFund(fund)}
                              style={{
                                marginTop: 12, width: '100%',
                                padding: '9px 0', borderRadius: 8,
                                border: 'none',
                                background: 'var(--g1)', cursor: 'pointer',
                                fontSize: '.72rem', fontWeight: 800,
                                color: '#fff', fontFamily: 'Raleway, sans-serif',
                                letterSpacing: '-.2px', transition: 'background .15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                            >
                              📊 Plan Redemption
                            </button>
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

      {/* ── FIFO Redemption Planner overlays ─────────────────────────────── */}
      {planFund && <RedemptionPlanner fund={planFund} onClose={() => setPlanFund(null)} />}
      {planPortfolio && (
        <PortfolioRedemptionPlanner
          holdings={currentInfo.holdings || []}
          investorName={currentInfo.investorName}
          onClose={() => setPlanPortfolio(false)}
        />
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
            {[
              ['Is it safe to upload my CAS PDF with my PAN password?',
               'Yes. The PDF is parsed inside an isolated serverless function and deleted immediately after. Your password is never stored. For signed-in users, only the parsed portfolio data (not the PDF) is saved privately — only you and your AMFI-registered distributor can view it.'],
              ['What is a Consolidated Account Statement (CAS)?',
               'A CAS consolidates all your mutual fund holdings across every AMC linked to your PAN. Download it from camsonline.com or kfintech.com using your PAN and registered email. Use your PAN in ALL CAPS as the PDF password.'],
              ['Does this support Family CAS with multiple PANs?',
               'Yes. The parser detects multiple PANs in one CAS and creates separate dashboard tabs per family member. Switch between them with one click.'],
              ['How is current value calculated?',
               'Current Value = Units x Live NAV from AMFI official end-of-day data, fetched fresh on each page load.'],
              ['What is FIFO capital gains calculation?',
               'FIFO (First In, First Out) is the SEBI-mandated method for mutual fund redemptions. Our tracker uses CAS purchase history to compute unrealised gain/loss correctly under FIFO accounting.'],
              ['How does ELSS lock-in tracking work?',
               'ELSS investments are locked for 3 years from each purchase date. We compute the locked value and unlocked portion for each ELSS fund separately so you know exactly what is redeemable today.'],
              ['Which CAS formats are supported?',
               'Both CAMS (camsonline.com) and KFintech (kfintech.com) password-protected PDFs are supported. Enter your PAN in ALL CAPS as the password.'],
              ['Does this support SIF (Specialised Investment Funds)?',
               'Yes. SIF holdings added by your distributor appear alongside mutual funds with live NAVs from AMFI. Standard CAS PDFs do not yet include SIF statements, so your distributor adds them separately.'],
            ].map(([q, a], i, arr) => (
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
