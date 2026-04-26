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
function SifCard({ scheme, watched, onToggleWatch }) {
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
    </div>
  );
}

// ── SIF Row (list view) ───────────────────────────────────────────────────────
function SifRow({ scheme, watched, onToggleWatch, idx }) {
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
      <td className="sif-td sif-td-action">
        <button
          className={`sif-star${watched ? ' active' : ''}`}
          onClick={() => onToggleWatch(scheme.scheme_id)}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '★' : '☆'}
        </button>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
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

      <Footer />
    </>
  );
}
