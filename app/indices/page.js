'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import RiskGauge from '@/components/RiskGauge';

const CAT_LABELS = {
  broad: 'Broad',
  sectoral: 'Sectoral',
  strategy: 'Strategy',
  thematic: 'Thematic',
  hybrid: 'Hybrid',
  bond: 'Bonds',
};

function fmtRet(v) {
  if (v === null || v === undefined || isNaN(v)) return <span>—</span>;
  const cls = v > 0 ? 'ret-pos' : v < 0 ? 'ret-neg' : 'ret-neu';
  const txt = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  return <span className={cls}>{txt}</span>;
}

function fmtNum(v, dp = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return v.toFixed(dp);
}

function ordinal(n) {
  const v = n % 100;
  return n + (['th','st','nd','rd'][(v - 20) % 10] || ['th','st','nd','rd'][v] || 'th');
}

export default function IndicesPage() {
  const { data: session } = useSession();
  const isProUser = Boolean(
    session?.user?.role === 'admin' ||
    session?.user?.plan === 'pro' ||
    session?.user?.plan === 'pro_lifetime' ||
    session?.user?.plan === 'lifetime' ||
    session?.user?.isPro
  );
  const [allData, setAllData] = useState([]);
  const [sortKey, setSortKey] = useState('r1y');
  const [sortDir, setSortDir] = useState(-1);
  const [catFilter, setCatFilter] = useState('all');
  const [exchFilter, setExchFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState({ month: '', year: '', count: 0, asOf: '', bseCount: 0 });
  const [toast, setToast] = useState('');

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }

  function handleCopyLink() {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    Promise.race([navigator.clipboard.writeText(window.location.href), timeout])
      .then(() => flashToast('Link copied to clipboard'))
      .catch(() => flashToast('Copy failed — select the address bar manually'));
  }

  // Exports the currently filtered/sorted `rows` (not just allData) — defined
  // below in render scope, captured by closure; only ever invoked after this
  // render's `rows` assignment has run, so it's always populated on click.
  function handleExportCsv() {
    if (!isProUser) { flashToast('Export CSV is a Pro feature — upgrade at /pricing'); return; }
    if (!rows.length) return;
    const cols = [
      { key: 'name', label: 'Index' }, { key: 'exchange', label: 'Exchange' }, { key: 'cat', label: 'Category' },
      { key: 'r1m', label: '1M %' }, { key: 'r3m', label: '3M %' }, { key: 'r1y', label: '1Y %' },
      { key: 'r3y', label: '3Y %' }, { key: 'r5y', label: '5Y %' },
      { key: 'vol', label: 'Volatility' }, { key: 'beta', label: 'Beta' },
      { key: 'pe', label: 'P/E' }, { key: 'pb', label: 'P/B' }, { key: 'dy', label: 'Div Yield %' },
      { key: 'riskLabel', label: 'Riskometer' },
    ];
    const get = (r, key) => {
      if (key.startsWith('r') && r.returns && key in r.returns) return r.returns[key];
      if (['pe', 'pb', 'dy'].includes(key)) return r.val?.[key];
      if (['vol', 'beta'].includes(key)) return r.risk?.[key];
      return r[key];
    };
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(get(r, c.key))).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mf-indices-${metadata.month || 'latest'}-${metadata.year || ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashToast(`Exported ${rows.length} indices`);
  }

  useEffect(() => {
    async function loadData() {
      const [nseRes, bseRes] = await Promise.allSettled([
        fetch('/api/index-dashboard').then(r => { if (!r.ok) throw new Error(`API returned ${r.status}`); return r.json(); }),
        fetch('/api/bse-index-dashboard').then(r => { if (!r.ok) throw new Error(`API returned ${r.status}`); return r.json(); }),
      ]);

      const nseData = nseRes.status === 'fulfilled' && nseRes.value.indices?.length ? nseRes.value : null;
      const bseData = bseRes.status === 'fulfilled' && bseRes.value.indices?.length ? bseRes.value : null;

      if (!nseData && !bseData) {
        setError(nseRes.status === 'rejected' ? nseRes.reason.message : 'No index data in response');
        setLoading(false);
        return;
      }

      const nseIndices = (nseData?.indices || []).map(r => ({ ...r, exchange: r.exchange || 'NSE' }));
      const bseIndices = bseData?.indices || [];

      setAllData([...nseIndices, ...bseIndices]);
      setMetadata({
        month: nseData?.month || '', year: nseData?.year || '',
        count: nseData?.count || 0, asOf: nseData?.asOf || '',
        bseCount: bseData?.count || 0,
      });
      setLoading(false);
    }
    loadData();
  }, []);

  const sortTable = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir * -1);
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const filterCat = (cat) => setCatFilter(cat);
  const handleSearch = (e) => setSearchFilter(e.target.value.trim());

  let rows = allData.slice();
  if (catFilter !== 'all') rows = rows.filter(r => r.cat === catFilter);
  if (exchFilter !== 'all') rows = rows.filter(r => r.exchange === exchFilter);
  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(q));
  }

  rows.sort((a, b) => {
    const kMap = {
      name: r => r.name,
      r1m:  r => r.returns.r1m,
      r3m:  r => r.returns.r3m,
      r1y:  r => r.returns.r1y,
      r3y:  r => r.returns.r3y,
      r5y:  r => r.returns.r5y,
      vol:  r => r.risk.vol,
      beta: r => r.risk.beta,
      pe:   r => r.val.pe,
      pb:   r => r.val.pb,
      dy:   r => r.val.dy,
      risk: r => r.riskScore ?? -1,
    };
    const fn = kMap[sortKey] || (r => r.name);
    const aV = fn(a), bV = fn(b);
    if (typeof aV === 'string') return sortDir * aV.localeCompare(bV);
    return sortDir * ((aV ?? -999) - (bV ?? -999));
  });

  const getSortClass = (key) => {
    if (sortKey !== key) return '';
    return sortDir === -1 ? 'sorted-desc' : 'sorted-asc';
  };

  // ── Market Valuation Dashboard ──────────────────────────────────────────────
  const BENCHMARK_INDICES = ['Nifty 50', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

  // PE thresholds per index for the valuation gauge
  const PE_THRESHOLDS = {
    'Nifty 50':           { low: 18, high: 24, max: 36 },
    'Nifty Midcap 150':   { low: 25, high: 35, max: 52 },
    'Nifty Smallcap 250': { low: 20, high: 30, max: 45 },
  };

  function getValuation(name, pe) {
    const t = PE_THRESHOLDS[name];
    if (!t || pe == null) return { label: 'N/A', color: 'var(--muted)', fill: '#ccc', pct: 0 };
    const pct = Math.min((pe / t.max) * 100, 100);
    if (pe < t.low)  return { label: 'Undervalued', color: '#1b5e20', fill: '#43a047', pct };
    if (pe < t.high) return { label: 'Fair Value',  color: '#e65100', fill: '#fb8c00', pct };
                     return { label: 'Overvalued',  color: '#b71c1c', fill: '#e53935', pct };
  }

  function renderValuationDashboard() {
    const benchmarks = allData.filter(r => BENCHMARK_INDICES.includes(r.name));
    if (!benchmarks.length || loading) return null;

    return (
      <div className="valuation-dashboard">
        <div className="section-head" style={{ marginBottom: 16 }}>
          <div className="section-title">🌡 Market Valuation — PE Gauge</div>
          <div className="section-badge">BENCHMARK INDICES · LIVE</div>
        </div>
        <div className="val-cards">
          {BENCHMARK_INDICES.map(name => {
            const row = benchmarks.find(r => r.name === name);
            if (!row) return null;
            const pe   = row.val?.pe;
            const pb   = row.val?.pb;
            const dy   = row.val?.dy;
            const v    = getValuation(name, pe);
            const t    = PE_THRESHOLDS[name];
            return (
              <div key={name} className="val-card">
                <div className="val-name">{name}</div>

                {/* PE — primary metric */}
                <div className="val-pe-row">
                  <div className="val-pe-num" style={{ color: v.color }}>{pe ?? '—'}</div>
                  <div className="val-badge" style={{ background: v.fill + '22', color: v.color, borderColor: v.fill + '55' }}>
                    {v.label}
                  </div>
                </div>

                {/* Gauge bar */}
                <div className="val-gauge-track" title={`PE: ${pe} · Undervalued < ${t.low} · Fair ${t.low}–${t.high} · Overvalued > ${t.high}`}>
                  {/* Zone markers */}
                  <div className="val-gauge-zone val-zone-green"  style={{ width: `${(t.low  / t.max) * 100}%` }} />
                  <div className="val-gauge-zone val-zone-yellow" style={{ width: `${((t.high - t.low) / t.max) * 100}%` }} />
                  <div className="val-gauge-zone val-zone-red"    style={{ width: `${((t.max  - t.high) / t.max) * 100}%` }} />
                  {/* Current PE needle */}
                  {pe != null && (
                    <div className="val-gauge-needle" style={{ left: `${Math.min(v.pct, 98)}%` }} />
                  )}
                </div>
                <div className="val-gauge-labels">
                  <span style={{ color: '#1b5e20' }}>{t.low}</span>
                  <span style={{ color: '#e65100' }}>{t.high}</span>
                  <span style={{ color: '#b71c1c' }}>{t.max}+</span>
                </div>

                {/* PB + DY */}
                <div className="val-metrics">
                  <div className="val-metric">
                    <span className="val-metric-label">P/B</span>
                    <span className="val-metric-val">{pb ?? '—'}</span>
                  </div>
                  <div className="val-metric">
                    <span className="val-metric-label">Div. Yield</span>
                    <span className="val-metric-val">{dy != null ? dy + '%' : '—'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="val-disclaimer">
          PE zones: Green = historically undervalued · Yellow = fair value range · Red = stretched valuations.
          Thresholds based on historical averages. Not investment advice.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container">
        <Navbar activePage="indices" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">NSE + BSE Index Dashboard</span>
          </div>
          <h1 className="page-title">
            Index <span>Returns</span> & Valuation
          </h1>
          <p className="page-subtitle">
            {metadata.count > 0 || metadata.bseCount > 0
              ? (() => {
                  const day = metadata.asOf ? ordinal(parseInt(metadata.asOf.split('-')[2], 10)) : '';
                  const dateStr = day ? `${day} ${metadata.month} ${metadata.year}` : `${metadata.month} ${metadata.year}`;
                  const nsePart = metadata.count > 0 ? `${metadata.count} NSE indices as of ${dateStr}` : '';
                  const bsePart = metadata.bseCount > 0 ? `${metadata.bseCount} BSE indices` : '';
                  const both = [nsePart, bsePart].filter(Boolean).join(' + ');
                  return `${both} — returns, P/E, P/B, Beta, Volatility. Sources: NSE Indices Limited, BSE Ltd.`;
                })()
              : 'Loading index dashboard...'}
          </p>
        </div>

        {renderValuationDashboard()}

        <div id="controls" className="controls-bar" style={{ display: loading ? 'none' : 'flex' }}>
          <button className={`cat-btn ${catFilter === 'all'      ? 'active' : ''}`} onClick={() => filterCat('all')}>All</button>
          <button className={`cat-btn ${catFilter === 'broad'    ? 'active' : ''}`} onClick={() => filterCat('broad')}>Broad</button>
          <button className={`cat-btn ${catFilter === 'sectoral' ? 'active' : ''}`} onClick={() => filterCat('sectoral')}>Sectoral</button>
          <button className={`cat-btn ${catFilter === 'strategy' ? 'active' : ''}`} onClick={() => filterCat('strategy')}>Strategy</button>
          <button className={`cat-btn ${catFilter === 'thematic' ? 'active' : ''}`} onClick={() => filterCat('thematic')}>Thematic</button>
          <button className={`cat-btn ${catFilter === 'hybrid'   ? 'active' : ''}`} onClick={() => filterCat('hybrid')}>Hybrid</button>
          <button className={`cat-btn ${catFilter === 'bond'     ? 'active' : ''}`} onClick={() => filterCat('bond')}>Bonds</button>
          <span className="controls-divider" />
          <button className={`cat-btn ${exchFilter === 'all' ? 'active' : ''}`} onClick={() => setExchFilter('all')}>All Exchanges</button>
          <button className={`cat-btn ${exchFilter === 'NSE' ? 'active' : ''}`} onClick={() => setExchFilter('NSE')}>NSE</button>
          <button className={`cat-btn ${exchFilter === 'BSE' ? 'active' : ''}`} onClick={() => setExchFilter('BSE')}>BSE</button>
          <input
            type="text"
            className="search-box"
            placeholder="Search indices..."
            onChange={handleSearch}
          />
          <div className="data-badge">
            {rows.length} of {allData.length} indices
          </div>
          <span className="controls-divider" />
          <button className="export-btn" onClick={handleCopyLink} title="Copy a link to this page" aria-label="Copy link">🔗 Copy Link</button>
          <button className="export-btn" onClick={handleExportCsv} title={isProUser ? 'Export the currently filtered table as CSV' : 'Export CSV is a Pro feature'} aria-label="Export as CSV">⤓ Export CSV{!isProUser && ' 🔒'}</button>
        </div>

        {loading && (
          <div id="skeleton" className="table-card">
            <div className="table-wrap">
              <table className="idx-table">
                <thead>
                  <tr>
                    <th className="idx-name-th">Index Name</th>
                    <th colSpan={5} className="th-group">TRI Returns</th>
                    <th colSpan={2} className="th-group">Risk</th>
                    <th colSpan={3} className="th-group">Valuation</th>
                    <th>Riskometer</th>
                    <th>Compare</th>
                  </tr>
                  <tr>
                    <th>Name</th>
                    <th>1M</th><th>3M</th><th>1Y</th><th>3Y</th><th>5Y</th>
                    <th>Vol</th><th>Beta</th>
                    <th>P/E</th><th>P/B</th><th>D.Y.</th>
                    <th>Score</th>
                    <th>Compare</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(8)].map((_, i) => (
                    <tr key={i}>
                      <td><div className="sk" style={{ width: '180px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '68px', height: '40px' }}></div></td>
                      <td><div className="sk" style={{ width: '80px', height: '14px' }}></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <div id="errorBox" style={{ 
            padding: '20px', 
            background: 'var(--neg-bg)', 
            border: '1.5px solid var(--neg)', 
            borderRadius: 'var(--r)', 
            color: 'var(--neg)', 
            fontWeight: 600 
          }}>
            ⚠ Could not load index data: {error}. Please try again in a moment.
          </div>
        )}

        {!loading && !error && (
          <div id="tableCard" className="table-card">
            <div className="table-wrap">
              <table className="idx-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className={`idx-name-th ${getSortClass('name')}`} onClick={() => sortTable('name')}>
                      Index Name
                    </th>
                    <th colSpan={5} className="th-group">TRI Returns</th>
                    <th colSpan={2} className="th-group">Risk</th>
                    <th colSpan={3} className="th-group">Valuation</th>
                    <th rowSpan={2} className={getSortClass('risk')} onClick={() => sortTable('risk')}>Riskometer</th>
                    <th rowSpan={2}>Compare</th>
                  </tr>
                  <tr>
                    <th className={getSortClass('r1m')} onClick={() => sortTable('r1m')}>1M</th>
                    <th className={getSortClass('r3m')} onClick={() => sortTable('r3m')}>3M</th>
                    <th className={getSortClass('r1y')} onClick={() => sortTable('r1y')}>1Y</th>
                    <th className={getSortClass('r3y')} onClick={() => sortTable('r3y')}>3Y</th>
                    <th className={getSortClass('r5y')} onClick={() => sortTable('r5y')}>5Y</th>
                    <th className={getSortClass('vol')} onClick={() => sortTable('vol')}>Vol</th>
                    <th className={getSortClass('beta')} onClick={() => sortTable('beta')}>Beta</th>
                    <th className={getSortClass('pe')} onClick={() => sortTable('pe')}>P/E</th>
                    <th className={getSortClass('pb')} onClick={() => sortTable('pb')}>P/B</th>
                    <th className={getSortClass('dy')} onClick={() => sortTable('dy')}>D.Y.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const encodedName = encodeURIComponent(r.name);
                    const rollUrl = `/rolling?bench=${encodedName}`;

                  
  return (
                      <tr key={i} data-cat={r.cat}>
                        <td>
                          <div className="idx-name-cell">
                            {r.name}
                            <span className={`exch-pill exch-${r.exchange}`}>{r.exchange}</span>
                            <span className={`cat-pill cat-${r.cat}`}>
                              {CAT_LABELS[r.cat] || r.cat}
                            </span>
                          </div>
                        </td>
                        <td className="td-divider">{fmtRet(r.returns.r1m)}</td>
                        <td>{fmtRet(r.returns.r3m)}</td>
                        <td>{fmtRet(r.returns.r1y)}</td>
                        <td>{fmtRet(r.returns.r3y)}</td>
                        <td>{fmtRet(r.returns.r5y)}</td>
                        <td className="td-divider">{fmtNum(r.risk.vol)}</td>
                        <td>{fmtNum(r.risk.beta)}</td>
                        <td className="td-divider">{fmtNum(r.val.pe)}</td>
                        <td>{fmtNum(r.val.pb)}</td>
                        <td>{fmtNum(r.val.dy)}</td>
                        <td className="td-gauge">
                          <RiskGauge label={r.riskLabel} score={r.riskScore} />
                        </td>
                        <td>
                          <a className="roll-btn" href={rollUrl} title={`Compare vs ${r.name} on Rolling Returns`}>
                            📉 Compare
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="src-text">
              Data: NSE Indices ({metadata.month} {metadata.year}, TRI basis, {metadata.count} indices) + BSE Ltd. ({metadata.bseCount} indices, price basis)
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="pf-advisor-card">
            <div className="pf-advisor-icon">✦</div>
            <div className="pf-advisor-body">
              <div className="pf-advisor-title">Not sure which index or fund fits your goals?</div>
              <div className="pf-advisor-sub">
                Index valuation is market context, not a buy signal — talk to an AMFI-registered advisor about your own allocation.
              </div>
            </div>
            <a href="/book-consultation" className="pf-advisor-btn">
              Book a Call →
            </a>
          </div>
        )}
      </div>

      {toast && <div className="pf-toast">{toast}</div>}
      <Footer />
    </>
  );
}
