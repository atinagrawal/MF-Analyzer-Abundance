'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

/* ═══════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════ */
const ALL_INDICES = {
  broad: [
    'NIFTY 50','Nifty Next 50','Nifty 100','Nifty 200','Nifty 500',
    'Nifty Midcap 150','Nifty Midcap 50','Nifty Midcap 100','Nifty Midcap Select',
    'Nifty Smallcap 250','Nifty Smallcap 50','Nifty Smallcap 100','Nifty Smallcap 500',
    'Nifty LargeMidcap 250','Nifty MidSmallcap 400','Nifty Total Market',
    'Nifty Microcap 250','Nifty500 Multicap 50:25:25',
  ],
  sectoral: [
    'Nifty Bank','Nifty IT','Nifty Pharma','Nifty FMCG','Nifty Auto',
    'Nifty Financial Services','Nifty Private Bank','Nifty PSU Bank',
    'Nifty Realty','Nifty Metal','Nifty Healthcare Index','Nifty Infrastructure',
    'Nifty MNC','Nifty Media','Nifty Chemicals','Nifty Oil & Gas',
    'Nifty Consumer Durables','Nifty500 Healthcare',
  ],
  strategy: [
    'Nifty Alpha 50','Nifty Dividend Opportunities 50','Nifty High Beta 50',
    'Nifty Low Volatility 50','Nifty50 Equal Weight','Nifty100 Quality 30',
    'Nifty200 Momentum 30','Nifty500 Value 50','Nifty500 Quality 50',
    'Nifty Midcap150 Momentum 50','Nifty Midcap150 Quality 50',
    'Nifty100 Alpha 30','Nifty200 Alpha 30','Nifty500 Momentum 50',
  ],
};
const CAT_LABELS = { broad: 'Broad Market', sectoral: 'Sectoral', strategy: 'Strategy & Thematic' };
const QUICK_CHIPS = ['NIFTY 50','Nifty Next 50','Nifty Midcap 150','Nifty Smallcap 250','Nifty 500','Nifty Bank','Nifty IT','Nifty Pharma'];
const WINDOWS = [1,3,5,7,10];

/* ═══════════════════════════════════════════════════════
   PURE CALCULATION FUNCTIONS (no React deps)
═══════════════════════════════════════════════════════ */
function parseNavDate(str) {
  const [d,m,y] = str.split('-').map(Number);
  return new Date(y, m-1, d).getTime();
}

function calcRolling(navData, windowYears) {
  const pts = navData
    .map(d => ({ t: parseNavDate(d.date), n: parseFloat(d.nav) }))
    .sort((a,b) => a.t - b.t);
  const windowMs    = windowYears * 365.25 * 86400000;
  const toleranceMs = 45 * 86400000;
  const results = [];
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    const targetStart = pts[i].t - windowMs;
    while (j < pts.length - 1 && pts[j+1].t <= targetStart) j++;
    let si = j;
    if (j+1 < pts.length && Math.abs(pts[j+1].t - targetStart) < Math.abs(pts[j].t - targetStart)) si = j+1;
    if (Math.abs(pts[si].t - targetStart) > toleranceMs) continue;
    const actualYears = (pts[i].t - pts[si].t) / (365.25 * 86400000);
    if (actualYears < windowYears * 0.9 || actualYears > windowYears * 1.1) continue;
    if (pts[si].n <= 0 || pts[i].n <= 0) continue;
    const cagr = Math.pow(pts[i].n / pts[si].n, 1/actualYears) - 1;
    results.push({ endDate: new Date(pts[i].t), startDate: new Date(pts[si].t), endNav: pts[i].n, startNav: pts[si].n, cagr, cagrPct: cagr*100 });
  }
  return results;
}

function calcStats(rr) {
  const vals = [...rr.map(r => r.cagrPct)].sort((a,b) => a-b);
  const n = vals.length;
  const median  = n % 2 === 0 ? (vals[n/2-1]+vals[n/2])/2 : vals[Math.floor(n/2)];
  const pctPos  = vals.filter(v => v > 0).length / n * 100;
  const pct12   = vals.filter(v => v >= 12).length / n * 100;
  const best    = vals[n-1], worst = vals[0];
  const mean    = vals.reduce((s,v) => s+v, 0) / n;
  const stddev  = Math.sqrt(vals.reduce((s,v) => s+(v-mean)**2, 0) / n);
  const bestEntry  = rr.find(r => r.cagrPct === best);
  const worstEntry = rr.find(r => r.cagrPct === worst);
  return { median, pctPos, pct12, best, worst, mean, stddev, n, bestEntry, worstEntry };
}

function buildHistogram(rr) {
  const BANDS = [
    {lo:-Infinity,hi:-10,label:'< -10%'},
    {lo:-10,hi:-5,label:'-10 to -5%'},
    {lo:-5,hi:0,label:'-5 to 0%'},
    {lo:0,hi:5,label:'0 to 5%'},
    {lo:5,hi:10,label:'5 to 10%'},
    {lo:10,hi:15,label:'10 to 15%'},
    {lo:15,hi:20,label:'15 to 20%'},
    {lo:20,hi:25,label:'20 to 25%'},
    {lo:25,hi:Infinity,label:'> 25%'},
  ];
  const n = rr.length;
  return BANDS.map(b => ({
    label: b.label,
    pct: rr.filter(r => r.cagrPct > b.lo && r.cagrPct <= b.hi).length / n * 100,
    lo: b.lo,
  }));
}

function histColor(lo, alpha=1) {
  if (lo < -5) return `rgba(183,28,28,${alpha})`;
  if (lo < 0)  return `rgba(239,83,80,${alpha})`;
  if (lo < 5)  return `rgba(255,152,0,${alpha})`;
  if (lo < 10) return `rgba(102,187,106,${alpha})`;
  if (lo < 15) return `rgba(67,160,71,${alpha})`;
  if (lo < 20) return `rgba(46,125,50,${alpha})`;
  return `rgba(27,94,32,${alpha})`;
}

