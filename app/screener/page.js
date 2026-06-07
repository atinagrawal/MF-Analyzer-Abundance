'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

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

const SORTS = [
  { key: 'ret_1y', label: '1Y' },
  { key: 'ret_3y', label: '3Y' },
  { key: 'ret_5y', label: '5Y' },
  { key: 'vol', label: 'Volatility' },
  { key: 'max_dd', label: 'Max DD' },
  { key: 'ret_per_risk', label: 'Return / risk' },
];

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
  { q: 'Why only Regular plans, not Direct?', a: 'Abundance Financial Services is an AMFI-registered mutual fund distributor (ARN-251838), so the screener shows Regular plans. Direct plans are intentionally hidden.' },
  { q: 'Is this investment advice?', a: 'No. This is an educational data tool. Past performance is not indicative of future results, and nothing here is a recommendation. Please consult your financial advisor before investing.' },
];

export default function ScreenerPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const [cat, setCat] = useState('All');
  const [openOnly, setOpenOnly] = useState(true);
  const [sort, setSort] = useState({ key: 'ret_3y', dir: -1 });
  const [sel, setSel] = useState(null);
  const [faq, setFaq] = useState(0);

  useEffect(() => {
    fetch('/api/screener')
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setData(d); })
      .catch(() => setErr('Could not load screener data.'));
  }, []);

  const funds = data?.funds || [];
  const groups = ['All', 'Equity', 'Hybrid', 'Debt', 'Index / FoF', 'Other'];
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
    return FEATURED.map((cat) => ({
      label: cat.label,
      top: pool.filter((f) => cat.m(f.category || '')).sort((a, b) => b.ret_3y - a.ret_3y).slice(0, 3),
    })).filter((c) => c.top.length > 0);
  }, [funds]);

  const jumpTo = (f) => { setGroup('All'); setCat(f.category); setSort({ key: 'ret_3y', dir: -1 }); };

  return (
    <div className="scr-body">
      <Navbar activePage="screener" />
      <div className="container">
        <div className="page-header">
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">Live · rebuilt daily from AMFI NAVs</span></div>
          <h1 className="page-title">Mutual Fund Screener</h1>
          <p className="page-subtitle">Filter and rank {data ? data.count.toLocaleString('en-IN') : '2,500+'} regular mutual funds by category, returns and risk — on real historical NAVs.</p>
        </div>

        {/* controls */}
        <div className="scr-controls">
          <input className="scr-search" placeholder="Search fund or AMC…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="scr-groups">
            {groups.map((g) => (
              <button key={g} className={`scr-chip ${group === g ? 'on' : ''}`} onClick={() => { setGroup(g); setCat('All'); }}>{g}</button>
            ))}
          </div>
          <select className="scr-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="All">All categories</option>
            {cats.map(([c, n]) => <option key={c} value={c}>{shortCat(c)} ({n})</option>)}
          </select>
          <label className="scr-toggle"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /><span>Open-ended only</span></label>
        </div>

        <div className="scr-meta">
          {err ? <span className="scr-neg">{err}</span> : <>Showing <b>{rows.length.toLocaleString('en-IN')}</b> funds{data ? <> · as of {data.asof}</> : ''}. Tap a fund for detail.</>}
        </div>

        {leaders.length > 0 && !q && group === 'All' && cat === 'All' && (
          <section className="scr-leaders" aria-label="Category leaders">
            <div className="scr-leaders-h">Category leaders <em>· top 3 by 3-year return (open-ended)</em></div>
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

        {/* table */}
        <div className="scr-table-wrap">
          <table className="scr-table">
            <thead>
              <tr>
                <th className="scr-name-h">Fund</th>
                {SORTS.map((s) => (
                  <th key={s.key} className={`scr-sortable ${sort.key === s.key ? 'active' : ''}`} onClick={() => setSortKey(s.key)}>
                    {s.label}{sort.key === s.key ? <span className="scr-arrow">{sort.dir < 0 ? '▾' : '▴'}</span> : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((f) => (
                <tr key={f.code} className="scr-row" onClick={() => setSel(f)}>
                  <td className="scr-name">
                    <button className="scr-fundlink" onClick={(e) => { e.stopPropagation(); setSel(f); }}>
                      <span className="scr-fund-n">{f.name.replace(/\s*-\s*(Regular Plan|Regular|Growth( Option)?| Plan).*/i, '').trim()}{f.flag === 'check' && <span className="scr-flag" title="Unusual value — under review">⚠</span>}</span>
                      <span className="scr-fund-sub">{f.amc} · {shortCat(f.category)}</span>
                    </button>
                  </td>
                  <td className={cls(f.ret_1y)}>{pctTxt(f.ret_1y)}</td>
                  <td className={cls(f.ret_3y)}>{pctTxt(f.ret_3y)}</td>
                  <td className={cls(f.ret_5y)}>{pctTxt(f.ret_5y)}</td>
                  <td>{numTxt(f.vol)}{f.vol != null ? '%' : ''}</td>
                  <td className="scr-neg">{f.max_dd != null ? f.max_dd.toFixed(1) + '%' : '—'}</td>
                  <td><b>{numTxt(f.ret_per_risk, 2)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 300 && <div className="scr-more">Showing top 300 — refine filters or search to narrow down.</div>}
          {!data && !err && <div className="scr-loading">Loading funds…</div>}
        </div>

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

function Spark({ nav }) {
  if (!nav) return <div className="scr-spark-load">Loading NAV history…</div>;
  if (nav.length < 2) return null;
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

/* category leaders */
.scr-leaders{margin-bottom:18px}
.scr-leaders-h{font:600 11px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.scr-leaders-h em{font-style:normal;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:500}
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
.scr-table{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
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
.scr-fundlink{display:flex;flex-direction:column;gap:2px;background:none;border:0;padding:0;text-align:left;cursor:pointer;max-width:280px}
.scr-fund-n{font:700 13.5px Raleway,sans-serif;color:var(--g1);line-height:1.25;white-space:normal}
.scr-fundlink:hover .scr-fund-n{text-decoration:underline}
.scr-fund-sub{font:500 11px JetBrains Mono,monospace;color:var(--muted)}
.scr-flag{color:var(--warn);margin-left:5px;font-size:12px}
.scr-pos{color:var(--g2)}
.scr-neg{color:var(--neg)}
.scr-muted{color:var(--muted)}
.scr-more,.scr-loading{padding:14px;text-align:center;color:var(--muted);font-size:13px}

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
