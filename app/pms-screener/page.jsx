'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { PMSCompareBar, PMSCompareModal } from './PMSCompare';
import './pms-screener.css';

const BENCHMARK_1Y = 18.5;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

// AUM threshold per strategy type (Crores)
const AUM_THRESHOLD = { Equity: 50, Debt: 10, 'Multi Asset': 10, Hybrid: 10 };

function getReturnClass(v) {
    if (v === null || v === undefined) return 'ret-neu';
    if (v >= 30) return 'ret-fire';
    if (v >= 15) return 'ret-pos';
    if (v >= 0) return 'ret-neu';
    if (v >= -5) return 'ret-warn';
    return 'ret-neg';
}
function fmtRet(v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v + '%';
}
function fmtAum(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 10000) return '₹' + (v / 1000).toFixed(1) + 'K Cr';
    return '₹' + v.toLocaleString('en-IN') + ' Cr';
}
function initials(name) {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function PMSScreener() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');
    const [providerFilter, setProviderFilter] = useState('');
    const [viewMode, setViewMode] = useState('table');
    const [sortCol, setSortCol] = useState('ret1Y');
    const [sortDir, setSortDir] = useState(-1);
    const [strategy, setStrategy] = useState('Equity');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [showSmallAum, setShowSmallAum] = useState(false); // AUM filter toggle
    const [compareList, setCompareList] = useState([]);    // comparison basket (max 3)
    const [showCompare, setShowCompare] = useState(false); // comparison modal open
    const [showAdvanced, setShowAdvanced] = useState(false); // toggle advanced filters

    // Advanced Filter State
    const [aumTier, setAumTier] = useState('all'); // 'all', '<100', '100-500', '500-2000', '>2000', 'custom'
    const [minAumFilter, setMinAumFilter] = useState('');
    const [maxAumFilter, setMaxAumFilter] = useState('');
    const [minRet, setMinRet] = useState('');
    const [retPeriod, setRetPeriod] = useState('ret1Y');

    const MAX_COMPARE = 3;

    const toggleCompare = useCallback((fund, e) => {
        e.stopPropagation(); // don't open drawer
        setCompareList(prev => {
            const already = prev.find(f => f.id === fund.id);
            if (already) return prev.filter(f => f.id !== fund.id);
            if (prev.length >= MAX_COMPARE) return prev; // silently cap at 3
            return [...prev, fund];
        });
    }, []);

    const isComparing = useCallback(id => compareList.some(f => f.id === id), [compareList]);
    const removeFromCompare = useCallback(id => setCompareList(prev => prev.filter(f => f.id !== id)), []);
    const clearCompare = useCallback(() => setCompareList([]), []);

    const STRATEGIES = ['Equity', 'Debt', 'Multi Asset', 'Hybrid'];

    useEffect(() => {
        setPage(1); setSearch(''); setProviderFilter('');
        fetchData();
    }, [strategy]);

    useEffect(() => { setPage(1); }, [search, providerFilter, sortCol, sortDir, showSmallAum, aumTier, minAumFilter, maxAumFilter, minRet, retPeriod]);

    // Automatically manage Nascent/Illiquid filter based on Advanced Filters
    useEffect(() => {
        const hasAdvancedFilters = aumTier !== 'all' || minAumFilter !== '' || maxAumFilter !== '' || minRet !== '';
        if (hasAdvancedFilters) {
            setShowSmallAum(true); // Disable Manager-Level AUM Filter (Show All)
        } else {
            setShowSmallAum(false); // Enable Manager-Level AUM Filter (Hide Nascent)
        }
    }, [aumTier, minAumFilter, maxAumFilter, minRet]);

    async function fetchData() {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/pms-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strategy, month: '2', year: '2026', asOnDate: '2026-2-28' })
            });
            const result = await res.json();
            if (result.status === 'success') setData(result.data);
            else throw new Error(result.message || 'API error');
        } catch (e) { setError(e.message); }
        setLoading(false);
    }

    function handleSort(col) {
        if (sortCol === col) setSortDir(d => d * -1);
        else { setSortCol(col); setSortDir(-1); }
    }

    // Derive the set of providers whose ALL strategies are below the AUM threshold
    const smallAumProviders = useMemo(() => {
        const threshold = AUM_THRESHOLD[strategy] ?? 50;
        const providerMap = {};
        data.forEach(d => {
            if (!providerMap[d.portfolioManager]) providerMap[d.portfolioManager] = [];
            providerMap[d.portfolioManager].push(d.aum ?? 0);
        });
        const small = new Set();
        Object.entries(providerMap).forEach(([mgr, aums]) => {
            if (aums.every(a => a < threshold)) small.add(mgr);
        });
        return small;
    }, [data, strategy]);

    // Unique provider list for the dropdown (only those passing AUM filter)
    const providers = useMemo(() => {
        const visible = showSmallAum ? data : data.filter(d => !smallAumProviders.has(d.portfolioManager));
        return [...new Set(visible.map(d => d.portfolioManager))].sort();
    }, [data, smallAumProviders, showSmallAum]);

    const filtered = useMemo(() => {
        const threshold = AUM_THRESHOLD[strategy] ?? 50;
        let arr = [...data];

        // Hide small-AUM providers unless toggled
        if (!showSmallAum) arr = arr.filter(d => !smallAumProviders.has(d.portfolioManager));

        // Provider filter
        if (providerFilter) arr = arr.filter(d => d.portfolioManager === providerFilter);

        // Text search
        if (search.trim()) {
            const q = search.toLowerCase();
            arr = arr.filter(d =>
                (d.strategyName || '').toLowerCase().includes(q) ||
                (d.portfolioManager || '').toLowerCase().includes(q)
            );
        }

        // AUM Tier filter
        if (aumTier !== 'all') {
            const aum = d => d.aum ?? 0;
            if (aumTier === '<100') arr = arr.filter(d => aum(d) < 100);
            else if (aumTier === '100-500') arr = arr.filter(d => aum(d) >= 100 && aum(d) < 500);
            else if (aumTier === '500-2000') arr = arr.filter(d => aum(d) >= 500 && aum(d) < 2000);
            else if (aumTier === '>2000') arr = arr.filter(d => aum(d) >= 2000);
            else if (aumTier === 'custom') {
                const min = parseFloat(minAumFilter) || 0;
                const max = parseFloat(maxAumFilter) || Infinity;
                arr = arr.filter(d => aum(d) >= min && aum(d) <= max);
            }
        }

        // Return threshold filter
        if (minRet !== '') {
            const threshold = parseFloat(minRet);
            if (!isNaN(threshold)) {
                arr = arr.filter(d => (d[retPeriod] ?? -Infinity) >= threshold);
            }
        }

        // Sort
        arr.sort((a, b) => {
            const av = a[sortCol] ?? -Infinity;
            const bv = b[sortCol] ?? -Infinity;
            return typeof av === 'string' ? sortDir * av.localeCompare(bv) : sortDir * (bv - av);
        });
        return arr;
    }, [data, search, providerFilter, sortCol, sortDir, showSmallAum, smallAumProviders, strategy, aumTier, minAumFilter, maxAumFilter, minRet, retPeriod]);

    const totalPages = Math.ceil(filtered.length / pageSize);
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    const stats = useMemo(() => {
        if (!data.length) return null;
        const threshold = AUM_THRESHOLD[strategy] ?? 50;
        const visible = showSmallAum ? data : data.filter(d => !smallAumProviders.has(d.portfolioManager));
        const valid1Y = visible.filter(d => d.ret1Y !== null);
        const avg1Y = valid1Y.length ? (valid1Y.reduce((s, d) => s + d.ret1Y, 0) / valid1Y.length).toFixed(1) : null;
        const totalAum = visible.reduce((s, d) => s + (d.aum ?? 0), 0);
        const beatBenchmark = valid1Y.filter(d => d.ret1Y > BENCHMARK_1Y).length;
        const hiddenCount = data.length - visible.length;
        return { count: visible.length, total: data.length, avg1Y, totalAum, beatBenchmark, hiddenCount };
    }, [data, showSmallAum, smallAumProviders, strategy]);

    const topPerformers = useMemo(() => {
        return [...filtered].filter(d => d.ret1Y !== null).sort((a, b) => b.ret1Y - a.ret1Y).slice(0, 4);
    }, [filtered]);

    const maxAum = useMemo(() => Math.max(...filtered.map(d => d.aum ?? 0), 1), [filtered]);

    const retPeriods = selected ? [
        { label: '1M', val: selected.ret1M },
        { label: '3M', val: selected.ret3M },
        { label: '6M', val: selected.ret6M },
        { label: '1 Year', val: selected.ret1Y },
        { label: '2 Years', val: selected.ret2Y },
        { label: '3 Years', val: selected.ret3Y },
        { label: '5 Years', val: selected.ret5Y },
        { label: 'Inception', val: selected.retInception },
    ].filter(r => r.val !== null) : [];

    const maxAbsRet = retPeriods.length ? Math.max(...retPeriods.map(r => Math.abs(r.val)), 1) : 1;

    function getPageNums() {
        const nums = []; const delta = 2;
        for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) nums.push(i);
        return nums;
    }

    const ThSort = ({ col, label, left }) => (
        <th onClick={() => handleSort(col)} className={sortCol === col ? 'col-active' : ''} style={left ? { textAlign: 'left' } : {}}>
            {label} <span className="sort-icon">{sortCol === col ? (sortDir === -1 ? '▼' : '▲') : '⇅'}</span>
        </th>
    );

    return (
        <>
            <main className="container" id="pms-screener-main" aria-label="PMS Screener — Portfolio Management Services Analytics">
                <Navbar activePage="pms-screener" />

                {/* Page Header */}
                <div className="page-header">
                    <div className="page-eyebrow">
                        <div className="live-dot"></div>
                        <span className="page-eyebrow-text">APMI Official Data · Feb 2026</span>
                    </div>
                    <h1 className="page-title">PMS <span>Screener</span></h1>
                    <p className="page-subtitle">
                        Institutional-grade analytics for Portfolio Management Services — compare {strategy} strategies across all time horizons, assess manager track records, and shortlist portfolios for wealth allocation.
                    </p>
                </div>

                {/* Strategy Tabs */}
                <nav className="controls-bar" style={{ marginBottom: '20px' }} aria-label="PMS Strategy Category Filter">
                    {STRATEGIES.map(s => (
                        <button key={s} onClick={() => setStrategy(s)} className={`cat-btn ${strategy === s ? 'active' : ''}`} aria-pressed={strategy === s}>{s}</button>
                    ))}
                </nav>

                {/* Summary Stats */}
                {!loading && !error && stats && (
                    <div className="pms-stat-strip">
                        <div className="pms-stat-tile">
                            <div className="pst-label">Strategies Shown</div>
                            <div className="pst-val">{stats.count}</div>
                            <div className="pst-sub">of {stats.total} total · {strategy}</div>
                        </div>
                        <div className="pms-stat-tile">
                            <div className="pst-label">Avg 1Y Return</div>
                            <div className="pst-val" style={{ color: parseFloat(stats.avg1Y) >= 0 ? 'var(--g1)' : 'var(--neg)' }}>
                                {stats.avg1Y ? `${stats.avg1Y}%` : '—'}
                            </div>
                            <div className="pst-sub">Across visible strategies</div>
                        </div>
                        <div className="pms-stat-tile">
                            <div className="pst-label">Beat Nifty 50</div>
                            <div className="pst-val">{stats.beatBenchmark}</div>
                            <div className="pst-sub">of {stats.count} vs {BENCHMARK_1Y}% benchmark</div>
                        </div>
                        <div className="pms-stat-tile">
                            <div className="pst-label">Combined AUM</div>
                            <div className="pst-val">{fmtAum(stats.totalAum)}</div>
                            <div className="pst-sub">Under management</div>
                        </div>
                    </div>
                )}

                {/* Top 4 performers — 2×2 grid, no horizontal scroll */}
                {!loading && !error && topPerformers.length > 0 && (
                    <div style={{ marginBottom: '28px' }}>
                        <div className="section-head">
                            <span className="section-title">🏆 Top Performers · 1Y Return</span>
                            <span className="section-badge">CLICK TO DEEP DIVE</span>
                        </div>
                        <div className="top-perf-grid">
                            {topPerformers.map((fund, i) => (
                                <div key={fund.id} className="winner-card" onClick={() => setSelected(fund)}>
                                    <div className="wc-label">#{i + 1} · {fund.portfolioManager}</div>
                                    <div className="wc-name">{fund.strategyName}</div>
                                    <div className="wc-footer">
                                        <span className="wc-ret">{fmtRet(fund.ret1Y)}</span>
                                        <span className="wc-aum">{fmtAum(fund.aum)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Controls Bar ── */}
                <section className="pms-controls" aria-label="Screener Filters">
                    {/* Strategy/text search */}
                    <input
                        type="search"
                        id="pms-search-input"
                        className="pms-search"
                        placeholder="Search strategy..."
                        aria-label="Search PMS strategies"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />

                    {/* Provider dropdown */}
                    <select
                        id="pms-provider-filter"
                        className="pms-provider-sel"
                        value={providerFilter}
                        onChange={e => setProviderFilter(e.target.value)}
                        aria-label="Filter by PMS provider"
                    >
                        <option value="">All Providers</option>
                        {providers.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    {/* AUM toggle */}
                    <button
                        className={`cat-btn ${showSmallAum ? 'active' : ''}`}
                        onClick={() => setShowSmallAum(v => !v)}
                        title={`AUM threshold: Equity ≥₹50Cr, Debt/Others ≥₹10Cr`}
                        style={{ fontSize: '.68rem' }}
                    >
                        {showSmallAum ? '👁 All Funds' : `🔍 Filtered (${stats?.hiddenCount ?? '…'} hidden)`}
                    </button>

                    {/* View toggle */}
                    <button className={`view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'} aria-label="Table view">Table</button>
                    <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} aria-label="Grid view">Grid</button>

                    <button
                        className={`view-btn ${showAdvanced ? 'active' : ''}`}
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <span>{showAdvanced ? '✕' : '⚙'} Filters</span>
                    </button>

                    <span className="pms-count-badge">{filtered.length} strategies</span>
                </section>

                {/* ── Advanced Filters Panel (Collapsible) ── */}
                {showAdvanced && (
                    <section className="advanced-filters-panel" aria-label="Advanced filtering options">
                        <div className="af-row">
                            <div className="af-group">
                                <label className="af-label">AUM Range</label>
                                <div className="af-options">
                                    {[
                                        { id: 'all', label: 'All' },
                                        { id: '<100', label: '< ₹100Cr' },
                                        { id: '100-500', label: '100 - 500Cr' },
                                        { id: '500-2000', label: '500 - 2K Cr' },
                                        { id: '>2000', label: 'Mega (> ₹2K Cr)' },
                                        { id: 'custom', label: 'Custom' }
                                    ].map(tier => (
                                        <button
                                            key={tier.id}
                                            className={`cat-btn ${aumTier === tier.id ? 'active' : ''}`}
                                            onClick={() => setAumTier(tier.id)}
                                            style={{ fontSize: '.68rem', padding: '6px 12px' }}
                                        >
                                            {tier.label}
                                        </button>
                                    ))}
                                </div>

                                {aumTier === 'custom' && (
                                    <div className="af-options" style={{ marginTop: '12px' }}>
                                        <div className="af-input-group">
                                            <span className="af-input-pfx">MIN</span>
                                            <input
                                                type="number"
                                                className="pms-search"
                                                style={{ margin: 0, height: '32px', width: '80px', textAlign: 'center', padding: '0 8px', fontSize: '.7rem' }}
                                                placeholder="0"
                                                value={minAumFilter}
                                                onChange={e => setMinAumFilter(e.target.value)}
                                            />
                                            <span className="af-input-sfx">Cr</span>
                                        </div>
                                        <div className="af-input-group">
                                            <span className="af-input-pfx">MAX</span>
                                            <input
                                                type="number"
                                                className="pms-search"
                                                style={{ margin: 0, height: '32px', width: '80px', textAlign: 'center', padding: '0 8px', fontSize: '.7rem' }}
                                                placeholder="∞"
                                                value={maxAumFilter}
                                                onChange={e => setMaxAumFilter(e.target.value)}
                                            />
                                            <span className="af-input-sfx">Cr</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="af-group">
                                <label className="af-label">Performance Threshold</label>
                                <div className="af-ret-controls">
                                    <select
                                        className="pms-provider-sel"
                                        style={{ margin: 0, height: '38px', minWidth: '140px' }}
                                        value={retPeriod}
                                        onChange={e => setRetPeriod(e.target.value)}
                                        aria-label="Filter return period"
                                    >
                                        <option value="ret1M">1 Month</option>
                                        <option value="ret3M">3 Months</option>
                                        <option value="ret6M">6 Months</option>
                                        <option value="ret1Y">1 Year</option>
                                        <option value="ret3Y">3 Years</option>
                                        <option value="ret5Y">5 Years</option>
                                    </select>
                                    
                                    <div className="af-input-group">
                                        <span className="af-input-pfx">MIN</span>
                                        <input
                                            type="number"
                                            className="pms-search"
                                            style={{ margin: 0, height: '38px', width: '70px', textAlign: 'center', padding: '0 10px' }}
                                            placeholder="0"
                                            value={minRet}
                                            onChange={e => setMinRet(e.target.value)}
                                        />
                                        <span className="af-input-sfx">%</span>
                                    </div>

                                    <button
                                        className="af-reset-btn"
                                        onClick={() => {
                                            setAumTier('all');
                                            setMinAumFilter('');
                                            setMaxAumFilter('');
                                            setMinRet('');
                                            setProviderFilter('');
                                            setSearch('');
                                        }}
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* AUM filter explanation */}
                {!showSmallAum && stats?.hiddenCount > 0 && (
                    <div className="insight-bar" style={{ marginBottom: '16px' }}>
                        <strong>{stats.hiddenCount} strategies</strong> from providers with all strategies &lt;₹{AUM_THRESHOLD[strategy]}Cr AUM are hidden (likely nascent/illiquid). Toggle <strong>"All Funds"</strong> to see them.
                    </div>
                )}

                {error && <div className="error-box">⚠ Failed to load data: {error}</div>}

                {/* Loading skeleton */}
                {loading && (
                    <div className="pms-table-card">
                        <table className="pms-table">
                            <tbody>
                                {[...Array(8)].map((_, i) => (
                                    <tr key={i} className="pms-loading-row">
                                        <td><div className="sk" style={{ width: '180px', height: '14px', marginBottom: '6px' }}></div><div className="sk" style={{ width: '120px', height: '10px' }}></div></td>
                                        {[...Array(7)].map((_, j) => <td key={j}><div className="sk" style={{ width: '52px', height: '13px', marginLeft: 'auto' }}></div></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── Table View ── */}
                {!loading && !error && viewMode === 'table' && (
                    <div className="pms-table-card">
                        <div className="pms-table-wrap">
                            <table className="pms-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 32, textAlign: "center", color: "var(--muted)", fontSize: ".65rem" }} title="Add to compare (max 3)">⚖</th>
                                        <ThSort col="strategyName" label="Strategy & Manager" left />
                                        <ThSort col="aum" label="AUM (Cr)" />
                                        <ThSort col="ret1M" label="1M" />
                                        <ThSort col="ret3M" label="3M" />
                                        <ThSort col="ret6M" label="6M" />
                                        <th onClick={() => handleSort('ret1Y')} className={sortCol === 'ret1Y' ? 'col-active' : ''} style={{ color: 'var(--g2)' }}>
                                            1Y <span className="sort-icon">{sortCol === 'ret1Y' ? (sortDir === -1 ? '▼' : '▲') : '⇅'}</span>
                                        </th>
                                        <ThSort col="ret3Y" label="3Y" />
                                        <ThSort col="ret5Y" label="5Y" />
                                        <ThSort col="retInception" label="Inception" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(fund => (
                                        <tr key={fund.id} onClick={() => setSelected(fund)} className={[selected?.id === fund.id ? 'row-selected' : '', isComparing(fund.id) ? 'row-comparing' : ''].join(' ')}>
                                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center', paddingLeft: 8, paddingRight: 4 }}>
                                                <input type="checkbox" className="cmp-chk" checked={isComparing(fund.id)} onChange={e => toggleCompare(fund, e)} disabled={!isComparing(fund.id) && compareList.length >= MAX_COMPARE} title={isComparing(fund.id) ? 'Remove from compare' : compareList.length >= MAX_COMPARE ? 'Max 3 selected' : 'Add to compare'} aria-label={`Compare ${fund.strategyName}`} />
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                    <div className="pms-avatar">{initials(fund.portfolioManager)}</div>
                                                    <div>
                                                        <span className="pms-strat-name">{fund.strategyName}</span>
                                                        <span className="pms-strat-mgr">{fund.portfolioManager}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="aum-inline">
                                                    <div className="aum-bar-bg">
                                                        <div className="aum-bar-fill" style={{ width: `${Math.round((fund.aum ?? 0) / maxAum * 100)}%` }}></div>
                                                    </div>
                                                    {fmtAum(fund.aum)}
                                                </div>
                                            </td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret1M)}`}>{fmtRet(fund.ret1M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret3M)}`}>{fmtRet(fund.ret3M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret6M)}`}>{fmtRet(fund.ret6M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret1Y)}`}>{fmtRet(fund.ret1Y)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret3Y)}`}>{fmtRet(fund.ret3Y)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret5Y)}`}>{fmtRet(fund.ret5Y)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.retInception)}`}>{fmtRet(fund.retInception)}</span></td>
                                        </tr>
                                    ))}
                                    {paginated.length === 0 && (
                                        <tr><td colSpan={9} style={{ textAlign: 'center', padding: '56px', color: 'var(--muted)', fontFamily: 'Raleway' }}>No strategies match your filters.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="pms-pagination">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span className="pg-info">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
                                    <select className="pg-size-sel" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                                        {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} per page</option>)}
                                    </select>
                                </div>
                                <div className="pg-controls">
                                    <button className="pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                                    <button className="pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                                    {getPageNums().map(n => <button key={n} className={`pg-btn${n === page ? ' active' : ''}`} onClick={() => setPage(n)}>{n}</button>)}
                                    <button className="pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                                    <button className="pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Grid View ── */}
                {!loading && !error && viewMode === 'grid' && (
                    <>
                        <div className="pms-grid-view">
                            {paginated.map(fund => (
                                <div key={fund.id} className="pms-grid-card" onClick={() => setSelected(fund)}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '14px' }}>
                                        <div className="pms-avatar">{initials(fund.portfolioManager)}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="gc-name">{fund.strategyName}</div>
                                            <div className="gc-mgr">{fund.portfolioManager}</div>
                                        </div>
                                    </div>
                                    <div className="gc-divider"></div>
                                    <div className="gc-metrics">
                                        <div className="gc-metric">
                                            <div className="gc-m-label">3M</div>
                                            <div className={`gc-m-val ${(fund.ret3M ?? 0) >= 0 ? 'cagr-pos' : 'cagr-neg'}`}>{fmtRet(fund.ret3M)}</div>
                                        </div>
                                        <div className="gc-metric">
                                            <div className="gc-m-label">1Y</div>
                                            <div className={`gc-m-val ${(fund.ret1Y ?? 0) >= 0 ? 'cagr-pos' : 'cagr-neg'}`}>{fmtRet(fund.ret1Y)}</div>
                                        </div>
                                        <div className="gc-metric">
                                            <div className="gc-m-label">5Y</div>
                                            <div className={`gc-m-val ${(fund.ret5Y ?? 0) >= 0 ? 'cagr-pos' : 'cagr-neg'}`}>{fmtRet(fund.ret5Y)}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {paginated.length === 0 && (
                                <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                                    <div className="empty-icon">🔍</div>
                                    <div className="empty-title">No strategies found</div>
                                    <div className="empty-sub">Try adjusting your search or filters.</div>
                                </div>
                            )}
                        </div>
                        {totalPages > 1 && (
                            <div className="pms-pagination" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '14px' }}>
                                <span className="pg-info">Page {page} of {totalPages} · {filtered.length} results</span>
                                <div className="pg-controls">
                                    <button className="pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹ Prev</button>
                                    {getPageNums().map(n => <button key={n} className={`pg-btn${n === page ? ' active' : ''}`} onClick={() => setPage(n)}>{n}</button>)}
                                    <button className="pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next ›</button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {!loading && !error && (
                    <div className="src-line">
                        <div className="src-dot"></div>
                        Source: APMI India · Discretionary {strategy} strategies · February 2026 · TWRR methodology
                    </div>
                )}
            </main>

            {/* ══ Compare Bar (floats at bottom) ══ */}
            <PMSCompareBar
                selected={compareList}
                onRemove={removeFromCompare}
                onClear={clearCompare}
                onCompare={() => setShowCompare(true)}
            />

            {/* ══ Compare Modal ══ */}
            {showCompare && compareList.length >= 2 && (
                <PMSCompareModal
                    funds={compareList}
                    onClose={() => setShowCompare(false)}
                    onRemove={id => { removeFromCompare(id); if (compareList.length <= 2) setShowCompare(false); }}
                />
            )}

            {/* ══ Slide-out Drawer ══ */}
            <div className={`pms-drawer-backdrop${selected ? ' open' : ''}`} onClick={() => setSelected(null)}></div>
            <div className={`pms-drawer${selected ? ' open' : ''}`}>
                <div className="pd-band"></div>
                {selected && (
                    <>
                        <div className="pd-header">
                            <button className="pd-close" onClick={() => setSelected(null)}>×</button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div className="pd-avatar-lg">{initials(selected.portfolioManager)}</div>
                                <img src="/logo-navbar.png" alt="Abundance" className="pd-logo" style={{ marginBottom: 0 }} />
                            </div>
                            <div className="pd-provider">{selected.portfolioManager}</div>
                            <div className="pd-name">{selected.strategyName}</div>
                            <div className="pd-metrics">
                                <div className="pd-metric">
                                    <div className="pdm-label">AUM</div>
                                    <div className="pdm-val">{fmtAum(selected.aum)}</div>
                                </div>
                                <div className="pd-metric">
                                    <div className="pdm-label">1Y Return</div>
                                    <div className="pdm-val" style={{ color: (selected.ret1Y ?? 0) >= 0 ? 'var(--g2)' : 'var(--neg)' }}>{fmtRet(selected.ret1Y)}</div>
                                </div>
                                <div className="pd-metric">
                                    <div className="pdm-label">vs Nifty 50</div>
                                    <div className="pdm-val" style={{ color: (selected.ret1Y ?? 0) > BENCHMARK_1Y ? 'var(--g2)' : 'var(--neg)' }}>
                                        {selected.ret1Y !== null ? `${(selected.ret1Y - BENCHMARK_1Y).toFixed(1)}%` : '—'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="pd-body">
                            <div className="pd-section-head">Returns Across All Time Horizons</div>
                            <div className="pd-ret-bars">
                                {retPeriods.map(rp => (
                                    <div key={rp.label} className="pd-ret-row">
                                        <span className="pd-ret-lbl">{rp.label}</span>
                                        <div className="pd-ret-bar-wrap">
                                            <div className={`pd-ret-bar-fill${rp.val < 0 ? ' neg' : ''}`} style={{ width: `${Math.round(Math.abs(rp.val) / maxAbsRet * 100)}%` }}></div>
                                        </div>
                                        <span className="pd-ret-val" style={{ color: rp.val >= 0 ? 'var(--g2)' : 'var(--neg)' }}>{fmtRet(rp.val)}</span>
                                    </div>
                                ))}
                            </div>

                            {selected.ret1Y !== null && (
                                <>
                                    <div className="pd-section-head">Wealth Creation Simulation · ₹50 Lakh</div>
                                    <div className="sim-card">
                                        <div className="sim-label">₹50,00,000 invested 1 year ago is today worth:</div>
                                        <div className="sim-result">₹{(5000000 * (1 + selected.ret1Y / 100)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                        <div className={`sim-gain${selected.ret1Y < 0 ? ' neg' : ''}`}>
                                            {selected.ret1Y >= 0 ? '+' : ''}₹{Math.abs(Math.round(5000000 * selected.ret1Y / 100)).toLocaleString('en-IN')} gain
                                        </div>
                                    </div>
                                </>
                            )}

                            {selected.apmiLink && (
                                <>
                                    <div className="pd-section-head">Official Source</div>
                                    <a href={(() => {
                                        if (selected.apmiLink.startsWith('http')) return selected.apmiLink;
                                        // Handle legacy cached relative links
                                        const cleanPath = selected.apmiLink.startsWith('/') ? selected.apmiLink.slice(1) : selected.apmiLink;
                                        // Most APMI relative links need the /apmi/ prefix if not already present
                                        if (cleanPath.startsWith('apmi/')) return `https://www.apmiindia.org/${cleanPath}`;
                                        return `https://www.apmiindia.org/apmi/${cleanPath}`;
                                    })()}
                                        target="_blank" rel="noopener noreferrer" className="apmi-link-btn">
                                        View on APMI India ↗
                                    </a>
                                </>
                            )}

                            <div className="pd-source" style={{ marginTop: '28px' }}>
                                <strong>Disclosure:</strong> Data from APMI India · Discretionary {strategy} strategies · Feb 2026 · TWRR, net of all fees. Past performance is not indicative of future results. Min PMS investment ₹50L per SEBI.
                            </div>
                        </div>
                    </>
                )}
            </div>

            <Footer />
        </>
    );
}