function computeAlpha(rrA, rrB) {
  function monthKey(d) { return `${d.getFullYear()}-${d.getMonth()}`; }
  const bMap = new Map(rrB.map(r => [monthKey(r.endDate), r]));
  return rrA
    .map(a => { const b = bMap.get(monthKey(a.endDate)); return b ? { endDate:a.endDate, fundCagr:a.cagrPct, indexCagr:b.cagrPct, alpha:a.cagrPct-b.cagrPct } : null; })
    .filter(Boolean)
    .sort((a,b) => a.endDate - b.endDate);
}

function filterFunds(data) {
  const growthOnly = data.filter(f => !/\b(idcw|dividend|weekly|daily|monthly\s+reinvestment|bonus|institutional)\b/i.test(f.schemeName));
  const regular = growthOnly.filter(f => !/\bdirect\b/i.test(f.schemeName));
  return regular.length ? regular : growthOnly;
}

function fmtDateShort(d) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear();
}
function fmtDateLong(d) {
  return d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear();
}
function cagrCl(v) { return v >= 12 ? 'cagr-pos' : v >= 0 ? 'cagr-warn' : 'cagr-neg'; }

/* ═══════════════════════════════════════════════════════
   CHART RENDERING (imperative via Chart.js globals)
═══════════════════════════════════════════════════════ */
function drawHistogram(canvasEl, histA, histB, twoFund, nameA, nameB, chartRef) {
  if (!canvasEl || !window.Chart) return;
  if (chartRef.hist) { try { chartRef.hist.destroy(); } catch(e){} }
  const datasets = [{
    label: nameA, data: histA.map(b => +b.pct.toFixed(1)),
    backgroundColor: twoFund ? 'rgba(46,125,50,0.78)' : histA.map(b => histColor(b.lo)),
    borderRadius: 4, borderSkipped: false,
  }];
  if (twoFund && histB) datasets.push({
    label: nameB, data: histB.map(b => +b.pct.toFixed(1)),
    backgroundColor: 'rgba(123,31,162,0.65)', borderRadius: 4, borderSkipped: false,
  });
  chartRef.hist = new window.Chart(canvasEl, {
    type: 'bar', data: { labels: histA.map(b => b.label), datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      animation:{duration:800,easing:'easeInOutQuart'},
      plugins:{
        legend:{display:twoFund,labels:{font:{family:'Raleway',size:11},boxWidth:12,padding:16}},
        tooltip:{backgroundColor:'#162616',titleFont:{family:'JetBrains Mono',size:10},bodyFont:{family:'JetBrains Mono',size:11},padding:10,cornerRadius:8,
          callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}% of windows`}},
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{family:'JetBrains Mono',size:9},maxRotation:35}},
        y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{font:{family:'JetBrains Mono',size:9},callback:v=>v+'%'},
          title:{display:true,text:'% of windows',font:{size:9},color:'#5e8a5e'}},
      },
    },
  });
}

function drawTimeline(canvasEl, rrA, rrB, twoFund, nameA, nameB, chartRef) {
  if (!canvasEl || !window.Chart) return;
  if (chartRef.timeline) { try { chartRef.timeline.destroy(); } catch(e){} }
  const sample = arr => arr.length <= 500 ? arr : arr.filter((_,i) => i % Math.ceil(arr.length/500) === 0);
  const sA = sample(rrA);
  const datasets = [{
    label: nameA, data: sA.map(r => ({x:r.endDate,y:+r.cagrPct.toFixed(2)})),
    borderColor:'#2e7d32', backgroundColor:'rgba(46,125,50,0.07)',
    fill:true, tension:0.3, pointRadius:0, borderWidth:1.8,
  }];
  if (twoFund && rrB) {
    const sB = sample(rrB);
    datasets.push({ label:nameB, data:sB.map(r=>({x:r.endDate,y:+r.cagrPct.toFixed(2)})),
      borderColor:'#7b1fa2', backgroundColor:'rgba(123,31,162,0.05)',
      fill:false, tension:0.3, pointRadius:0, borderWidth:1.8 });
  }
  chartRef.timeline = new window.Chart(canvasEl, {
    type:'line', data:{datasets},
    options:{
      responsive:true, maintainAspectRatio:false, parsing:false,
      animation:{duration:900,easing:'easeInOutQuart'},
      plugins:{
        legend:{display:twoFund,labels:{font:{family:'Raleway',size:11},boxWidth:12,padding:16}},
        annotation:{annotations:{
          zeroLine:{type:'line',yMin:0,yMax:0,borderColor:'rgba(183,28,28,0.45)',borderWidth:1.5,borderDash:[4,3],
            label:{display:true,content:'0%',position:'end',color:'rgba(183,28,28,0.7)',font:{family:'JetBrains Mono',size:9},padding:2}},
          twelveLine:{type:'line',yMin:12,yMax:12,borderColor:'rgba(46,125,50,0.3)',borderWidth:1,borderDash:[3,4],
            label:{display:true,content:'12%',position:'end',color:'rgba(46,125,50,0.6)',font:{family:'JetBrains Mono',size:9},padding:2}},
        }},
        tooltip:{backgroundColor:'#162616',titleFont:{family:'JetBrains Mono',size:10},bodyFont:{family:'JetBrains Mono',size:11},padding:10,cornerRadius:8,
          callbacks:{title:items=>fmtDateLong(new Date(items[0].parsed.x)),label:c=>` ${c.dataset.label}: ${c.parsed.y>=0?'+':''}${c.parsed.y.toFixed(1)}% CAGR`}},
      },
      scales:{
        x:{type:'time',time:{unit:'year',displayFormats:{year:'MMM yy'}},grid:{display:false},
          ticks:{font:{family:'JetBrains Mono',size:9},maxRotation:0,autoSkip:true,maxTicksLimit:8}},
        y:{grid:{color:ctx2=>ctx2.tick.value===0?'rgba(183,28,28,0.25)':'rgba(0,0,0,.04)'},
          ticks:{font:{family:'JetBrains Mono',size:9},callback:v=>v+'%'},
          title:{display:true,text:'CAGR %',font:{size:9},color:'#5e8a5e'}},
      },
    },
  });
}

function drawAlpha(canvasEl, alphaData, indexName, hitRatio, chartRef) {
  if (!canvasEl || !window.Chart) return;
  if (chartRef.alpha) { try { chartRef.alpha.destroy(); } catch(e){} }
  const sample = alphaData.length > 400 ? alphaData.filter((_,i) => i % Math.ceil(alphaData.length/400)===0) : alphaData;
  const vals = sample.map(r => +r.alpha.toFixed(2));
  const avgAlpha = vals.reduce((s,v)=>s+v,0)/vals.length;
  chartRef.alpha = new window.Chart(canvasEl, {
    type:'bar',
    data:{datasets:[{label:'Alpha (pp)',data:sample.map((r,i)=>({x:r.endDate,y:vals[i]})),
      backgroundColor:vals.map(v=>v>=0?'rgba(46,125,50,0.75)':'rgba(183,28,28,0.72)'),
      borderRadius:1,borderSkipped:false,barPercentage:0.9}]},
    options:{
      responsive:true,maintainAspectRatio:false,parsing:false,
      animation:{duration:700,easing:'easeInOutQuart'},
      plugins:{
        legend:{display:false},
        annotation:{annotations:{
          zeroLine:{type:'line',yMin:0,yMax:0,borderColor:'rgba(0,0,0,0.3)',borderWidth:1},
          avgLine:{type:'line',yMin:avgAlpha,yMax:avgAlpha,
            borderColor:avgAlpha>=0?'rgba(46,125,50,0.6)':'rgba(183,28,28,0.6)',
            borderWidth:1.5,borderDash:[5,4],
            label:{display:true,content:`Avg ${avgAlpha>=0?'+':''}${avgAlpha.toFixed(1)}pp`,position:'end',
              color:avgAlpha>=0?'rgba(46,125,50,0.8)':'rgba(183,28,28,0.8)',font:{family:'JetBrains Mono',size:9},padding:2}},
        }},
        tooltip:{backgroundColor:'#162616',titleFont:{family:'JetBrains Mono',size:10},bodyFont:{family:'JetBrains Mono',size:11},padding:10,cornerRadius:8,
          callbacks:{title:items=>fmtDateLong(new Date(items[0].parsed.x)),label:c=>` Alpha: ${c.parsed.y>=0?'+':''}${c.parsed.y.toFixed(2)}pp vs ${indexName}`}},
      },
      scales:{
        x:{type:'time',time:{unit:'year',displayFormats:{year:'MMM yy'}},grid:{display:false},
          ticks:{font:{family:'JetBrains Mono',size:9},maxRotation:0,autoSkip:true,maxTicksLimit:8}},
        y:{grid:{color:ctx2=>ctx2.tick.value===0?'rgba(0,0,0,0.15)':'rgba(0,0,0,.04)'},
          ticks:{font:{family:'JetBrains Mono',size:9},callback:v=>(v>=0?'+':'')+v+'pp'},
          title:{display:true,text:'Alpha (pp)',font:{size:9},color:'#5e8a5e'}},
      },
    },
  });
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════ */
export default function RollingPage() {
  // Fund slots
  const [fundA, setFundA] = useState({ code:null, name:null, nav:null });
  const [fundB, setFundB] = useState({ code:null, name:null, nav:null });
  // Benchmark
  const [benchMode, setBenchMode] = useState('index'); // 'index' | 'fund'
  const [benchIndex, setBenchIndex] = useState('NIFTY 50');
  const [benchNav, setBenchNav]   = useState(null);
  // Window
  const [win, setWin] = useState(5);
  // Search
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [ddA, setDdA] = useState([]);
  const [ddB, setDdB] = useState([]);
  const [ddAOpen, setDdAOpen] = useState(false);
  const [ddBOpen, setDdBOpen] = useState(false);
  const [ddAIdx, setDdAIdx]  = useState(-1);
  const [ddBIdx, setDdBIdx]  = useState(-1);
  // Index dropdown
  const [showIdxDrop, setShowIdxDrop] = useState(false);
  const [idxQuery, setIdxQuery]       = useState('');
  // State
  const [running, setRunning]   = useState(false);
  const [result,  setResult]    = useState(null); // { rrA, rrBOrNull, nameA, nameB, isIndex, indexName }
  const [error,   setError]     = useState(null);
  // Table
  const [tableOpen, setTableOpen]   = useState(false);
  const [dtSort, setDtSort]         = useState({ key:'cagrPct', dir:-1 });
  // Share
  const [shareCopied, setShareCopied] = useState(false);
  // Ref for chart instances
  const charts = useRef({});
  const histRef = useRef(null);
  const timeRef = useRef(null);
  const alphaRef= useRef(null);
  const timerA  = useRef(null);
  const timerB  = useRef(null);

  // ── Debounced search ──
  const searchFunds = useCallback(async (q, slot) => {
    if (q.length < 2) { slot==='A'?setDdA([]):setDdB([]); return; }
    try {
      const res = await fetch(`/api/mf?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const ranked = filterFunds(data).slice(0,20);
      slot==='A' ? setDdA(ranked) : setDdB(ranked);
    } catch {}
  }, []);

  function handleSearchChange(val, slot) {
    if (slot==='A') { setSearchA(val); setDdAOpen(val.length>=2); setDdAIdx(-1); clearTimeout(timerA.current); timerA.current=setTimeout(()=>searchFunds(val,'A'),280); }
    else            { setSearchB(val); setDdBOpen(val.length>=2); setDdBIdx(-1); clearTimeout(timerB.current); timerB.current=setTimeout(()=>searchFunds(val,'B'),280); }
  }

  function selectFund(slot, code, name) {
    if (slot==='A') { setFundA({code,name,nav:null}); setSearchA(''); setDdA([]); setDdAOpen(false); }
    else            { setFundB({code,name,nav:null}); setSearchB(''); setDdB([]); setDdBOpen(false); }
  }

  function removeFund(slot) {
    if (slot==='A') setFundA({code:null,name:null,nav:null});
    else            setFundB({code:null,name:null,nav:null});
    setResult(null); setError(null);
  }

  // ── Key navigation in dropdown ──
  function handleDdKey(e, slot) {
    const dd = slot==='A' ? ddA : ddB;
    const idx = slot==='A' ? ddAIdx : ddBIdx;
    const setIdx = slot==='A' ? setDdAIdx : setDdBIdx;
    if (e.key==='ArrowDown') { e.preventDefault(); setIdx(Math.min(idx+1, dd.length-1)); }
    else if (e.key==='ArrowUp') { e.preventDefault(); setIdx(Math.max(idx-1,0)); }
    else if (e.key==='Enter') { e.preventDefault(); if (idx>=0 && dd[idx]) selectFund(slot, dd[idx].schemeCode, dd[idx].schemeName); }
    else if (e.key==='Escape') { slot==='A'?setDdAOpen(false):setDdBOpen(false); }
  }

  // ── Fetch NAV ──
  async function fetchNav(code) {
    const r = await fetch(`/api/mf?code=${code}`);
    if (!r.ok) throw new Error(`Could not fetch NAV for code ${code}`);
    const d = await r.json();
    if (!d.data?.length) throw new Error(`No NAV data for scheme ${code}`);
    return d.data;
  }

  // ── Fetch TRI benchmark ──
  async function fetchBenchmark(indexName) {
    const r = await fetch(`/api/nifty-tri?index=${encodeURIComponent(indexName)}`);
    if (!r.ok) throw new Error(`Could not fetch TRI for ${indexName}`);
    const d = await r.json();
    if (!d.data?.length) throw new Error(`No TRI data for ${indexName}`);
    const MON = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
    return d.data.map(r => { const [dd,mon,yyyy]=r.date.split(' '); return {date:`${dd.padStart(2,'0')}-${MON[mon]||'01'}-${yyyy}`,nav:String(r.value)}; });
  }

  // ── Main run ──
  async function run() {
    if (!fundA.code) return;
    setRunning(true); setError(null); setResult(null); setTableOpen(false);
    try {
      const navA = await fetchNav(fundA.code);
      setFundA(p => ({...p, nav:navA}));
      let navBData = null;
      if (benchMode==='index') {
        const cached = benchNav;
        navBData = cached || await fetchBenchmark(benchIndex);
        if (!benchNav) setBenchNav(navBData);
      } else if (fundB.code) {
        navBData = await fetchNav(fundB.code);
        setFundB(p => ({...p, nav:navBData}));
      }
      const rrA = calcRolling(navA, win);
      if (!rrA.length) throw new Error(`Not enough NAV history for a ${win}Y rolling window.`);
      const rrB = navBData ? calcRolling(navBData, win) : null;
      const nameA = fundA.name.split('-')[0].trim();
      const nameB = benchMode==='index' ? benchIndex : (fundB.name||'Fund B').split('-')[0].trim();
      const isIndex = benchMode==='index';
      setResult({ rrA, rrB: rrB?.length ? rrB : null, nameA, nameB, isIndex, indexName: isIndex?benchIndex:null });
      // Update URL
      const p = new URLSearchParams();
      p.set('a', fundA.code);
      if (fundB.code) p.set('b', fundB.code);
      p.set('w', win);
      history.replaceState(null,'','?'+p.toString());
    } catch(e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  // Invalidate bench cache when index changes
  function selectBenchIndex(name) {
    setBenchIndex(name);
    setBenchNav(null);
  }

  // ── Draw charts when result changes ──
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      const { rrA, rrB, nameA, nameB, isIndex } = result;
      const histA = buildHistogram(rrA);
      const histB = rrB ? buildHistogram(rrB) : null;
      const twoFund = !!rrB && !isIndex;
      drawHistogram(histRef.current, histA, histB, twoFund, nameA, nameB, charts.current);
      drawTimeline(timeRef.current, rrA, rrB, twoFund, nameA, nameB, charts.current);
      if (isIndex && rrB) {
        const alphaData = computeAlpha(rrA, rrB);
        const hitRatio = alphaData.length ? alphaData.filter(r=>r.alpha>0).length/alphaData.length*100 : 0;
        drawAlpha(alphaRef.current, alphaData, result.indexName, hitRatio, charts.current);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [result]);

  // ── Cleanup charts on unmount ──
  useEffect(() => {
    return () => {
      Object.values(charts.current).forEach(c => { try{c.destroy();}catch(e){} });
    };
  }, []);

  // ── URL param restore on load ──
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const codeA = p.get('a'), w = p.get('w'), bench=p.get('bench')||p.get('index');
    if (w && WINDOWS.includes(+w)) setWin(+w);
    if (bench) selectBenchIndex(bench);
    if (codeA) {
      fetch(`/api/mf?code=${codeA}`).then(r=>r.json()).then(d=>{
        if (d.meta) selectFund('A', +codeA, d.meta.scheme_name||`Fund ${codeA}`);
      }).catch(()=>{});
    }
  }, []);

  /* ── Computed stats from result ── */
  const statsA = result ? calcStats(result.rrA) : null;
  const statsB = result?.rrB ? calcStats(result.rrB) : null;
  const alphaData = result?.rrB && result.isIndex ? computeAlpha(result.rrA, result.rrB) : null;
  const hitRatio  = alphaData?.length ? alphaData.filter(r=>r.alpha>0).length/alphaData.length*100 : null;
  const sortedAlpha = alphaData ? [...alphaData.map(r=>r.alpha)].sort((a,b)=>a-b) : null;
  const medAlpha = sortedAlpha?.length ? (sortedAlpha.length%2===0?(sortedAlpha[sortedAlpha.length/2-1]+sortedAlpha[sortedAlpha.length/2])/2:sortedAlpha[Math.floor(sortedAlpha.length/2)]) : null;
  const fmtPct = v => (v>=0?'+':'')+v.toFixed(1)+'%';

  /* ── Insight ── */
  function buildInsight() {
    if (!statsA) return '';
    const W = win;
    const nameA = result.nameA || 'Fund';
    let text = '';
    if (statsA.pct12 >= 80) text += `<strong>${nameA}</strong> delivered above <span class="pos">12% CAGR</span> in <span class="pos">${statsA.pct12.toFixed(0)}%</span> of ${W}Y windows — very consistent.`;
    else if (statsA.pct12 >= 50) text += `<strong>${nameA}</strong> beat 12% CAGR in <span class="pos">${statsA.pct12.toFixed(0)}%</span> of ${W}Y windows — decent but entry-date sensitive.`;
    else text += `<strong>${nameA}</strong> beat 12% in only <span class="warn">${statsA.pct12.toFixed(0)}%</span> of ${W}Y windows.`;
    const negPct = 100 - statsA.pctPos;
    if (negPct > 0.5) text += ` <span class="neg">${negPct.toFixed(0)}% of windows delivered negative returns</span> — entry timing matters significantly.`;
    else if (statsA.pctPos > 99) text += ` <span class="pos">All ${W}Y windows were positive</span> — no investor holding for ${W}Y lost money.`;
    if (statsB) {
      const winner = statsA.median >= statsB.median ? result.nameA : result.nameB;
      const diff = Math.abs(statsA.median - statsB.median).toFixed(1);
      text += ` Vs ${result.nameB}: <strong>${winner}</strong> had the higher median by ${diff}pp.`;
    }
    return text;
  }

  /* ── Data table ── */
  const sortedRows = result ? [...result.rrA].sort((a,b) => {
    const av = a[dtSort.key], bv = b[dtSort.key];
    return dtSort.dir * (typeof av==='number' ? av-bv : String(av).localeCompare(String(bv)));
  }) : [];
  const bMapForTable = result?.rrB ? Object.fromEntries(result.rrB.map(r=>[fmtDateShort(r.endDate),r])) : {};

  /* ── Index dropdown filter ── */
  const filteredIndices = Object.entries(ALL_INDICES).reduce((acc,[cat,names])=>{
    const f = names.filter(n => !idxQuery || n.toLowerCase().includes(idxQuery.toLowerCase()));
    if (f.length) acc[cat]=f;
    return acc;
  }, {});

  return (
    <>
      <div className="container">
        <Navbar activePage="rolling" />

        {/* ── Page header ── */}
        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">NAV History · Every Entry Point</span>
          </div>
          <h1 className="page-title">Rolling Returns <span>Visualizer</span></h1>
          <p className="page-subtitle">Not just how a fund did — how <em>consistently</em> it did. See CAGR distribution across every possible entry date.</p>
        </div>

        {/* ── Search card ── */}
        <div className="search-card">
          <div className="search-row" id="searchRow">

            {/* Fund A */}
            <div className="fund-slot" id="slotA">
              <div className="fund-label fund-label-a"><span className="badge">A</span> Fund 1</div>
              {!fundA.code ? (
                <div className="fund-input-wrap">
                  <input id="inputA" className="fund-input" type="text" placeholder="Type fund name…"
                    autoComplete="off" spellCheck={false}
                    value={searchA}
                    onChange={e => handleSearchChange(e.target.value,'A')}
                    onKeyDown={e => handleDdKey(e,'A')}
                    onBlur={() => setTimeout(()=>setDdAOpen(false),180)}
                    onFocus={() => ddA.length && setDdAOpen(true)}
                  />
                  {searchA && <button className="fund-clear show" onClick={()=>{setSearchA('');setDdA([]);setDdAOpen(false);}}>✕</button>}
                  {ddAOpen && ddA.length > 0 && (
                    <div className="fund-dropdown open">
                      {ddA.map((f,i) => (
                        <div key={f.schemeCode} className={`dd-item${i===ddAIdx?' active':''}`}
                          onMouseDown={() => selectFund('A',f.schemeCode,f.schemeName)}>
                          {f.schemeName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="fund-selected show">
                  <div className="fs-name">{fundA.name}</div>
                  <div className="fs-code">Code: {fundA.code}</div>
                  <button className="fs-remove" onClick={()=>removeFund('A')}>✕</button>
                </div>
              )}
            </div>

            {/* VS divider */}
            <div className="vs-divider">
              <div className="vs-label" id="vsLabel">VS</div>
            </div>

            {/* Right slot: Index or Fund B */}
            <div className="fund-slot" id="slotB">
              <div className="slot-mode-row">
                <button className={`slot-mode-btn${benchMode==='index'?' active':''}`} onClick={()=>{setBenchMode('index');setBenchNav(null);}}>📈 vs Index</button>
                <button className={`slot-mode-btn${benchMode==='fund'?' active':''}`}  onClick={()=>setBenchMode('fund')}>👥 vs Fund</button>
              </div>

              {benchMode==='index' ? (
                <div id="indexModeContent">
                  <div className="fund-label fund-label-b"><span className="badge">B</span> Benchmark Index</div>
                  <div className="bench-chips" id="benchChips">
                    {QUICK_CHIPS.map(chip => (
                      <button key={chip} className={`bench-chip${benchIndex===chip?' active':''}`}
                        onClick={()=>{selectBenchIndex(chip);setShowIdxDrop(false);}}>
                        {chip.replace('NIFTY 50','Nifty 50').replace('Nifty Midcap 150','Mid 150').replace('Nifty Smallcap 250','Small 250').replace('Nifty 500','N 500').replace('Nifty Bank','Bank').replace('Nifty Pharma','Pharma')}
                      </button>
                    ))}
                  </div>
                  <div style={{position:'relative',display:'inline-block'}}>
                    <button className="more-indices-btn" onClick={e=>{e.stopPropagation();setShowIdxDrop(!showIdxDrop);setIdxQuery('');}}>▾ More indices</button>
                    {showIdxDrop && (
                      <div className="more-indices-drop" onClick={e=>e.stopPropagation()}>
                        <input className="idx-search-in" placeholder="Search all indices…" value={idxQuery} onChange={e=>setIdxQuery(e.target.value)} autoFocus />
                        <div id="idxDropBody">
                          {Object.entries(filteredIndices).map(([cat,names]) => (
                            <div key={cat}>
                              <div className="idx-drop-section">{CAT_LABELS[cat]}</div>
                              {names.map(name => (
                                <div key={name} className={`idx-drop-item${benchIndex===name?' active':''}`}
                                  onMouseDown={()=>{selectBenchIndex(name);setShowIdxDrop(false);}}>
                                  {name}
                                </div>
                              ))}
                            </div>
                          ))}
                          {Object.keys(filteredIndices).length===0 && <div className="idx-drop-item" style={{color:'var(--muted)'}}>No results</div>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="bench-pill">
                    <span id="benchPillName" style={{display:'block',fontSize:'.75rem',fontWeight:700,color:'var(--g1)'}}>{benchIndex}</span>
                    <span style={{display:'block',fontSize:'.6rem',color:'var(--muted)',fontFamily:'JetBrains Mono,monospace',marginTop:2}}>TRI · NSE</span>
                  </div>
                </div>
              ) : (
                <div id="fundModeContent">
                  <div className="fund-label fund-label-b"><span className="badge">B</span> Fund 2 <span style={{fontSize:'.55rem',fontWeight:500,color:'var(--muted)',marginLeft:4}}>(optional)</span></div>
                  {!fundB.code ? (
                    <div className="fund-input-wrap">
                      <input id="inputB" className="fund-input" type="text" placeholder="Type to compare…"
                        autoComplete="off" spellCheck={false}
                        value={searchB}
                        onChange={e => handleSearchChange(e.target.value,'B')}
                        onKeyDown={e => handleDdKey(e,'B')}
                        onBlur={() => setTimeout(()=>setDdBOpen(false),180)}
                        onFocus={() => ddB.length && setDdBOpen(true)}
                      />
                      {searchB && <button className="fund-clear show" onClick={()=>{setSearchB('');setDdB([]);setDdBOpen(false);}}>✕</button>}
                      {ddBOpen && ddB.length > 0 && (
                        <div className="fund-dropdown open">
                          {ddB.map((f,i) => (
                            <div key={f.schemeCode} className={`dd-item${i===ddBIdx?' active':''}`}
                              onMouseDown={() => selectFund('B',f.schemeCode,f.schemeName)}>
                              {f.schemeName}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="fund-selected show">
                      <div className="fs-name">{fundB.name}</div>
                      <div className="fs-code">Code: {fundB.code}</div>
                      <button className="fs-remove" onClick={()=>removeFund('B')}>✕</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Controls row */}
          <div className="controls-row">
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontSize:'.6rem',fontWeight:800,letterSpacing:'1px',textTransform:'uppercase',color:'var(--muted)',fontFamily:"'JetBrains Mono',monospace"}}>Window:</span>
              <div className="window-group">
                {WINDOWS.map(w => (
                  <button key={w} className={`window-btn${win===w?' active':''}`} onClick={()=>{setWin(w);if(result)setResult(null);}}>
                    {w}Y
                  </button>
                ))}
              </div>
            </div>
            <button className={`run-btn${running?' loading':''}`} onClick={run} disabled={!fundA.code||running}>
              {running ? (
                <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.22-8.56"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
              {running ? 'Calculating…' : 'Analyse'}
            </button>
          </div>
        </div>

        {/* ── Output area ── */}
        <div id="outputArea">
          {!result && !error && !running && (
            <div className="empty-state">
              <div className="empty-icon">📉</div>
              <div className="empty-title">Search for a fund to begin</div>
              <div className="empty-sub">Type any mutual fund name above — SIP, ELSS, index funds, sectoral — anything listed on AMFI. Pick a rolling window and hit Analyse.</div>
            </div>
          )}
          {running && (
            <div className="empty-state">
              <div style={{width:36,height:36,border:'3px solid var(--border)',borderTopColor:'var(--g3)',borderRadius:'50%',animation:'spin .8s linear infinite',margin:'0 auto 14px'}}></div>
              <div style={{fontSize:'.85rem',color:'var(--muted)',fontWeight:600}}>Calculating rolling returns…</div>
            </div>
          )}
          {error && (
            <>
              <div className="error-box">⚠ {error}</div>
              <div className="empty-state">
                <div className="empty-icon">🔄</div>
                <div className="empty-title">Something went wrong</div>
                <div className="empty-sub">Try a different fund, or check that enough NAV history exists for the selected window.</div>
              </div>
            </>
          )}

          {result && statsA && (
            <>
              {/* Stat cards */}
              <div className="stat-grid">
                {alphaData?.length ? (
                  /* Index mode stat cards */
                  <>
                    <div className="stat-card"><div className="sc-label">Hit Ratio</div><div className={`sc-val ${hitRatio>=60?'cagr-pos':hitRatio>=40?'cagr-warn':'cagr-neg'}`}>{hitRatio.toFixed(0)}%</div><div className="sc-sub">of {win}Y windows beat {result.nameB}</div></div>
                    <div className="stat-card"><div className="sc-label">Median Alpha</div><div className={`sc-val ${medAlpha>0?'cagr-pos':medAlpha>-2?'cagr-warn':'cagr-neg'}`}>{(medAlpha>=0?'+':'')+medAlpha.toFixed(1)} pp</div><div className="sc-sub">fund − index per window</div></div>
                    <div className="stat-card"><div className="sc-label">Fund Median CAGR</div><div className={`sc-val ${cagrCl(statsA.median)}`}>{fmtPct(statsA.median)}</div><div className="sc-sub">vs index {fmtPct(statsB.median)}</div></div>
                    <div className="stat-card"><div className="sc-label">Best Alpha</div><div className="sc-val cagr-pos">{(()=>{const b=alphaData.reduce((m,r)=>r.alpha>m?r.alpha:m,-Infinity);return (b>=0?'+':'')+b.toFixed(1)+'pp';})()}</div><div className="sc-sub">single window outperformance</div></div>
                    <div className="stat-card"><div className="sc-label">Worst Alpha</div><div className={`sc-val ${(()=>{const w=alphaData.reduce((m,r)=>r.alpha<m?r.alpha:m,Infinity);return w>-3?'cagr-warn':'cagr-neg';})()}`}>{(()=>{const w=alphaData.reduce((m,r)=>r.alpha<m?r.alpha:m,Infinity);return w.toFixed(1)+'pp';})()}</div><div className="sc-sub">single window underperformance</div></div>
                  </>
                ) : statsB ? (
                  /* Two-fund comparison stat cards */
                  <>
                    {[
                      {label:'Median CAGR', vA:fmtPct(statsA.median), clA:cagrCl(statsA.median), vB:fmtPct(statsB.median), clB:cagrCl(statsB.median)},
                      {label:'% Positive', vA:statsA.pctPos.toFixed(0)+'%', clA:statsA.pctPos>=80?'cagr-pos':'cagr-warn', vB:statsB.pctPos.toFixed(0)+'%', clB:statsB.pctPos>=80?'cagr-pos':'cagr-warn'},
                      {label:'% Beat 12%', vA:statsA.pct12.toFixed(0)+'%', clA:statsA.pct12>=80?'cagr-pos':'cagr-warn', vB:statsB.pct12.toFixed(0)+'%', clB:statsB.pct12>=80?'cagr-pos':'cagr-warn'},
                      {label:`Best ${win}Y`, vA:fmtPct(statsA.best), clA:'cagr-pos', vB:fmtPct(statsB.best), clB:'cagr-pos'},
                      {label:`Worst ${win}Y`, vA:fmtPct(statsA.worst), clA:cagrCl(statsA.worst), vB:fmtPct(statsB.worst), clB:cagrCl(statsB.worst)},
                    ].map(s => (
                      <div key={s.label} className="stat-card two-fund"><div className="sc-label">{s.label}</div>
                        <div className="sc-pair">
                          <div><div className={`sc-pair-val a ${s.clA}`}>{s.vA}</div><div className="sc-sub" style={{color:'var(--g2)'}}>A</div></div>
                          <div style={{width:1,background:'var(--border)',alignSelf:'stretch'}}></div>
                          <div><div className={`sc-pair-val b ${s.clB}`}>{s.vB}</div><div className="sc-sub" style={{color:'#7b1fa2'}}>B</div></div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  /* Single fund stat cards */
                  <>
                    <div className="stat-card"><div className="sc-label">Median CAGR</div><div className={`sc-val ${cagrCl(statsA.median)}`}>{fmtPct(statsA.median)}</div><div className="sc-sub">across {statsA.n.toLocaleString()} windows</div></div>
                    <div className="stat-card"><div className="sc-label">% Periods Positive</div><div className={`sc-val ${statsA.pctPos>=80?'cagr-pos':'cagr-warn'}`}>{statsA.pctPos.toFixed(0)}%</div><div className="sc-sub">of {win}Y windows &gt; 0%</div></div>
                    <div className="stat-card"><div className="sc-label">% Beat 12% CAGR</div><div className={`sc-val ${statsA.pct12>=80?'cagr-pos':statsA.pct12>=50?'cagr-warn':'cagr-neg'}`}>{statsA.pct12.toFixed(0)}%</div><div className="sc-sub">better than typical FD</div></div>
                    <div className="stat-card"><div className="sc-label">Best {win}Y Period</div><div className="sc-val cagr-pos">{fmtPct(statsA.best)}</div><div className="sc-sub">{statsA.bestEntry?fmtDateShort(statsA.bestEntry.startDate)+'→'+fmtDateShort(statsA.bestEntry.endDate):''}</div></div>
                    <div className="stat-card"><div className="sc-label">Worst {win}Y Period</div><div className={`sc-val ${cagrCl(statsA.worst)}`}>{fmtPct(statsA.worst)}</div><div className="sc-sub">{statsA.worstEntry?fmtDateShort(statsA.worstEntry.startDate)+'→'+fmtDateShort(statsA.worstEntry.endDate):''}</div></div>
                  </>
                )}
              </div>

              {/* Charts */}
              <div className="charts-section">
                {/* Histogram */}
                <div className="chart-card">
                  <div className="chart-header">
                    <div>
                      <div className="chart-title">📊 Return Distribution — {win}Y Rolling CAGR</div>
                      <div className="chart-sub">What % of all {win}-year holding windows delivered each return band · more bars on the right = more consistent</div>
                    </div>
                    <div className="chart-badge">{statsA.n.toLocaleString()} WINDOWS</div>
                  </div>
                  {(statsB || result.isIndex) && (
                    <div className="chart-legend">
                      <div className="cl-item"><div className="cl-dot" style={{background:'var(--g2)'}}></div>{result.nameA}</div>
                      <div className="cl-item"><div className="cl-dot" style={{background:result.isIndex?'#e65100':'#7b1fa2'}}></div>{result.nameB}</div>
                    </div>
                  )}
                  <div className="chart-wrap" style={{height:240}}><canvas ref={histRef}></canvas></div>
                  <div className="insight-bar" dangerouslySetInnerHTML={{__html:buildInsight()}}></div>
                </div>

                {/* Alpha chart (index mode only) */}
                {result.isIndex && alphaData?.length > 0 && (
                  <div className="chart-card">
                    <div className="chart-header">
                      <div>
                        <div className="chart-title">📊 Rolling Alpha — Fund vs {result.nameB}</div>
                        <div className="chart-sub">Each bar = fund CAGR minus index CAGR for that {win}Y entry window · green = outperformed · red = underperformed</div>
                      </div>
                      <div className="chart-badge" style={{background:hitRatio>=60?'var(--g-xlight)':'var(--neg-bg)',color:hitRatio>=60?'var(--g2)':'var(--neg)'}}>
                        HIT RATIO {hitRatio.toFixed(0)}%
                      </div>
                    </div>
                    <div className="chart-wrap" style={{height:200}}><canvas ref={alphaRef}></canvas></div>
                    <div className="insight-bar">
                      <strong>Alpha summary:</strong> Median alpha <span className={medAlpha>0?'pos':'neg'}>{(medAlpha>=0?'+':'')+medAlpha.toFixed(1)}pp</span>.
                      Fund beat {result.nameB} in <span className={hitRatio>=60?'pos':'neg'}>{hitRatio.toFixed(0)}%</span> of {win}Y windows.
                      {hitRatio>=70?' Consistent outperformer — alpha appears structural.': hitRatio>=50?' Marginal edge — alpha is present but entry timing matters.': <span className="neg"> Index was a stronger choice in majority of windows.</span>}
                    </div>
                  </div>
                )}

                {/* Timeline chart */}
                <div className="chart-card">
                  <div className="chart-header">
                    <div>
                      <div className="chart-title">📈 Rolling CAGR Over Time</div>
                      <div className="chart-sub">Each point = {win}Y CAGR starting on that entry date · flat high line = very consistent fund</div>
                    </div>
                    <div className="chart-badge">ENTRY DATE AXIS</div>
                  </div>
                  {(statsB || result.isIndex) && (
                    <div className="chart-legend">
                      <div className="cl-item"><div className="cl-dot" style={{background:'var(--g2)'}}></div>{result.nameA}</div>
                      <div className="cl-item"><div className="cl-dot" style={{background:result.isIndex?'#e65100':'#7b1fa2'}}></div>{result.nameB}</div>
                    </div>
                  )}
                  <div className="chart-wrap" style={{height:240}}><canvas ref={timeRef}></canvas></div>
                  <div className="insight-bar">
                    <strong>How to read:</strong> A flat line near 15–20% means investors who entered at any time got similar returns — ideal.
                    A volatile line means entry timing dominated outcomes. The dip below zero (if any) shows periods when investors who entered then had a loss.
                  </div>
                  {/* Data table toggle */}
                  <button className="table-toggle" onClick={()=>setTableOpen(!tableOpen)}>
                    {tableOpen?'▼ Hide data table':`▶ Show all ${statsA.n.toLocaleString()} data points`}
                  </button>
                  {tableOpen && (
                    <div className="table-section open">
                      <div style={{overflowX:'auto',maxHeight:360,overflowY:'auto'}}>
                        <table className="data-table">
                          <thead><tr>
                            <th onClick={()=>setDtSort(s=>({key:'startDate',dir:s.key==='startDate'?s.dir*-1:-1}))}>Entry Date</th>
                            <th onClick={()=>setDtSort(s=>({key:'endDate',dir:s.key==='endDate'?s.dir*-1:-1}))}>Exit Date</th>
                            <th onClick={()=>setDtSort(s=>({key:'startNav',dir:s.key==='startNav'?s.dir*-1:-1}))}>Start NAV</th>
                            <th onClick={()=>setDtSort(s=>({key:'endNav',dir:s.key==='endNav'?s.dir*-1:-1}))}>End NAV</th>
                            <th onClick={()=>setDtSort(s=>({key:'cagrPct',dir:s.key==='cagrPct'?s.dir*-1:-1}))}>CAGR</th>
                            {result.rrB && !result.isIndex && <th>CAGR (B)</th>}
                          </tr></thead>
                          <tbody>
                            {sortedRows.map((r,i)=>{
                              const bRow = bMapForTable[fmtDateShort(r.endDate)];
                              return (
                                <tr key={i}>
                                  <td>{fmtDateShort(r.startDate)}</td>
                                  <td>{fmtDateShort(r.endDate)}</td>
                                  <td>{r.startNav.toFixed(2)}</td>
                                  <td>{r.endNav.toFixed(2)}</td>
                                  <td className={cagrCl(r.cagrPct)}>{(r.cagrPct>=0?'+':'')+r.cagrPct.toFixed(2)}%</td>
                                  {result.rrB && !result.isIndex && <td className={bRow?cagrCl(bRow.cagrPct):''}>{bRow?(bRow.cagrPct>=0?'+':'')+bRow.cagrPct.toFixed(2)+'%':'—'}</td>}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Source line */}
        {result && (
          <div className="src-line" style={{display:'flex',flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
              <div className="src-dot"></div>
              <span>Data: AMFI · {result.rrA.length.toLocaleString()} NAV records · {win}Y rolling · {statsA?.n.toLocaleString()} windows{result.isIndex?` vs ${result.nameB} TRI`:result.rrB?` vs Fund B`:''}</span>
            </div>
            <button onClick={()=>{navigator.clipboard.writeText(location.href).then(()=>{setShareCopied(true);setTimeout(()=>setShareCopied(false),2000);});}}
              style={{padding:'4px 12px',borderRadius:6,fontSize:'.62rem',fontWeight:700,cursor:'pointer',border:'1px solid var(--border2)',background:'var(--s2)',color:'var(--g2)',fontFamily:'Raleway,sans-serif',transition:'.15s'}}>
              {shareCopied?'✓ Copied!':'🔗 Share link'}
            </button>
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}