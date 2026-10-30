'use client';

/**
 * app/gold-silver-rates/GoldSilverRatesClient.jsx
 *
 * Live-updating rate table. Receives the server-rendered first reading
 * as `initialData` (so the page has real numbers on first paint, no
 * flash of "Loading…"), then polls our OWN cached API route on an
 * interval -- never the upstream refinery endpoint directly, see
 * lib/preciousMetalsCache.js's header comment for why.
 */

import { useEffect, useState, useCallback } from 'react';

const POLL_MS = 60000;

function fmtInr(n) {
  if (n == null || !isFinite(n)) return '—';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

  return (
    <div className="gsr-ticker">
      <div className={`gsr-status-bar${stale ? ' stale' : ''}`}>
        <span className="gsr-status-dot" />
        <span>{stale ? 'Showing last known rates' : 'Live'}</span>
        <span className="gsr-updated">· Updated {fmtTime(conversions.asOf)} IST</span>
      </div>

      <div className="gsr-table-wrap">
        <table className="gsr-table">
          <caption>Gold Rate Today (24K &amp; 22K, Indicative)</caption>
          <thead>
            <tr>
              <th>Weight</th>
              <th>You Sell At</th>
              <th>You Buy At</th>
            </tr>
          </thead>
          <tbody>
            <tr className="gsr-subhead"><td colSpan={3}>24 Karat (999 Fine)</td></tr>
            <WeightRows rows={conversions.gold['24k'].rows} />
            <tr className="gsr-subhead"><td colSpan={3}>22 Karat (916)</td></tr>
            <WeightRows rows={conversions.gold['22k'].rows} />
          </tbody>
        </table>
      </div>

      <div className="gsr-table-wrap">
        <table className="gsr-table">
          <caption>Silver Rate Today (999 Fine, Indicative)</caption>
          <thead>
            <tr>
              <th>Weight</th>
              <th>You Sell At</th>
              <th>You Buy At</th>
            </tr>
          </thead>
          <tbody>
            <WeightRows rows={conversions.silver.rows} />
          </tbody>
        </table>
      </div>

      <div className="gsr-table-wrap">
        <table className="gsr-table">
          <caption>Platinum Rate Today (999 Fine, Indicative)</caption>
          <thead>
            <tr>
              <th>Weight</th>
              <th>You Sell At</th>
              <th>You Buy At</th>
            </tr>
          </thead>
          <tbody>
            <WeightRows rows={conversions.platinum.rows} />
          </tbody>
        </table>
      </div>

      <div className="gsr-global-grid">
        <div className="gsr-global-card">
          <span className="gsr-global-label">Gold (Global)</span>
          <span className="mono gsr-global-val">{fmtUsd(conversions.goldUsdOz.ask)} / oz</span>
        </div>
        <div className="gsr-global-card">
          <span className="gsr-global-label">Silver (Global)</span>
          <span className="mono gsr-global-val">{fmtUsd(conversions.silverUsdOz.ask)} / oz</span>
        </div>
        <div className="gsr-global-card">
          <span className="gsr-global-label">USD / INR</span>
          <span className="mono gsr-global-val">₹{conversions.usdInr.ask.toFixed(2)}</span>
        </div>
      </div>

      {error && (
        <p className="gsr-poll-note">Live refresh is having trouble — showing the most recent rates we have.</p>
      )}
    </div>
  );
}
