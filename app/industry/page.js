'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

/* ── constants ── */
const MONTHS      = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LABELS= ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MO_SHORT    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TYPE_COLORS = {
  equity:  { badge:'type-equity',   label:'Equity'   },
  debt:    { badge:'type-debt',     label:'Debt'     },
  hybrid:  { badge:'type-hybrid',   label:'Hybrid'   },
  passive: { badge:'type-passive',  label:'Passive'  },
  solution:{ badge:'type-solution', label:'Solution' },
};
const YEARS = [];
for (let y = new Date().getFullYear(); y >= 2020; y--) YEARS.push(y);

/* ── helpers ── */
function getDefaultDate() {
  const now = new Date();
  const offset = now.getDate() < 10 ? 2 : 1;
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return { mon: MONTHS[d.getMonth()], year: d.getFullYear() };
}
function fmtCr(val) {
  if (!val && val !== 0) return '—';
  if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + 'L Cr';
  if (val >= 1000)   return '₹' + (val / 1000).toFixed(2)   + 'K Cr';
  return '₹' + val.toFixed(2) + ' Cr';
}
function fmtFlow(val) {
  if (!val && val !== 0) return '—';
  const a = Math.abs(val);
  const s = a >= 100000 ? (a/100000).toFixed(2)+'L' : a >= 1000 ? (a/1000).toFixed(2)+'K' : a.toFixed(2);
  return (val < 0 ? '−' : '+') + '₹' + s + ' Cr';
}
function fmtFolios(val) {
  if (!val && val !== 0) return '—';
  if (val >= 10000000) return (val/10000000).toFixed(2) + ' Cr';
  if (val >= 100000)   return (val/100000).toFixed(2)   + ' L';
  return val.toLocaleString('en-IN');
}
function fmtNum(val) {
  if (!val && val !== 0) return '—';
  return val.toLocaleString('en-IN');
}
function fmtShort(v) {
  const a = Math.abs(v);
  if (a >= 100000) return (v < 0 ? '−' : '') + (a/100000).toFixed(1) + 'L';
  if (a >= 1000)   return (v < 0 ? '−' : '') + (a/1000).toFixed(0)   + 'K';
  return String(Math.round(v));
}
function hmColor(v) {
  if (v >= 8000) return { bg:'#1b5e20', tx:'#fff' };
  if (v >= 4000) return { bg:'#2e7d32', tx:'#fff' };
  if (v >= 2000) return { bg:'#43a047', tx:'#fff' };
  if (v >= 500)  return { bg:'#81c784', tx:'#2e4d2e' };
  if (v >= 0)    return { bg:'#c8e6c9', tx:'#5e8a5e' };
  if (v >= -500) return { bg:'#ffcdd2', tx:'#c62828' };
  return { bg:'#b71c1c', tx:'#fff' };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* chart refs survive re-renders */
let gCharts = {};
let gTrendCharts = {};

export default function IndustryPage() {
  const def = getDefaultDate();
  const [selMon,   setSelMon]   = useState(def.mon);
  const [selYear,  setSelYear]  = useState(def.year);
  const [loading,  setLoading]  = useState(false);
  const [data,     setData]     = useState(null);
  const [error,    setError]    = useState(null);
  const [sourceNote, setSourceNote] = useState('Source: AMFI Monthly Report');
  const [parseWarn, setParseWarn]   = useState(false);

  /* table state */
  const [sortCol, setSortCol] = useState('aum');
  const [sortDir, setSortDir] = useState(-1);
  const [filterType, setFilterType] = useState('all');

  /* trends */
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsData,    setTrendsData]    = useState(null);
  const [sipData,       setSipData]       = useState(null);
  const [sipLoading,    setSipLoading]    = useState(false);
  const [sipTrendData,  setSipTrendData]  = useState(null); // 12-month SIP inflow array

  const flowCanvasRef = useRef(null);
  const trendSecRef   = useRef(null);

  /* ── load main data ── */
  // loadData() with no args → API auto-resolves latest available month
  // loadData(mon, year) → load specific month
  const loadData = useCallback(async (mon, year, attempt = 1) => {
    const MAX = 3;
    const isBrowse = !!mon; // true when user explicitly selects a month
    const targetMon  = mon  || null;
    const targetYear = year || null;
    const label = targetMon
      ? MONTH_LABELS[MONTHS.indexOf(targetMon)] + ' ' + targetYear
      : 'latest available month';

    setLoading(true); setError(null); setData(null); setParseWarn(false);
    setTrendsData(null);
    Object.values(gCharts).forEach(c => { try { c.destroy(); } catch (_) {} });
    gCharts = {};

    const apiUrl = targetMon
      ? `/api/amfi-industry?month=${targetMon}&year=${targetYear}`
      : '/api/amfi-industry';

    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
        if (attempt < MAX) { await sleep(800 * attempt); return loadData(mon, year, attempt + 1); }
        setError('Report not available for ' + label + (err.error ? ' — ' + err.error : ''));
        setLoading(false); return;
      }
      const d = await res.json();
      if (d.error) {
        if (attempt < MAX) { await sleep(800 * attempt); return loadData(mon, year, attempt + 1); }
        setError('Could not load data — ' + d.error);
        setLoading(false); return;
      }
      const catCount = Object.keys(d.categories || {}).length;
      if (catCount < 10 && attempt < MAX) { await sleep(800 * attempt); return loadData(mon, year, attempt + 1); }
      if (catCount < 10) setParseWarn(true);
      setData(d);
      // Sync selectors to actual month returned by API
      if (d.month) setSelMon(d.month);
      if (d.year)  setSelYear(d.year);
      const resolvedLabel = d.month && d.year
        ? MONTH_LABELS[MONTHS.indexOf(d.month)] + ' ' + d.year
        : label;
      setSourceNote('Source: AMFI Monthly Report · ' + resolvedLabel + ' · ' + new Date(d.parsedAt || Date.now()).toLocaleTimeString('en-IN'));
      setLoading(false);
      loadTrends(d.month || targetMon, parseInt(d.year || targetYear));
    } catch (e) {
      if (attempt < MAX) { await sleep(800 * attempt); return loadData(mon, year, attempt + 1); }
      setError('Network error — ' + e.message);
      setLoading(false);
    }
  }, []);

  /* ── auto-load on mount ── */
  useEffect(() => {
    loadData();
    // Fetch SIP metrics from AMFI Monthly Note PDF (fires once, cached server-side 24h)
    setSipLoading(true);
    fetch('/api/amfi-monthly-note?v=2')
      .then(r => r.json())
      .then(d => { if (d.ok && d.sipInflow) setSipData(d); })
      .catch(() => {/* silent — graceful degradation */})
      .finally(() => setSipLoading(false));
  }, [loadData]);

  /* ── trends: 12-month parallel fetch ── */
  async function loadTrends(curMon, curYear) {
    setTrendsLoading(true); setTrendsData(null);
    Object.values(gTrendCharts).forEach(c => { try { c.destroy(); } catch (_) {} });
    gTrendCharts = {};

    const mi = MONTHS.indexOf(curMon);
    const monthList = [];
    for (let i = 11; i >= 0; i--) {
      let m = mi - i, y = curYear;
      while (m < 0) { m += 12; y--; }
      monthList.push({ mon: MONTHS[m], year: y, label: MO_SHORT[m] + '-' + String(y).slice(2) });
    }
    // Fetch industry data + SIP monthly note data in parallel
    const [industryResults, sipResults] = await Promise.all([
      Promise.allSettled(
        monthList.map(async ({ mon, year }) => {
          const r = await fetch(`/api/amfi-industry?month=${mon}&year=${year}`);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const d = await r.json();
          if (d.error) throw new Error(d.error);
          return d;
        })
      ),
      Promise.allSettled(
        monthList.map(async ({ mon, year, label }) => {
          try {
            // v=2 busts the immutable edge cache containing the wrong SIF numbers
            const r = await fetch(`/api/amfi-monthly-note?month=${mon}&year=${year}&v=2`);
            if (!r.ok) return null;
            const d = await r.json();
            // Return numeric inflow + label even if other fields missing
            return d.ok && d.sipInflowNum ? { label, sipInflowNum: d.sipInflowNum, sipInflow: d.sipInflow } : null;
          } catch { return null; }
        })
      ),
    ]);

    const successful = industryResults
      .map((r, i) => r.status === 'fulfilled' && r.value?.summary?.totalAum ? { ...r.value, _label: monthList[i].label } : null)
      .filter(Boolean);

    // SIP trend: preserve position alignment with industry months
    const sipMonths = sipResults.map((r, i) => {
      if (r.status === 'fulfilled' && r.value) return r.value;
      return { label: monthList[i].label, sipInflowNum: null, sipInflow: null };
    });
    const hasSipData = sipMonths.some(s => s.sipInflowNum != null);
    if (hasSipData) setSipTrendData(sipMonths);

    setTrendsLoading(false);
    if (successful.length >= 3) setTrendsData(successful);
  }

  /* ── draw flow bar chart ── */
  useEffect(() => {
    if (!data || !flowCanvasRef.current || typeof window === 'undefined' || !window.Chart) return;
    const timer = setTimeout(() => drawFlowBar(data.categories || {}), 60);
    return () => clearTimeout(timer);
  }, [data]);

  /* ── draw trend charts ── */
  useEffect(() => {
    if (!trendsData || typeof window === 'undefined' || !window.Chart) return;
    const timer = setTimeout(() => drawTrendCharts(trendsData), 80);
    return () => clearTimeout(timer);
  }, [trendsData, sipTrendData]);

  /* ── intersection observer for trend animations ── */
  useEffect(() => {
    if (!trendsData || !trendSecRef.current) return;
    const els = trendSecRef.current.querySelectorAll('.trend-stat,.trend-anim');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('on'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [trendsData]);

  /* ── cleanup on unmount ── */
  useEffect(() => () => {
    Object.values(gCharts).forEach(c => { try { c.destroy(); } catch (_) {} });
    Object.values(gTrendCharts).forEach(c => { try { c.destroy(); } catch (_) {} });
  }, []);

  /* ── Chart drawing ── */
  function drawFlowBar(cats) {
    const ctx = flowCanvasRef.current;
    if (!ctx || !window.Chart) return;
    if (gCharts.flow) { try { gCharts.flow.destroy(); } catch (_) {} }
    const flows = { equity:0, debt:0, hybrid:0, passive:0, solution:0 };
    Object.values(cats).forEach(c => { if (flows[c.type] !== undefined) flows[c.type] += (c.netFlow || 0); });
    const labels = ['Equity','Debt','Hybrid','Passive','Solution'];
    const vals   = [flows.equity, flows.debt, flows.hybrid, flows.passive, flows.solution];
    const colors = vals.map(v => v >= 0 ? 'rgba(27,94,32,.82)' : 'rgba(183,28,28,.72)');
    gCharts.flow = new window.Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderRadius: 7, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeInOutQuart' },
        plugins: { legend: { display: false }, tooltip: { backgroundColor:'#162616', bodyFont:{ family:'JetBrains Mono',size:11 }, padding:10, cornerRadius:7, callbacks:{ label: c => ' Net Flow: '+fmtFlow(c.raw) } } },
        scales: {
          x: { grid:{ display:false }, ticks:{ font:{ family:'Raleway', size:12 }, color:'#2e4d2e' } },
          y: { grid:{ color:'rgba(0,0,0,.05)' }, ticks:{ font:{ family:'JetBrains Mono', size:10 }, callback: v => v>=0 ? '+₹'+fmtNum(Math.round(v/100))+'K Cr' : '−₹'+fmtNum(Math.round(-v/100))+'K Cr' } }
        }
      }
    });
  }

  function drawTrendCharts(months) {
    if (!window.Chart) return;
    Object.values(gTrendCharts).forEach(c => { try { c.destroy(); } catch (_) {} });
    gTrendCharts = {};

    const N      = months.length;
    const labels = months.map(m => m._label);
    const totalAum = months.map(m => +(m.summary.totalAum/100000).toFixed(2));
    const equityAum= months.map(m => +(m.summary.equityAum/100000).toFixed(2));
    const debtAum  = months.map(m => +(m.summary.debtAum/100000).toFixed(2));

    function getMonthFolios(m) {
      if (m.summary?.totalFolios > 0) return m.summary.totalFolios;
      if (m.grandTotal?.folios > 0)   return m.grandTotal.folios;
      return Object.values(m.categories||{}).reduce((s,c) => s+(c.folios||0), 0);
    }
    const folioRaw  = months.map(getMonthFolios);
    const folios    = folioRaw.map(v => +(v/10000000).toFixed(2));
    const folioDelta= folioRaw.slice(1).map((v,i) => Math.round((v-folioRaw[i])/100000));

    function sumType(d, type) { return Object.values(d.categories||{}).filter(c=>c.type===type).reduce((s,c)=>s+(c.netFlow||0),0); }
    const eqNet  = months.map(m => Math.round(sumType(m,'equity')));
    const liqNet = months.map(m => Math.round(m.categories?.liquidFund?.netFlow||0));
    const mmNet  = months.map(m => Math.round(m.categories?.moneyMarket?.netFlow||0));
    const mktRet = months.slice(1).map((_,i) => Math.round((months[i+1].summary.equityAum - months[i].summary.equityAum)*100000 - eqNet[i+1]));

    const eqShare  = months.map(m => +((m.summary.equityAum/m.summary.totalAum)*100).toFixed(1));
    const debtShare= months.map(m => +((m.summary.debtAum/m.summary.totalAum)*100).toFixed(1));
    const hybShare = months.map(m => +((m.summary.hybridAum/m.summary.totalAum)*100).toFixed(1));
    const pasShare = months.map(m => +((m.summary.passiveAum/m.summary.totalAum)*100).toFixed(1));

    const _f0 = folios[0] || 1, _a0 = totalAum[0] || 1;
    const folIdx = folios.map(f  => +((f/_f0)*100).toFixed(1));
    const aumIdx = totalAum.map(a => +((a/_a0)*100).toFixed(1));
    const gap    = folIdx.map((f,i) => +(aumIdx[i]-f).toFixed(1));

    const tOpts = (extra = {}) => ({
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 950, easing: 'easeInOutQuart' },
      plugins: { legend:{ display:false }, tooltip:{ backgroundColor:'#162616', titleFont:{family:'JetBrains Mono',size:10}, bodyFont:{family:'JetBrains Mono',size:11}, padding:9, cornerRadius:7, ...(extra.plugins||{}) } },
      scales: {
        x: { grid:{ display:false }, ticks:{ font:{size:9}, maxRotation:45, autoSkip:false }, ...(extra.scaleX||{}) },
        y: { grid:{ color:'rgba(0,0,0,.05)' }, ticks:{ font:{size:9} }, ...(extra.scaleY||{}) }
      }
    });

    const c1 = document.getElementById('tAum');
    if (c1) gTrendCharts.aum = new window.Chart(c1, { type:'line', data:{ labels, datasets:[
      { label:'Total AUM', data:totalAum, borderColor:'#2e7d32', backgroundColor:'rgba(46,125,50,.08)', fill:true, tension:.35, pointRadius:3, borderWidth:2.5 },
      { label:'Equity',    data:equityAum, borderColor:'#1565c0', fill:false, tension:.35, pointRadius:2, borderWidth:1.5, borderDash:[5,3] },
      { label:'Debt',      data:debtAum,   borderColor:'#880e4f', fill:false, tension:.35, pointRadius:2, borderWidth:1.5, borderDash:[5,3] },
    ]}, options: tOpts({ plugins:{ tooltip:{ callbacks:{ label: c => ` ${c.dataset.label}: ₹${c.parsed.y.toFixed(2)}L Cr` } } }, scaleY:{ ticks:{ callback: v => '₹'+v+'L' } } }) });

    const c2 = document.getElementById('tMkt');
    if (c2) gTrendCharts.mkt = new window.Chart(c2, { type:'bar', data:{ labels:labels.slice(1), datasets:[{ label:'Market return', data:mktRet, backgroundColor:mktRet.map(v=>v>=0?'rgba(27,94,32,.78)':'rgba(183,28,28,.72)'), borderRadius:3 }] },
      options: tOpts({ plugins:{ tooltip:{ callbacks:{ label: c => ` ₹${c.parsed.y>=0?'+':''}${c.parsed.y.toLocaleString('en-IN')} Cr` } } }, scaleY:{ ticks:{ callback: v => v>=0?'+₹'+(v/1000).toFixed(0)+'K':'−₹'+(Math.abs(v)/1000).toFixed(0)+'K' } } }) });

    const c3 = document.getElementById('tDebt');
    if (c3) gTrendCharts.debt = new window.Chart(c3, { type:'line', data:{ labels, datasets:[
      { label:'Liquid',       data:liqNet, borderColor:'#00838f', backgroundColor:'rgba(0,131,143,.06)', fill:true, tension:.3, pointRadius:2, borderWidth:2 },
      { label:'Money Market', data:mmNet,  borderColor:'#6a1b9a', fill:false, tension:.3, pointRadius:2, borderWidth:1.5, borderDash:[4,3] },
    ]}, options: tOpts({ plugins:{ tooltip:{ callbacks:{ label: c => ` ${c.dataset.label}: ₹${c.parsed.y>=0?'+':''}${c.parsed.y.toLocaleString('en-IN')} Cr` } } }, scaleY:{ ticks:{ callback: v => (v>=0?'+':'')+(v/1000).toFixed(0)+'K' } } }) });

    const c4 = document.getElementById('tEq');
    if (c4) gTrendCharts.eq = new window.Chart(c4, { type:'bar', data:{ labels, datasets:[{ label:'Equity net flow', data:eqNet, backgroundColor:eqNet.map(v=>v>=0?'rgba(27,94,32,.78)':'rgba(183,28,28,.72)'), borderRadius:3 }] },
      options: tOpts({ plugins:{ tooltip:{ callbacks:{ label: c => ` ₹${c.parsed.y.toLocaleString('en-IN')} Cr` } } }, scaleY:{ ticks:{ callback: v => (v/1000).toFixed(0)+'K' } } }) });

    const c5 = document.getElementById('tFol');
    if (c5) gTrendCharts.fol = new window.Chart(c5, { type:'line', data:{ labels, datasets:[{ label:'Folios (Cr)', data:folios, borderColor:'#6a1b9a', backgroundColor:'rgba(106,27,154,.07)', fill:true, tension:.35, pointRadius:3, borderWidth:2 }] },
      options: tOpts({ plugins:{ tooltip:{ callbacks:{ label: c => ` ${c.parsed.y.toFixed(2)} Cr` } } }, scaleY:{ min:Math.min(...folios)*.99, ticks:{ callback: v => v.toFixed(1)+' Cr' } } }) });

    const c6 = document.getElementById('tMom');
    if (c6) gTrendCharts.mom = new window.Chart(c6, { type:'bar', data:{ labels:labels.slice(1), datasets:[{ label:'New accounts (L)', data:folioDelta, backgroundColor:'rgba(0,131,143,.72)', borderRadius:3 }] },
      options: tOpts({ plugins:{ tooltip:{ callbacks:{ label: c => ` ${c.parsed.y} lakh new accounts` } } }, scaleY:{ ticks:{ callback: v => v+' L' } } }) });

    // SIP inflow chart — drawn only if sipTrendData is available
    const cSip = document.getElementById('tSip');
    if (cSip && sipTrendData) {
      const sipLabels = sipTrendData.map(s => s.label);
      const sipVals   = sipTrendData.map(s => s.sipInflowNum);
      gTrendCharts.sip = new window.Chart(cSip, {
        type: 'bar',
        data: {
          labels: sipLabels,
          datasets: [{
            label: 'SIP monthly inflow (₹ Cr)',
            data: sipVals,
            backgroundColor: sipVals.map(v =>
              v == null ? 'rgba(0,0,0,.08)' : 'rgba(21,101,192,.78)'
            ),
            borderRadius: 3,
          }]
        },
        options: tOpts({
          plugins: { tooltip: { callbacks: { label: c => c.raw == null ? ' Data unavailable' : ` ₹${c.raw.toLocaleString('en-IN')} Cr` } } },
          scaleY: { ticks: { callback: v => '₹'+(v/1000).toFixed(0)+'K' } },
        })
      });
    }

    const c7 = document.getElementById('tDiv');
    if (c7) gTrendCharts.div = new window.Chart(c7, { type:'line', data:{ labels, datasets:[
      { label:'Folio index', data:folIdx, borderColor:'#6a1b9a', fill:false, tension:.3, pointRadius:2, borderWidth:2 },
      { label:'AUM index',   data:aumIdx, borderColor:'#2e7d32', backgroundColor:'rgba(46,125,50,.06)', fill:true, tension:.3, pointRadius:2, borderWidth:2 },
      { label:'Gap',         data:gap,    borderColor:'#e65100', backgroundColor:'rgba(230,81,0,.05)', fill:true, tension:.3, pointRadius:0, borderWidth:1.5, borderDash:[4,3] },
    ]}, options: tOpts({ plugins:{ tooltip:{ callbacks:{ label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}` } } }, scaleY:{ min: Math.min(...[...folIdx,...aumIdx])*.99, ticks:{ callback: v => v.toFixed(0) } } }) });

    const c8 = document.getElementById('tComp');
    if (c8) gTrendCharts.comp = new window.Chart(c8, { type:'bar', data:{ labels, datasets:[
      { label:'Equity %',  data:eqShare,   backgroundColor:'#1565c0', stack:'s' },
      { label:'Debt %',    data:debtShare,  backgroundColor:'#880e4f', stack:'s' },
      { label:'Hybrid %',  data:hybShare,   backgroundColor:'#6a1b9a', stack:'s' },
      { label:'Passive %', data:pasShare,   backgroundColor:'#1b5e20', stack:'s' },
    ]}, options: {
      responsive:true, maintainAspectRatio:false,
      animation:{ duration:950, easing:'easeInOutQuart' },
      plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#162616', bodyFont:{family:'JetBrains Mono',size:11}, padding:9, cornerRadius:7, mode:'index', callbacks:{ label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } },
      scales:{
        x:{ stacked:true, grid:{display:false}, ticks:{font:{size:9},maxRotation:45,autoSkip:false} },
        y:{ stacked:true, grid:{color:'rgba(0,0,0,.05)'}, ticks:{font:{size:9},callback:v=>v+'%'}, min:0, max:100 }
      }
    }});
  }

  /* ── Table rendering ── */
  function getTableRows() {
    if (!data) return [];
    const cats = data.categories || {};
    let rows = Object.values(cats);
    if (filterType !== 'all') rows = rows.filter(r => r.type === filterType);
    rows.sort((a, b) => {
      const av = a[sortCol] ?? (sortCol === 'label' ? '' : 0);
      const bv = b[sortCol] ?? (sortCol === 'label' ? '' : 0);
      if (typeof av === 'string') return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
    return rows;
  }

  function handleSortTable(col) {
    if (sortCol === col) setSortDir(d => d * -1);
    else { setSortCol(col); setSortDir(-1); }
  }

  /* ── Trends rendering helpers ── */
  function renderHeatmap(months) {
    const hmCats = ['Flexi Cap','Mid Cap','Small Cap','Sectoral','Large Cap','Lg & Mid Cap','Multi Cap','ELSS'];
    const hmKeys = ['flexiCap','midCap','smallCap','sectoralThematic','largeCap','largeMidCap','multiCap','elss'];
    const labels  = months.map(m => m._label);
    const hmData  = hmKeys.map(k => months.map(m => Math.round(m.categories?.[k]?.netFlow || 0)));
    return (
      <div className="hm-scroll">
        <div className="hm-inner">
          <div className="hm-mrow">{labels.map((l,i) => <div key={i} className="hm-mlbl">{l}</div>)}</div>
          {hmCats.map((cat, ri) => (
            <div key={ri} className="hm-row">
              <div className="hm-cat">{cat}</div>
              <div className="hm-cells">
                {hmData[ri].map((val, ci) => {
                  const { bg, tx } = hmColor(val);
                  return (
                    <div key={ci} className="hm-cell" style={{ background:bg, color:tx, animationDelay: ci*60+'ms' }}
                      title={`${cat} ${labels[ci]}: ₹${val.toLocaleString('en-IN')} Cr`}>
                      {fmtShort(val)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderHBars(data, isPct) {
    const maxV = Math.max(...data.map(d => d.v), 1);
    return data.map((d, i) => {
      const w = (d.v / maxV * 100).toFixed(1);
      const c = d.c || (d.v > 60 ? '#1b5e20' : d.v > 30 ? '#43a047' : d.v > 10 ? '#66bb6a' : '#a5d6a7');
      return (
        <div key={i} className="hbar-row">
          <div className="hbar-label">{d.n}</div>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: w+'%', background: c }}/></div>
          <div className="hbar-val" style={{ color: c }}>{d.v}{isPct ? '%' : ''}</div>
        </div>
      );
    });
  }

  function renderTrendsSection(months) {
    const N = months.length;
    const labels = months.map(m => m._label);
    const totalAum = months.map(m => +(m.summary.totalAum/100000).toFixed(2));
    function getMonthFolios(m) {
      if (m.summary?.totalFolios > 0) return m.summary.totalFolios;
      if (m.grandTotal?.folios > 0)   return m.grandTotal.folios;
      return Object.values(m.categories||{}).reduce((s,c) => s+(c.folios||0), 0);
    }
    const folioRaw = months.map(getMonthFolios);
    const folios   = folioRaw.map(v => +(v/10000000).toFixed(2));
    function sumType(d, type) { return Object.values(d.categories||{}).filter(c=>c.type===type).reduce((s,c)=>s+(c.netFlow||0),0); }
    const eqNet = months.map(m => Math.round(sumType(m,'equity')));
    const cumEqFlow = eqNet.reduce((s,v) => s+v, 0);
    const pasShare  = months.map(m => +((m.summary.passiveAum/m.summary.totalAum)*100).toFixed(1));
    const pasShareChg = (pasShare[N-1] - pasShare[0]).toFixed(1);
    const aumGrowth = ((totalAum[N-1]-totalAum[0])*100000).toFixed(0);
    const folioGrowthVal = (folios[N-1]-folios[0]).toFixed(2);
    const rng = `${labels[0].split('-')[0]} 20${labels[0].split('-')[1]} — ${labels[N-1].split('-')[0]} 20${labels[N-1].split('-')[1]}`;

    const hmKeys = ['flexiCap','midCap','smallCap','sectoralThematic','largeCap','largeMidCap','multiCap','elss'];
    const hmCatsN= ['Flexi Cap','Mid Cap','Small Cap','Sectoral','Large Cap','Lg & Mid Cap','Multi Cap','ELSS'];
    const hmData = hmKeys.map(k => months.map(m => Math.round(m.categories?.[k]?.netFlow||0)));
    const leadData = hmKeys.map((k,i) => ({ n:hmCatsN[i], v: hmData[i].reduce((s,x)=>s+x,0) }))
      .concat([
        { n:'Multi Asset Alloc', v: months.map(m=>Math.round(m.categories?.multiAsset?.netFlow||0)).reduce((s,x)=>s+x,0) },
        { n:'Balanced Adv.',     v: months.map(m=>Math.round(m.categories?.balancedAdvantage?.netFlow||0)).reduce((s,x)=>s+x,0) },
      ])
      .filter(d => d.v > 0)
      .sort((a,b) => b.v - a.v)
      .slice(0, 8);

    const stickyData = [
      {n:'Retirement Fund',v:84},{n:"Children's Fund",v:77},{n:'ELSS',v:67},
      {n:'Multi Asset',v:70},{n:'Flexi Cap',v:51},{n:'Mid Cap',v:48},
      {n:'Small Cap',v:45},{n:'Money Market',v:9},{n:'Liquid Fund',v:10},{n:'Overnight',v:3},
    ];
    const redmData = [
      {n:'Sectoral/Thematic',v:1.91,c:'#e65100'},{n:'Small Cap',v:1.02,c:'#f57c00'},
      {n:'Balanced Adv.',v:1.00,c:'#f57c00'},{n:'Focused Fund',v:0.91,c:'#ffa726'},
      {n:'Multi Asset',v:0.91,c:'#ffa726'},{n:'Mid Cap',v:0.83,c:'#66bb6a'},
      {n:'Aggr. Hybrid',v:0.81,c:'#66bb6a'},{n:'Lg & Mid Cap',v:0.81,c:'#66bb6a'},
      {n:'ELSS',v:0.79,c:'#43a047'},{n:'Flexi Cap',v:0.74,c:'#2e7d32'},
    ];

    return (
      <div ref={trendSecRef}>
        <div className="trends-divider"/>
        <div className="section-head" style={{marginBottom:16}}>
          <div className="section-title">📅 12-month industry trends</div>
          <div className="section-badge">{rng.toUpperCase()}</div>
        </div>

        <div className="trend-stat-grid">
          {[
            { label:'AUM growth', val: '+₹'+(Math.abs(aumGrowth)/100000).toFixed(1)+'L Cr', sub: labels[0]+' → '+labels[N-1], delta: '+'+((totalAum[N-1]/totalAum[0]-1)*100).toFixed(1)+'%' },
            { label:'New folios', val: '+'+folioGrowthVal+' Cr', sub:'Investor accounts opened', delta: '+'+((folios[N-1]/folios[0]-1)*100).toFixed(1)+'%', d:.08 },
            { label:'Equity net inflow', val: '₹'+(cumEqFlow/100000).toFixed(1)+'L Cr', sub:'12-month cumulative', delta:'All months positive ✓', d:.16 },
            { label:'Passive AUM share', val: pasShare[N-1]+'%', sub:'Was '+pasShare[0]+'% a year ago', delta:(pasShareChg>=0?'+':'')+pasShareChg+' pp shift ↑', d:.24 },
          ].map((s,i) => (
            <div key={i} className="trend-stat" style={s.d?{transitionDelay:s.d+'s'}:{}}>
              <div className="ts-label">{s.label}</div>
              <div className="ts-val">{s.val}</div>
              <div className="ts-sub">{s.sub}</div>
              <div className="ts-delta">{s.delta}</div>
            </div>
          ))}
        </div>

        <div className="trend-anim">
          <div className="section-head" style={{marginBottom:14}}><div className="section-title">📈 Total AUM growth</div><div className="section-badge">₹ LAKH CRORE</div></div>
          <div className="chart-card" style={{marginBottom:16}}>
            <div className="chart-title">Total industry AUM with equity & debt overlay</div>
            <div className="chart-sub">End-of-month · dashed lines = sub-components</div>
            <div className="chart-leg">
              <span><span className="ld" style={{background:'#2e7d32'}}/>Total AUM</span>
              <span><span className="ld" style={{background:'#1565c0',opacity:.75}}/>Equity</span>
              <span><span className="ld" style={{background:'#880e4f',opacity:.75}}/>Debt</span>
            </div>
            <div className="chart-wrap" style={{height:200}}><canvas id="tAum"/></div>
          </div>
        </div>

        <div className="chart-duo trend-anim" style={{transitionDelay:'.08s'}}>
          <div className="chart-card">
            <div className="chart-title">Implied equity market return (₹ Cr)</div>
            <div className="chart-sub">AUM change minus net inflows = market's contribution</div>
            <div className="chart-wrap" style={{height:165}}><canvas id="tMkt"/></div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Quarter-end debt fund anomaly</div>
            <div className="chart-sub">Liquid & money market surge/slump at Q-ends</div>
            <div className="chart-leg">
              <span><span className="ld" style={{background:'#00838f'}}/>Liquid</span>
              <span><span className="ld" style={{background:'#6a1b9a',opacity:.7}}/>Money Mkt</span>
            </div>
            <div className="chart-wrap" style={{height:140}}><canvas id="tDebt"/></div>
          </div>
        </div>

        <div className="trend-anim" style={{transitionDelay:'.14s'}}>
          <div className="section-head" style={{marginBottom:14}}><div className="section-title">🔥 Category rotation heatmap</div><div className="section-badge">EQUITY NET FLOWS</div></div>
          <div className="chart-card" style={{marginBottom:16,padding:'18px 18px 14px'}}>
            <div className="chart-title">Which equity categories attracted or lost money each month</div>
            <div className="chart-sub">Cell = net inflow (₹ Cr) · deep green = strong buying · red = net redemption</div>
            {renderHeatmap(months)}
            <div className="hm-legend">
              <span style={{fontSize:'.58rem',color:'var(--muted)'}}>Outflow</span>
              <div className="hm-scale"/>
              <span style={{fontSize:'.58rem',color:'var(--muted)'}}>High inflow</span>
            </div>
          </div>
        </div>

        <div className="chart-duo trend-anim" style={{transitionDelay:'.2s'}}>
          <div className="chart-card">
            <div className="chart-title">Equity net flows — monthly (₹ Cr)</div>
            <div className="chart-sub">Green = net buying · red = net redemption</div>
            <div className="chart-wrap" style={{height:170}}><canvas id="tEq"/></div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Folio count growth (crore accounts)</div>
            <div className="chart-sub">Total investor accounts, all fund types</div>
            <div className="chart-wrap" style={{height:170}}><canvas id="tFol"/></div>
          </div>
        </div>

        <div className="chart-duo trend-anim" style={{transitionDelay:'.26s'}}>
          <div className="chart-card">
            <div className="chart-title">Fund stickiness score — net ÷ gross inflow (%)</div>
            <div className="chart-sub">Higher = money stays in · lower = in-and-out cycling</div>
            <div>{renderHBars(stickyData, true)}</div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Redemption pressure — redemptions ÷ AUM (%)</div>
            <div className="chart-sub">Equity & hybrid only · debt excluded (structural turnover)</div>
            <div>{renderHBars(redmData, true)}</div>
          </div>
        </div>

        <div className="chart-duo trend-anim" style={{transitionDelay:'.32s'}}>
          <div className="chart-card">
            <div className="chart-title">New investor momentum — monthly folio additions (lakh)</div>
            <div className="chart-sub">Month-over-month accounts registered industry-wide</div>
            <div className="chart-wrap" style={{height:170}}><canvas id="tMom"/></div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Top 8 — cumulative 12-month net inflow (₹ Cr)</div>
            <div className="chart-sub">Where investor conviction actually went this year</div>
            <div>{renderHBars(leadData.map((d,i) => ({ n:d.n, v: Math.round(d.v/100), c:['#1b5e20','#2e7d32','#2e7d32','#43a047','#43a047','#43a047','#66bb6a','#66bb6a'][i] })), false)}</div>
          </div>
        </div>

        <div className="trend-anim" style={{transitionDelay:'.38s'}}>
          <div className="section-head" style={{marginBottom:14}}><div className="section-title">📐 Folio vs AUM divergence</div><div className="section-badge">INDEXED TO 100 · {labels[0].toUpperCase()}</div></div>
          <div className="chart-card">
            <div className="chart-title">Both indexed at 100 — divergence shows market sensitivity vs investor discipline</div>
            <div className="chart-sub">Folios grow smoothly; AUM swings with markets. Gap = market-driven premium above committed capital</div>
            <div className="chart-leg">
              <span><span className="ld" style={{background:'#6a1b9a'}}/>Folio index</span>
              <span><span className="ld" style={{background:'#2e7d32'}}/>AUM index</span>
              <span><span className="ld" style={{background:'#e65100',opacity:.65}}/>Gap (AUM − Folios)</span>
            </div>
            <div className="chart-wrap" style={{height:190}}><canvas id="tDiv"/></div>
          </div>
        </div>

        <div className="trend-anim" style={{transitionDelay:'.44s'}}>
          <div className="section-head" style={{marginBottom:14}}><div className="section-title">📊 AUM composition shift</div><div className="section-badge">% SHARE · 12 MONTHS</div></div>
          <div className="chart-card">
            <div className="chart-title">How equity, debt, hybrid & passive shares have moved month by month</div>
            <div className="chart-sub">Stacked 100% — shows rotation between categories over the year</div>
            <div className="chart-leg">
              <span><span className="ld" style={{background:'#1565c0'}}/>Equity</span>
              <span><span className="ld" style={{background:'#880e4f'}}/>Debt</span>
              <span><span className="ld" style={{background:'#6a1b9a'}}/>Hybrid</span>
              <span><span className="ld" style={{background:'#1b5e20'}}/>Passive</span>
            </div>
            <div className="chart-wrap" style={{height:175}}><canvas id="tComp"/></div>
          </div>
        </div>

        {sipTrendData && sipTrendData.some(s => s.sipInflowNum != null) && (
          <div className="trend-anim" style={{transitionDelay:'.5s'}}>
            <div className="section-head" style={{marginBottom:14}}>
              <div className="section-title">💰 SIP inflow trend — monthly contribution (₹ Cr)</div>
              <div className="section-badge">AMFI MONTHLY NOTE · 12 MONTHS</div>
            </div>
            <div className="chart-card">
              <div className="chart-title">Monthly SIP contributions — systematic investment plan inflows</div>
              <div className="chart-sub">Bar = total SIP inflow for that month · source: AMFI Monthly Note PDFs</div>
              <div className="chart-wrap" style={{height:200}}><canvas id="tSip"/></div>
            </div>
          </div>
        )}

        <div className="src-line"><div className="src-dot"/>Data: AMFI official monthly disclosure reports · portal.amfiindia.com</div>
      </div>
    );
  }

  /* ── render helpers (summary cards, AUM bar, table) ── */
  function renderSummaryCards(d) {
    const s  = d.summary || {};
    const gt = d.grandTotal || {};
    const cats = d.categories || {};
    const mon = d.month || '', yr = d.year || '';
    const label = mon && yr ? (MONTH_LABELS[MONTHS.indexOf(mon)] || mon) + ' ' + yr : '';
    const industryAAUM = gt.avgAum || 0;
    const catFolios = Object.values(cats).reduce((sum,c) => sum+(c.folios||0), 0);
    const totalFolios = s.totalFolios > 0 ? s.totalFolios : (gt.folios > 0 ? gt.folios : catFolios);
    const cards = [
      { icon:'🏦', val:fmtCr(s.totalAum),   label:'Total Industry AUM', sub:label, aaum:industryAAUM?'AAUM '+fmtCr(industryAAUM):'', highlight:true },
      { icon:'👥', val:fmtFolios(totalFolios), label:'Total Folios',       sub:'Investor accounts', aaum:'', highlight:false },
      { icon:'📈', val:fmtCr(s.equityAum),  label:'Equity AUM',          sub:'Growth/equity schemes', aaum:'', highlight:false },
      { icon:'🏛', val:fmtCr(s.debtAum),    label:'Debt AUM',            sub:'Fixed income schemes', aaum:'', highlight:false },
      { icon:'⚖️', val:fmtCr(s.hybridAum),  label:'Hybrid AUM',          sub:'Balanced funds', aaum:'', highlight:false },
      { icon:'📊', val:fmtCr(s.passiveAum), label:'Passive AUM',         sub:'Index funds & ETFs', aaum:'', highlight:false },
    ];
    return (
      <div className="summary-grid">
        {cards.map((c,i) => (
          <div key={i} className={`sum-card${c.highlight?' highlight':''}`}>
            <div className="sum-icon">{c.icon}</div>
            <div className="sum-val">{c.val}</div>
            <div className="sum-label">{c.label}</div>
            <div className="sum-sub">{c.sub}</div>
            {c.aaum && <div className="sum-aaum">{c.aaum}</div>}
          </div>
        ))}
      </div>
    );
  }

  function renderAumBreakdown(d) {
    const s = d.summary || {};
    const total = s.totalAum || 1;
    const segs = [
      { label:'Equity',  val:s.equityAum,  color:'#1565c0', pct:((s.equityAum/total)*100).toFixed(1) },
      { label:'Debt',    val:s.debtAum,    color:'#880e4f', pct:((s.debtAum/total)*100).toFixed(1)   },
      { label:'Hybrid',  val:s.hybridAum,  color:'#6a1b9a', pct:((s.hybridAum/total)*100).toFixed(1) },
      { label:'Passive', val:s.passiveAum, color:'#1b5e20', pct:((s.passiveAum/total)*100).toFixed(1)},
    ];
    return (
      <div className="aum-breakdown section">
        <div className="section-head"><div className="section-title">📊 AUM distribution</div><div className="section-badge">BREAKDOWN</div></div>
        <div className="aum-breakdown-bar">
          {segs.map((sg,i) => <div key={i} className="aum-seg" style={{width:sg.pct+'%',background:sg.color}} title={`${sg.label}: ${fmtCr(sg.val)}`}/>)}
        </div>
        <div className="aum-legend">
          {segs.map((sg,i) => (
            <div key={i} className="aum-leg-item">
              <div className="aum-leg-dot" style={{background:sg.color}}/>
              {sg.label} <span className="aum-leg-val">{fmtCr(sg.val)} · {sg.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── main render ── */
  const rows = getTableRows();
  const maxAum  = data ? Math.max(...Object.values(data.categories||{}).map(r=>r.aum||0), 1) : 1;
  const maxFlow = data ? Math.max(...Object.values(data.categories||{}).map(r=>Math.abs(r.netFlow||0)), 1) : 1;

  return (
    <>
      <div className="container" style={{maxWidth:1100,margin:'0 auto',padding:'0 20px'}}>
        <Navbar activePage="industry" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"/>
            <span className="page-eyebrow-text">AMFI Official Data</span>
          </div>
          <h1 className="page-title">MF Industry <span>Pulse</span></h1>
          <p className="page-subtitle">AUM · AAUM · category flows · 12-month trends — sourced directly from AMFI official monthly reports</p>
          <div className="month-selector">
            <select className="month-select" value={selMon} onChange={e => setSelMon(e.target.value)}>
              {MONTHS.map((m,i) => <option key={m} value={m}>{MONTH_LABELS[i]}</option>)}
            </select>
            <select className="month-select" value={selYear} onChange={e => setSelYear(+e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="load-btn" onClick={() => loadData(selMon, selYear)}>Load Report</button>
            <span className="data-source-note">{sourceNote}</span>
          </div>
        </div>

        {parseWarn && <div className="parse-warn show">⚠️ Some category data could not be parsed from this month&apos;s report. Showing partial data.</div>}

        {/* Loading skeleton */}
        {loading && (
          <div>
            <div className="sk-grid">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="sk-card">
                  <div className="sk" style={{height:14,width:'32%',marginBottom:10}}/>
                  <div className="sk" style={{height:24,width:'75%',marginBottom:8}}/>
                  <div className="sk" style={{height:9,width:'55%',marginBottom:5}}/>
                  <div className="sk" style={{height:8,width:'70%'}}/>
                </div>
              ))}
            </div>
            <div className="sk-chart-wrap">
              <div className="sk" style={{height:11,width:160,marginBottom:14}}/>
              <div className="sk" style={{height:24,borderRadius:12}}/>
            </div>
            <div className="sk-chart-wrap">
              <div className="sk" style={{height:11,width:220,marginBottom:14}}/>
              <div className="sk" style={{height:240}}/>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{textAlign:'center',padding:'60px 20px',background:'var(--surface)',borderRadius:'var(--radius)',border:'1.5px solid var(--border)'}}>
            <div style={{fontSize:'2rem',marginBottom:12}}>⚠️</div>
            <div className="state-error">{error}</div>
            <button className="retry-btn" onClick={() => loadData()}>Retry</button>
          </div>
        )}

        {/* No data prompt */}
        {!data && !loading && !error && (
          <div style={{textAlign:'center',padding:'60px 20px',background:'var(--surface)',borderRadius:'var(--radius)',border:'1.5px solid var(--border)'}}>
            <div style={{fontSize:'2rem',marginBottom:12}}>📊</div>
            <div style={{fontWeight:700,marginBottom:8}}>Loading latest available data…</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)'}}>Data is sourced live from AMFI&apos;s official monthly PDF reports</div>
          </div>
        )}

        {/* Main content */}
        {data && !loading && (
          <>
            {renderSummaryCards(data)}
            {renderAumBreakdown(data)}

            {/* ── SIP Pulse Section ── */}
            {(sipLoading || sipData) && (
              <div className="section sip-pulse-section">
                <div className="section-head">
                  <div className="section-title">📈 Systematic Investment Plan (SIP) Pulse</div>
                  {sipData?.month && <div className="section-badge">{sipData.month.toUpperCase()} · AMFI MONTHLY NOTE</div>}
                </div>

                {sipLoading && (
                  <div className="sk-grid" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
                    {[1,2,3].map(i => (
                      <div key={i} className="sk-card">
                        <div className="sk" style={{height:12,width:'40%',marginBottom:10}}/>
                        <div className="sk" style={{height:28,width:'70%',marginBottom:8}}/>
                        <div className="sk" style={{height:10,width:'55%'}}/>
                      </div>
                    ))}
                  </div>
                )}

                {sipData && !sipLoading && (
                  <>
                    <div className="stat-grid sip-stat-grid">

                      {/* Primary: Monthly Inflow */}
                      <div className="stat-card gain-card sip-primary-card">
                        <div className="sc-label">SIP Monthly Inflow</div>
                        <div className="sc-val" style={{color:'var(--g1)'}}>
                          ₹{sipData.sipInflow || '—'}
                        </div>
                        <div className="sc-sub" style={{color:'var(--g3)',marginTop:4}}>
                          Monthly SIP contribution · {sipData.month}
                        </div>
                      </div>

                      {/* SIP AUM */}
                      <div className="stat-card">
                        <div className="sc-label">Total SIP AUM</div>
                        <div className="sc-val">
                          ₹{sipData.sipAum || '—'}
                        </div>
                        {sipData.sipAumPct && (
                          <div className="sc-sub" style={{marginTop:4}}>
                            {sipData.sipAumPct}% of total industry AUM
                          </div>
                        )}
                        {!sipData.sipAumPct && data?.summary?.totalAum && sipData.sipAum && (
                          <div className="sc-sub" style={{marginTop:4}}>of ₹{(data.summary.totalAum/100000).toFixed(2)} L Cr industry AUM</div>
                        )}
                      </div>

                      {/* Active SIP Accounts */}
                      <div className="stat-card">
                        <div className="sc-label">Active SIP Accounts</div>
                        <div className="sc-val">
                          {sipData.sipAccounts || '—'}
                        </div>
                        <div className="sc-sub" style={{marginTop:4}}>
                          Contributing (active) accounts · {sipData.month}
                        </div>
                      </div>

                    </div>

                    <div className="src-line" style={{marginTop:10}}>
                      <div className="src-dot"/>
                      Source: AMFI Monthly Note ·{' '}
                      <a href="https://www.amfiindia.com/otherdata/amfi-monthlynote"
                        target="_blank" rel="noopener noreferrer"
                        style={{color:'var(--g2)',textDecoration:'none'}}>
                        amfiindia.com
                      </a>
                      {' '}· {sipData.month}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="section">
              <div className="section-head">
                <div className="section-title">💸 Net flows by category type</div>
                <div className="section-badge">THIS MONTH · ₹ CRORE</div>
              </div>
              <div className="chart-card">
                <div className="chart-sub">Positive = net buying · negative = net redemptions · hover for exact figures</div>
                <div className="chart-wrap" style={{height:220}}><canvas ref={flowCanvasRef} id="chartFlowBar"/></div>
              </div>
            </div>

            {/* Category table */}
            <div className="section">
              <div className="section-head">
                <div className="section-title">📋 Category-wise data</div>
                <div className="section-badge">{Object.keys(data.categories||{}).length} CATEGORIES</div>
              </div>
              <div className="cat-table-wrap">
                <div className="cat-filters">
                  {['all','equity','debt','hybrid','passive'].map(t => (
                    <button key={t} className={`cat-filter-btn${filterType===t?' active':''}`} onClick={() => setFilterType(t)}>
                      {t.charAt(0).toUpperCase()+t.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={{overflowX:'auto'}}>
                  <table className="cat-table">
                    <thead><tr>
                      <th onClick={() => handleSortTable('label')}>Category <span className="sort-arrow">{sortCol==='label'?(sortDir===-1?'↓':'↑'):'↕'}</span></th>
                      <th onClick={() => handleSortTable('folios')} className="mono">Folios <span className="sort-arrow">{sortCol==='folios'?(sortDir===-1?'↓':'↑'):'↕'}</span></th>
                      <th onClick={() => handleSortTable('inflow')} className="mono">Inflow (Cr) <span className="sort-arrow">{sortCol==='inflow'?(sortDir===-1?'↓':'↑'):'↕'}</span></th>
                      <th onClick={() => handleSortTable('redemption')} className="mono col-hide-mobile">Redemption (Cr) <span className="sort-arrow">{sortCol==='redemption'?(sortDir===-1?'↓':'↑'):'↕'}</span></th>
                      <th onClick={() => handleSortTable('netFlow')} className={`mono${sortCol==='netFlow'?' sorted':''}`}>Net Flow (Cr) <span className="sort-arrow">{sortCol==='netFlow'?(sortDir===-1?'↓':'↑'):'↓'}</span></th>
                      <th onClick={() => handleSortTable('aum')} className="mono">AUM (Cr) <span className="sort-arrow">{sortCol==='aum'?(sortDir===-1?'↓':'↑'):'↕'}</span></th>
                      <th onClick={() => handleSortTable('avgAum')} className="mono col-hide-mobile">AAUM (Cr) <span className="sort-arrow">{sortCol==='avgAum'?(sortDir===-1?'↓':'↑'):'↕'}</span></th>
                    </tr></thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={7} className="no-data">No data for this filter</td></tr>}
                      {rows.map((r, i) => {
                        const tc  = TYPE_COLORS[r.type] || { badge:'', label: r.type || '' };
                        const fc  = (r.netFlow || 0) >= 0 ? 'flow-pos' : 'flow-neg';
                        const fp  = (Math.abs(r.netFlow || 0) / maxFlow * 100).toFixed(1);
                        const fcol= (r.netFlow || 0) >= 0 ? '#1b5e20' : '#b71c1c';
                        const ap  = ((r.aum || 0) / maxAum * 100).toFixed(1);
                        const aaum= r.avgAum || 0;
                        const pct = aaum && r.aum ? ((aaum/r.aum-1)*100) : null;
                        return (
                          <tr key={i}>
                            <td><span className="cat-name">{r.label || '—'}</span><span className={`cat-type-badge ${tc.badge}`}>{tc.label}</span></td>
                            <td className="mono">{fmtFolios(r.folios)}</td>
                            <td className="mono">{r.inflow ? '₹'+fmtNum(Math.round(r.inflow)) : '—'}</td>
                            <td className="mono col-hide-mobile">{r.redemption ? '₹'+fmtNum(Math.round(r.redemption)) : '—'}</td>
                            <td className="flow-bar-cell">
                              <span className={`${fc} mono`}>{fmtFlow(r.netFlow)}</span>
                              <div className="flow-bar-bg"><div className="flow-bar-fill" style={{width:fp+'%',background:fcol}}/></div>
                            </td>
                            <td>
                              <span className="mono">{r.aum ? '₹'+fmtNum(Math.round(r.aum)) : '—'}</span>
                              <div className="flow-bar-bg"><div className="flow-bar-fill" style={{width:ap+'%',background:'var(--g3)'}}/></div>
                            </td>
                            <td className="mono col-hide-mobile">
                              {aaum ? '₹'+fmtNum(Math.round(aaum)) : '—'}
                              {pct !== null && <div className="aaum-sub">{(pct >= 0 ? '+' : '') + pct.toFixed(1)}% vs AUM</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Trends */}
            {trendsLoading && (
              <div>
                <div className="trends-divider"/>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
                  {[1,2,3,4].map(i => <div key={i} className="sk-card"><div className="sk" style={{height:9,width:'60%',marginBottom:8}}/><div className="sk" style={{height:22,width:'78%',marginBottom:6}}/><div className="sk" style={{height:8,width:'88%'}}/></div>)}
                </div>
                <div className="sk-chart-wrap"><div className="sk" style={{height:11,width:220,marginBottom:14}}/><div className="sk" style={{height:200}}/></div>
              </div>
            )}
            {trendsData && renderTrendsSection(trendsData)}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
