'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { simulateSIP, fmtINR, fmtINRFull } from '@/lib/calculatorMath';
import WidgetAttributionFooter from '@/components/widgets/WidgetAttributionFooter';

export default function EmbedSipWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: '#5e8a5e' }}>Loading SIP Calculator…</div>}>
      <EmbedSipClient />
    </Suspense>
  );
}

function EmbedSipClient() {
  const searchParams = useSearchParams();

  // Read initial params with fallbacks
  const initAmt = parseInt(searchParams.get('amount'), 10) || 10000;
  const initYears = parseInt(searchParams.get('years'), 10) || 10;
  const initRate = parseFloat(searchParams.get('rate')) || 12;
  const initStepup = parseInt(searchParams.get('stepup'), 10) || 0;

  const [sipAmt, setSipAmt] = useState(initAmt);
  const [durationYears, setDurationYears] = useState(initYears);
  const [annualRate, setAnnualRate] = useState(initRate);
  const [stepupEnabled, setStepupEnabled] = useState(initStepup > 0);
  const [stepupPct, setStepupPct] = useState(initStepup > 0 ? initStepup : 10);

  // Compute simulation
  const result = useMemo(() => {
    return simulateSIP({
      mode: stepupEnabled && stepupPct > 0 ? 'stepup' : 'sip',
      freq: 'monthly',
      sipAmt: Number(sipAmt) || 0,
      lumpAmt: 0,
      totalYears: Number(durationYears) || 1,
      annualRate: Number(annualRate) || 0,
      stepupPct: stepupEnabled ? Number(stepupPct) || 0 : 0,
    });
  }, [sipAmt, durationYears, annualRate, stepupEnabled, stepupPct]);

  const totalInvested = result.totalInvested || 0;
  const totalGain = result.totalGain || 0;
  const finalCorpus = result.finalCorpus || 0;

  const investedRatio = finalCorpus > 0 ? (totalInvested / finalCorpus) * 100 : 50;
  const gainRatio = 100 - investedRatio;

  const fullUrl = `https://mfcalc.getabundance.in/sip-calculator?amount=${sipAmt}&years=${durationYears}&rate=${annualRate}${stepupEnabled ? `&stepup=${stepupPct}` : ''}&utm_source=widget_embed&utm_medium=cta&utm_campaign=sip_calculator`;

  return (
    <div style={{
      maxWidth: '460px',
      margin: '0 auto',
      width: '100%',
      height: '100%',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface, #ffffff)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
      border: '1px solid var(--border, #c2dfc2)',
    }}>
      {/* Widget Header */}
      <header style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border, #c2dfc2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--s2, #edf6ed)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📈</span>
          <h1 style={{
            fontSize: '15px',
            fontWeight: '700',
            color: 'var(--g1, #1b5e20)',
            margin: 0,
          }}>
            SIP Wealth Calculator
          </h1>
        </div>
        <span style={{
          fontSize: '10px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          background: 'var(--g-xlight, #e8f5e9)',
          color: 'var(--g1, #1b5e20)',
          padding: '2px 8px',
          borderRadius: '12px',
          border: '1px solid var(--border, #c2dfc2)',
        }}>
          Live Tool
        </span>
      </header>

      {/* Main Body */}
      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Slider 1: Monthly Investment */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2, #2e4d2e)' }}>
              Monthly Investment
            </label>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '14px',
              fontWeight: '700',
              color: 'var(--g1, #1b5e20)',
              background: 'var(--s2, #edf6ed)',
              padding: '2px 8px',
              borderRadius: '4px',
            }}>
              {fmtINRFull(sipAmt)}
            </span>
          </div>
          <input
            type="range"
            min="500"
            max="100000"
            step="500"
            value={sipAmt}
            onChange={(e) => setSipAmt(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--g1, #1b5e20)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted, #5e8a5e)', marginTop: '2px' }}>
            <span>₹500</span>
            <span>₹50K</span>
            <span>₹1 Lakh</span>
          </div>
        </div>

        {/* Slider 2: Investment Duration */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2, #2e4d2e)' }}>
              Investment Period
            </label>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '14px',
              fontWeight: '700',
              color: 'var(--g1, #1b5e20)',
              background: 'var(--s2, #edf6ed)',
              padding: '2px 8px',
              borderRadius: '4px',
            }}>
              {durationYears} {durationYears === 1 ? 'Year' : 'Years'}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={durationYears}
            onChange={(e) => setDurationYears(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--g1, #1b5e20)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted, #5e8a5e)', marginTop: '2px' }}>
            <span>1 Yr</span>
            <span>15 Yrs</span>
            <span>30 Yrs</span>
          </div>
        </div>

        {/* Slider 3: Expected Annual Return */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2, #2e4d2e)' }}>
              Expected Annual Return
            </label>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '14px',
              fontWeight: '700',
              color: 'var(--g1, #1b5e20)',
              background: 'var(--s2, #edf6ed)',
              padding: '2px 8px',
              borderRadius: '4px',
            }}>
              {annualRate}% p.a.
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="30"
            step="0.5"
            value={annualRate}
            onChange={(e) => setAnnualRate(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--g1, #1b5e20)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted, #5e8a5e)', marginTop: '2px' }}>
            <span>1% (Debt)</span>
            <span>12% (Equity)</span>
            <span>30%</span>
          </div>
        </div>

        {/* Step-Up Toggle */}
        <div style={{
          background: 'var(--s2, #edf6ed)',
          borderRadius: '8px',
          padding: '8px 12px',
          border: '1px solid var(--border, #c2dfc2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text, #162616)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={stepupEnabled}
                onChange={(e) => setStepupEnabled(e.target.checked)}
                style={{ accentColor: 'var(--g1, #1b5e20)', cursor: 'pointer' }}
              />
              Annual Step-Up SIP (+{stepupPct}%)
            </label>
            {stepupEnabled && (
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--g1, #1b5e20)' }}>
                +{stepupPct}% / yr
              </span>
            )}
          </div>
          {stepupEnabled && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={stepupPct}
                onChange={(e) => setStepupPct(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--g1, #1b5e20)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--muted, #5e8a5e)' }}>
                <span>1%</span>
                <span>10%</span>
                <span>25%</span>
              </div>
            </div>
          )}
        </div>

        {/* Results Summary Card */}
        <div style={{
          background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
          borderRadius: '10px',
          padding: '14px',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(27, 94, 32, 0.2)',
        }}>
          <div style={{ fontSize: '11px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Expected Future Value
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '24px',
            fontWeight: '800',
            lineHeight: '1.2',
            margin: '2px 0 10px 0',
          }}>
            {fmtINRFull(finalCorpus)}
          </div>

          {/* Breakdown Bar */}
          <div style={{
            height: '8px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.25)',
            borderRadius: '4px',
            overflow: 'hidden',
            display: 'flex',
            marginBottom: '8px',
          }}>
            <div
              style={{
                width: `${investedRatio}%`,
                background: '#a5d6a7',
                transition: 'width 0.2s ease',
              }}
              title={`Invested: ${investedRatio.toFixed(1)}%`}
            />
            <div
              style={{
                width: `${gainRatio}%`,
                background: '#ffca28',
                transition: 'width 0.2s ease',
              }}
              title={`Gain: ${gainRatio.toFixed(1)}%`}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <div>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#a5d6a7', marginRight: '4px' }} />
              Invested: <strong style={{ fontFamily: 'monospace' }}>{fmtINR(totalInvested)}</strong>
            </div>
            <div>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ffca28', marginRight: '4px' }} />
              Wealth Gain: <strong style={{ fontFamily: 'monospace' }}>{fmtINR(totalGain)}</strong>
            </div>
          </div>
        </div>

        {/* CTA Link to Full Tool */}
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener"
          style={{
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--g1, #1b5e20)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
          onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          View Fund Historical Backtests & Top Schemes ↗
        </a>
      </div>

      {/* Attribution Footer */}
      <WidgetAttributionFooter widget="sip_calculator" defaultHeight={500} />
    </div>
  );
}
