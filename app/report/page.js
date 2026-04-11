'use client';
import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

/* ── helpers ── */
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function fmtCr(v) {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  if (a >= 100000) return '₹' + (v/100000).toFixed(2) + 'L Cr';
  if (a >= 1000)   return '₹' + (v/1000).toFixed(1)   + 'K Cr';
  return '₹' + Math.round(v) + ' Cr';
}
function fmtCrShort(v) {
  const a = Math.abs(v);
  if (a >= 100000) return (v/100000).toFixed(2) + 'L';
  if (a >= 1000)   return (v/1000).toFixed(1)   + 'K';
  return Math.round(v).toString();
}
function fmtFlow(v) {
  if (!v && v !== 0) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + fmtCr(v);
}
function fmtNum(v) {
  if (!v) return '—';
  return v >= 1e7 ? (v/1e7).toFixed(2)+'Cr' : v >= 1e5 ? (v/1e5).toFixed(1)+'L' : v.toLocaleString('en-IN');
}
function titleMonth(data) {
  const m = (data.month || '').toUpperCase();
  return m + ' ' + (data.year || '');
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Canvas helpers ── */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
function roundRectLeft(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
function roundRectRight(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x,y+h); ctx.closePath();
}

export default function ReportPage() {
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [industry,  setIndustry]  = useState(null);
  const [statewise, setStatewise] = useState(null);
  const [months,    setMonths]    = useState([]);
  const [selDate,   setSelDate]   = useState('');
  const [dataNote,  setDataNote]  = useState('Fetching data…');
  const [cardReady, setCardReady] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);

  const [typeFilter, setTypeFilter]   = useState('all');
  const [sortColumn, setSortColumn]   = useState('aum');
  const [sortDir,    setSortDir]      = useState(-1);

  const canvasRef = useRef(null);

  /* ── initial load ── */
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [ind, sw] = await Promise.all([
          fetch('/api/amfi-industry').then(r => { if(!r.ok) throw new Error('Industry API '+r.status); return r.json(); }),
          fetch('/api/amfi-statewise').then(r => { if(!r.ok) throw new Error('Statewise API '+r.status); return r.json(); }),
        ]);
        setIndustry(ind);
        setStatewise(sw);
        // Build months list from statewise
        const mList = (sw.availableMonths || []);
        setMonths(mList);
        const curDate = '01-' + (ind.month||'').slice(0,3).toLowerCase() + '-' + (ind.year||'');
        setSelDate(curDate);
        setDataNote('Data: AMFI · ' + titleMonth(ind));
        setLoading(false);
      } catch(e) {
        setError(e.message);
        setLoading(false);
      }
    }
    init();
  }, []);

  /* ── draw card whenever data changes ── */
  useEffect(() => {
    if (!industry || !canvasRef.current) return;
    setCardReady(false);
    document.fonts.ready.then(() => {
      drawCard(industry, statewise);
      setCardReady(true);
    });
  }, [industry, statewise]);

  /* ── month change handler ── */
  async function handleMonthChange(date) {
    setSelDate(date);
    if (!date) return;
    setLoading(true); setCardReady(false); setDataNote('Loading…');
    try {
      const [ind, sw] = await Promise.all([
        fetch('/api/amfi-industry?date=' + date).then(r => r.json()),
        fetch('/api/amfi-statewise?date=' + date).then(r => r.json()),
      ]);
      setIndustry(ind);
      setStatewise(sw);
      setDataNote('Data: AMFI · ' + titleMonth(ind));
      setLoading(false);
    } catch(e) {
      setDataNote('⚠ ' + e.message);
      setLoading(false);
    }
  }

  /* ── Canvas drawing ── */
  function drawCard(data, sw) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 1200, H = 630;
    ctx.clearRect(0, 0, W, H);

    // Background
    const bgGrad = ctx.createLinearGradient(0,0,0,H);
    bgGrad.addColorStop(0, '#0c1c0c'); bgGrad.addColorStop(1, '#0f2210');
    ctx.fillStyle = bgGrad; ctx.fillRect(0,0,W,H);
    const rg = ctx.createRadialGradient(900,0,50,900,0,400);
    rg.addColorStop(0,'rgba(46,125,50,0.18)'); rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0,0,W,H);

    // Grid lines
    ctx.strokeStyle='rgba(255,255,255,0.035)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Column dividers
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(390,30);ctx.lineTo(390,H-30);ctx.stroke();
    ctx.beginPath();ctx.moveTo(830,30);ctx.lineTo(830,H-30);ctx.stroke();
    ctx.setLineDash([]);

    drawLeftPanel(ctx, data, sw, 0, 0, 390, H);
    drawMiddlePanel(ctx, data, 390, 0, 440, H);
    drawRightPanel(ctx, data, 830, 0, 370, H);
    drawBottomBar(ctx, data, sw, 0, H-52, W, 52);
  }

  function drawLeftPanel(ctx, data, sw, x0, y0, w, h) {
    const s = data.summary || {};
    const total = s.totalAum || 0;
    const accentGrad = ctx.createLinearGradient(x0+38,y0,x0+38,y0+h);
    accentGrad.addColorStop(0,'#43a047'); accentGrad.addColorStop(0.5,'#66bb6a'); accentGrad.addColorStop(1,'#2e7d32');
    ctx.fillStyle=accentGrad; ctx.fillRect(x0+38,y0+50,3,h-100);
    ctx.font='600 11px "JetBrains Mono",monospace'; ctx.fillStyle='#4caf50'; ctx.textAlign='left';
    ctx.fillText('AMFI OFFICIAL DATA',x0+56,y0+68);
    ctx.beginPath();ctx.arc(x0+49,y0+64,4,0,Math.PI*2); ctx.fillStyle='#43a047';ctx.fill();
    ctx.font='bold 48px "Raleway",sans-serif'; ctx.fillStyle='#c8e6c9'; ctx.fillText('INDIA MF',x0+56,y0+108);
    ctx.fillStyle='#66bb6a'; ctx.fillText('INDUSTRY',x0+56,y0+160);
    const mLabel=titleMonth(data); const badgeW=130,badgeH=28,bx=x0+56,by=y0+178;
    roundRect(ctx,bx,by,badgeW,badgeH,14); ctx.fillStyle='#1b4d1f'; ctx.fill();
    ctx.strokeStyle='#2e7d32'; ctx.lineWidth=1; ctx.stroke();
    ctx.font='bold 12px "JetBrains Mono",monospace'; ctx.fillStyle='#81c784'; ctx.textAlign='center';
    ctx.fillText(mLabel,bx+badgeW/2,by+18); ctx.textAlign='left';
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x0+56,y0+222);ctx.lineTo(x0+w-30,y0+222);ctx.stroke();
    ctx.font='600 12px "JetBrains Mono",monospace'; ctx.fillStyle='#6a8e6a';
    ctx.fillText('TOTAL INDUSTRY AUM',x0+56,y0+248);
    const totalStr=fmtCr(total).replace('₹','');
    ctx.font='bold 40px "JetBrains Mono",monospace'; ctx.fillStyle='#ffffff';
    ctx.fillText('₹'+totalStr,x0+56,y0+298);
    const equityPct=total>0?(s.equityAum/total*100).toFixed(1):'—';
    ctx.font='600 12px "JetBrains Mono",monospace'; ctx.fillStyle='#4a8a4e';
    ctx.fillText('EQUITY SHARE',x0+56,y0+330);
    ctx.font='bold 22px "JetBrains Mono",monospace'; ctx.fillStyle='#81c784';
    ctx.fillText(equityPct+'%',x0+56,y0+356);
    ctx.font='600 12px "JetBrains Mono",monospace'; ctx.fillStyle='#4a8a4e';
    ctx.fillText('CATEGORIES',x0+200,y0+330);
    ctx.font='bold 22px "JetBrains Mono",monospace'; ctx.fillStyle='#81c784';
    ctx.fillText(String(data.parsedCategories||'39'),x0+200,y0+356);
    ctx.strokeStyle='rgba(255,255,255,0.06)';
    ctx.beginPath();ctx.moveTo(x0+56,y0+376);ctx.lineTo(x0+w-30,y0+376);ctx.stroke();
    ctx.font='700 11px "Raleway",sans-serif'; ctx.fillStyle='#2e5e30';
    ctx.fillText('MONTHLY REPORT CARD',x0+56,y0+402);
    ctx.font='500 11px "Raleway",sans-serif'; ctx.fillStyle='#2a4a2c';
    ctx.fillText('mfcalc.getabundance.in/report',x0+56,y0+420);
    ctx.font='bold 14px "Raleway",sans-serif'; ctx.fillStyle='#c8e6c9';
    ctx.fillText('Abundance Financial Services',x0+56,y0+h-75);
    ctx.font='600 11px "JetBrains Mono",monospace'; ctx.fillStyle='#3a6a3e';
    ctx.fillText('ARN-251838',x0+56,y0+h-58);
  }

  function drawMiddlePanel(ctx, data, x0, y0, w, h) {
    const s = data.summary || {};
    const total = s.totalAum || 1;
    const cats = [
      { label:'EQUITY',  val:s.equityAum,  color:'#43a047' },
      { label:'PASSIVE', val:s.passiveAum, color:'#ff9800' },
      { label:'HYBRID',  val:s.hybridAum,  color:'#ab47bc' },
      { label:'DEBT',    val:s.debtAum,    color:'#42a5f5' },
    ];
    ctx.font='700 11px "JetBrains Mono",monospace'; ctx.fillStyle='#3a6a3e'; ctx.textAlign='left';
    ctx.fillText('CATEGORY BREAKDOWN',x0+20,y0+68);
    const tileW=188,tileH=112,gapX=16,gapY=14,gridX=x0+20,gridY=y0+88;
    cats.forEach((c,i)=>{
      const col=i%2,row=Math.floor(i/2);
      const tx=gridX+col*(tileW+gapX),ty=gridY+row*(tileH+gapY);
      const pct=(c.val/total*100).toFixed(1);
      roundRect(ctx,tx,ty,tileW,tileH,10); ctx.fillStyle='rgba(255,255,255,0.04)';ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle=c.color; ctx.fillRect(tx,ty+12,3,tileH-24);
      ctx.font='700 10px "JetBrains Mono",monospace'; ctx.fillStyle=c.color; ctx.textAlign='left';
      ctx.fillText(c.label,tx+14,ty+24);
      const aumStr=fmtCr(c.val);
      ctx.font='bold 20px "JetBrains Mono",monospace'; ctx.fillStyle='#e8f5e9'; ctx.fillText(aumStr,tx+14,ty+56);
      ctx.font='bold 13px "JetBrains Mono",monospace'; ctx.fillStyle=c.color; ctx.fillText(pct+'%',tx+14,ty+76);
      ctx.font='500 10px "Raleway",sans-serif'; ctx.fillStyle='rgba(255,255,255,0.35)';
      ctx.fillText('of total AUM',tx+14+ctx.measureText(pct+'%').width+6,ty+76);
      const barX=tx+14,barY=ty+88,barW=tileW-28,barH=5;
      roundRect(ctx,barX,barY,barW,barH,3); ctx.fillStyle='rgba(255,255,255,0.08)';ctx.fill();
      const fill=Math.max(4,barW*(c.val/total));
      roundRect(ctx,barX,barY,fill,barH,3); ctx.fillStyle=c.color;ctx.fill();
    });
    const barY2=gridY+2*(tileH+gapY)+18;
    ctx.font='700 10px "JetBrains Mono",monospace'; ctx.fillStyle='#3a6a3e'; ctx.fillText('DISTRIBUTION',x0+20,barY2-6);
    const stackW=w-40,stackH=18;
    roundRect(ctx,x0+20,barY2,stackW,stackH,9); ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fill();
    let stackX=x0+20;
    const order=[...cats].sort((a,b)=>b.val-a.val);
    const total2=order.reduce((acc,c)=>acc+(c.val||0),0);
    order.forEach((c,i)=>{
      const segW=stackW*(c.val/total2); ctx.fillStyle=c.color;
      if(i===0)roundRectLeft(ctx,stackX,barY2,Math.max(segW,1),stackH,9);
      else if(i===order.length-1)roundRectRight(ctx,stackX,barY2,Math.max(segW,1),stackH,9);
      else ctx.fillRect(stackX,barY2,Math.max(segW,1),stackH);
      ctx.fill(); stackX+=segW;
    });
    let lx=x0+20;
    cats.forEach(c=>{
      ctx.fillStyle=c.color; ctx.fillRect(lx,barY2+stackH+8,10,10);
      ctx.font='600 10px "JetBrains Mono",monospace'; ctx.fillStyle='rgba(255,255,255,0.5)';
      ctx.fillText(c.label,lx+14,barY2+stackH+18); lx+=ctx.measureText(c.label).width+30;
    });
    const solAum=total-(s.equityAum||0)-(s.debtAum||0)-(s.hybridAum||0)-(s.passiveAum||0);
    if(solAum>0){
      ctx.font='500 10px "JetBrains Mono",monospace'; ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.textAlign='right';
      ctx.fillText('+₹'+fmtCrShort(solAum)+' Cr solution funds',x0+w-20,barY2+stackH+18); ctx.textAlign='left';
    }
  }

  function drawRightPanel(ctx, data, x0, y0, w, h) {
    const cats = data.categories || {};
    const allCats = Object.entries(cats)
      .filter(([k,v])=>v.netFlow!==undefined&&v.label!=='Schemes as')
      .map(([k,v])=>({...v,key:k}));
    const inflows = allCats.filter(c=>c.netFlow>0&&c.key!=='liquidFund'&&c.key!=='overnightFund').sort((a,b)=>b.netFlow-a.netFlow).slice(0,7);
    const outflows= allCats.filter(c=>c.netFlow<0).sort((a,b)=>a.netFlow-b.netFlow).slice(0,4);
    const maxInflow=inflows[0]?.netFlow||1, maxOutflow=Math.abs(outflows[0]?.netFlow||1);
    const barMaxW=w-42;
    ctx.font='700 11px "JetBrains Mono",monospace'; ctx.fillStyle='#3a6a3e'; ctx.textAlign='left';
    ctx.fillText('NET INFLOWS — TOP MOVERS',x0+20,y0+68);
    const rowH=46,startY=y0+82;
    const typeColor={equity:'#43a047',hybrid:'#ab47bc',passive:'#ff9800',debt:'#42a5f5',solution:'#f48fb1'};
    inflows.forEach((c,i)=>{
      const ry=startY+i*rowH; if(ry+rowH>y0+h-130)return;
      let name=c.label; if(name.length>22)name=name.slice(0,20)+'…';
      ctx.font='600 11px "Raleway",sans-serif'; ctx.fillStyle='rgba(200,230,201,0.75)'; ctx.textAlign='left';
      ctx.fillText(name,x0+20,ry+15);
      ctx.font='bold 11px "JetBrains Mono",monospace'; ctx.fillStyle='#4caf50'; ctx.textAlign='right';
      ctx.fillText('+'+fmtCr(c.netFlow),x0+w-18,ry+15); ctx.textAlign='left';
      const barW=(c.netFlow/maxInflow)*barMaxW;
      roundRect(ctx,x0+20,ry+20,barMaxW,5,3); ctx.fillStyle='rgba(255,255,255,0.05)';ctx.fill();
      roundRect(ctx,x0+20,ry+20,Math.max(barW,3),5,3); ctx.fillStyle=typeColor[c.type]||'#43a047';ctx.fill();
    });
    const outflowY=startY+Math.min(inflows.length,7)*rowH+10;
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath();ctx.moveTo(x0+20,outflowY);ctx.lineTo(x0+w-20,outflowY);ctx.stroke(); ctx.setLineDash([]);
    if(outflowY+60<y0+h-60){
      ctx.font='700 11px "JetBrains Mono",monospace'; ctx.fillStyle='#4a2020';
      ctx.fillText('NET OUTFLOWS',x0+20,outflowY+18);
      outflows.slice(0,3).forEach((c,i)=>{
        const ry=outflowY+24+i*28; if(ry+28>y0+h-60)return;
        let name=c.label; if(name.length>22)name=name.slice(0,20)+'…';
        ctx.font='500 10px "Raleway",sans-serif'; ctx.fillStyle='rgba(255,120,120,0.6)'; ctx.fillText(name,x0+20,ry+12);
        ctx.font='bold 10px "JetBrains Mono",monospace'; ctx.fillStyle='#ef5350'; ctx.textAlign='right';
        ctx.fillText(fmtFlow(c.netFlow),x0+w-18,ry+12); ctx.textAlign='left';
      });
    }
  }

  function drawBottomBar(ctx, data, sw, x0, y0, w, h) {
    const barGrad=ctx.createLinearGradient(0,y0,0,y0+h);
    barGrad.addColorStop(0,'#091409'); barGrad.addColorStop(1,'#060e06');
    ctx.fillStyle=barGrad; ctx.fillRect(x0,y0,w,h);
    const lineGrad=ctx.createLinearGradient(0,0,w,0);
    lineGrad.addColorStop(0,'#1b5e20'); lineGrad.addColorStop(0.3,'#43a047'); lineGrad.addColorStop(0.7,'#43a047'); lineGrad.addColorStop(1,'#1b5e20');
    ctx.fillStyle=lineGrad; ctx.fillRect(x0,y0,w,2);
    const s=data.summary||{};
    const items=['₹'+fmtCrShort(s.totalAum||0)+' Cr Total AUM',titleMonth(data),(data.parsedCategories||39)+' Fund Categories',sw?.stateCount?sw.stateCount+' States Reporting':'36 States Reporting','Source: AMFI'];
    ctx.font='600 11px "JetBrains Mono",monospace'; ctx.fillStyle='rgba(100,160,100,0.6)'; ctx.textAlign='left';
    let bx=x0+56;
    items.forEach((item,i)=>{
      ctx.fillText(item,bx,y0+32); bx+=ctx.measureText(item).width+30;
      if(i<items.length-1){ctx.fillStyle='rgba(255,255,255,0.12)';ctx.fillText('·',bx-18,y0+32);ctx.fillStyle='rgba(100,160,100,0.6)';}
    });
    ctx.font='600 11px "JetBrains Mono",monospace'; ctx.fillStyle='#2e7d32'; ctx.textAlign='right';
    ctx.fillText('mfcalc.getabundance.in/report',x0+w-40,y0+32); ctx.textAlign='left';
  }

  /* ── actions ── */
  function downloadCard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fname = industry ? `india-mf-industry-${industry.month||'report'}-${industry.year||''}.png` : 'india-mf-industry-report.png';
    canvas.toBlob(blob => {
      if (!blob) { alert('Could not generate image. Try again.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=fname;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function buildShareText() {
    const s = industry?.summary || {};
    const m = titleMonth(industry || {});
    const t = fmtCr(s.totalAum);
    const eq = s.totalAum > 0 ? (s.equityAum/s.totalAum*100).toFixed(1) : '—';
    return `India's Mutual Fund Industry — ${m}\n\n📊 Total AUM: ${t}\n📈 Equity Share: ${eq}%\n🏦 ${industry?.parsedCategories||39} fund categories tracked\n\nFull interactive report 👇\nmfcalc.getabundance.in/report\n\n#MutualFunds #AMFI #IndiaFinance #WealthManagement #SIP`;
  }
  function shareLinkedIn() {
    const url  = 'https://mfcalc.getabundance.in/report';
    const text = buildShareText();
    window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent('India MF Industry Report')}&summary=${encodeURIComponent(text)}`,'_blank','width=600,height=600');
  }
  function shareWhatsApp() {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(buildShareText()+'\nhttps://mfcalc.getabundance.in/report')}`,'_blank');
  }
  function shareTwitter() {
    const s = industry?.summary || {};
    const tweet = `India MF Industry ${titleMonth(industry||{})}: Total AUM ${fmtCr(s.totalAum)}, Equity Share ${s.totalAum>0?(s.equityAum/s.totalAum*100).toFixed(1):'—'}%\n\nFull report 👇 #MutualFunds #AMFI`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent('https://mfcalc.getabundance.in/report')}`,'_blank','width=600,height=400');
  }
  function copyLink() {
    const url = 'https://mfcalc.getabundance.in/report';
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    });
    setCopyFlash(true);
    setTimeout(() => setCopyFlash(false), 2000);
  }

  /* ── table data ── */
  const tableData = industry ? Object.entries(industry.categories || {})
    .filter(([k,v]) => v.label && v.label !== 'Schemes as')
    .map(([k,v]) => ({ ...v, key: k })) : [];
  const filteredRows = [...tableData]
    .filter(r => typeFilter === 'all' || r.type === typeFilter)
    .sort((a,b) => sortDir * ((b[sortColumn]||0) - (a[sortColumn]||0)));
  const maxAum = Math.max(...tableData.map(r => r.aum || 0), 1);

  function handleSortTable(key) {
    if (sortColumn === key) setSortDir(d => d * -1);
    else { setSortColumn(key); setSortDir(-1); }
  }

  /* ── render ── */
  return (
    <>
      <div className="container">
        <Navbar activePage="report" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"/>
            <span className="eyebrow-text">AMFI Official Data · Monthly</span>
          </div>
          <h1 className="page-title">India MF Industry <span>Report Card</span></h1>
          <p className="page-subtitle">One-click shareable monthly snapshot — download as PNG, post on LinkedIn or WhatsApp</p>
        </div>

        {/* Controls */}
        <div className="controls-bar">
          <select className="month-select" value={selDate} onChange={e => handleMonthChange(e.target.value)} title="Select month">
            {months.length === 0 && <option value="">Loading months…</option>}
            {months.map((m, i) => {
              const [mon, yr] = m.split('-');
              const dStr = '01-' + mon.slice(0,3).toLowerCase() + '-' + yr;
              return <option key={i} value={dStr}>{mon} {yr}</option>;
            })}
          </select>
          <button className="btn btn-primary" onClick={downloadCard} disabled={!cardReady}>⬇ Download PNG</button>
          <span className="data-note">{dataNote}</span>
        </div>

        {/* Card */}
        <div className="card-outer">
          <div className="card-wrapper">
            {(loading || !cardReady) && <div className="card-skeleton" style={{display:'block',height:0,paddingBottom:'52.5%'}}/>}
            <canvas
              ref={canvasRef}
              width={1200}
              height={630}
              style={{ display: cardReady ? 'block' : 'none', width:'100%', height:'auto', cursor:'default' }}
            />
          </div>

          {/* Share strip */}
          {cardReady && (
            <div className="share-strip">
              <span className="share-label">Share</span>
              <button className="share-btn linkedin" onClick={shareLinkedIn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
                LinkedIn
              </button>
              <button className="share-btn whatsapp" onClick={shareWhatsApp}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </button>
              <button className="share-btn twitter" onClick={shareTwitter}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X / Twitter
              </button>
              <button className="share-btn copy" onClick={copyLink}>📋 Copy Link</button>
              {copyFlash && <span className="copy-flash" style={{opacity:1}}>✓ Copied!</span>}
            </div>
          )}
        </div>

        {error && (
          <div style={{textAlign:'center',padding:'40px',color:'#b71c1c',fontSize:'.9rem'}}>
            ⚠ {error}
          </div>
        )}

        {/* Category table */}
        {industry && !loading && (
          <div className="detail-section">
            <div className="section-header">
              <div className="section-title">📂 Category Breakdown</div>
              <div className="type-filters">
                {['all','equity','debt','hybrid','passive','solution'].map(t => (
                  <button key={t} className={`type-btn${typeFilter===t?' active':''}`} onClick={() => setTypeFilter(t)}>
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <div style={{overflowX:'auto'}}>
                <table className="data-table">
                  <thead><tr>
                    <th onClick={() => handleSortTable('label')}>Category</th>
                    <th onClick={() => handleSortTable('type')} className="col-mob-hide">Type</th>
                    <th onClick={() => handleSortTable('aum')}>AUM (Cr)</th>
                    <th onClick={() => handleSortTable('netFlow')} className="col-mob-hide">Net Flow (Cr)</th>
                    <th onClick={() => handleSortTable('inflow')} className="col-mob-hide">Inflow</th>
                    <th onClick={() => handleSortTable('redemption')} className="col-mob-hide">Outflow</th>
                    <th onClick={() => handleSortTable('folios')}>Folios</th>
                    <th onClick={() => handleSortTable('schemes')} className="col-mob-hide">Schemes</th>
                  </tr></thead>
                  <tbody>
                    {filteredRows.map((r, i) => {
                      const flowCls = r.netFlow > 0 ? 'flow-pos' : r.netFlow < 0 ? 'flow-neg' : 'flow-neu';
                      const bar = Math.round((r.aum||0)/maxAum*100);
                      return (
                        <tr key={i}>
                          <td style={{minWidth:200}}>{r.label}</td>
                          <td className="col-mob-hide"><span className={`type-pill pill-${r.type||'equity'}`}>{r.type||''}</span></td>
                          <td className="mono">
                            {fmtCr(r.aum)}
                            <div className="aum-bar-bg"><div className="aum-bar-fill" style={{width:bar+'%'}}/></div>
                          </td>
                          <td className="col-mob-hide"><span className={flowCls}>{fmtFlow(r.netFlow)}</span></td>
                          <td className="col-mob-hide mono">{fmtCr(r.inflow)}</td>
                          <td className="col-mob-hide mono">{fmtCr(r.redemption)}</td>
                          <td className="mono">{fmtNum(r.folios)}</td>
                          <td className="col-mob-hide mono">{r.schemes||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="src-line"><div className="src-dot"/>Data: AMFI official monthly report · amfiindia.com</div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
