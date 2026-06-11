'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const PAGE_SIZE = 50;

const FILTERS = [
  { key: 'above_200',    label: 'Above 200 DMA', group: 'trend',   pos: true  },
  { key: 'above_50',     label: 'Above 50 DMA',  group: 'trend',   pos: true  },
  { key: 'above_20',     label: 'Above 20 DMA',  group: 'trend',   pos: true  },
  { key: 'bull_stacked', label: 'Bull stacked',  group: 'aligned', pos: true  },
  { key: 'bear_stacked', label: 'Bear stacked',  group: 'aligned', pos: false },
  { key: 'golden_cross', label: 'Golden cross',  group: 'cross',   pos: true  },
  { key: 'death_cross',  label: 'Death cross',   group: 'cross',   pos: false },
  { key: 'new_high_52w', label: '52W high',      group: '52w',     pos: true  },
  { key: 'new_low_52w',  label: '52W low',       group: '52w',     pos: false },
];

const SORTS = [
  { key: 'name',         label: 'Name'          },
  { key: 'close',        label: 'Close'         },
  { key: 'pct_from_52h', label: '% from 52W H'  },
  { key: 'pct_from_52l', label: '% from 52W L'  },
  { key: 'above_count',  label: '# DMAs above'  },
];

const fmtNum = (v, d = 2) => v == null ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

function aboveCount(s) {
  return [s.above_20, s.above_50, s.above_100, s.above_150, s.above_200].filter(Boolean).length;
}

function DmaDots({ s }) {
  return (
    <span className="ssc-dots">
      {[20, 50, 100, 150, 200].map((n) => (
        <span key={n} className={`ssc-dot ${s['above_' + n] === true ? 'on' : s['above_' + n] === false ? 'off' : 'na'}`} title={`${n} DMA`} />
      ))}
    </span>
  );
}

function SignalBadges({ s }) {
  const badges = [];
  if (s.bull_stacked)  badges.push(['bs-bull', 'Bull↑']);
  if (s.bear_stacked)  badges.push(['bs-bear', 'Bear↓']);
  if (s.golden_cross)  badges.push(['bs-gc',   'GC']);
  if (s.death_cross)   badges.push(['bs-dc',   'DC']);
  if (s.new_high_52w)  badges.push(['bs-hi',   '52H']);
  if (s.new_low_52w)   badges.push(['bs-lo',   '52L']);
  if (!badges.length)  return null;
  return (
    <span className="ssc-badges">
      {badges.map(([cls, lbl]) => <span key={cls} className={`ssc-badge ${cls}`}>{lbl}</span>)}
    </span>
  );
}

