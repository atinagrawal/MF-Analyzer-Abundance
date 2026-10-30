'use client';

/**
 * app/gold-silver-rates/GoldSilverRatesClient.jsx
 *
 * Live-updating rate tables, Interactive Jewellery Cost & GST Calculator,
 * Major Cities live indicative rate grid, and Gold/Silver Ratio tracker.
 *
 * Receives the server-rendered first reading as `initialData` (so the page
 * has real numbers on first paint with zero layout shift), then polls our
 * cached API route (/api/precious-metals-rates) every 60 seconds.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';

const POLL_MS = 60000;

function fmtInr(n, maxDec = 2) {
  if (n == null || !isFinite(n)) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', {
    maximumFractionDigits: n >= 1000 ? 0 : maxDec,
  });
}

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function WeightRows({ rows }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.label}>
          <td className="gsr-weight-label">{r.label}</td>
          <td className="mono gsr-num gsr-sell">{fmtInr(r.bid)}</td>
          <td className="mono gsr-num gsr-buy">{fmtInr(r.ask)}</td>
        </tr>
      ))}
    </>
  );
}

// ── Interactive Jewellery & GST Calculator ──────────────────────────────────
function JewelleryCalculator({ conversions }) {
  const [metal, setMetal] = useState('22k'); // '24k' | '22k' | '18k' | 'silver'
  const [weight, setWeight] = useState(10);
  const [unit, setUnit] = useState('gram'); // 'gram' | 'pavan' | 'tola'
  const [makingPct, setMakingPct] = useState(12);
  const [includeHallmark, setIncludeHallmark] = useState(true);

  // Rate per gram based on chosen metal
  const ratePerGram = useMemo(() => {
    if (!conversions) return 0;
    if (metal === '24k') return conversions.gold?.['24k']?.perGram?.ask ?? 0;
    if (metal === '22k') return conversions.gold?.['22k']?.perGram?.ask ?? 0;
    if (metal === '18k') return conversions.gold?.['18k']?.perGram?.ask ?? 0;
    if (metal === 'silver') return conversions.silver?.perGram?.ask ?? 0;
    return 0;
  }, [conversions, metal]);

  // Weight converted to grams
  const weightInGrams = useMemo(() => {
    const w = parseFloat(weight) || 0;
    if (unit === 'pavan') return w * 8;
    if (unit === 'tola') return w * 11.6638;
    return w;
  }, [weight, unit]);

  // Calculations
  const metalValue = weightInGrams * ratePerGram;
  const makingCharges = metalValue * ((parseFloat(makingPct) || 0) / 100);
  const subtotal = metalValue + makingCharges;
  const gstAmount = subtotal * 0.03; // 3% GST on precious metals and jewellery
  const hallmarkFee = includeHallmark && metal !== 'silver' ? 53.10 : 0; // ₹45 + 18% GST = ₹53.10
  const grandTotal = subtotal + gstAmount + hallmarkFee;

  const handlePreset = (grams, label) => {
    setWeight(grams);
    setUnit('gram');
  };

  return (
    <div className="gsr-calc-card" id="jewellery-calculator">
      <div className="gsr-calc-header">
        <div>
          <span className="gsr-badge-pill">🧮 Interactive Tool</span>
          <h3 className="gsr-calc-title">Jewellery Cost &amp; GST Calculator</h3>
          <p className="gsr-calc-subtitle">
            Calculate the exact showroom price for your jewellery, including making charges, 3% GST, and BIS hallmarking fees.
          </p>
        </div>
      </div>

      <div className="gsr-calc-body">
        {/* Controls */}
        <div className="gsr-calc-controls">
          {/* Metal selection */}
          <div className="gsr-control-group">
            <label className="gsr-control-lbl">Select Metal / Purity</label>
            <div className="gsr-toggle-grid">
              {[
                { id: '22k', label: '22K Gold', sub: '916 Jewellery Standard' },
                { id: '18k', label: '18K Gold', sub: '750 Diamond Jewellery' },
                { id: '24k', label: '24K Gold', sub: '999 Bullion / Coin' },
                { id: 'silver', label: 'Silver', sub: '999 Fine Silver' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  className={`gsr-toggle-btn${metal === opt.id ? ' active' : ''}`}
                  onClick={() => setMetal(opt.id)}
                >
                  <span className="btn-title">{opt.label}</span>
                  <span className="btn-sub">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Weight + Unit */}
          <div className="gsr-control-group">
            <div className="gsr-split-lbl">
              <label className="gsr-control-lbl">Weight</label>
              <span className="gsr-rate-note">
                Base Rate: <strong>{fmtInr(ratePerGram)}/g</strong>
              </span>
            </div>
            <div className="gsr-input-with-unit">
              <input
                type="number"
                min="0.1"
                step="0.1"
                className="gsr-number-input"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Enter weight"
              />
              <select
                className="gsr-unit-select"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                aria-label="Weight unit"
              >
                <option value="gram">Grams (g)</option>
                <option value="pavan">Sovereign / Pavan (8g)</option>
                <option value="tola">Tola (11.66g)</option>
              </select>
            </div>

            {/* Quick Presets */}
            <div className="gsr-preset-chips">
              <span className="preset-lbl">Popular:</span>
              <button type="button" className="preset-btn" onClick={() => handlePreset(4, 'Ring')}>Ring (4g)</button>
              <button type="button" className="preset-btn" onClick={() => handlePreset(8, '1 Sovereign')}>1 Sovereign (8g)</button>
              <button type="button" className="preset-btn" onClick={() => handlePreset(10, 'Chain')}>Chain (10g)</button>
              <button type="button" className="preset-btn" onClick={() => handlePreset(20, 'Bangle')}>Bangle (20g)</button>
              <button type="button" className="preset-btn" onClick={() => handlePreset(11.66, '1 Tola')}>1 Tola</button>
            </div>
          </div>

          {/* Making charges */}
          <div className="gsr-control-group">
            <div className="gsr-split-lbl">
              <label className="gsr-control-lbl">Making Charges</label>
              <span className="gsr-slider-val"><strong>{makingPct}%</strong></span>
            </div>
            <div className="gsr-slider-wrap">
              <input
                type="range"
                min="0"
                max="30"
                step="0.5"
                value={makingPct}
                onChange={(e) => setMakingPct(e.target.value)}
                className="gsr-range-slider"
              />
              <div className="gsr-slider-ticks">
                <span>0% (Coins)</span>
                <span>10% (Plain)</span>
                <span>18% (Ornate)</span>
                <span>25%+ (Bridal)</span>
              </div>
            </div>
          </div>

          {/* Hallmarking checkbox */}
          {metal !== 'silver' && (
            <label className="gsr-checkbox-lbl">
              <input
                type="checkbox"
                checked={includeHallmark}
                onChange={(e) => setIncludeHallmark(e.target.checked)}
              />
              <span>Include BIS Hallmarking Fee (₹45 + 18% GST = ₹53.10)</span>
            </label>
          )}
        </div>

        {/* Breakdown Card */}
        <div className="gsr-calc-summary">
          <div className="gsr-summary-eyebrow">Estimated Showroom Breakdown</div>
          <div className="gsr-grand-total">
            <span className="total-lbl">Estimated Price:</span>
            <span className="total-val mono">{fmtInr(grandTotal, 0)}</span>
          </div>

          <div className="gsr-breakdown-table">
            <div className="breakdown-row">
              <span>Net Metal Cost ({weightInGrams.toFixed(2)}g @ {fmtInr(ratePerGram)}/g)</span>
              <strong className="mono">{fmtInr(metalValue)}</strong>
            </div>
            <div className="breakdown-row">
              <span>Making Charges ({makingPct}%)</span>
              <strong className="mono">+{fmtInr(makingCharges)}</strong>
            </div>
            <div className="breakdown-row subtotal">
              <span>Subtotal before Tax</span>
              <strong className="mono">{fmtInr(subtotal)}</strong>
            </div>
            <div className="breakdown-row">
              <span>GST on Gold &amp; Making (3%)</span>
              <strong className="mono">+{fmtInr(gstAmount)}</strong>
            </div>
            {hallmarkFee > 0 && (
              <div className="breakdown-row">
                <span>BIS Hallmarking (HUID)</span>
                <strong className="mono">+{fmtInr(hallmarkFee)}</strong>
              </div>
            )}
          </div>

          <div className="gsr-calc-note">
            💡 <em>Note:</em> Jewellers may add local wastage (kadan) or stone charges. Always verify the 6-digit <strong>HUID stamp</strong> on the official BIS Care app before paying.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Client Component ───────────────────────────────────────────────────
export default function GoldSilverRatesClient({ initialData }) {
  const [data, setData] = useState(initialData || null);
  const [error, setError] = useState(!initialData);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/precious-metals-rates', { cache: 'no-store' });
      if (!res.ok) throw new Error('unavailable');
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError((prev) => prev || !data);
    }
  }, [data]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!data) {
    return (
      <div className="gsr-unavailable">
        Rates are temporarily unavailable. Please check back shortly.
      </div>
    );
  }

  const { conversions, stale } = data;
  const ratio = conversions.goldSilverRatio;

  return (
    <>
      <div className="gsr-ticker">
        {/* Status Bar */}
        <div className={`gsr-status-bar${stale ? ' stale' : ''}`}>
          <span className="gsr-status-dot" />
          <span>{stale ? 'Showing last known rates' : 'Live Indicative Rates'}</span>
          <span className="gsr-updated">· Refreshed {fmtTime(conversions.asOf)} IST</span>
        </div>

        {/* Global Overview Grid */}
        <div className="gsr-global-grid">
          <div className="gsr-global-card">
            <span className="gsr-global-label">Gold (Global Spot)</span>
            <span className="mono gsr-global-val">{fmtUsd(conversions.goldUsdOz.ask)} / oz</span>
          </div>
          <div className="gsr-global-card">
            <span className="gsr-global-label">Silver (Global Spot)</span>
            <span className="mono gsr-global-val">{fmtUsd(conversions.silverUsdOz.ask)} / oz</span>
          </div>
          <div className="gsr-global-card">
            <span className="gsr-global-label">USD / INR Exchange Rate</span>
            <span className="mono gsr-global-val">₹{conversions.usdInr.ask.toFixed(2)}</span>
          </div>
          {ratio && (
            <div className="gsr-global-card gsr-ratio-card">
              <span className="gsr-global-label">Gold / Silver Ratio</span>
              <span className="mono gsr-global-val">{ratio}</span>
            </div>
          )}
        </div>

        {/* 24K, 22K, 18K Gold Rate Table */}
        <div className="gsr-table-wrap" style={{ marginTop: 20 }}>
          <table className="gsr-table">
            <caption>Gold Rate Today in India (24K, 22K &amp; 18K, Indicative)</caption>
            <thead>
              <tr>
                <th>Weight</th>
                <th>You Sell At (Bid)</th>
                <th>You Buy At (Ask)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="gsr-subhead"><td colSpan={3}>24 Karat (999 Fine Bullion)</td></tr>
              <WeightRows rows={conversions.gold['24k'].rows} />
              <tr className="gsr-subhead"><td colSpan={3}>22 Karat (916 Hallmarked Jewellery)</td></tr>
              <WeightRows rows={conversions.gold['22k'].rows} />
              {conversions.gold['18k'] && (
                <>
                  <tr className="gsr-subhead"><td colSpan={3}>18 Karat (750 Diamond &amp; Gemstone Jewellery)</td></tr>
                  <WeightRows rows={conversions.gold['18k'].rows} />
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Silver Rate Table */}
        <div className="gsr-table-wrap">
          <table className="gsr-table">
            <caption>Silver Rate Today in India (999 Fine, Indicative)</caption>
            <thead>
              <tr>
                <th>Weight</th>
                <th>You Sell At (Bid)</th>
                <th>You Buy At (Ask)</th>
              </tr>
            </thead>
            <tbody>
              <WeightRows rows={conversions.silver.rows} />
            </tbody>
          </table>
        </div>

        {/* Platinum Rate Table */}
        <div className="gsr-table-wrap">
          <table className="gsr-table">
            <caption>Platinum Rate Today in India (999 Fine, Indicative)</caption>
            <thead>
              <tr>
                <th>Weight</th>
                <th>You Sell At (Bid)</th>
                <th>You Buy At (Ask)</th>
              </tr>
            </thead>
            <tbody>
              <WeightRows rows={conversions.platinum.rows} />
            </tbody>
          </table>
        </div>

        {error && (
          <p className="gsr-poll-note">Live refresh is experiencing high traffic — displaying the most recent recorded rates.</p>
        )}
      </div>

      {/* ── Interactive Jewellery & GST Calculator ── */}
      <JewelleryCalculator conversions={conversions} />
    </>
  );
}
