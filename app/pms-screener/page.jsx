'use client';
/**
 * app/pms-screener/page.jsx
 *
 * Changes from original:
 *  1. URL state — strategy and search query are reflected in URL params
 *     (?strategy=Debt, ?q=mirae). Enables the SearchAction schema, shareable
 *     filtered links, and browser back/forward support.
 *
 *  2. Dynamic data month — uses getLatestPmsDataDate() instead of hardcoded
 *     "2026-2-28". Today is April 13 → March 2026 data is fetched correctly.
 *
 *  3. FAQ section — rendered HTML matching the FAQPage JSON-LD in layout.jsx.
 *     Collapsible accordion. Google needs matching HTML to award rich snippets.
 *
 *  NOTE: useSearchParams requires this page to be wrapped in <Suspense>.
 *  The existing loading.jsx acts as the fallback. If Next.js build warns about
 *  static rendering, wrap the export in <Suspense fallback={<Loading />}>.
 */

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { PMSCompareBar, PMSCompareModal } from './PMSCompare';
import { getPmsDataMonths } from '@/lib/pmsDate';
import { PMS_FAQ } from '@/lib/pmsFaq';
import './pms-screener.css';

// ── Constants ─────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [15, 25, 50];
const AUM_THRESHOLD = { Equity: 50, Debt: 10, 'Multi Asset': 10, Hybrid: 10 };
const STRATEGIES = ['Equity', 'Debt', 'Multi Asset', 'Hybrid'];
const MAX_COMPARE = 3;

// Return-period columns in display order. AUM/1M/3M/6M/1Y/3Y are always
// visible; the rest are opt-in via checkboxes in the advanced filters panel.
const RETURN_COLUMNS = [
    { key: 'ret1M',        label: '1M',        optional: false },
    { key: 'ret3M',        label: '3M',        optional: false },
    { key: 'ret6M',        label: '6M',        optional: false },
    { key: 'ret1Y',        label: '1Y',        optional: false },
    { key: 'ret2Y',        label: '2Y',        optional: true },
    { key: 'ret3Y',        label: '3Y',        optional: false },
    { key: 'ret4Y',        label: '4Y',        optional: true },
    { key: 'ret5Y',        label: '5Y',        optional: true },
    { key: 'retInception', label: 'Inception', optional: true },
];
const OPTIONAL_RETURN_COLUMNS = RETURN_COLUMNS.filter(c => c.optional);

// Broad-market TRI benchmarks shown for reference (live from /api/index-dashboard).
// APMI doesn't attribute one "correct" benchmark per PMS category, so these are
// shown as general reference points rather than a pass/fail comparison.
const BENCHMARK_NAMES = ['NIFTY 50', 'Nifty 500', 'Nifty Smallcap 250', 'Nifty Midcap 150'];

// PMS_FAQ is imported from lib/pmsFaq.js — single source of truth for HTML accordion + JSON-LD.

// ── Helpers ───────────────────────────────────────────────────────────────
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

// ── Collapsible FAQ item ──────────────────────────────────────────────────
function PMSFaqItem({ question, answer }) {
    const [open, setOpen] = useState(false);
    return (
        <div
            className={`pms-faq-item${open ? ' open' : ''}`}
        >
            <button
                className="pms-faq-q"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                {question}
                <span className="pms-faq-icon" aria-hidden="true">{open ? '−' : '+'}</span>
            </button>
            <div
                className="pms-faq-a"
                hidden={!open}
            >
                <p>{answer}</p>
            </div>
        </div>
    );
}

// ── Sort header — defined outside the component so React doesn't treat
// it as a new component type on every render (which causes re-mounts).
function ThSort({ col, label, left, highlight, sortCol, sortDir, onSort }) {
    return (
        <th
            onClick={() => onSort(col)}
            className={sortCol === col ? 'col-active' : ''}
            style={{ ...(left ? { textAlign: 'left' } : {}), ...(highlight ? { color: 'var(--g2)' } : {}) }}
        >
            {label} <span className="sort-icon">{sortCol === col ? (sortDir === -1 ? '▼' : '▲') : '⇅'}</span>
        </th>
    );
}

