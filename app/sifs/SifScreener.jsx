'use client';

/**
 * app/sifs/SifScreener.jsx — SIF Screener Client Component
 *
 * Data: GET /api/sif-nav
 * Features: live search, type + strategy filters, grid/list view toggle,
 *           watchlist (localStorage), sort by NAV/name, skeleton loading
 */

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// ── Category label map — short names for the long AMFI strings ──────────────
const STRATEGY_LABELS = {
  'Equity Oriented Investment Strategies - Equity Ex-Top 100 Long-Short Fund':
    'Equity Ex-Top 100 L/S',
  'Equity Oriented Investment Strategies - Equity Long-Short Fund':
    'Equity Long-Short',
  'Hybrid Investment Strategies - Active Asset Allocator Long-Short Fund':
    'Active Asset Allocator',
  'Hybrid Investment Strategies - Hybrid Long-Short Fund':
    'Hybrid Long-Short',
};

const STRATEGY_FAMILY = cat =>
  cat?.startsWith('Equity') ? 'Equity' : 'Hybrid';

const STRATEGY_SHORT = cat => STRATEGY_LABELS[cat] || cat?.split(' - ')[1] || cat || '—';

// ── Colour per strategy family ────────────────────────────────────────────────
const FAMILY_STYLE = {
  Equity: { bg: 'rgba(27,94,32,.12)',  fg: 'var(--g1)' },
  Hybrid: { bg: 'rgba(74,20,140,.10)', fg: '#5e35b1' },
};

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtDate = d =>
  d ? new Date(d.split('-').reverse().join('-'))
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const SORT_OPTIONS = [
  { value: 'nav_desc', label: 'NAV: High → Low' },
  { value: 'nav_asc',  label: 'NAV: Low → High' },
  { value: 'name_asc', label: 'Name: A → Z' },
  { value: 'name_desc', label: 'Name: Z → A' },
];

// ── Watchlist helpers (localStorage) ─────────────────────────────────────────
function getWatchlist() {
  try { return new Set(JSON.parse(localStorage.getItem('sif_watchlist') || '[]')); }
  catch { return new Set(); }
}
function saveWatchlist(set) {
  try { localStorage.setItem('sif_watchlist', JSON.stringify([...set])); } catch {}
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="sif-card sif-card-sk" aria-hidden="true">
      <div className="sif-sk-line" style={{ width: '55%', height: 10, marginBottom: 10 }} />
      <div className="sif-sk-line" style={{ width: '90%', height: 14, marginBottom: 6 }} />
      <div className="sif-sk-line" style={{ width: '70%', height: 10, marginBottom: 20 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="sif-sk-line" style={{ width: 60, height: 28 }} />
        <div className="sif-sk-line" style={{ width: 44, height: 28, borderRadius: '50%' }} />
      </div>
    </div>
  );
}

// ── SIF Card (grid view) ──────────────────────────────────────────────────────
function SifCard({ scheme, watched, onToggleWatch, onViewHistory }) {
  const family   = STRATEGY_FAMILY(scheme.category);
  const fStyle   = FAMILY_STYLE[family] || FAMILY_STYLE.Equity;
  const stratShort = STRATEGY_SHORT(scheme.category);

  return (
    <div className="sif-card" tabIndex={0}>
      {/* Header row: SIF name + star */}
      <div className="sif-card-head">
        <span className="sif-house-badge">{scheme.sif_name}</span>
        <button
          className={`sif-star${watched ? ' active' : ''}`}
          onClick={() => onToggleWatch(scheme.scheme_id)}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '★' : '☆'}
        </button>
      </div>

      {/* Scheme name */}
      <div className="sif-scheme-name">{scheme.nav_name}</div>

      {/* Strategy badge */}
      <div
        className="sif-strat-badge"
        style={{ background: fStyle.bg, color: fStyle.fg }}
        title={scheme.category}
      >
        {stratShort}
      </div>

      {/* Footer: NAV + meta */}
      <div className="sif-card-foot">
        <div className="sif-nav-block">
          <span className="sif-nav-label">NAV</span>
          <span className="sif-nav-val">₹{scheme.nav.toFixed(4)}</span>
        </div>
        <div className="sif-meta-pills">
          <span className="sif-pill sif-type-pill">{scheme.type}</span>
          <span className="sif-pill sif-id-pill">{scheme.scheme_id}</span>
        </div>
      </div>
      <button
        className="sif-hist-trigger"
        onClick={() => onViewHistory(scheme)}
        aria-label={`View NAV history for ${scheme.nav_name}`}
      >
        📈 View History
      </button>
    </div>
  );
}