export default function StockScreener() {
  const [raw, setRaw]         = useState(null);
  const [err, setErr]         = useState('');
  const [active, setActive]   = useState(new Set());
  const [sortKey, setSortKey] = useState('above_count');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage]       = useState(0);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    fetch('/api/stock-signals')
      .then((r) => r.json())
      .then((d) => { if (d.error) { setErr(d.error); return; } setRaw(d); })
      .catch(() => setErr('Could not load stock signals.'));
  }, []);

  const toggleFilter = (key) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setPage(0);
  };

  const setSort = (key) => {
    setSortKey((prev) => { if (prev === key) { setSortAsc((a) => !a); return prev; } setSortAsc(false); return key; });
    setPage(0);
  };

  const filtered = useMemo(() => {
    if (!raw?.stocks) return [];
    let list = raw.stocks;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.symbol?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q));
    }
    if (active.size > 0) {
      list = list.filter((s) => [...active].every((k) => s[k] === true));
    }
    const mult = sortAsc ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === 'name')         return mult * (a.name || '').localeCompare(b.name || '');
      if (sortKey === 'close')        return mult * ((a.close ?? 0) - (b.close ?? 0));
      if (sortKey === 'pct_from_52h') return mult * ((a.pct_from_52h ?? -999) - (b.pct_from_52h ?? -999));
      if (sortKey === 'pct_from_52l') return mult * ((a.pct_from_52l ?? 0) - (b.pct_from_52l ?? 0));
      if (sortKey === 'above_count')  return mult * (aboveCount(a) - aboveCount(b));
      return 0;
    });
    return list;
  }, [raw, active, sortKey, sortAsc, search]);

  const pages    = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const asof     = raw?.asof;

  return (
    <div className="ssc-body">
      <Navbar activePage="stock-screener" />
      <div className="container">
        <div className="page-header">
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">Nightly · per-stock signals · BSE liquid universe top-1100</span></div>
          <h1 className="page-title">Stock Screener</h1>
          <p className="page-subtitle">Filter the BSE liquid universe by technical signals, precomputed nightly. All signals use unadjusted EOD prices.{asof ? ` Data as of ${asof}.` : ''}</p>
        </div>

        {err && <div className="ssc-err">{err}</div>}

        {/* search + filter chips */}
        <div className="ssc-toolbar">
          <input
            className="ssc-search"
            type="text"
            placeholder="Search symbol or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
          <div className="ssc-chips">
            {FILTERS.map(({ key, label, pos }) => (
              <button
                key={key}
                className={`ssc-chip ${active.has(key) ? 'on' : ''} ${pos ? 'pos' : 'neg'}`}
                onClick={() => toggleFilter(key)}
              >
                {label}
              </button>
            ))}
            {active.size > 0 && (
              <button className="ssc-chip clear" onClick={() => { setActive(new Set()); setPage(0); }}>
                Clear ×
              </button>
            )}
          </div>
        </div>

        {/* result count */}
        {raw && (
          <div className="ssc-meta">
            {filtered.length} of {raw.stocks.length} stocks
            {active.size > 0 && ` · ${[...active].join(', ')}`}
          </div>
        )}

        {/* table */}
        {!raw && !err && <div className="ssc-loading">Loading signals…</div>}
        {pageRows.length > 0 && (
          <div className="ssc-wrap">
            <table className="ssc-table">
              <thead>
                <tr>
                  <th className="ssc-th-num">#</th>
                  <th className="ssc-th-sym" onClick={() => setSort('name')} style={{ cursor: 'pointer' }}>
                    Symbol / Name {sortKey === 'name' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => setSort('close')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                    Close {sortKey === 'close' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => setSort('above_count')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                    DMAs {sortKey === 'above_count' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ textAlign: 'center' }}>Signals</th>
                  <th onClick={() => setSort('pct_from_52h')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                    vs 52W H {sortKey === 'pct_from_52h' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => setSort('pct_from_52l')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                    vs 52W L {sortKey === 'pct_from_52l' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ textAlign: 'center' }}>A/D</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s, i) => {
                  const adCls = s.adv_dec === 1 ? 'brd-up' : s.adv_dec === -1 ? 'brd-down' : '';
                  const adLbl = s.adv_dec === 1 ? '▲' : s.adv_dec === -1 ? '▼' : '—';
                  return (
                    <tr key={s.isin} className="ssc-tr">
                      <td className="ssc-num">{page * PAGE_SIZE + i + 1}</td>
                      <td className="ssc-sym">
                        <span className="ssc-sym-code">{s.symbol}</span>
                        <span className="ssc-sym-name">{s.name}</span>
                      </td>
                      <td className="ssc-close" style={{ textAlign: 'right' }}>{fmtNum(s.close)}</td>
                      <td style={{ textAlign: 'center' }}><DmaDots s={s} /></td>
                      <td style={{ textAlign: 'center' }}><SignalBadges s={s} /></td>
                      <td style={{ textAlign: 'right' }} className={s.pct_from_52h != null ? (s.pct_from_52h >= -5 ? 'brd-up' : s.pct_from_52h < -20 ? 'brd-down' : '') : ''}>
                        {s.pct_from_52h != null ? s.pct_from_52h.toFixed(1) + '%' : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }} className={s.pct_from_52l != null ? (s.pct_from_52l > 50 ? 'brd-up' : '') : ''}>
                        {s.pct_from_52l != null ? '+' + s.pct_from_52l.toFixed(1) + '%' : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }} className={adCls}>{adLbl}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {pages > 1 && (
          <div className="ssc-pages">
            <button className="ssc-pg" disabled={page === 0} onClick={() => setPage(0)}>«</button>
            <button className="ssc-pg" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span className="ssc-pg-info">{page + 1} / {pages}</span>
            <button className="ssc-pg" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
            <button className="ssc-pg" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
          </div>
        )}

        <div className="ssc-disc">
          <b>Disclaimer.</b> Stock signals are precomputed from unadjusted BSE EOD prices. DMA crossings use simple moving averages. 52-week H/L use intraday highs/lows. Golden/death cross = 50×200 SMA cross within the last 25 sessions. This is technical analysis data for educational reference only — not a recommendation to buy or sell any security.
        </div>
      </div>
      <Footer activePage="stock-screener" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

const CSS = `
.ssc-body{font-family:Raleway,sans-serif;color:var(--text);padding-bottom:48px}

.ssc-err{background:var(--warn-bg,#fff3e0);border:1px solid #ffcc80;color:#8a4300;padding:11px 14px;border-radius:10px;font-size:13px;margin-bottom:16px}
.ssc-loading{text-align:center;color:var(--muted);padding:48px 0;font-size:14px}

.ssc-toolbar{display:flex;flex-direction:column;gap:12px;margin-bottom:14px}
.ssc-search{padding:9px 13px;border:1.5px solid var(--border);border-radius:10px;font:600 13.5px Raleway,sans-serif;color:var(--text);background:var(--surface);width:100%;max-width:340px;outline:none}
.ssc-search:focus{border-color:var(--g2)}
.ssc-chips{display:flex;flex-wrap:wrap;gap:6px}
.ssc-chip{padding:6px 12px;border:1.5px solid var(--border);background:var(--surface);border-radius:999px;font:700 11.5px JetBrains Mono,monospace;color:var(--muted);cursor:pointer;transition:all .14s}
.ssc-chip.pos.on{background:var(--g1);color:#fff;border-color:var(--g1)}
.ssc-chip.neg.on{background:var(--neg);color:#fff;border-color:var(--neg)}
.ssc-chip.clear{background:var(--s3,#eef5ee);border-color:var(--border);color:var(--text2)}
.ssc-chip:hover:not(.on){background:var(--s2)}

.ssc-meta{font:600 12px JetBrains Mono,monospace;color:var(--muted);margin-bottom:12px}

.ssc-wrap{overflow-x:auto;border-radius:12px;border:1px solid var(--border);box-shadow:var(--shadow)}
.ssc-table{width:100%;border-collapse:collapse;font-size:13px;background:var(--surface)}
.ssc-table th{padding:9px 11px;font:700 10.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1.5px solid var(--border);background:var(--s2);white-space:nowrap;user-select:none}
.ssc-table th:hover{color:var(--text)}
.ssc-tr{border-bottom:1px solid var(--border);transition:background .1s}
.ssc-tr:hover{background:var(--s2)}
.ssc-table td{padding:8px 11px;vertical-align:middle}
.ssc-th-num,.ssc-num{width:38px;text-align:right;color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:11px}
.ssc-th-sym{width:200px}
.ssc-sym{display:flex;flex-direction:column;gap:2px}
.ssc-sym-code{font:800 12.5px JetBrains Mono,monospace;color:var(--text);letter-spacing:.02em}
.ssc-sym-name{font:500 11px Raleway,sans-serif;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.ssc-close{font:700 13px JetBrains Mono,monospace;color:var(--text)}

.ssc-dots{display:inline-flex;gap:3px;align-items:center}
.ssc-dot{width:9px;height:9px;border-radius:50%;flex:none}
.ssc-dot.on{background:var(--g2)}.ssc-dot.off{background:#e57373;opacity:.6}.ssc-dot.na{background:var(--border)}

.ssc-badges{display:inline-flex;flex-wrap:wrap;gap:3px}
.ssc-badge{font:700 8.5px JetBrains Mono,monospace;padding:2px 5px;border-radius:4px;white-space:nowrap}
.bs-gc,.bs-bull,.bs-hi{background:var(--g-xlight);color:var(--g1)}
.bs-dc,.bs-bear,.bs-lo{background:#fdeaea;color:var(--neg)}

.ssc-pages{display:flex;align-items:center;gap:6px;justify-content:center;margin-top:16px}
.ssc-pg{padding:7px 12px;border:1.5px solid var(--border);background:var(--surface);border-radius:8px;font:700 12px JetBrains Mono,monospace;color:var(--text2);cursor:pointer;transition:all .12s}
.ssc-pg:hover:not(:disabled){background:var(--s2)}.ssc-pg:disabled{opacity:.35;cursor:default}
.ssc-pg-info{font:600 12px JetBrains Mono,monospace;color:var(--muted);padding:0 6px}

.ssc-disc{margin-top:24px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.ssc-disc b{color:var(--text2)}

@media(max-width:700px){
  .ssc-table th:nth-child(6),.ssc-table td:nth-child(6),
  .ssc-table th:nth-child(7),.ssc-table td:nth-child(7){display:none}
  .ssc-sym-name{max-width:120px}
}
`;
