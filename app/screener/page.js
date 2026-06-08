'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

/* ---------- SIF helpers ---------- */
const SIF_STRATEGY_LABELS = {
  'Equity Oriented Investment Strategies - Equity Ex-Top 100 Long-Short Fund': 'Equity Ex-Top 100 L/S',
  'Equity Oriented Investment Strategies - Equity Long-Short Fund': 'Equity Long-Short',
  'Hybrid Investment Strategies - Active Asset Allocator Long-Short Fund': 'Active Asset Allocator',
  'Hybrid Investment Strategies - Hybrid Long-Short Fund': 'Hybrid Long-Short',
};
const sifStratShort = (cat) => SIF_STRATEGY_LABELS[cat] || cat?.split(' - ')[1] || cat || '—';
const sifFamily = (cat) => cat?.startsWith('Equity') ? 'Equity' : 'Hybrid';

function backtestSifLink(s) {
  try {
    const state = { v: 1, h: [{ k: 'sif', i: s.scheme_id, n: s.nav_name, c: sifStratShort(s.category), m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '3', sdt: '', su: 0, st: 0, bo: 0, b: null };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch (e) { return '/backtest'; }
}

/* ---------- helpers ---------- */
const pctTxt = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const numTxt = (v, d = 1) => (v == null ? '—' : v.toFixed(d));
const cls = (v) => (v == null ? 'scr-muted' : v >= 0 ? 'scr-pos' : 'scr-neg');

function assetClass(cat = '') {
  if (/equity/i.test(cat)) return 'Equity';
  if (/hybrid|arbitrage|balanced|multi asset/i.test(cat)) return 'Hybrid';
  if (/index|etf|fof|fund of fund/i.test(cat)) return 'Index / FoF';
  if (/debt|income|liquid|gilt|bond|overnight|duration|money market|psu|credit|floater/i.test(cat)) return 'Debt';
  return 'Other';
}
const shortCat = (c = '') => c.replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented)\s+Scheme\s*-\s*/i, '').replace(/\s+Fund$/i, '').trim() || c;

// mirror of the Backtester ?p= encoder so a fund opens pre-loaded there
function backtestLink(f) {
  try {
    const state = { v: 1, h: [{ k: 'mf', i: f.code, n: f.name, c: f.category, m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '10', sdt: '', su: 0, st: 1, bo: 0, b: null };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch (e) { return '/backtest'; }
}

// All metric columns. kind controls formatting: ret/abs = % return, risk = vol%,
// dd = drawdown%, ratio = number. Sub-year periods (1M/3M/6M) are absolute, not annualised.
const METRICS = [
  { key: 'ret_1m', label: '1M', kind: 'abs' },
  { key: 'ret_3m', label: '3M', kind: 'abs' },
  { key: 'ret_6m', label: '6M', kind: 'abs' },
  { key: 'ret_1y', label: '1Y', kind: 'ret' },
  { key: 'ret_3y', label: '3Y', kind: 'ret' },
  { key: 'ret_5y', label: '5Y', kind: 'ret' },
  { key: 'ret_7y', label: '7Y', kind: 'ret' },
  { key: 'ret_10y', label: '10Y', kind: 'ret' },
  { key: 'vol', label: 'Vol', kind: 'risk' },
  { key: 'max_dd', label: 'Max DD', kind: 'dd' },
  { key: 'ret_per_risk', label: 'Ret/Risk', kind: 'ratio' },
];
const DEFAULT_COLS = ['ret_1y', 'ret_3y', 'ret_5y', 'max_dd', 'ret_per_risk'];
const fmtCell = (m, v) => {
  if (v == null) return '—';
  if (m.kind === 'ratio') return v.toFixed(2);
  if (m.kind === 'risk') return v.toFixed(1) + '%';
  if (m.kind === 'dd') return v.toFixed(1) + '%';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
};
const cellCls = (m, v) => {
  if (m.kind === 'risk') return '';
  if (m.kind === 'dd') return 'scr-neg';
  if (m.kind === 'ratio') return '';
  return cls(v);
};

// Default category per asset class (so picking a type lands on a useful view).
const GROUP_DEFAULT_CAT = {
  Equity: /flexi cap/i,
  Hybrid: /multi asset/i,
  'Index / FoF': /index fund/i,
  Debt: /liquid fund/i,
  Other: /children/i,
};

// Featured categories for the "category leaders" band (top 3 by 3Y CAGR each).
const FEATURED = [
  { label: 'Large Cap', m: (c) => /equity/i.test(c) && /large cap/i.test(c) && !/mid/i.test(c) },
  { label: 'Mid Cap', m: (c) => /mid cap/i.test(c) && !/large/i.test(c) },
  { label: 'Small Cap', m: (c) => /small cap/i.test(c) },
  { label: 'Flexi Cap', m: (c) => /flexi cap/i.test(c) },
  { label: 'ELSS (Tax Saver)', m: (c) => /elss/i.test(c) },
  { label: 'Aggressive Hybrid', m: (c) => /aggressive hybrid/i.test(c) },
];

const FAQ_ITEMS = [
  { q: 'How are the returns calculated?', a: 'Point-to-point CAGR from real AMFI NAVs — the latest NAV versus the NAV one, three and five years earlier. For periods shorter than a fund’s age, the figure is left blank rather than estimated.' },
  { q: 'How current is the data?', a: 'The dataset is rebuilt every day from AMFI’s official NAV files, so the figures reflect the most recent published NAVs.' },
  { q: 'What do volatility and max drawdown mean?', a: 'Volatility is the annualised standard deviation of monthly returns — how bumpy the ride was. Max drawdown is the largest peak-to-trough fall. Both are on a month-end basis over the available history.' },

  { q: 'Is this investment advice?', a: 'No. This is an educational data tool. Past performance is not indicative of future results, and nothing here is a recommendation. Please consult your financial advisor before investing.' },
];

export default function ScreenerPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('Equity');
  const [cat, setCat] = useState('Equity Scheme - Flexi Cap Fund');
  const [openOnly, setOpenOnly] = useState(true);
  const [sort, setSort] = useState({ key: 'ret_3y', dir: -1 });
  const [sel, setSel] = useState(null);
  const [faq, setFaq] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [cols, setCols] = useState(DEFAULT_COLS);

  // SIF state
  const [sifData, setSifData] = useState(null);
  const [sifLoading, setSifLoading] = useState(false);
  const [sifQ, setSifQ] = useState('');
  const [sifFamily, setSifFamily] = useState('all');
  const [sifCat, setSifCat] = useState('all');
  const [sifHouse, setSifHouse] = useState('all');
  const [sifSel, setSifSel] = useState(null);
  const [sifSort, setSifSort] = useState({ key: 'nav', dir: -1 });
  const [sifPage, setSifPage] = useState(0);

  const isSIF = group === 'SIF';

  useEffect(() => {
    fetch('/api/screener')
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setData(d); })
      .catch(() => setErr('Could not load screener data.'));
  }, []);

  useEffect(() => {
    if (isSIF && !sifData && !sifLoading) {
      setSifLoading(true);
      fetch('/api/sif-nav')
        .then((r) => r.json())
        .then((d) => { if (d.error) setErr(d.error); else setSifData(d); })
        .catch(() => setErr('Could not load SIF data.'))
        .finally(() => setSifLoading(false));
    }
  }, [isSIF, sifData, sifLoading]);

  const funds = data?.funds || [];
  const groups = ['All', 'Equity', 'Hybrid', 'Debt', 'Index / FoF', 'Other', 'SIF'];

  /* ---- SIF derived state ---- */
  const sifSchemes = sifData?.schemes || [];
  const sifHouses = useMemo(() => [...new Set(sifSchemes.map((s) => s.sif_name))].sort(), [sifSchemes]);
  const sifCats = useMemo(() => [...new Set(sifSchemes.map((s) => s.category))].sort(), [sifSchemes]);
  const sifRows = useMemo(() => {
    let r = sifSchemes;
    if (sifFamily !== 'all') r = r.filter((s) => (s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid') === sifFamily);
    if (sifCat !== 'all') r = r.filter((s) => s.category === sifCat);
    if (sifHouse !== 'all') r = r.filter((s) => s.sif_name === sifHouse);
    if (sifQ.trim()) { const t = sifQ.toLowerCase().split(/\s+/); r = r.filter((s) => { const str = (s.nav_name + ' ' + s.sif_name).toLowerCase(); return t.every((w) => str.includes(w)); }); }
    const { key, dir } = sifSort;
    return [...r].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      return typeof av === 'string' ? av.localeCompare(bv) * dir : (av - bv) * dir;
    });
  }, [sifSchemes, sifFamily, sifCat, sifHouse, sifQ, sifSort]);
  const sifPageCount = Math.max(1, Math.ceil(sifRows.length / pageSize));
  const sifCur = Math.min(sifPage, sifPageCount - 1);
  const sifVisible = sifRows.slice(sifCur * pageSize, sifCur * pageSize + pageSize);
  const setSifSortKey = (key) => setSifSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'nav' ? -1 : 1 }));
  useEffect(() => { setSifPage(0); }, [sifFamily, sifCat, sifHouse, sifQ, sifSort, pageSize]);
  const sifLeaders = useMemo(() => {
    const uniq = [...new Set(sifSchemes.map((s) => s.category))];
    return uniq.map((c) => ({
      label: sifStratShort(c),
      cat: c,
      top: sifSchemes.filter((s) => s.category === c).sort((a, b) => b.nav - a.nav).slice(0, 3),
    })).filter((c) => c.top.length > 0);
  }, [sifSchemes]);
  const cats = useMemo(() => {
    const set = new Map();
    funds.forEach((f) => { if (group === 'All' || assetClass(f.category) === group) set.set(f.category, (set.get(f.category) || 0) + 1); });
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [funds, group]);

  const rows = useMemo(() => {
    let r = funds;
    if (openOnly) r = r.filter((f) => /open/i.test(f.structure || ''));
    if (group !== 'All') r = r.filter((f) => assetClass(f.category) === group);
    if (cat !== 'All') r = r.filter((f) => f.category === cat);
    if (q.trim()) { const t = q.toLowerCase().split(/\s+/); r = r.filter((f) => { const s = (f.name + ' ' + f.amc).toLowerCase(); return t.every((w) => s.includes(w)); }); }
    const { key, dir } = sort;
    r = [...r].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      return (av - bv) * dir;
    });
    return r;
  }, [funds, openOnly, group, cat, q, sort]);

  const setSortKey = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'vol' || key === 'max_dd' ? 1 : -1 }));

  const leaders = useMemo(() => {
    const pool = funds.filter((f) => /open/i.test(f.structure || '') && f.flag !== 'check' && f.ret_3y != null);
    let featured; // [{ label, m }]
    if (group === 'All') {
      featured = FEATURED; // curated cross-asset set
    } else {
      // top categories WITHIN the selected type, ranked by number of funds
      const counts = {};
      pool.forEach((f) => { if (assetClass(f.category) === group) counts[f.category] = (counts[f.category] || 0) + 1; });
      featured = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([c]) => ({ label: shortCat(c), m: (x) => x === c }));
    }
    return featured.map((cat) => ({
      label: cat.label,
      top: pool.filter((f) => cat.m(f.category || '')).sort((a, b) => b.ret_3y - a.ret_3y).slice(0, 3),
    })).filter((c) => c.top.length > 0);
  }, [funds, group]);

  const jumpTo = (f) => { setCat(f.category); setSort({ key: 'ret_3y', dir: -1 }); };

  // pick a sensible default category when a type is chosen
  const defaultCatFor = (g) => {
    if (g === 'All') return 'All';
    const re = GROUP_DEFAULT_CAT[g];
    const hit = re && funds.find((f) => assetClass(f.category) === g && re.test(f.category || ''));
    return hit ? hit.category : 'All';
  };
  const pickGroup = (g) => { setGroup(g); if (g !== 'SIF') setCat(defaultCatFor(g)); setQ(''); setSifQ(''); };
  const visibleCols = METRICS.filter((m) => cols.includes(m.key));
  const toggleCol = (key) => setCols((c) => (c.includes(key) ? (c.length > 1 ? c.filter((k) => k !== key) : c) : [...c, key]));

  // pagination
  useEffect(() => { setPage(0); }, [group, cat, q, openOnly, sort, pageSize]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pageCount - 1);
  const visible = rows.slice(cur * pageSize, cur * pageSize + pageSize);
  const from = rows.length ? cur * pageSize + 1 : 0;
  const to = Math.min(rows.length, (cur + 1) * pageSize);

  return (
    <div className="scr-body">
      <Navbar activePage="screener" />
      <div className="container">
        <div className="page-header">
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">{isSIF ? 'Live · from AMFI SIF NAV API' : 'Live · rebuilt daily from AMFI NAVs'}</span></div>
          <h1 className="page-title">{isSIF ? <><span>SIF</span> Screener</> : 'Mutual Fund Screener'}</h1>
          <p className="page-subtitle">
            {isSIF
              ? <>Discover all SEBI-regulated <b>Specialised Investment Funds</b> — {sifData ? sifSchemes.length : '…'} schemes across Equity Long-Short, Hybrid Long-Short and Active Asset Allocator strategies.</>
              : <>Filter and rank {data ? data.count.toLocaleString('en-IN') : '1,800+'} mutual funds by category, returns and risk — on real historical NAVs.</>
            }
          </p>
        </div>

        {/* controls */}
        <div className="scr-controls">
          <input className="scr-search" placeholder={isSIF ? 'Search SIF or fund house…' : 'Search fund or AMC…'}
            value={isSIF ? sifQ : q} onChange={(e) => isSIF ? setSifQ(e.target.value) : setQ(e.target.value)} />
          <div className="scr-groups">
            {groups.map((g) => (
              <button key={g} className={`scr-chip ${group === g ? 'on' : ''} ${g === 'SIF' ? 'scr-chip-sif' : ''}`} onClick={() => pickGroup(g)}>{g}</button>
            ))}
          </div>
          {!isSIF && (
            <select className="scr-select" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="All">All categories</option>
              {cats.map(([c, n]) => <option key={c} value={c}>{shortCat(c)} ({n})</option>)}
            </select>
          )}
          {isSIF && (
            <>
              <select className="scr-select" value={sifFamily} onChange={(e) => setSifFamily(e.target.value)}>
                <option value="all">All strategies</option>
                <option value="Equity">Equity strategies</option>
                <option value="Hybrid">Hybrid strategies</option>
              </select>
              <select className="scr-select" value={sifCat} onChange={(e) => setSifCat(e.target.value)}>
                <option value="all">All categories</option>
                {sifCats.map((c) => <option key={c} value={c}>{sifStratShort(c)}</option>)}
              </select>
              <select className="scr-select" value={sifHouse} onChange={(e) => setSifHouse(e.target.value)}>
                <option value="all">All fund houses</option>
                {sifHouses.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </>
          )}
          {!isSIF && <label className="scr-toggle"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /><span>Open-ended only</span></label>}
        </div>

        {!isSIF && (
          <div className="scr-colbar">
            <span className="scr-colbar-l">Columns:</span>
            {METRICS.map((m) => (
              <button key={m.key} className={`scr-colchip ${cols.includes(m.key) ? 'on' : ''}`} onClick={() => toggleCol(m.key)}>{m.label}</button>
            ))}
          </div>
        )}

        <div className="scr-meta">
          {err ? <span className="scr-neg">{err}</span> : isSIF
            ? <>Showing <b>{sifRows.length}</b> SIF scheme{sifRows.length !== 1 ? 's' : ''}{sifData ? <> · NAV as of {sifData.nav_date}</> : ''}. Tap a fund for detail.</>
            : <>Showing <b>{rows.length.toLocaleString('en-IN')}</b> funds{data ? <> · as of {data.asof}</> : ''}. Tap a fund for detail.</>
          }
        </div>

        {/* SIF leaders */}
        {isSIF && sifLeaders.length > 0 && (
          <section className="scr-leaders" aria-label="SIF strategy overview">
            <div className="scr-leaders-h">SIF strategies <em>· top 3 by latest NAV per category</em></div>
            <div className="scr-leaders-grid">
              {sifLeaders.map((c) => (
                <div className="scr-lead-card" key={c.label}>
                  <button className="scr-lead-cat" onClick={() => { setSifCat(c.cat); setSifFamily('all'); }}>
                    {c.label} <span className="scr-lead-all">view all →</span>
                  </button>
                  {c.top.map((s, i) => (
                    <button className="scr-lead-row" key={s.scheme_id} onClick={() => setSifSel(s)}>
                      <span className="scr-lead-rank">{i + 1}</span>
                      <span className="scr-lead-name">{s.sif_name}</span>
                      <span className="scr-lead-ret scr-muted">₹{s.nav.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MF leaders */}
        {!isSIF && leaders.length > 0 && (
          <section className="scr-leaders" aria-label="Category leaders">
            <div className="scr-leaders-h">Category leaders {group !== 'All' && <b className="scr-leaders-g">{group}</b>} <em>· top 3 by 3-year return</em></div>
            <div className="scr-leaders-grid">
              {leaders.map((c) => (
                <div className="scr-lead-card" key={c.label}>
                  <button className="scr-lead-cat" onClick={() => jumpTo(c.top[0])}>{c.label} <span className="scr-lead-all">view all →</span></button>
                  {c.top.map((f, i) => (
                    <button className="scr-lead-row" key={f.code} onClick={() => setSel(f)}>
                      <span className="scr-lead-rank">{i + 1}</span>
                      <span className="scr-lead-name">{f.name.replace(/\s*-\s*(Regular Plan|Regular|Growth( Option)?| Plan).*/i, '').trim()}</span>
                      <span className="scr-lead-ret scr-pos">{f.ret_3y > 0 ? '+' : ''}{f.ret_3y.toFixed(1)}%</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SIF table */}
        {isSIF && (
          <>
            <div className="scr-table-wrap">
              <table className="scr-table">
                <thead>
                  <tr>
                    <th className="scr-name-h">Fund</th>
                    <th className={`scr-sortable ${sifSort.key === 'category' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('category')}>Strategy{sifSort.key === 'category' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th className={`scr-sortable ${sifSort.key === 'sif_name' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('sif_name')}>Fund House{sifSort.key === 'sif_name' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th className={`scr-sortable ${sifSort.key === 'nav' ? 'active' : ''}`} onClick={() => setSifSortKey('nav')}>NAV{sifSort.key === 'nav' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th>NAV Date</th>
                  </tr>
                </thead>
                <tbody>
                  {sifVisible.map((s) => {
                    const fam = s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid';
                    return (
                      <tr key={s.scheme_id} className="scr-row" onClick={() => setSifSel(s)}>
                        <td className="scr-name">
                          <button className="scr-fundlink" onClick={(e) => { e.stopPropagation(); setSifSel(s); }}>
                            <span className="scr-fund-n">{s.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim()}</span>
                            <span className="scr-fund-sub">{s.scheme_id}</span>
                          </button>
                        </td>
                        <td style={{textAlign:'left'}}>
                          <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`}>{sifStratShort(s.category)}</span>
                        </td>
                        <td style={{textAlign:'left',color:'var(--text2)',fontSize:'12px',fontWeight:600}}>{s.sif_name}</td>
                        <td><b>₹{s.nav.toFixed(4)}</b></td>
                        <td className="scr-muted" style={{fontSize:'11px'}}>{s.nav_date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sifLoading && <div className="scr-loading">Loading SIF data…</div>}
            {!sifLoading && sifData && sifRows.length === 0 && <div className="scr-loading">No SIFs match these filters.</div>}
            {sifRows.length > 0 && (
              <div className="scr-pager">
                <div className="scr-pager-info">Showing <b>{sifCur * pageSize + 1}–{Math.min(sifRows.length, (sifCur + 1) * pageSize)}</b> of {sifRows.length}</div>
                <div className="scr-pager-ctrls">
                  <button className="scr-pg-btn" disabled={sifCur === 0} onClick={() => setSifPage(sifCur - 1)}>‹ Prev</button>
                  <span className="scr-pg-now">Page {sifCur + 1} / {sifPageCount}</span>
                  <button className="scr-pg-btn" disabled={sifCur >= sifPageCount - 1} onClick={() => setSifPage(sifCur + 1)}>Next ›</button>
                </div>
                <label className="scr-pager-size">Show
                  <select value={pageSize} onChange={(e) => setPageSize(+e.target.value)}>
                    <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100000}>All</option>
                  </select>
                  per page
                </label>
              </div>
            )}
          </>
        )}

        {/* MF table */}
        {!isSIF && (
          <>
            <div className="scr-table-wrap">
              <table className="scr-table">
                <thead>
                  <tr>
                    <th className="scr-name-h">Fund</th>
                    {visibleCols.map((m) => (
                      <th key={m.key} className={`scr-sortable ${sort.key === m.key ? 'active' : ''}`} onClick={() => setSortKey(m.key)}>
                        {m.label}{sort.key === m.key ? <span className="scr-arrow">{sort.dir < 0 ? '▾' : '▴'}</span> : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f) => (
                    <tr key={f.code} className="scr-row" onClick={() => setSel(f)}>
                      <td className="scr-name">
                        <button className="scr-fundlink" onClick={(e) => { e.stopPropagation(); setSel(f); }}>
                          <span className="scr-fund-n">{f.name.replace(/\s*-\s*(Regular Plan|Regular|Growth( Option)?| Plan).*/i, '').trim()}{f.flag === 'check' && <span className="scr-flag" title="Unusual value — under review">⚠</span>}</span>
                          <span className="scr-fund-sub">{shortCat(f.category)}</span>
                        </button>
                      </td>
                      {visibleCols.map((m) => (
                        <td key={m.key} className={cellCls(m, f[m.key])}>{m.kind === 'ratio' ? <b>{fmtCell(m, f[m.key])}</b> : fmtCell(m, f[m.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data && !err && <div className="scr-loading">Loading funds…</div>}
            {data && rows.length === 0 && <div className="scr-loading">No funds match these filters.</div>}
            {rows.length > 0 && (
              <div className="scr-pager">
                <div className="scr-pager-info">Showing <b>{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}</b> of {rows.length.toLocaleString('en-IN')}</div>
                <div className="scr-pager-ctrls">
                  <button className="scr-pg-btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Prev</button>
                  <span className="scr-pg-now">Page {cur + 1} / {pageCount}</span>
                  <button className="scr-pg-btn" disabled={cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>Next ›</button>
                </div>
                <label className="scr-pager-size">Show
                  <select value={pageSize} onChange={(e) => setPageSize(+e.target.value)}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={100000}>All</option>
                  </select>
                  per page
                </label>
              </div>
            )}
          </>
        )}

        {/* FAQ */}
        <section className="scr-faq" aria-label="FAQ">
          <h2>Frequently asked questions</h2>
          {FAQ_ITEMS.map((f, i) => (
            <div className={`scr-faq-item ${faq === i ? 'open' : ''}`} key={i}>
              <button className="scr-faq-q" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}><span>{f.q}</span><span className="scr-faq-ic">{faq === i ? '−' : '+'}</span></button>
              <div className="scr-faq-a" style={{ maxHeight: faq === i ? 320 : 0 }}><p>{f.a}</p></div>
            </div>
          ))}
        </section>

        <div className="scr-disc">
          <b>Disclaimer.</b> Educational tool by <b>Atin Kumar Agrawal | Abundance Financial Services</b> · AMFI Registered Mutual Funds &amp; SIF Distributor (ARN-251838). Returns are point-to-point CAGR from AMFI NAVs; volatility and drawdown are month-end approximations. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. Past performance is not indicative of future results. This is not investment advice.
        </div>
      </div>
      <Footer activePage="screener" />

      {sel && <Detail f={sel} onClose={() => setSel(null)} />}
      {sifSel && <SifDetail s={sifSel} onClose={() => setSifSel(null)} />}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

/* ---------- fund detail drawer (fetches NAV sparkline on open) ---------- */
function Detail({ f, onClose }) {
  const [nav, setNav] = useState(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    let alive = true;
    fetch(`/api/mf?code=${f.code}`).then((r) => r.json()).then((d) => {
      if (!alive || !d?.data?.length) return;
      const pts = d.data.map((x) => { const [dd, mm, yy] = x.date.split('-'); return { t: Date.UTC(+yy, +mm - 1, +dd), v: +x.nav }; }).filter((p) => isFinite(p.v)).sort((a, b) => a.t - b.t);
      setNav(pts);
    }).catch(() => {});
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [f, onClose]);

  const M = [['1Y', f.ret_1y, '%'], ['3Y', f.ret_3y, '%'], ['5Y', f.ret_5y, '%'], ['Volatility', f.vol, '%'], ['Max drawdown', f.max_dd, '%'], ['Return / risk', f.ret_per_risk, '']];
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="scr-drawer-h">
          <div>
            <div className="scr-drawer-name">{f.name}</div>
            <div className="scr-drawer-tags"><span className="scr-tag">{f.amc}</span><span className="scr-tag alt">{shortCat(f.category)}</span><span className="scr-tag alt">{f.structure}</span></div>
          </div>
          <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {f.flag === 'check' && <div className="scr-warn">⚠ One or more returns look unusual for this fund — we’re reviewing the source NAV. Treat with caution.</div>}

        <Spark nav={nav} />

        <div className="scr-drawer-kpis">
          {M.map(([l, v, u]) => (
            <div className="scr-dk" key={l}><span>{l}</span><b className={u === '%' && (l.includes('draw')) ? 'scr-neg' : cls(typeof v === 'number' ? v : null)}>{v == null ? '—' : (u === '%' ? (v > 0 && !l.includes('draw') && !l.includes('Vol') ? '+' : '') + v.toFixed(1) + '%' : v.toFixed(2))}</b></div>
          ))}
        </div>
        <div className="scr-drawer-meta"><span>Latest NAV ₹{f.nav}</span><span>History ~{f.age_years ?? '—'} yrs</span><span>as of {f.asof}</span></div>

        <div className="scr-drawer-cta">
          <a className="scr-btn primary" href={backtestLink(f)}>⚗ Backtest this fund</a>
          <a className="scr-btn" href="/rolling">📉 Rolling returns</a>
        </div>
      </div>
    </div>
  );
}
/* ---------- SIF detail drawer ---------- */
function SifDetail({ s, onClose }) {
  const [pts, setPts] = useState(null);
  const [histLoading, setHistLoading] = useState(true);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    let alive = true;
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/sif-history?sd_id=${encodeURIComponent(s.scheme_id)}&from=${from}&to=${today}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.records?.length) { setHistLoading(false); return; }
        setPts(d.records.map((r) => ({ t: new Date(r.date).getTime(), v: +r.nav })).filter((p) => isFinite(p.v)).sort((a, b) => a.t - b.t));
        setHistLoading(false);
      })
      .catch(() => setHistLoading(false));
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [s, onClose]);

  const fam = s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid';
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="scr-drawer-h">
          <div>
            <div className="scr-drawer-name">{s.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim()}</div>
            <div className="scr-drawer-tags">
              <span className="scr-tag">{s.sif_name}</span>
              <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`} style={{fontSize:'10px',padding:'3px 8px'}}>{SIF_STRATEGY_LABELS[s.category] || sifStratShort(s.category)}</span>
              <span className="scr-tag alt">{s.type}</span>
              <span className="scr-tag alt">{s.scheme_id}</span>
            </div>
          </div>
          <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="scr-sif-notice">ⓘ SIFs are a new asset class (launched 2024–25) with limited NAV history. Performance metrics are not yet available.</div>

        <Spark nav={pts} loadingMsg={histLoading ? 'Loading NAV history…' : null} emptyMsg="No NAV history available yet" />

        <div className="scr-drawer-kpis">
          <div className="scr-dk"><span>Latest NAV</span><b>₹{s.nav.toFixed(4)}</b></div>
          <div className="scr-dk"><span>NAV Date</span><b style={{fontSize:'13px'}}>{s.nav_date}</b></div>
          <div className="scr-dk"><span>Data points</span><b>{pts ? pts.length : '—'}</b></div>
        </div>

        <div className="scr-drawer-cta">
          <a className="scr-btn primary" href={backtestSifLink(s)}>⚗ Backtest this SIF</a>
          <a className="scr-btn" href="/sifs">📋 Full SIF screener</a>
        </div>
      </div>
    </div>
  );
}

function Spark({ nav, loadingMsg, emptyMsg }) {

  if (loadingMsg || (!nav && loadingMsg !== null)) return <div className="scr-spark-load">{loadingMsg || 'Loading NAV history…'}</div>;
  if (!nav || nav.length < 2) return emptyMsg ? <div className="scr-spark-load">{emptyMsg}</div> : null;
  const W = 480, H = 110, pad = 4;
  const xs = nav.map((p) => p.t), minX = xs[0], maxX = xs[xs.length - 1];
  const vs = nav.map((p) => p.v), minV = Math.min(...vs), maxV = Math.max(...vs);
  const X = (t) => pad + ((t - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const Y = (v) => pad + (1 - (v - minV) / (maxV - minV || 1)) * (H - pad * 2);
  const d = nav.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const up = vs[vs.length - 1] >= vs[0];
  return (
    <div className="scr-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path d={`${d} L${X(maxX)},${H} L${X(minX)},${H} Z`} fill={up ? '#2e7d3214' : '#b71c1c14'} />
        <path d={d} fill="none" stroke={up ? '#2e7d32' : '#b71c1c'} strokeWidth="2" />
      </svg>
      <div className="scr-spark-lbl">NAV since {new Date(minX).getFullYear()}</div>
    </div>
  );
}

const CSS = `
.scr-body{font-family:Raleway,sans-serif;color:var(--text);padding-bottom:48px}
/* SIF chip styling */
.scr-chip-sif{border-color:#5e35b133;color:#7c4dff!important}
.scr-chip-sif:hover{border-color:#7c4dff!important}
.scr-chip-sif.on{background:linear-gradient(135deg,#5e35b1,#7c4dff)!important;color:#fff!important;border-color:#5e35b1!important}
/* SIF strategy badges */
.scr-sif-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:6px;font:700 11px JetBrains Mono,monospace;white-space:nowrap}
.scr-sif-badge-equity{background:rgba(27,94,32,.12);color:var(--g1)}
.scr-sif-badge-hybrid{background:rgba(94,53,177,.10);color:#5e35b1}
/* SIF notice */
.scr-sif-notice{background:rgba(94,53,177,.08);border:1px solid rgba(94,53,177,.2);border-radius:8px;padding:9px 12px;font-size:12px;color:#7c4dff;margin-bottom:14px}
.scr-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.scr-search{flex:1;min-width:200px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;font:500 14px Raleway,sans-serif;background:var(--surface);color:var(--text)}
.scr-search:focus{outline:none;border-color:var(--g3);box-shadow:0 0 0 3px var(--g-xlight)}
.scr-groups{display:flex;gap:6px;flex-wrap:wrap}
.scr-chip{padding:8px 13px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font:700 12.5px Raleway,sans-serif;color:var(--text2);cursor:pointer;transition:all .14s ease}
.scr-chip:hover{border-color:var(--g3)}
.scr-chip.on{background:var(--g1);color:#fff;border-color:var(--g1)}
.scr-select{padding:9px 12px;border:1px solid var(--border);border-radius:10px;font:600 13px Raleway,sans-serif;background:var(--surface);color:var(--text);max-width:260px}
.scr-toggle{display:flex;align-items:center;gap:7px;font:600 13px Raleway,sans-serif;color:var(--text2);cursor:pointer}
.scr-toggle input{width:16px;height:16px;accent-color:var(--g2)}
.scr-meta{font-size:13px;color:var(--muted);margin-bottom:10px}
.scr-meta b{color:var(--g1)}

/* column chooser */
.scr-colbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding:9px 11px;background:var(--s2);border:1px solid var(--border);border-radius:10px}
.scr-colbar-l{font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
.scr-colchip{padding:5px 10px;border:1px solid var(--border);background:var(--surface);border-radius:7px;font:700 11.5px JetBrains Mono,monospace;color:var(--muted);cursor:pointer;transition:all .12s ease}
.scr-colchip:hover{border-color:var(--g3);color:var(--text2)}
.scr-colchip.on{background:var(--g-xlight);color:var(--g1);border-color:var(--g-light)}

/* category leaders */
.scr-leaders{margin-bottom:18px}
.scr-leaders-h{font:600 11px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.scr-leaders-h em{font-style:normal;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:500}
.scr-leaders-g{color:var(--g1);font-weight:800}
.scr-leaders-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:860px){.scr-leaders-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.scr-leaders-grid{grid-template-columns:1fr}}
.scr-lead-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 13px;box-shadow:var(--shadow)}
.scr-lead-cat{width:100%;display:flex;align-items:center;justify-content:space-between;background:none;border:0;padding:0 0 8px;margin-bottom:6px;border-bottom:1px solid var(--border);font:800 13.5px Raleway,sans-serif;color:var(--g1);cursor:pointer}
.scr-lead-all{font:600 10px JetBrains Mono,monospace;color:var(--muted)}
.scr-lead-cat:hover .scr-lead-all{color:var(--g2)}
.scr-lead-row{width:100%;display:flex;align-items:center;gap:8px;background:none;border:0;padding:6px 0;text-align:left;cursor:pointer;border-radius:6px}
.scr-lead-row:hover{background:var(--g-xlight)}
.scr-lead-rank{flex:none;width:18px;height:18px;border-radius:50%;background:var(--g-xlight);color:var(--g1);font:800 10px JetBrains Mono,monospace;display:grid;place-items:center}
.scr-lead-name{flex:1;font:600 12px Raleway,sans-serif;color:var(--text);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-lead-ret{flex:none;font:800 12.5px JetBrains Mono,monospace}

.scr-table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow)}
.scr-table{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
.scr-table th{position:sticky;top:0;background:var(--s2);text-align:right;padding:11px 12px;font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap;z-index:2}
.scr-table th.scr-name-h{text-align:left;left:0;z-index:3}
.scr-sortable{cursor:pointer;user-select:none}
.scr-sortable:hover{color:var(--g2)}
.scr-sortable.active{color:var(--g1)}
.scr-arrow{margin-left:3px}
.scr-table td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600}
.scr-row{cursor:pointer;transition:background .12s ease}
.scr-row:hover{background:var(--g-xlight)}
.scr-name,.scr-name-h{text-align:left!important;position:sticky;left:0;background:var(--surface)}
.scr-row:hover .scr-name{background:var(--g-xlight)}
.scr-fundlink{display:flex;flex-direction:column;gap:2px;background:none;border:0;padding:0;text-align:left;cursor:pointer;max-width:230px}
.scr-fund-n{font:700 13px Raleway,sans-serif;color:var(--g1);line-height:1.25;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.scr-fundlink:hover .scr-fund-n{text-decoration:underline}
.scr-fund-sub{font:500 11px JetBrains Mono,monospace;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-flag{color:var(--warn);margin-left:5px;font-size:12px}
.scr-pos{color:var(--g2)}
.scr-neg{color:var(--neg)}
.scr-muted{color:var(--muted)}
.scr-more,.scr-loading{padding:14px;text-align:center;color:var(--muted);font-size:13px}
/* pager is OUTSIDE the horizontal-scroll wrap, so it never scrolls sideways */
.scr-pager{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;margin-top:10px;background:var(--s2)}
.scr-pager-info{font-size:12.5px;color:var(--muted)}
.scr-pager-info b{color:var(--text)}
.scr-pager-ctrls{display:flex;align-items:center;gap:10px}
.scr-pg-btn{padding:7px 13px;border:1px solid var(--border);background:var(--surface);border-radius:8px;font:700 12.5px Raleway,sans-serif;color:var(--g1);cursor:pointer}
.scr-pg-btn:hover:not(:disabled){border-color:var(--g3);background:var(--g-xlight)}
.scr-pg-btn:disabled{opacity:.4;cursor:not-allowed;color:var(--muted)}
.scr-pg-now{font:700 12.5px JetBrains Mono,monospace;color:var(--text2);min-width:96px;text-align:center}
.scr-pager-size{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted)}
.scr-pager-size select{padding:6px 9px;border:1px solid var(--border);border-radius:8px;font:700 12.5px Raleway,sans-serif;background:var(--surface);color:var(--text)}
@media(max-width:560px){
  .scr-pager{justify-content:center}.scr-pager-info{order:3;width:100%;text-align:center}
  /* shrink the sticky fund column so the data columns get room */
  .scr-table{min-width:420px}
  .scr-fundlink{max-width:132px}
  .scr-fund-n{font-size:12px}
  .scr-fund-sub{font-size:9.5px}
  .scr-table th,.scr-table td{padding:9px 8px}
  .scr-name,.scr-name-h{max-width:140px}
}

.scr-faq{margin-top:24px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;box-shadow:var(--shadow)}
.scr-faq h2{font-size:17px;margin:0 0 14px;color:var(--text)}
.scr-faq-item{border:1px solid var(--border);border-radius:10px;background:var(--s2);margin-bottom:8px;overflow:hidden}
.scr-faq-item.open{border-color:var(--g-light)}
.scr-faq-q{width:100%;display:flex;justify-content:space-between;gap:12px;background:none;border:0;padding:14px 15px;text-align:left;font:700 14px Raleway,sans-serif;color:var(--text);cursor:pointer}
.scr-faq-q:hover{color:var(--g1)}
.scr-faq-ic{font:700 18px JetBrains Mono,monospace;color:var(--g3)}
.scr-faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease}
.scr-faq-a p{margin:0;padding:0 15px 15px;font-size:13px;line-height:1.65;color:var(--text2)}
.scr-disc{margin-top:20px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.scr-disc b{color:var(--text2)}

/* drawer */
.scr-drawer-wrap{position:fixed;inset:0;background:#0d260d55;backdrop-filter:blur(3px);z-index:95;display:flex;justify-content:flex-end;animation:scrfade .2s ease}
.scr-drawer{background:var(--surface);width:460px;max-width:100%;height:100%;overflow-y:auto;box-shadow:var(--shadow-lg);padding:22px;animation:scrslide .28s cubic-bezier(.2,.7,.3,1)}
@keyframes scrfade{from{opacity:0}to{opacity:1}}
@keyframes scrslide{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes scrup{from{transform:translateY(60px);opacity:.5}to{transform:none;opacity:1}}
.scr-drawer-h{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px}
.scr-drawer-name{font-size:16px;font-weight:800;color:var(--text);line-height:1.3}
.scr-drawer-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.scr-tag{font:700 10px JetBrains Mono,monospace;background:var(--g-xlight);color:var(--g1);padding:3px 8px;border-radius:5px}
.scr-tag.alt{background:var(--s3,#eef5ee);color:var(--text2)}
.scr-x{width:34px;height:34px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font-size:20px;color:var(--muted);cursor:pointer;flex:none}
.scr-warn{background:var(--warn-bg,#fff3e0);border:1px solid #ffcc80;color:#8a4300;padding:9px 12px;border-radius:8px;font-size:12px;margin-bottom:14px}
.scr-spark{margin-bottom:16px}
.scr-spark svg{width:100%;height:110px;display:block;background:var(--s2);border:1px solid var(--border);border-radius:10px}
.scr-spark-lbl,.scr-spark-load{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:5px}
.scr-spark-load{padding:34px 0;text-align:center}
.scr-drawer-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.scr-dk{background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:9px 10px;display:flex;flex-direction:column;gap:3px}
.scr-dk span{font:600 9.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase}
.scr-dk b{font:800 16px JetBrains Mono,monospace;color:var(--text)}
.scr-drawer-meta{display:flex;flex-wrap:wrap;gap:12px;font:600 11px JetBrains Mono,monospace;color:var(--muted);border-top:1px solid var(--border);padding-top:12px;margin-bottom:16px}
.scr-drawer-cta{display:flex;gap:10px;flex-wrap:wrap}
.scr-btn{flex:1;text-align:center;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:800 13px Raleway,sans-serif;text-decoration:none;white-space:nowrap}
.scr-btn.primary{background:var(--g1);color:#fff;border-color:var(--g1)}
.scr-btn:hover{transform:translateY(-1px)}
@media(max-width:560px){
  .scr-drawer-wrap{justify-content:center;align-items:flex-end}
  .scr-drawer{width:100%;height:auto;max-height:90vh;border-radius:18px 18px 0 0;animation:scrup .3s cubic-bezier(.2,.7,.3,1)}
  .scr-drawer-kpis{grid-template-columns:repeat(2,1fr)}
  .scr-select{max-width:100%;flex:1}
}
@media (prefers-reduced-motion: reduce){ .scr-drawer,.scr-drawer-wrap{animation:none} .scr-btn:hover{transform:none} }
`;
