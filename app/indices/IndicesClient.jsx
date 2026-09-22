'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
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

const BENCHMARK_INDICES = ['Nifty 50', 'BSE SENSEX', 'Nifty Midcap 150', 'Nifty Smallcap 250'];

const PE_THRESHOLDS = {
  'Nifty 50':           { low: 18, high: 24, max: 36 },
  'S&P BSE SENSEX':     { low: 19, high: 25, max: 38 },
  'BSE SENSEX':         { low: 19, high: 25, max: 38 },
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

export default function IndicesClient({ initialData }) {
  const { data: session } = useSession();
  const isProUser = Boolean(
    session?.user?.role === 'admin' ||
    session?.user?.plan === 'pro' ||
    session?.user?.plan === 'pro_lifetime' ||
    session?.user?.plan === 'lifetime' ||
    session?.user?.isPro
  );

  const [allData] = useState(initialData?.allData || []);
  const [metadata] = useState(initialData?.metadata || {});
  const [sortKey, setSortKey] = useState('r1y');
  const [sortDir, setSortDir] = useState(-1);
  const [catFilter, setCatFilter] = useState('all');
  const [exchFilter, setExchFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
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
    const qTokens = searchFilter.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter(r => {
      const target = `${r.name} ${r.exchange} ${CAT_LABELS[r.cat] || r.cat}`.toLowerCase();
      return qTokens.every(tok => target.includes(tok));
    });
  }

  rows.sort((a, b) => {
    const kMap = {
      name: r => r.name,
      r1m:  r => r.returns?.r1m,
      r3m:  r => r.returns?.r3m,
      r1y:  r => r.returns?.r1y,
      r3y:  r => r.returns?.r3y,
      r5y:  r => r.returns?.r5y,
      vol:  r => r.risk?.vol,
      beta: r => r.risk?.beta,
      pe:   r => r.val?.pe,
      pb:   r => r.val?.pb,
      dy:   r => r.val?.dy,
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

  function renderValuationDashboard() {
    const activeBenchmarks = BENCHMARK_INDICES
      .map(name => allData.find(r => r.name.toLowerCase() === name.toLowerCase()))
      .filter(Boolean);

    if (!activeBenchmarks.length) return null;

    return (
      <div className="valuation-dashboard">
        <div className="section-head" style={{ marginBottom: 16 }}>
          <div className="section-title">🌡 Market Valuation — PE Gauge</div>
          <div className="section-badge">BENCHMARK INDICES · LIVE DATA</div>
        </div>
        <div className="val-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {activeBenchmarks.map(row => {
            const name = row.name;
            const pe   = row.val?.pe;
            const pb   = row.val?.pb;
            const dy   = row.val?.dy;
            const v    = getValuation(name, pe);
            const t    = PE_THRESHOLDS[name] || { low: 18, high: 24, max: 36 };
            return (
              <div key={name} className="val-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="val-name">{name}</div>
                  <span className={`exch-pill exch-${row.exchange}`}>{row.exchange}</span>
                </div>

                {/* PE — primary metric */}
                <div className="val-pe-row">
                  <div className="val-pe-num" style={{ color: v.color }}>{pe ?? '—'}</div>
                  <div className="val-badge" style={{ background: v.fill + '22', color: v.color, borderColor: v.fill + '55' }}>
                    {v.label}
                  </div>
                </div>

                {/* Gauge bar */}
                <div className="val-gauge-track" title={`PE: ${pe} · Undervalued < ${t.low} · Fair ${t.low}–${t.high} · Overvalued > ${t.high}`}>
                  <div className="val-gauge-zone val-zone-green"  style={{ width: `${(t.low  / t.max) * 100}%` }} />
                  <div className="val-gauge-zone val-zone-yellow" style={{ width: `${((t.high - t.low) / t.max) * 100}%` }} />
                  <div className="val-gauge-zone val-zone-red"    style={{ width: `${((t.max  - t.high) / t.max) * 100}%` }} />
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
          PE valuation zones: Green = historically undervalued · Yellow = fair value range · Red = stretched valuations.
          Thresholds based on multi-decade historical averages. Sourced from NSE Indices Limited & BSE Ltd.
        </div>
      </div>
    );
  }

  const { nseOk, bseOk } = metadata;
  // getCombinedIndicesData() runs NSE and BSE fetches through
  // Promise.allSettled, which swallows an individual rejection -- without
  // this, a source outage (or, if both are down, the SSR catch in page.js
  // falling back to an empty payload) would render a normal-looking but
  // silently incomplete or empty table with no indication anything is wrong.
  const sourceNotice =
    nseOk === false && bseOk === false
      ? 'Both NSE and BSE index data are temporarily unavailable. Please try again shortly.'
      : nseOk === false
      ? 'NSE index data is temporarily unavailable — showing BSE indices only.'
      : bseOk === false
      ? 'BSE index data is temporarily unavailable — showing NSE indices only.'
      : null;

  return (
    <>
      {sourceNotice && (
        <div id="sourceNoticeBox" style={{
          padding: '12px 16px',
          marginBottom: 14,
          background: 'var(--warn-bg, #fff8e1)',
          border: '1.5px solid var(--warn, #f9a825)',
          borderRadius: 'var(--r)',
          color: 'var(--warn-text, #8a6100)',
          fontWeight: 600,
          fontSize: '.85rem',
        }}>
          ⚠ {sourceNotice}
        </div>
      )}

      {renderValuationDashboard()}

      <div id="controls" className="controls-bar" style={{ display: 'flex' }}>
        <button className={`cat-btn ${catFilter === 'all'      ? 'active' : ''}`} onClick={() => filterCat('all')}>All Categories</button>
        <button className={`cat-btn ${catFilter === 'broad'    ? 'active' : ''}`} onClick={() => filterCat('broad')}>Broad Market</button>
        <button className={`cat-btn ${catFilter === 'sectoral' ? 'active' : ''}`} onClick={() => filterCat('sectoral')}>Sectoral</button>
        <button className={`cat-btn ${catFilter === 'strategy' ? 'active' : ''}`} onClick={() => filterCat('strategy')}>Strategy / Factor</button>
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
          placeholder="Search 270+ indices..."
          onChange={handleSearch}
        />
        <div className="data-badge">
          {rows.length} of {allData.length} indices
        </div>
        <span className="controls-divider" />
        <button className="export-btn" onClick={handleCopyLink} title="Copy a link to this page" aria-label="Copy link">🔗 Copy Link</button>
        <button className="export-btn" onClick={handleExportCsv} title={isProUser ? 'Export the currently filtered table as CSV' : 'Export CSV is a Pro feature'} aria-label="Export as CSV">⤓ Export CSV{!isProUser && ' 🔒'}</button>
      </div>

      <div id="tableCard" className="table-card">
        <div className="table-wrap">
          <table className="idx-table">
            <thead>
              <tr>
                <th rowSpan={2} className={`idx-name-th ${getSortClass('name')}`} onClick={() => sortTable('name')}>
                  Index Name
                </th>
                <th colSpan={5} className="th-group">Trailing Returns (TRI)</th>
                <th colSpan={2} className="th-group">Risk Profile</th>
                <th colSpan={3} className="th-group">Valuation Ratios</th>
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
                  <tr key={r.name + '_' + (r.exchange || 'idx') + '_' + i} data-cat={r.cat}>
                    <td>
                      <div className="idx-name-cell">
                        {r.name}
                        <span className={`exch-pill exch-${r.exchange}`}>{r.exchange}</span>
                        <span className={`cat-pill cat-${r.cat}`}>
                          {CAT_LABELS[r.cat] || r.cat}
                        </span>
                      </div>
                    </td>
                    <td className="td-divider">{fmtRet(r.returns?.r1m)}</td>
                    <td>{fmtRet(r.returns?.r3m)}</td>
                    <td>{fmtRet(r.returns?.r1y)}</td>
                    <td>{fmtRet(r.returns?.r3y)}</td>
                    <td>{fmtRet(r.returns?.r5y)}</td>
                    <td className="td-divider">{fmtNum(r.risk?.vol)}</td>
                    <td>{fmtNum(r.risk?.beta)}</td>
                    <td className="td-divider">{fmtNum(r.val?.pe)}</td>
                    <td>{fmtNum(r.val?.pb)}</td>
                    <td>{fmtNum(r.val?.dy)}</td>
                    <td className="td-gauge">
                      <RiskGauge label={r.riskLabel} score={r.riskScore} />
                    </td>
                    <td>
                      <a className="roll-btn" href={rollUrl} title={`Compare mutual funds vs ${r.name} on Rolling Returns`}>
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

      <div className="pf-advisor-card">
        <div className="pf-advisor-icon">✦</div>
        <div className="pf-advisor-body">
          <div className="pf-advisor-title">Not sure which benchmark or mutual fund category fits your risk profile?</div>
          <div className="pf-advisor-sub">
            Market valuation metrics provide essential macroeconomic context, not automated buy/sell signals. Consult an AMFI-registered Mutual Fund Distributor to construct an allocation tailored to your personal investment horizon.
          </div>
        </div>
        <a href="/book-consultation" className="pf-advisor-btn">
          Book a Call →
        </a>
      </div>

      {toast && <div className="pf-toast">{toast}</div>}
    </>
  );
}