// ── SIF Row (list view) ───────────────────────────────────────────────────────
function SifRow({ scheme, watched, onToggleWatch, idx, onViewHistory }) {
  const family = STRATEGY_FAMILY(scheme.category);
  const fStyle = FAMILY_STYLE[family] || FAMILY_STYLE.Equity;
  return (
    <tr className="sif-tr">
      <td className="sif-td sif-td-num mono">{String(idx + 1).padStart(2, '0')}</td>
      <td className="sif-td sif-td-name">
        <div className="sif-row-name">{scheme.nav_name}</div>
        <div className="sif-row-house">{scheme.sif_name} · {scheme.scheme_id}</div>
      </td>
      <td className="sif-td">
        <span className="sif-strat-badge sif-strat-sm"
          style={{ background: fStyle.bg, color: fStyle.fg }}>
          {STRATEGY_SHORT(scheme.category)}
        </span>
      </td>
      <td className="sif-td">
        <span className="sif-pill sif-type-pill">{scheme.type}</span>
      </td>
      <td className="sif-td sif-td-nav mono">₹{scheme.nav.toFixed(4)}</td>
      <td className="sif-td sif-td-date mono">{fmtDate(scheme.nav_date)}</td>
      <td className="sif-td sif-td-action" style={{ whiteSpace: 'nowrap' }}>
        <button
          className={`sif-star${watched ? ' active' : ''}`}
          onClick={() => onToggleWatch(scheme.scheme_id)}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '★' : '☆'}
        </button>
        <button
          className="sif-hist-trigger-sm"
          onClick={() => onViewHistory(scheme)}
          title="View NAV history"
        >
          📈
        </button>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Pure SVG Area Chart ────────────────────────────────────────────────────────
function SifAreaChart({ records, color = '#43a047' }) {
  if (!records.length) return null;
  const W = 640, H = 200, PL = 52, PR = 12, PT = 12, PB = 28;
  const plotW = W - PL - PR, plotH = H - PT - PB;

  const navs  = records.map(r => r.nav);
  const minNav = Math.min(...navs);
  const maxNav = Math.max(...navs);
  const rangeNav = maxNav - minNav || 1;

  const px = (i) => PL + (i / (records.length - 1)) * plotW;
  const py = (nav) => PT + plotH - ((nav - minNav) / rangeNav) * plotH;

  const pathLine  = records.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(r.nav).toFixed(1)}`).join(' ');
  const pathArea  = pathLine + ` L${px(records.length - 1).toFixed(1)},${(PT + plotH).toFixed(1)} L${PL},${(PT + plotH).toFixed(1)} Z`;

  // Y-axis ticks (4 levels)
  const yTicks = [0, 1, 2, 3].map(i => minNav + (rangeNav * i) / 3);
  // X-axis labels (first, mid, last)
  const xLabels = [0, Math.floor(records.length / 2), records.length - 1];

  const fmtNav   = v => '₹' + v.toFixed(2);
  const fmtLabel = d => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      aria-label="NAV history chart"
    >
      <defs>
        <linearGradient id="sif-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PL} y1={py(v).toFixed(1)}
            x2={W - PR} y2={py(v).toFixed(1)}
            stroke="rgba(255,255,255,.07)" strokeWidth="1"
          />
          <text
            x={PL - 4} y={py(v)} dy="0.35em"
            textAnchor="end" fontSize="9"
            fill="rgba(255,255,255,.4)" fontFamily="'JetBrains Mono',monospace"
          >
            {fmtNav(v)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={pathArea} fill="url(#sif-grad)" />

      {/* Line */}
      <path d={pathLine} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* First & last dots */}
      {[0, records.length - 1].map(i => (
        <circle key={i} cx={px(i)} cy={py(records[i].nav)} r="3.5" fill={color} stroke="#1b1b1b" strokeWidth="1.5" />
      ))}

      {/* X-axis labels */}
      {xLabels.map(i => (
        <text key={i} x={px(i)} y={H - 6}
          textAnchor={i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}
          fontSize="9" fill="rgba(255,255,255,.4)" fontFamily="'JetBrains Mono',monospace"
        >
          {fmtLabel(records[i].date)}
        </text>
      ))}
    </svg>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function subtractDays(d, days) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - days);
  return dt.toISOString().slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

const PRESETS = [
  { label: '1M',  days: 30  },
  { label: '3M',  days: 90  },
  { label: '6M',  days: 180 },
  { label: 'Max', days: 999 },
];

// ── NAV History Modal ─────────────────────────────────────────────────────────
function NavHistoryModal({ scheme, onClose }) {
  const [strategies,    setStrategies]    = useState([]);
  const [selectedSd,    setSelectedSd]    = useState('');
  const [stratLoading,  setStratLoading]  = useState(true);
  const [stratError,    setStratError]    = useState('');

  const [fromDate, setFromDate] = useState(subtractDays(todayStr(), 180));
  const [toDate,   setToDate]   = useState(todayStr());
  const [preset,   setPreset]   = useState('6M');

  const [records,      setRecords]      = useState([]);
  const [navLoading,   setNavLoading]   = useState(false);
  const [navError,     setNavError]     = useState('');
  const [mfMeta,       setMfMeta]       = useState({});
  const [fetched,      setFetched]      = useState(false);

  // Load strategies on open
  useEffect(() => {
    setStratLoading(true);
    fetch(`/api/sif-history?sif_id=${scheme.sif_id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setStrategies(d.strategies || []);
        if (d.strategies?.length) setSelectedSd(d.strategies[0].nav_id);
        setStratLoading(false);
      })
      .catch(e => { setStratError(e.message); setStratLoading(false); });
  }, [scheme.sif_id]);

  // Compute min date = scheme inception (all SIFs post-2024)
  const inception = '2024-01-01';

  function applyPreset(label) {
    setPreset(label);
    const today = todayStr();
    setToDate(today);
    if (label === 'Max') { setFromDate(inception); return; }
    const p = PRESETS.find(p => p.label === label);
    if (p) setFromDate(subtractDays(today, p.days));
  }

  async function fetchHistory() {
    if (!selectedSd) return;
    setNavLoading(true);
    setNavError('');
    setFetched(false);
    try {
      const res = await fetch(`/api/sif-history?sd_id=${selectedSd}&from=${fromDate}&to=${toDate}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setRecords(d.records || []);
      setMfMeta({ mf_name: d.mf_name, scheme_name: d.scheme_name, date_range: d.date_range });
      setFetched(true);
    } catch (e) {
      setNavError(e.message);
    } finally {
      setNavLoading(false);
    }
  }

  // Computed stats
  const stats = records.length >= 2 ? (() => {
    const first = records[0].nav, last = records[records.length - 1].nav;
    const ret   = ((last - first) / first) * 100;
    const navs  = records.map(r => r.nav);
    return {
      ret, high: Math.max(...navs), low: Math.min(...navs),
      current: last, inception: first, points: records.length,
    };
  })() : null;

  const isProfit = stats && stats.ret >= 0;

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="sif-hist-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="NAV History">
      <div className="sif-hist-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sif-hist-header">
          <div className="sif-hist-header-left">
            <div className="sif-hist-eyebrow">NAV History</div>
            <div className="sif-hist-title">{scheme.nav_name}</div>
            <div className="sif-hist-sub">{scheme.sif_name} · {scheme.scheme_id}</div>
          </div>
          <button className="sif-hist-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Controls */}
        <div className="sif-hist-controls">
          {/* Strategy picker */}
          <div className="sif-hist-ctrl-group">
            <label className="sif-hist-label">Strategy</label>
            {stratLoading ? (
              <div className="sif-hist-sk" style={{ width: 200, height: 36 }} />
            ) : stratError ? (
              <div className="sif-hist-err-sm">⚠ {stratError}</div>
            ) : strategies.length === 0 ? (
              <div className="sif-hist-err-sm">No strategies available</div>
            ) : strategies.length === 1 ? (
              <div className="sif-hist-strategy-name">{strategies[0].nav_name}</div>
            ) : (
              <select className="sif-hist-select" value={selectedSd} onChange={e => setSelectedSd(e.target.value)}>
                {strategies.map(s => <option key={s.nav_id} value={s.nav_id}>{s.nav_name}</option>)}
              </select>
            )}
          </div>

          {/* Date range */}
          <div className="sif-hist-ctrl-group">
            <label className="sif-hist-label">Period</label>
            <div className="sif-hist-presets">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  className={`sif-hist-preset${preset === p.label ? ' active' : ''}`}
                  onClick={() => applyPreset(p.label)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sif-hist-ctrl-group">
            <label className="sif-hist-label">Custom Range</label>
            <div className="sif-hist-dates">
              <input type="date" className="sif-hist-date-input"
                value={fromDate} min={inception} max={toDate}
                onChange={e => { setFromDate(e.target.value); setPreset(''); }} />
              <span className="sif-hist-date-sep">→</span>
              <input type="date" className="sif-hist-date-input"
                value={toDate} min={fromDate} max={todayStr()}
                onChange={e => { setToDate(e.target.value); setPreset(''); }} />
            </div>
          </div>

          <button
            className="sif-hist-fetch-btn"
            onClick={fetchHistory}
            disabled={navLoading || !selectedSd || stratLoading}
          >
            {navLoading ? '⏳ Loading…' : 'Fetch History →'}
          </button>
        </div>

        {/* Body */}
        <div className="sif-hist-body">

          {/* Loading skeleton */}
          {navLoading && (
            <div>
              <div className="sif-hist-sk sif-hist-sk-chart" />
              <div style={{ display: 'flex', gap: 10, margin: '16px 0 12px' }}>
                {[1,2,3,4].map(i => <div key={i} className="sif-hist-sk" style={{ flex:1, height: 56 }} />)}
              </div>
              <div className="sif-hist-sk" style={{ height: 120, borderRadius: 10 }} />
            </div>
          )}

          {/* Error */}
          {navError && !navLoading && (
            <div className="sif-hist-error">⚠ {navError}</div>
          )}

          {/* Empty */}
          {fetched && !navLoading && records.length === 0 && (
            <div className="sif-hist-empty">
              <div style={{ fontSize: '1.8rem', marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>No data available</div>
              <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.4)', marginTop: 6 }}>
                AMFI has no records for this period. Try a different date range.
              </div>
            </div>
          )}

          {/* Results */}
          {fetched && !navLoading && records.length > 0 && (
            <>
              {/* Stats row */}
              {stats && (
                <div className="sif-hist-stats">
                  {[
                    ['Period Return', (isProfit ? '+' : '') + stats.ret.toFixed(2) + '%', isProfit ? '#69f0ae' : '#ef5350'],
                    ['Current NAV',   '₹' + stats.current.toFixed(4), 'rgba(255,255,255,.9)'],
                    ['Period High',   '₹' + stats.high.toFixed(4),    '#a5d6a7'],
                    ['Period Low',    '₹' + stats.low.toFixed(4),     '#ef9a9a'],
                    ['Data Points',   stats.points + ' days',          'rgba(255,255,255,.5)'],
                  ].map(([label, val, color]) => (
                    <div key={label} className="sif-hist-stat">
                      <div className="sif-hist-stat-label">{label}</div>
                      <div className="sif-hist-stat-val" style={{ color }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Chart */}
              <div className="sif-hist-chart-wrap">
                <SifAreaChart records={records} color={isProfit ? '#43a047' : '#ef5350'} />
              </div>

              {/* Date range label */}
              <div className="sif-hist-range-label">
                {mfMeta.date_range || `${fromDate} → ${toDate}`} · {records.length} data points
              </div>

              {/* Data table */}
              <div className="sif-hist-table-wrap">
                <table className="sif-hist-table" aria-label="NAV history data">
                  <thead>
                    <tr>
                      <th className="sif-hist-th">#</th>
                      <th className="sif-hist-th">Date</th>
                      <th className="sif-hist-th sif-hist-th-right">NAV (₹)</th>
                      <th className="sif-hist-th sif-hist-th-right">Day Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...records].reverse().map((row, i, arr) => {
                      const prev = arr[i + 1];
                      const delta = prev ? ((row.nav - prev.nav) / prev.nav * 100) : null;
                      const dPos  = delta !== null && delta >= 0;
                      return (
                        <tr key={row.date} className="sif-hist-tr">
                          <td className="sif-hist-td sif-hist-td-num">{records.length - i}</td>
                          <td className="sif-hist-td">{new Date(row.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</td>
                          <td className="sif-hist-td sif-hist-td-right sif-hist-td-nav">₹{row.nav.toFixed(4)}</td>
                          <td className="sif-hist-td sif-hist-td-right" style={{ color: delta === null ? 'rgba(255,255,255,.3)' : dPos ? '#69f0ae' : '#ef5350', fontWeight: 600 }}>
                            {delta === null ? '—' : `${dPos ? '+' : ''}${delta.toFixed(3)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Placeholder before first fetch */}
          {!fetched && !navLoading && !navError && (
            <div className="sif-hist-placeholder">
              <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: .4 }}>📈</div>
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.82rem' }}>
                Select a strategy and period, then click <strong style={{ color: 'rgba(255,255,255,.6)' }}>Fetch History</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export default function SifScreener() {
  const [schemes,    setSchemes]    = useState([]);
  const [navDate,    setNavDate]    = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const [query,      setQuery]      = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterFam,  setFilterFam]  = useState('all');
  const [sortBy,     setSortBy]     = useState('nav_desc');
  const [view,       setView]       = useState('grid'); // 'grid' | 'list'
  const [watchlist,  setWatchlist]  = useState(new Set());
  const [showWatchOnly, setShowWatchOnly] = useState(false);
  const [historyScheme, setHistoryScheme] = useState(null); // scheme for history modal

  // Load data + watchlist
  useEffect(() => {
    setWatchlist(getWatchlist());
    fetch('/api/sif-nav')
      .then(r => r.json())
      .then(d => {
        setSchemes(d.schemes || []);
        setNavDate(d.nav_date || '');
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  function toggleWatch(id) {
    setWatchlist(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveWatchlist(next);
      return next;
    });
  }

  // Derived: unique types + families
  const types    = useMemo(() => ['all', ...new Set(schemes.map(s => s.type))], [schemes]);
  const families = useMemo(() => ['all', 'Equity', 'Hybrid'], []);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = schemes;
    if (showWatchOnly)         list = list.filter(s => watchlist.has(s.scheme_id));
    if (query.trim())          list = list.filter(s =>
      s.nav_name.toLowerCase().includes(query.toLowerCase()) ||
      s.sif_name.toLowerCase().includes(query.toLowerCase()) ||
      s.scheme_id.toLowerCase().includes(query.toLowerCase())
    );
    if (filterType !== 'all')  list = list.filter(s => s.type === filterType);
    if (filterFam  !== 'all')  list = list.filter(s => STRATEGY_FAMILY(s.category) === filterFam);

    return [...list].sort((a, b) => {
      if (sortBy === 'nav_desc')  return b.nav - a.nav;
      if (sortBy === 'nav_asc')   return a.nav - b.nav;
      if (sortBy === 'name_asc')  return a.nav_name.localeCompare(b.nav_name);
      if (sortBy === 'name_desc') return b.nav_name.localeCompare(a.nav_name);
      return 0;
    });
  }, [schemes, query, filterType, filterFam, sortBy, watchlist, showWatchOnly]);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="sif-hero">
        <div className="container">
          <Navbar activePage="sifs" />
          <div className="sif-hero-inner">
            <div className="page-eyebrow">
              <span className="sif-eyebrow-dot" />
              <span className="eyebrow-text" style={{ color: 'rgba(255,255,255,.65)' }}>
                AMFI · Live NAVs · {navDate ? fmtDate(navDate) : '—'}
              </span>
            </div>
            <h1 className="sif-hero-title">
              Specialised<br />
              <span className="sif-hero-accent">Investment Funds</span>
            </h1>
            <p className="sif-hero-sub">
              India's newest investment category — precision long-short strategies
              with SEBI oversight. Minimum ₹10 lakh. Track all funds in one place.
            </p>

            {/* Hero stats */}
            {!loading && (
              <div className="sif-hero-stats">
                {[
                  ['Funds Tracked', schemes.length],
                  ['Open Ended', schemes.filter(s => s.type === 'Open Ended').length],
                  ['Equity Strategies', schemes.filter(s => STRATEGY_FAMILY(s.category) === 'Equity').length],
                  ['Hybrid Strategies', schemes.filter(s => STRATEGY_FAMILY(s.category) === 'Hybrid').length],
                ].map(([label, val]) => (
                  <div key={label} className="sif-hero-stat">
                    <div className="sif-hero-stat-val">{val}</div>
                    <div className="sif-hero-stat-label">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="container sif-main">

        {/* ── Sticky controls bar ────────────────────────────────────────── */}
        <div className="sif-controls-bar">
          {/* Search */}
          <div className="sif-search-wrap">
            <svg className="sif-search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              className="sif-search"
              placeholder="Search by fund name, SIF house, or scheme ID…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search SIF schemes"
            />
            {query && (
              <button className="sif-search-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
            )}
          </div>

          {/* Filters row */}
          <div className="sif-filter-row">
            {/* Type filter */}
            <select className="sif-select" value={filterType} onChange={e => setFilterType(e.target.value)} aria-label="Filter by type">
              <option value="all">All Types</option>
              {types.filter(t => t !== 'all').map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Strategy family filter */}
            <select className="sif-select" value={filterFam} onChange={e => setFilterFam(e.target.value)} aria-label="Filter by strategy">
              <option value="all">All Strategies</option>
              {families.filter(f => f !== 'all').map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            {/* Sort */}
            <select className="sif-select" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort order">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Watchlist toggle */}
            <button
              className={`sif-filter-btn${showWatchOnly ? ' active' : ''}`}
              onClick={() => setShowWatchOnly(p => !p)}
              title={showWatchOnly ? 'Show all' : 'Show watchlist only'}
            >
              {showWatchOnly ? '★ Watchlist' : '☆ Watchlist'}
            </button>

            {/* View toggle */}
            <div className="sif-view-toggle">
              <button className={`sif-view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')} title="Grid view" aria-pressed={view === 'grid'}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="0" y="0" width="6" height="6" rx="1.5"/>
                  <rect x="8" y="0" width="6" height="6" rx="1.5"/>
                  <rect x="0" y="8" width="6" height="6" rx="1.5"/>
                  <rect x="8" y="8" width="6" height="6" rx="1.5"/>
                </svg>
              </button>
              <button className={`sif-view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')} title="List view" aria-pressed={view === 'list'}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="0" y="0" width="14" height="2.5" rx="1.25"/>
                  <rect x="0" y="5.75" width="14" height="2.5" rx="1.25"/>
                  <rect x="0" y="11.5" width="14" height="2.5" rx="1.25"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Results summary */}
          <div className="sif-results-summary">
            <span>
              {loading ? 'Loading…' : `${filtered.length} of ${schemes.length} funds`}
            </span>
            {(query || filterType !== 'all' || filterFam !== 'all' || showWatchOnly) && !loading && (
              <button className="sif-clear-filters"
                onClick={() => { setQuery(''); setFilterType('all'); setFilterFam('all'); setShowWatchOnly(false); }}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="error-box" style={{ margin: '24px 0' }}>
            ⚠ Failed to load SIF data: {error}
          </div>
        )}

        {/* ── Loading skeletons ───────────────────────────────────────────── */}
        {loading && (
          <div className="sif-grid">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!loading && !error && filtered.length === 0 && (
          <div className="sif-empty">
            <div className="sif-empty-icon">{showWatchOnly ? '☆' : '🔍'}</div>
            <div className="sif-empty-title">
              {showWatchOnly ? 'Your watchlist is empty' : 'No funds match your filters'}
            </div>
            <div className="sif-empty-sub">
              {showWatchOnly
                ? 'Click the ☆ on any card to add funds to your watchlist.'
                : 'Try a different search term or clear the active filters.'}
            </div>
          </div>
        )}

        {/* ── Grid view ──────────────────────────────────────────────────── */}
        {!loading && !error && filtered.length > 0 && view === 'grid' && (
          <div className="sif-grid">
            {filtered.map(s => (
              <SifCard
                key={s.scheme_id}
                scheme={s}
                watched={watchlist.has(s.scheme_id)}
                onToggleWatch={toggleWatch}
                onViewHistory={setHistoryScheme}
              />
            ))}
          </div>
        )}

        {/* ── List view ──────────────────────────────────────────────────── */}
        {!loading && !error && filtered.length > 0 && view === 'list' && (
          <div className="sif-table-wrap">
            <table className="sif-table" aria-label="SIF schemes">
              <thead className="sif-thead">
                <tr>
                  <th className="sif-th">#</th>
                  <th className="sif-th sif-th-name">Fund Name</th>
                  <th className="sif-th">Strategy</th>
                  <th className="sif-th">Type</th>
                  <th className="sif-th">NAV</th>
                  <th className="sif-th">As of</th>
                  <th className="sif-th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <SifRow
                    key={s.scheme_id}
                    scheme={s}
                    idx={i}
                    watched={watchlist.has(s.scheme_id)}
                    onToggleWatch={toggleWatch}
                    onViewHistory={setHistoryScheme}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── "Why SIFs?" educational accordion ─────────────────────────── */}
        <div className="sif-why-section">
          <h2 className="sif-why-title">Why Specialised Investment Funds?</h2>
          <div className="sif-why-grid">
            {[
              {
                icon: '⚖',
                title: 'Long-Short Strategies',
                body: 'Unlike conventional mutual funds, SIFs can take both long and short positions, enabling genuine alpha generation regardless of market direction.',
              },
              {
                icon: '🏦',
                title: 'SEBI Regulated',
                body: 'SIFs are regulated by SEBI under a dedicated framework (2024), with mandatory risk disclosures, NAV publication, and custodian oversight — the same rigour as mutual funds.',
              },
              {
                icon: '📊',
                title: 'Active Risk Management',
                body: 'Managers can hedge equity exposure, shift between asset classes, and use derivatives to manage drawdowns — tools unavailable in standard mutual fund structures.',
              },
              {
                icon: '🎯',
                title: 'Accredited Investor Product',
                body: 'Minimum investment of ₹10 lakh ensures participation by investors with the risk appetite and understanding appropriate for alternative strategies.',
              },
            ].map(item => (
              <div key={item.title} className="sif-why-card">
                <div className="sif-why-icon">{item.icon}</div>
                <div className="sif-why-card-title">{item.title}</div>
                <div className="sif-why-body">{item.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── AMFI Regulatory Disclaimer ─────────────────────────────────── */}
        <div className="sif-disclaimer">
          <div className="sif-disclaimer-badge">AMFI Registered · ARN-251838</div>
          <p className="sif-disclaimer-text">
            <strong>Regulatory Disclaimer:</strong> Mutual Fund and Specialised Investment Fund (SIF)
            investments are subject to market risks. Please read all scheme-related documents carefully
            before investing. Past performance is not indicative of future results. NAVs shown are sourced
            from AMFI's official data feed and are for informational purposes only. SIFs have a minimum
            investment requirement of ₹10,00,000 (Ten Lakh Rupees). This screener is provided by
            Abundance Financial Services (AMFI Registered Distributor, ARN-251838) as a free tool for
            investors and does not constitute investment advice. Please consult a SEBI-registered
            investment advisor before making investment decisions.
          </p>
        </div>

        <div style={{ height: 48 }} />
      </div>

      {/* NAV History Modal */}
      {historyScheme && (
        <NavHistoryModal
          scheme={historyScheme}
          onClose={() => setHistoryScheme(null)}
        />
      )}

      <Footer />
    </>
  );
}