// ── Inner component — uses useSearchParams so it must sit inside <Suspense> ──
function PMSScreenerInner() {
    // ── URL state (SEO: strategy + search reflected in URL) ──────────────
    const searchParams = useSearchParams();
    const router = useRouter();

    // Compute both data months once — latest (may be partial) and prev (settled)
    const dataMonths = useMemo(() => getPmsDataMonths(), []);

    // Read strategy from URL (?strategy=Debt); validate against known list
    const urlStrategy = searchParams.get('strategy');
    const [strategy, setStrategyState] = useState(
        () => STRATEGIES.includes(urlStrategy) ? urlStrategy : 'Equity'
    );

    // Read search from URL (?q=mirae)
    const [search, setSearch] = useState(() => searchParams.get('q') || '');

    /** Update strategy + URL param; reset search when switching category */
    function setStrategy(s) {
        setStrategyState(s);
        setSearch('');
        const params = new URLSearchParams(searchParams.toString());
        s === 'Equity' ? params.delete('strategy') : params.set('strategy', s);
        params.delete('q');
        // params.size is not supported in all browsers; use params.toString() instead
        router.replace(`/pms-screener${params.toString() ? '?' + params : ''}`, { scroll: false });
    }

    /** Update search + URL param */
    function handleSearchChange(q) {
        setSearch(q);
        const params = new URLSearchParams(searchParams.toString());
        q ? params.set('q', q) : params.delete('q');
        router.replace(`/pms-screener${params.toString() ? '?' + params : ''}`, { scroll: false });
    }

    // ── Local UI state ────────────────────────────────────────────────────
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [providerFilter, setProviderFilter] = useState('');
    const [viewMode, setViewMode] = useState('table');
    const [sortCol, setSortCol] = useState('ret1Y');
    const [sortDir, setSortDir] = useState(-1);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [showSmallAum, setShowSmallAum] = useState(false);
    const [compareList, setCompareList] = useState([]);
    const [showCompare, setShowCompare] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [extraCols, setExtraCols] = useState(() => new Set());
    const [benchmarks, setBenchmarks] = useState(null);
    const [drawerBenchmark, setDrawerBenchmark] = useState({ loading: false, value: null });

    function toggleExtraCol(key) {
        setExtraCols(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    }

    // Advanced filter state
    const [aumTier, setAumTier] = useState('all');
    const [minAumFilter, setMinAumFilter] = useState('');
    const [maxAumFilter, setMaxAumFilter] = useState('');
    const [minRet, setMinRet] = useState('');
    const [retPeriod, setRetPeriod] = useState('ret1Y');

    // ── Compare helpers ───────────────────────────────────────────────────
    const toggleCompare = useCallback((fund, e) => {
        e.stopPropagation();
        setCompareList(prev => {
            const already = prev.find(f => f.id === fund.id);
            if (already) return prev.filter(f => f.id !== fund.id);
            if (prev.length >= MAX_COMPARE) return prev;
            return [...prev, fund];
        });
    }, []);
    const isComparing = useCallback(id => compareList.some(f => f.id === id), [compareList]);
    const removeFromCompare = useCallback(id => setCompareList(prev => prev.filter(f => f.id !== id)), []);
    const clearCompare = useCallback(() => setCompareList([]), []);

    // ── Data fetch ────────────────────────────────────────────────────────
    // Fetches both months in parallel, then merges: each strategy uses its
    // most recently available data. Strategies missing from the latest month
    // fall back to the previous month and are tagged dataMonth='prev'.
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const post = (m, isPartial) => fetch('/api/pms-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    strategy,
                    month   : String(m.month),
                    year    : String(m.year),
                    asOnDate: m.asOnDate,
                    isReportingWindow: isPartial,
                }),
            });

            const [latestRes, prevRes] = await Promise.all([
                post(dataMonths.latest, true),  // latest month — short cache, data still coming in
                post(dataMonths.prev,   false), // prev month   — settled, 30-day cache
            ]);

            const [latestJson, prevJson] = await Promise.all([
                latestRes.json(), prevRes.json(),
            ]);

            if (latestJson.status !== 'success') throw new Error(latestJson.message || 'API error');
            if (prevJson.status   !== 'success') throw new Error(prevJson.message   || 'API error');

            // Build lookup of strategies already present in latest month
            const latestKeys = new Set(
                latestJson.data.map(d => `${d.portfolioManager}|||${d.strategyName}`)
            );

            // Merge: latest-month rows first, then prev-month rows not yet in latest
            const merged = [
                ...latestJson.data.map(d => ({ ...d, dataMonth: 'latest' })),
                ...prevJson.data
                    .filter(d => !latestKeys.has(`${d.portfolioManager}|||${d.strategyName}`))
                    .map(d => ({ ...d, dataMonth: 'prev' })),
            ];

            setData(merged);
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    }, [strategy, dataMonths]);

    // ── Effects ───────────────────────────────────────────────────────────
    useEffect(() => {
        setPage(1);
        setProviderFilter('');
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setPage(1);
    }, [search, providerFilter, sortCol, sortDir, showSmallAum, aumTier, minAumFilter, maxAumFilter, minRet, retPeriod]);

    // Auto-toggle showSmallAum when advanced filters are active
    useEffect(() => {
        const hasAdvanced = aumTier !== 'all' || minAumFilter !== '' || maxAumFilter !== '' || minRet !== '';
        setShowSmallAum(hasAdvanced);
    }, [aumTier, minAumFilter, maxAumFilter, minRet]);

    // ── Benchmark data — live TRI returns, fetched once (not per-strategy) ──
    useEffect(() => {
        fetch('/api/index-dashboard')
            .then(r => r.json())
            .then(json => {
                if (!json?.indices) return;
                const found = BENCHMARK_NAMES
                    .map(name => {
                        const idx = json.indices.find(i => i.name.toLowerCase() === name.toLowerCase());
                        return idx ? { name, r1y: idx.returns.r1y, r3y: idx.returns.r3y, r5y: idx.returns.r5y } : null;
                    })
                    .filter(Boolean);
                setBenchmarks(found.length ? found : null);
            })
            .catch(() => setBenchmarks(null));
    }, []);

    // ── Drawer: per-strategy benchmark — lazy-fetched only when the drawer
    // opens for that strategy (each one is a separate APMI request, unlike
    // the bulk /api/pms-data table, so we don't fetch these upfront). Cached
    // server-side per IAID, so re-opening the same strategy is instant.
    useEffect(() => {
        if (!selected?.apmiLink) {
            setDrawerBenchmark({ loading: false, value: null });
            return;
        }
        let iaid;
        try {
            iaid = new URL(selected.apmiLink).searchParams.get('IAID');
        } catch {
            iaid = null;
        }
        if (!iaid) {
            setDrawerBenchmark({ loading: false, value: null });
            return;
        }
        let cancelled = false;
        setDrawerBenchmark({ loading: true, value: null });
        fetch(`/api/pms-benchmark?iaid=${encodeURIComponent(iaid)}`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                setDrawerBenchmark({ loading: false, value: json.status === 'success' ? json.benchmark : null });
            })
            .catch(() => { if (!cancelled) setDrawerBenchmark({ loading: false, value: null }); });
        return () => { cancelled = true; };
    }, [selected]);

    // ── Sort ──────────────────────────────────────────────────────────────
    function handleSort(col) {
        if (sortCol === col) setSortDir(d => d * -1);
        else { setSortCol(col); setSortDir(-1); }
    }

    // ── AUM provider filter ───────────────────────────────────────────────
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

    const providers = useMemo(() => {
        const visible = showSmallAum ? data : data.filter(d => !smallAumProviders.has(d.portfolioManager));
        return [...new Set(visible.map(d => d.portfolioManager))].sort();
    }, [data, smallAumProviders, showSmallAum]);

    // ── Filtered + sorted data ────────────────────────────────────────────
    const filtered = useMemo(() => {
        let arr = [...data];

        if (!showSmallAum) arr = arr.filter(d => !smallAumProviders.has(d.portfolioManager));
        if (providerFilter) arr = arr.filter(d => d.portfolioManager === providerFilter);

        if (search.trim()) {
            const q = search.toLowerCase();
            arr = arr.filter(d =>
                (d.strategyName || '').toLowerCase().includes(q) ||
                (d.portfolioManager || '').toLowerCase().includes(q)
            );
        }

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

        if (minRet !== '') {
            const threshold = parseFloat(minRet);
            if (!isNaN(threshold)) arr = arr.filter(d => (d[retPeriod] ?? -Infinity) >= threshold);
        }

        arr.sort((a, b) => {
            const av = a[sortCol];
            const bv = b[sortCol];
            // Missing values always sort last, regardless of direction — a -Infinity/0
            // fallback would flip which end they land on depending on sortDir, making
            // no-data funds look like top performers in the default (▼) view.
            const aMissing = av === null || av === undefined || av === '';
            const bMissing = bv === null || bv === undefined || bv === '';
            if (aMissing && bMissing) return 0;
            if (aMissing) return 1;
            if (bMissing) return -1;
            return typeof av === 'string' ? sortDir * av.localeCompare(bv) : sortDir * (av - bv);
        });

        return arr;
    }, [data, search, providerFilter, sortCol, sortDir, showSmallAum, smallAumProviders, strategy, aumTier, minAumFilter, maxAumFilter, minRet, retPeriod]);

    const totalPages = Math.ceil(filtered.length / pageSize);
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    // ── Stats strip ───────────────────────────────────────────────────────
    const stats = useMemo(() => {
        if (!data.length) return null;
        const visible = showSmallAum ? data : data.filter(d => !smallAumProviders.has(d.portfolioManager));
        const valid1Y = visible.filter(d => d.ret1Y !== null);
        const avg1Y = valid1Y.length ? (valid1Y.reduce((s, d) => s + d.ret1Y, 0) / valid1Y.length).toFixed(1) : null;
        const totalAum = visible.reduce((s, d) => s + (d.aum ?? 0), 0);
        const latestCount = visible.filter(d => d.dataMonth === 'latest').length;
        return {
            count: visible.length,
            total: data.length,
            avg1Y,
            totalAum,
            hiddenCount: data.length - visible.length,
            latestCount,
            prevCount: visible.length - latestCount,
        };
    }, [data, showSmallAum, smallAumProviders]);

    const topByPeriod = useMemo(() => {
        const rank = field => [...filtered].filter(d => d[field] !== null).sort((a, b) => b[field] - a[field]).slice(0, 3);
        return { ret1Y: rank('ret1Y'), ret3Y: rank('ret3Y'), ret5Y: rank('ret5Y') };
    }, [filtered]);

    const maxAum = useMemo(() => Math.max(...filtered.map(d => d.aum ?? 0), 1), [filtered]);

    // ── Table column visibility ──────────────────────────────────────────
    const visibleReturnCols = useMemo(() =>
        RETURN_COLUMNS.filter(c => !c.optional || extraCols.has(c.key)),
        [extraCols]
    );

    // ── Drawer ret periods ────────────────────────────────────────────────
    const retPeriods = selected ? [
        { label: '1M', val: selected.ret1M },
        { label: '3M', val: selected.ret3M },
        { label: '6M', val: selected.ret6M },
        { label: '1 Year', val: selected.ret1Y },
        { label: '2 Years', val: selected.ret2Y },
        { label: '3 Years', val: selected.ret3Y },
        { label: '5 Years', val: selected.ret5Y },
        { label: 'Inception', val: selected.retInception },
    // Use != null (loose) to also exclude undefined coming from missing API fields
    ].filter(r => r.val != null) : [];

    const maxAbsRet = retPeriods.length ? Math.max(...retPeriods.map(r => Math.abs(r.val)), 1) : 1;

    // ── Pagination ────────────────────────────────────────────────────────
    function getPageNums() {
        const nums = []; const delta = 2;
        for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) nums.push(i);
        return nums;
    }

    // ThSort is now defined outside this component (above) to prevent re-mounts.

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <>
            <main
                className="container"
                id="pms-screener-main"
                aria-label="PMS Screener — Portfolio Management Services Analytics"
            >
                <Navbar activePage="pms-screener" />

                {/* ── Page Header ── */}
                <div className="page-header">
                    <div className="page-eyebrow">
                        <div className="live-dot"></div>
                        <span className="page-eyebrow-text">APMI Official Data · {dataMonths.latest.shortLabel} / {dataMonths.prev.shortLabel} · Per strategy</span>
                    </div>
                    <h1 className="page-title">PMS <span>Screener</span></h1>
                    <p className="page-subtitle">
                        Institutional-grade analytics for Portfolio Management Services — compare {strategy} strategies
                        across all time horizons, assess manager track records, and shortlist portfolios for wealth allocation.
                    </p>
                </div>

                {/* ── Strategy Tabs (URL-backed) ── */}
                <nav className="controls-bar" style={{ marginBottom: '20px' }} aria-label="PMS Strategy Category Filter">
                    {STRATEGIES.map(s => (
                        <button
                            key={s}
                            onClick={() => setStrategy(s)}
                            className={`cat-btn ${strategy === s ? 'active' : ''}`}
                            aria-pressed={strategy === s}
                        >
                            {s}
                        </button>
                    ))}
                </nav>

                {/* ── Summary Stats ── */}
                {!loading && !error && stats && (
                    <div className="pms-stat-bar">
                        <div className="pms-stat-seg">
                            <div className="pss-label">Strategies Shown</div>
                            <div className="pss-val">{stats.count}</div>
                            <div className="pss-sub">of {stats.total} total · {strategy}</div>
                        </div>
                        <div className="pms-stat-seg">
                            <div className="pss-label">Avg 1Y Return</div>
                            <div className="pss-val" style={{ color: parseFloat(stats.avg1Y) >= 0 ? 'var(--g1)' : 'var(--neg)' }}>
                                {stats.avg1Y ? `${stats.avg1Y}%` : '—'}
                            </div>
                            <div className="pss-sub">Across visible strategies</div>
                        </div>
                        <div className="pms-stat-seg">
                            <div className="pss-label">Combined AUM</div>
                            <div className="pss-val">{fmtAum(stats.totalAum)}</div>
                            <div className="pss-sub">Under management</div>
                        </div>
                        <div className="pms-stat-seg">
                            <div className="pss-label">Data Coverage</div>
                            <div className="pss-val">
                                {stats.latestCount} <span style={{ fontSize: '.65rem', color: 'var(--pms-muted)', fontWeight: 400 }}>/ {stats.prevCount}</span>
                            </div>
                            <div className="pss-sub">{dataMonths.latest.shortLabel} / {dataMonths.prev.shortLabel} reporting</div>
                        </div>
                    </div>
                )}

                {/* ── Benchmark reference panel — live TRI data, no pass/fail framing ── */}
                {!loading && !error && benchmarks && (
                    <div style={{ marginBottom: '20px' }}>
                        <div className="pms-bench-head">Broad Market TRI · 3Y &amp; 5Y are CAGR</div>
                        <div className="pms-bench-grid">
                            {benchmarks.map(b => (
                                <div key={b.name} className="pms-bench-card">
                                    <div className="pms-bench-name">{b.name}</div>
                                    <div className="pms-bench-rets">
                                        <div className="pms-bench-row"><span className="pms-bench-p">1Y</span><span className={`pms-bench-v ${(b.r1y ?? 0) >= 0 ? 'g' : 'r'}`}>{fmtRet(b.r1y)}</span></div>
                                        <div className="pms-bench-row"><span className="pms-bench-p">3Y</span><span className={`pms-bench-v ${(b.r3y ?? 0) >= 0 ? 'g' : 'r'}`}>{fmtRet(b.r3y)}</span></div>
                                        <div className="pms-bench-row"><span className="pms-bench-p">5Y</span><span className={`pms-bench-v ${(b.r5y ?? 0) >= 0 ? 'g' : 'r'}`}>{fmtRet(b.r5y)}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Top Performers by period ── */}
                {!loading && !error && (topByPeriod.ret1Y.length > 0 || topByPeriod.ret3Y.length > 0 || topByPeriod.ret5Y.length > 0) && (
                    <div style={{ marginBottom: '28px' }}>
                        <div className="section-head">
                            <span className="section-title">🏆 Top Performers · By Period</span>
                            <span className="section-badge">CLICK TO DEEP DIVE</span>
                        </div>
                        <div className="pms-mini-grid">
                            {[
                                { period: 'ret1Y', title: '1 Year',  list: topByPeriod.ret1Y },
                                { period: 'ret3Y', title: '3 Years', list: topByPeriod.ret3Y },
                                { period: 'ret5Y', title: '5 Years', list: topByPeriod.ret5Y },
                            ].map(col => (
                                <div key={col.period} className="pms-mini-col">
                                    <div className="pms-mini-title">{col.title}</div>
                                    {col.list.length === 0 && <div className="pms-mini-empty">No data</div>}
                                    {col.list.map((fund, i) => (
                                        <div key={fund.id} className="pms-mini-item" onClick={() => setSelected(fund)}>
                                            <span>
                                                <span className="pms-mini-name"><span className="pms-mini-rank">{i + 1}.</span>{fund.strategyName}</span>
                                                <span className="pms-mini-mgr">{fund.portfolioManager}</span>
                                            </span>
                                            <span className="pms-mini-ret">{fmtRet(fund[col.period])}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Controls Bar ── */}
                <section className="pms-controls" aria-label="Screener Filters">
                    <input
                        type="search"
                        id="pms-search-input"
                        className="pms-search"
                        placeholder="Search strategy or manager..."
                        aria-label="Search PMS strategies"
                        value={search}
                        onChange={e => handleSearchChange(e.target.value)}
                    />
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
                    <button
                        className={`cat-btn ${showSmallAum ? 'active' : ''}`}
                        onClick={() => setShowSmallAum(v => !v)}
                        title={`AUM threshold: Equity ≥₹50Cr, Debt/Others ≥₹10Cr`}
                        style={{ fontSize: '.68rem' }}
                    >
                        {showSmallAum ? '👁 All Funds' : `🔍 Filtered (${stats?.hiddenCount ?? '…'} hidden)`}
                    </button>
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

                {/* ── Advanced Filters ── */}
                {showAdvanced && (
                    <section className="advanced-filters-panel" aria-label="Advanced filtering options">
                        <div className="af-row">
                            <div className="af-group">
                                <label className="af-label">AUM Range</label>
                                <div className="af-options">
                                    {[
                                        { id: 'all', label: 'All' },
                                        { id: '<100', label: '< ₹100Cr' },
                                        { id: '100-500', label: '100 – 500 Cr' },
                                        { id: '500-2000', label: '500 – 2K Cr' },
                                        { id: '>2000', label: 'Mega (> ₹2K Cr)' },
                                        { id: 'custom', label: 'Custom' },
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
                                            <input type="number" className="pms-search" style={{ margin: 0, height: '32px', width: '80px', textAlign: 'center', padding: '0 8px', fontSize: '.7rem' }} placeholder="0" value={minAumFilter} onChange={e => setMinAumFilter(e.target.value)} />
                                            <span className="af-input-sfx">Cr</span>
                                        </div>
                                        <div className="af-input-group">
                                            <span className="af-input-pfx">MAX</span>
                                            <input type="number" className="pms-search" style={{ margin: 0, height: '32px', width: '80px', textAlign: 'center', padding: '0 8px', fontSize: '.7rem' }} placeholder="∞" value={maxAumFilter} onChange={e => setMaxAumFilter(e.target.value)} />
                                            <span className="af-input-sfx">Cr</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="af-group">
                                <label className="af-label">Performance Threshold</label>
                                <div className="af-ret-controls">
                                    <select className="pms-provider-sel" style={{ margin: 0, height: '38px', minWidth: '140px' }} value={retPeriod} onChange={e => setRetPeriod(e.target.value)} aria-label="Filter return period">
                                        <option value="ret1M">1 Month</option>
                                        <option value="ret3M">3 Months</option>
                                        <option value="ret6M">6 Months</option>
                                        <option value="ret1Y">1 Year</option>
                                        <option value="ret3Y">3 Years</option>
                                        <option value="ret5Y">5 Years</option>
                                    </select>
                                    <div className="af-input-group">
                                        <span className="af-input-pfx">MIN</span>
                                        <input type="number" className="pms-search" style={{ margin: 0, height: '38px', width: '70px', textAlign: 'center', padding: '0 10px' }} placeholder="0" value={minRet} onChange={e => setMinRet(e.target.value)} />
                                        <span className="af-input-sfx">%</span>
                                    </div>
                                    <button className="af-reset-btn" onClick={() => {
                                        setAumTier('all');
                                        setMinAumFilter('');
                                        setMaxAumFilter('');
                                        setMinRet('');
                                        setProviderFilter('');
                                        setSearch('');
                                        setExtraCols(new Set());
                                        // Also clear strategy and search from URL
                                        router.replace('/pms-screener', { scroll: false });
                                    }}>
                                        Clear All
                                    </button>
                                </div>
                            </div>
                            <div className="af-group">
                                <label className="af-label">Return Periods Shown</label>
                                <div className="af-options">
                                    {OPTIONAL_RETURN_COLUMNS.map(col => (
                                        <label key={col.key} className={`af-col-chk ${extraCols.has(col.key) ? 'active' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={extraCols.has(col.key)}
                                                onChange={() => toggleExtraCol(col.key)}
                                            />
                                            {col.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── AUM insight bar ── */}
                {!showSmallAum && stats?.hiddenCount > 0 && (
                    <div className="insight-bar" style={{ marginBottom: '16px' }}>
                        <strong>{stats.hiddenCount} strategies</strong> from providers with all strategies &lt;₹{AUM_THRESHOLD[strategy]}Cr AUM are hidden (likely nascent/illiquid). Toggle <strong>"All Funds"</strong> to see them.
                    </div>
                )}

                {error && <div className="error-box">⚠ Failed to load data: {error}</div>}

                {/* ── Loading skeleton ── */}
                {loading && (
                    <div className="pms-table-card">
                        <table className="pms-table">
                            <tbody>
                                {[...Array(8)].map((_, i) => (
                                    <tr key={i} className="pms-loading-row">
                                        <td><div className="sk" style={{ width: '180px', height: '14px', marginBottom: '6px' }}></div><div className="sk" style={{ width: '120px', height: '10px' }}></div></td>
                                        {[...Array(visibleReturnCols.length)].map((_, j) => <td key={j}><div className="sk" style={{ width: '52px', height: '13px', marginLeft: 'auto' }}></div></td>)}
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
                            <table className="pms-table" style={{ minWidth: 36 + 200 + 110 + 72 * visibleReturnCols.length }}>
                                {/*
                                  colgroup locks column widths once — browser reads these under
                                  table-layout: fixed and never recalculates them from cell content.
                                  Return columns are dynamic per visibleReturnCols (checkboxes in
                                  the advanced filters panel control which optional periods show).
                                */}
                                <colgroup>
                                    <col style={{ width: 36 }} />   {/* ⚖ compare */}
                                    <col style={{ width: 200 }} />  {/* Strategy & Manager */}
                                    <col style={{ width: 110 }} />  {/* AUM */}
                                    {visibleReturnCols.map(c => <col key={c.key} style={{ width: 72 }} />)}
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                                        <ThSort col="strategyName" label="Strategy & Manager" left sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="aum" label="AUM (Cr)" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        {visibleReturnCols.map(c => (
                                            <ThSort key={c.key} col={c.key} label={c.label} highlight={c.key === 'ret1Y'} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(fund => (
                                        <tr
                                            key={fund.id}
                                            onClick={() => setSelected(fund)}
                                            className={[selected?.id === fund.id ? 'row-selected' : '', isComparing(fund.id) ? 'row-comparing' : ''].join(' ')}
                                        >
                                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center', paddingLeft: 8, paddingRight: 4 }}>
                                                <input
                                                    type="checkbox"
                                                    className="cmp-chk"
                                                    checked={isComparing(fund.id)}
                                                    onChange={e => toggleCompare(fund, e)}
                                                    disabled={!isComparing(fund.id) && compareList.length >= MAX_COMPARE}
                                                    title={isComparing(fund.id) ? 'Remove from compare' : compareList.length >= MAX_COMPARE ? 'Max 3 selected' : 'Add to compare'}
                                                    aria-label={`Compare ${fund.strategyName}`}
                                                />
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                    <div className="pms-avatar">{initials(fund.portfolioManager)}</div>
                                                    <div>
                                                        <span className="pms-strat-name">
                                                            {fund.strategyName}
                                                            {fund.dataMonth === 'prev' && (
                                                                <span className="pms-month-badge" title={`Latest available data is ${dataMonths.prev.label}`}>{dataMonths.prev.shortLabel}</span>
                                                            )}
                                                        </span>
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
                                            {visibleReturnCols.map(c => (
                                                <td key={c.key}><span className={`ret-chip ${getReturnClass(fund[c.key])}`}>{fmtRet(fund[c.key])}</span></td>
                                            ))}
                                        </tr>
                                    ))}
                                    {paginated.length === 0 && (
                                        <tr>
                                            <td colSpan={3 + visibleReturnCols.length} style={{ textAlign: 'center', padding: '56px', color: 'var(--pms-muted)', fontFamily: 'Arial, sans-serif' }}>
                                                No strategies match your filters.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

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
                                            <div className="gc-name">
                                                {fund.strategyName}
                                                {fund.dataMonth === 'prev' && (
                                                    <span className="pms-month-badge" title={`Latest available data is ${dataMonths.prev.label}`}>{dataMonths.prev.shortLabel}</span>
                                                )}
                                            </div>
                                            <div className="gc-mgr">{fund.portfolioManager}</div>
                                        </div>
                                    </div>
                                    <div className="gc-divider"></div>
                                    <div className="gc-metrics">
                                        <div className="gc-metric"><div className="gc-m-label">3M</div><div className={`gc-m-val ${(fund.ret3M ?? 0) >= 0 ? 'cagr-pos' : 'cagr-neg'}`}>{fmtRet(fund.ret3M)}</div></div>
                                        <div className="gc-metric"><div className="gc-m-label">1Y</div><div className={`gc-m-val ${(fund.ret1Y ?? 0) >= 0 ? 'cagr-pos' : 'cagr-neg'}`}>{fmtRet(fund.ret1Y)}</div></div>
                                        <div className="gc-metric"><div className="gc-m-label">5Y</div><div className={`gc-m-val ${(fund.ret5Y ?? 0) >= 0 ? 'cagr-pos' : 'cagr-neg'}`}>{fmtRet(fund.ret5Y)}</div></div>
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

                {/* ── Source line — dynamic month ── */}
                {!loading && !error && (
                    <div className="src-line">
                        <div className="src-line-main">
                            <span className="src-dot"></span>
                            Source: APMI India · Discretionary {strategy} strategies · {dataMonths.latest.shortLabel} / {dataMonths.prev.shortLabel} · TWRR methodology · Per strategy latest available
                        </div>
                        <div className="src-line-reg">
                            Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor.
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════════
            FAQ Section
            — Rendered HTML matching the FAQPage JSON-LD in layout.jsx.
            — Google requires actual HTML content to award rich snippet eligibility.
            — Structured data is handled exclusively by the JSON-LD FAQPage in layout.jsx.
        ════════════════════════════════════════════════════════════════════ */}
                <section
                    className="pms-faq"
                    id="pms-faq"
                    aria-labelledby="pms-faq-heading"
                >
                    <div className="pms-faq-header">
                        <h2 className="pms-faq-title" id="pms-faq-heading">
                            Frequently Asked Questions
                        </h2>
                        <p className="pms-faq-sub">
                            Everything you need to know about Portfolio Management Services in India
                        </p>
                    </div>
                    <div className="pms-faq-list">
                        {PMS_FAQ.map((item, i) => (
                            <PMSFaqItem key={i} question={item.q} answer={item.a} />
                        ))}
                    </div>
                </section>

            </main>

            {/* ══ Compare Bar ══ */}
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
                    dataLabel={dataMonths.latest.label}
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
                                    <div className="pdm-label">3Y Return</div>
                                    <div className="pdm-val" style={{ color: (selected.ret3Y ?? 0) >= 0 ? 'var(--g2)' : 'var(--neg)' }}>{fmtRet(selected.ret3Y)}</div>
                                </div>
                            </div>
                        </div>
                        <div className="pd-body">
                            {(drawerBenchmark.loading || drawerBenchmark.value) && (
                                <div className="pd-benchmark">
                                    <span className="pd-benchmark-label">Benchmark</span>
                                    <span className="pd-benchmark-val">
                                        {drawerBenchmark.loading ? 'Loading…' : drawerBenchmark.value}
                                    </span>
                                </div>
                            )}
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
                                    <a
                                        href={(() => {
                                            if (selected.apmiLink.startsWith('http')) return selected.apmiLink;
                                            const cleanPath = selected.apmiLink.startsWith('/') ? selected.apmiLink.slice(1) : selected.apmiLink;
                                            if (cleanPath.startsWith('apmi/')) return `https://www.apmiindia.org/${cleanPath}`;
                                            return `https://www.apmiindia.org/apmi/${cleanPath}`;
                                        })()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="apmi-link-btn"
                                    >
                                        View on APMI India ↗
                                    </a>
                                </>
                            )}

                            <div className="pd-source" style={{ marginTop: '28px' }}>
                                <strong>Disclosure:</strong> Data from APMI India · Discretionary {strategy} strategies · Returns as of {selected.dataMonth === 'prev' ? dataMonths.prev.label : dataMonths.latest.label} · TWRR, net of all fees. Past performance is not indicative of future results. Min PMS investment ₹50L per SEBI.
                                <br /><br />
                                Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor.
                            </div>
                        </div>
                    </>
                )}
            </div>

            <Footer />
        </>
    );
}

// ── Default export wraps the inner component in Suspense ─────────────────────
// Required because PMSScreenerInner calls useSearchParams(). Without this,
// Next.js App Router will either fail to statically render the segment (in
// Next 13/14) or show a build warning. The existing loading.jsx serves as the
// route-level fallback; this Suspense handles the client-side shell.
export default function PMSScreener() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #0d1117)', color: 'var(--muted, #8b949e)' }}>
                Loading screener…
            </div>
        }>
            <PMSScreenerInner />
        </Suspense>
    );
}
