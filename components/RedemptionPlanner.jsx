'use client';

// components/RedemptionPlanner.jsx
//
// Single-fund FIFO redemption planner drawer — shows exactly which purchase
// lots a redemption would consume (oldest first), the STCG/LTCG split with
// Jan 31 2018 grandfathering for pre-2018 equity/hybrid lots, and estimated
// tax. Shared by app/cas-tracker/page.js and app/portfolio/page.jsx so both
// pages compute and display identical numbers for the same fund.
//
// `fund` shape required: { name, units, liveNav, amfiCode, buyLots }, where
// each buyLots[] entry is { units, nav, date, isTransmission?, synthetic? }
// — exactly what calculateFifoCost() returns in both pages.

import { useState, useEffect, useMemo } from 'react';
import { TAX, inferCategory, applyLossOffset } from '@/lib/taxCalc';
import { calcLotExitLoad } from '@/lib/exitLoad';
import LossAdjustmentPanel from './LossAdjustmentPanel';

export default function RedemptionPlanner({ fund, masterFacts, onClose }) {
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
    fetch(`/api/mf?code=${fund.amfiCode}`)
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
    let totalExitLoad = 0;
    let cumUnitsRedeemed = 0;
    const totalFundUnits = fund.units;
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

      const { exitLoadAmt, effectiveRate } = calcLotExitLoad({
        lot, take, currentNav, redeemDate: today,
        fundName: fund.name, isin: fund.isin,
        overrideRate: null, totalFundUnits, cumUnitsRedeemed,
        masterFacts,
      });
      totalExitLoad += exitLoadAmt;
      cumUnitsRedeemed += take;

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
        isTransmission: !!lot.isTransmission,
        exitLoadAmt,
        exitLoadRate: effectiveRate,
      });
    }

    const rateConfig = (category === 'equity' || category === 'hybrid')
      ? { stcgRate: TAX[category].stcg, ltcgRate: TAX[category].ltcg, exemption: TAX[category].exemption }
      : { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 };
    const offset = applyLossOffset({ stcg: stcgGain, ltcg: ltcgGain }, rateConfig);
    const { stcgTax, ltcgTax, tax: totalTax } = offset;
    const postTax = proceeds - totalExitLoad - totalTax;
    const lossNote = (offset.offsetIntoLTCG || offset.stcgLossCarryForward || offset.ltcgLossCarryForward)
      ? offset
      : null;

    return { lotRows, stcgGain, ltcgGain, stcgTax, ltcgTax, totalTax, proceeds, totalExitLoad, postTax, granApplied, lossNote };
  }, [unitsToRedeem, category, slabPct, fund, currentNav, today, gran18Nav, masterFacts]);

  const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const fmtD = (n) => n.toFixed(4);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
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
                      {['Purchase Date','Units','Buy NAV','Gain / Loss','Holding','Exit Load','Type'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Units' || h === 'Gain / Loss' || h === 'Exit Load' ? 'right' : 'left', fontWeight: 800, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '.55rem', letterSpacing: '.5px', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.lotRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: i < result.lotRows.length-1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                          {row.date}
                          {row.isTransmission && (
                            <div style={{ fontSize: '.48rem', color: 'var(--muted)', fontWeight: 800 }} title="Transmitted in from another folio -- your CAS preserves the original purchase date and rate for this lot">
                              Transmitted
                            </div>
                          )}
                        </td>
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
                        <td style={{ padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', whiteSpace: 'nowrap', color: row.exitLoadAmt > 0 ? '#e65100' : 'var(--muted)' }}>
                          {row.exitLoadAmt > 0 ? `−${fmt(row.exitLoadAmt)}` : '—'}
                        </td>
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

          {result?.lotRows.some(r => r.isTransmission) && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: '#fff8e1', border: '1.5px solid #ffe082',
              borderRadius: 10, fontSize: '.7rem', lineHeight: 1.6,
            }}>
              <strong style={{ color: '#f57f17' }}>ℹ Includes transmitted units</strong>
              <div style={{ color: '#795548', marginTop: 3 }}>
                One or more lots above (marked "Transmitted") came in via unit transmission from
                another folio{fund.folioTransmission
                  ? <> (folio {fund.folioTransmission.from_folio}, previously held by {fund.folioTransmission.from_name})</>
                  : ', typically inheritance'}. Your CAS preserves each transaction's
                original purchase date and rate, so the cost basis and holding period above
                already reflect that — nothing extra to account for in the figures below.
              </div>
            </div>
          )}

          {/* Tax summary */}
          {result && (
            <div style={{ background: 'var(--s2)', borderRadius: 12, border: '1.5px solid var(--border)', padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>Tax Summary</div>
              {[
                ['Gross Proceeds', result.proceeds, 'var(--text)'],
                ...(result.totalExitLoad > 0 ? [['Exit Load', -result.totalExitLoad, '#e65100']] : []),
                // Debt has no rate difference between STCG/LTCG (both taxed at slab) — an
                // "STCG Gains"-only line used to silently hide long-held debt gains from
                // view entirely. Show one honest combined figure instead of a fake split.
                ...(category === 'debt'
                  ? [['Total Gains', result.stcgGain + result.ltcgGain, (result.stcgGain + result.ltcgGain) >= 0 ? 'var(--pos)' : 'var(--neg)']]
                  : [
                      ['STCG Gains', result.stcgGain, result.stcgGain >= 0 ? 'var(--pos)' : 'var(--neg)'],
                      ['STCG Tax (20%)', -result.stcgTax, 'var(--neg)'],
                      ['LTCG Gains', result.ltcgGain, result.ltcgGain >= 0 ? 'var(--pos)' : 'var(--neg)'],
                      ['LTCG Tax (12.5%)', -result.ltcgTax, 'var(--neg)'],
                    ]),
                ['Total Tax', -result.totalTax, 'var(--neg)'],
                ['Net Proceeds', result.postTax, 'var(--g1)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: label === 'Total Tax' ? '1px solid var(--border)' : 'none', marginBottom: label === 'Total Tax' ? 4 : 0 }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: label === 'Net Proceeds' ? 800 : 600, paddingLeft: label.includes('Tax (') ? 10 : 0 }}>{label}</span>
                  <span style={{ fontSize: label === 'Net Proceeds' ? '.85rem' : '.75rem', fontWeight: label.includes('Tax (') ? 700 : 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {val >= 0 ? '' : '−'}{fmt(Math.abs(val))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {result?.lossNote && <LossAdjustmentPanel notes={[result.lossNote]} />}

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
