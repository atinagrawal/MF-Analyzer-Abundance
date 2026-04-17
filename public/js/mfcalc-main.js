

/* ════════════════════════════════════════
   BRAND STRIP — IST CLOCK
════════════════════════════════════════ */
(function startClock(){
  function tick(){
    const el = document.getElementById('brandClockTime');
    if(!el) return;
    const now = new Date();
    // IST = UTC+5:30
    const ist = new Date(now.getTime() + (5*60+30)*60*1000);
    const h = String(ist.getUTCHours()).padStart(2,'0');
    const m = String(ist.getUTCMinutes()).padStart(2,'0');
    const s = String(ist.getUTCSeconds()).padStart(2,'0');
    el.textContent = h+':'+m+':'+s;
  }
  tick();
  setInterval(tick, 1000);
})();

/* ════════════════════════════════════════
   QUICK PICKS — live API, random per category
════════════════════════════════════════ */
// 2 verified search queries per category.
// We search the proxy — API picks the current regular-growth plan dynamically.

// Resolved picks — populated on load, reused for "Try" pairs
const _resolvedPicks = [];

// Words that disqualify a fund from search results
const QP_BLOCKED = [
  'institutional','discontinued','debt','insurance',
  'fmp','liquid','overnight','arbitrage','interval',
  'fixed maturity','banking','psu','credit risk',
  'money market','low duration','ultra short','short duration',
  'medium duration','long duration','gilt','dynamic bond',
  'corporate bond','floater','conservative','pension',
  'segregated','close ended','close-ended',
];

function isEligible(name) {
  const n = name.toLowerCase();
  if (n.includes('direct'))        return false;
  if (n.includes('institutional')) return false;
  if (/\bidcw\b|dividend payout/i.test(n)) return false;
  if (QP_BLOCKED.some(b => n.includes(b))) return false;
  return true;
}

// Fetch one fund by code, return {code, name} or null

function renderQAChip(pick) {
  const btn = document.createElement('button');
  btn.className = 'qa-chip';
  const shortName = pick.name
    .replace(/\s*-\s*regular\s*plan\s*-\s*growth\s*/i, '')
    .replace(/\s*-\s*growth\s*plan\s*-\s*growth\s*option\s*/i, '')
    .replace(/\s*-\s*growth\s*plan\s*/i, '')
    .replace(/\s*-\s*growth\s*option\s*/i, '')
    .replace(/\s*-\s*growth\s*/i, '')
    .replace(/-\s*regular\s*plan\s*/i, '')
    .trim();
  btn.innerHTML = `<span class="qa-chip-cat">${pick.label || ''}</span>
    <span class="qa-chip-name">${shortName.length > 28 ? shortName.slice(0,26)+'…' : shortName}</span>`;
  btn.title = pick.name;
  btn.onclick = function() { quickAddFund(pick.code, pick.name, pick.label || '', this); };
  return btn;
}

// Click handler for popular pick chips — uses data attributes
function qcClick(btn) {
  try {
    var code = parseInt(btn.dataset.code);
    var name = btn.dataset.name || '';
    var cat  = btn.dataset.cat  || '';
    if (!code || !name) { alert('Chip data missing: code=' + code + ' name=' + name); return; }
    quickAddFund(code, name, cat, btn);
  } catch(e) {
    alert('qcClick error: ' + e.message);
  }
}
// Click handler for Try: pair buttons
function tryPairClick(btn) {
  try {
    quickAddFund(parseInt(btn.dataset.c1), btn.dataset.n1, '', null);
    quickAddFund(parseInt(btn.dataset.c2), btn.dataset.n2, '', null);
  } catch(e) {
    alert('tryPairClick error: ' + e.message);
  }
}
// Chips are pre-rendered in HTML — just populate _resolvedPicks for internal use
function loadQuickPicks() {
  var chips = document.querySelectorAll('#qaChips .qa-chip');
  for (var i = 0; i + 1 < chips.length; i += 2) {
    _resolvedPicks[i / 2] = {
      primary:   { code: parseInt(chips[i].dataset.code),   name: chips[i].dataset.name,   label: chips[i].dataset.cat   || '' },
      secondary: { code: parseInt(chips[i+1].dataset.code), name: chips[i+1].dataset.name, label: chips[i+1].dataset.cat || '' }
    };
  }
}


function populateTryRow() {
  // Pair buttons are hardcoded in HTML — nothing to do.
  // _resolvedPicks is already populated by loadQuickPicks() from the DOM.
}

/* ════════════════════════════════════════
   FUND COMPARE — quick-add helper
════════════════════════════════════════ */
function quickAddFund(schemeCode, name, category, btn){
  if(selectedFunds.length>=5){alert('Max 5 funds.');return;}
  if(selectedFunds.find(f=>f.code===schemeCode)){return;}
  if(btn) btn.classList.add('added');
  setLoading(true);
  fetch('/api/mf?code='+schemeCode)
    .then(function(r){ return r.json(); })
    .then(function(res){
      if(!res.data||!res.data.length) throw new Error('No data');
      const cleaned = res.data
        .filter(function(d){const v=parseFloat(d.nav);return !isNaN(v)&&v>0;})
        .sort(function(a,b){return parseNAVDate(a.date)-parseNAVDate(b.date);});
      const fname = (res.meta && res.meta.scheme_name) ? res.meta.scheme_name : name;
      selectedFunds.push({code:schemeCode, name:fname, rawData:cleaned});
      renderChips();
      renderAll();
      setLoading(false);
      const es=document.getElementById('emptyState');
      const qa=document.getElementById('quickAddWrap');
      if(es) es.style.display='none';
      if(qa) qa.style.display='none';
      const tb=document.getElementById('toolbar');
      const tr=document.getElementById('tabsRow');
      if(tb) tb.style.display='flex';
      if(tr) tr.style.display='flex';
    })
    .catch(function(err){
      setLoading(false);
      if(btn) btn.classList.remove('added');
      alert('Could not load fund data. Please check your connection and try again.');
    });
}

/* ════════════════════════════════════════
   GOAL PLANNER — north star banner update
════════════════════════════════════════ */
function updateGoalNorthStar(){
  const el = document.getElementById('gpNorthStarText');
  if(!el) return;
  const nameEl = document.getElementById('goalName');
  const amtEl  = document.getElementById('goalAmount');
  const durEl  = document.getElementById('goalDuration');
  const unitEl = document.getElementById('goalDurationUnit');
  if(!nameEl || !amtEl || !durEl) return;
  const name = nameEl.value || 'your goal';
  const amt  = parseFloat(amtEl.value) || 0;
  const dur  = parseFloat(durEl.value) || 0;
  const unit = unitEl ? unitEl.value : 'years';
  el.textContent = 'Planning your ' + name + ' of ₹' + fmtINR(amt) + ' in ' + dur + ' ' + unit;
}

/* ════════════════════════════════════════
   SIP STEPPER HELPERS
════════════════════════════════════════ */
function stepField(id, delta, min, max){
  const el = document.getElementById(id);
  if(!el) return;
  let v = (parseFloat(el.value)||0) + delta;
  v = Math.min(max, Math.max(min, v));
  // Round to avoid floating-point drift
  v = Math.round(v * 100) / 100;
  el.value = v;
}
function setField(id, val){
  const el = document.getElementById(id);
  if(el) el.value = val;
}
function setUnit(id, val){
  const el = document.getElementById(id);
  if(el) el.value = val;
}

function initSIPSliders() { /* steppers need no init */ }
function syncSlider(){}
function syncInput(){}
function syncSliderDur(){}
function syncSliderDurUnit(){}


// Animated counter for big corpus number
let _counterTimer = null;
function animateCounter(el, targetVal) {
  if (_counterTimer) clearInterval(_counterTimer);
  const startVal = parseFloat(el.dataset.rawVal || 0);
  el.dataset.rawVal = targetVal;
  if (targetVal === startVal) { el.textContent = '₹' + fmtINR(targetVal); return; }
  const duration = 420, steps = 28;
  const interval = duration / steps;
  const delta = (targetVal - startVal) / steps;
  let current = startVal, step = 0;
  el.classList.add('animating');
  _counterTimer = setInterval(() => {
    step++;
    current += delta;
    if (step >= steps) {
      current = targetVal;
      clearInterval(_counterTimer);
      el.classList.remove('animating');
    }
    el.textContent = '₹' + fmtINR(Math.round(current));
  }, interval);
}

// Update the big result panel
function updateBigResult(corpus, invested, gain, mult, wealthGainPct, p) {
  const corpusEl = document.getElementById('sbrCorpus');
  if (corpusEl) animateCounter(corpusEl, corpus);

  const invEl = document.getElementById('sbrInvested');
  const gainEl = document.getElementById('sbrGain');
  const multEl = document.getElementById('sbrMult');
  if (invEl)  invEl.textContent  = 'Invested: ₹' + fmtINR(invested);
  if (gainEl) gainEl.textContent = 'Gain: ₹'     + fmtINR(gain);
  if (multEl) multEl.textContent = mult.toFixed(2) + '×';

  // Stacked bar
  const invPct = corpus > 0 ? Math.round((invested / corpus) * 100) : 50;
  const gainPct = 100 - invPct;
  const barInv  = document.getElementById('sbrBarInvested');
  const barGain = document.getElementById('sbrBarGain');
  if (barInv)  barInv.style.width  = invPct  + '%';
  if (barGain) barGain.style.width = gainPct + '%';

  // Insight sentence
  const insightEl = document.getElementById('sbrInsight');
  if (insightEl) {
    const years = p.totalYears.toFixed(0);
    const freq  = p.isLump ? 'one-time investment' : '₹' + fmtINR(p.sipAmt) + '/mo';
    const grows = (mult >= 1) ? 'grows to' : 'returns';
    insightEl.textContent =
      `Your ${freq} ${grows} ₹${fmtINR(corpus)} in ${years} years — that's ${mult.toFixed(2)}× your money.`;
  }

  // ── Announce result to screen reader ──
  const liveEl = document.getElementById('a11yLive');
  if (liveEl && corpus > 0) {
    liveEl.textContent = `Estimated corpus: ${fmtINR(corpus)} rupees. Invested: ${fmtINR(invested)}. Gain: ${fmtINR(gain)}.`;
  }

  // ── Wealth Clock ring update ──
  const circumference = 414.69;
  const gainFrac = corpus > 0 ? Math.min(gain / corpus, 1) : 0;
  const gainOffset = circumference * (1 - gainFrac);
  const ringGain = document.getElementById('wcRingGain');
  const ringGlow = document.getElementById('wcRingGlow');
  const ringPct  = document.getElementById('wcRingPct');
  if (ringGain) ringGain.style.strokeDashoffset = gainOffset;
  if (ringGlow) ringGlow.style.strokeDashoffset = gainOffset;
  if (ringPct)  ringPct.textContent = Math.round(gainFrac * 100) + '%';
}

/* ════════════════════════════════════════
   MAIN TAB SWITCHING — lazy init per tab
════════════════════════════════════════ */
const _tabInited = {fund:true, sip:false, goal:false, swp:false, emi:false};

function switchMainTab(id, btn) {
  document.querySelectorAll('.main-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.main-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
  document.getElementById('mpanel-' + id).classList.add('active');
  btn.classList.add('active');
  btn.setAttribute('aria-selected','true');
  // Lazy init: only compute on first visit
  if (!_tabInited[id]) {
    _tabInited[id] = true;
    if (id === 'sip')  { initSIPSliders(); calcSIP(); }
    if (id === 'goal') { initMCStars(); calcGoal(); }
    if (id === 'swp')  calcSWP();
    if (id === 'emi')  { initEMIStars(); calcEMI(); }
  }
  // Scroll sticky tabs into view
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ════════════════════════════════════════
   FUND COMPARISON
════════════════════════════════════════ */
const COLORS=["#2e7d32","#1565c0","#e65100","#6a1b9a","#00838f"];
const COLORS_LIGHT=["rgba(46,125,50,.13)","rgba(21,101,192,.13)","rgba(230,81,0,.13)","rgba(106,27,154,.13)","rgba(0,131,143,.13)"];
let selectedFunds=[],currentPeriod='1Y',searchTimeout=null;
let navChart=null,currentTab="nav";

let searchAbortCtrl=null;
const searchCache=new Map();

function onSearch(){
  const q=document.getElementById("mfInput").value.trim(),dd=document.getElementById("dropdown");
  clearTimeout(searchTimeout);
  if(q.length<2){dd.classList.remove("open");return;}
  searchTimeout=setTimeout(()=>doSearch(q),300);
}
// Deprioritise likely pre-rationalisation/merged funds by name pattern only
// (search API returns null isinGrowth for all funds — not usable as signal)
// Post-2018 SEBI rationalisation: active fund names always contain "Plan" or "Option"
// AMCs where every scheme is discontinued (null ISINs) — hidden unless explicitly searched


const EMI_PRESETS = {
  home:      { loan:5000000, rate:8.5,  tenure:20, label:'Home Loan' },
  car:       { loan:800000,  rate:9.0,  tenure:7,  label:'Car Loan' },
  personal:  { loan:500000,  rate:13.5, tenure:5,  label:'Personal Loan' },
  education: { loan:1500000, rate:10.5, tenure:10, label:'Education Loan' },
  custom:    { loan:1000000, rate:10.0, tenure:10, label:'Custom Loan' },
};

let emiMode = 'emi';       // 'emi' | 'loan' | 'tenure'
let emiPrepayOn = false;
let emiBTOn = false;
let emiChartInst = null;   // hoisted here to avoid TDZ errors on early calcEMI() calls
let emiTableOpen = false;

const DEAD_AMCS=[
  'grindlays','dbs chola','ing vysya','ing mutual','abn amro',
  'standard chartered','fidelity','dws','sahara','morgan stanley',
  'pinebridge','escorts','benchmark'
];
function isDeadAMC(schemeName){
  const n=schemeName.toLowerCase();
  return DEAD_AMCS.some(a=>n.startsWith(a));
}
function deadAMCQueried(q){
  const ql=q.toLowerCase();
  return DEAD_AMCS.some(a=>ql.includes(a));
}

function fundRank(f){
  const n=f.schemeName.toLowerCase();
  return /(^|\W)(plan|option)(\W|$)/.test(n)?0:1;
}
function renderSearchResults(q,data,dd){
    if(!data.length){dd.innerHTML='<div class="dropdown-loading">No results found</div>';return;}
    const hideDeadAMC=!deadAMCQueried(q);
    const filtered=data.filter(f=>!/direct/i.test(f.schemeName)&&!/institutional/i.test(f.schemeName)&&(!hideDeadAMC||!isDeadAMC(f.schemeName)));
    const ranked=filtered.slice().sort((a,b)=>fundRank(a)-fundRank(b));
    const results=ranked.slice(0,25);
    const ql=q.toLowerCase();
    // Highlight matched portion in fund name
    function highlight(name){
      const i=name.toLowerCase().indexOf(ql);
      if(i<0) return name;
      return name.slice(0,i)+'<mark style="background:rgba(67,160,71,.18);color:var(--g1);border-radius:2px;padding:0 1px">'+name.slice(i,i+q.length)+'</mark>'+name.slice(i+q.length);
    }
    dd.innerHTML=
      `<div class="dd-count">${results.length} of ${filtered.length} results</div>`+
      results.map(f=>`<div class="dropdown-item" onclick="addFund(${f.schemeCode})">
        <span style="flex:1;min-width:0;white-space:normal;word-break:break-word">${highlight(f.schemeName)}</span>
        <span class="di-code">${f.schemeCode}</span>
      </div>`).join("");
}

async function doSearch(q){
  const dd=document.getElementById("dropdown");
  dd.innerHTML='<div class="dropdown-loading">Searching…</div>';dd.classList.add("open");
  if(searchAbortCtrl){searchAbortCtrl.abort();}
  searchAbortCtrl=new AbortController();
  const signal=searchAbortCtrl.signal;
  try{
    if(searchCache.has(q)){renderSearchResults(q,searchCache.get(q),dd);return;}
    const r=await fetch(`/api/mf?q=${encodeURIComponent(q)}`,{signal});
    const data=await r.json();
    searchCache.set(q,data);
    renderSearchResults(q,data,dd);

  }catch(e){if(e.name!=='AbortError')dd.innerHTML='<div class="dropdown-loading">⚠️ Search failed. Check connection.</div>';}
}
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))document.getElementById("dropdown").classList.remove("open");});

async function addFund(code){
  if(selectedFunds.length>=5){alert("Max 5 funds.");return;}
  if(selectedFunds.find(f=>f.code===code)){alert("Already added.");return;}
  document.getElementById("dropdown").classList.remove("open");
  document.getElementById("mfInput").value="";
  setLoading(true);
  try{
    const r=await fetch(`/api/mf?code=${code}`);
    const res=await r.json();
    if(!res.data||!res.data.length)throw new Error();
    // Clean: remove zero/invalid NAVs, then sort ascending by date
    // (AMFI data is not always perfectly ordered for some fund houses like SBI)
    const cleaned=res.data
      .filter(d=>{const v=parseFloat(d.nav);return!isNaN(v)&&v>0;})
      .sort((a,b)=>parseNAVDate(a.date)-parseNAVDate(b.date));
    if(!cleaned.length)throw new Error('no_data');
    selectedFunds.push({code,name:res.meta.scheme_name,rawData:cleaned});
    renderChips();renderAll();
  }catch(e){
    const msg=e.message==='no_data'
      ?'This scheme appears discontinued or merged.\nTry searching for the \'Regular Plan\' version.'
      :'Failed to load fund data. Please try again.';
    alert(msg);
  }
  setLoading(false);
}
function removeFund(code){selectedFunds=selectedFunds.filter(f=>f.code!==code);renderChips();renderAll();}
function renderChips(){
  document.getElementById("chips").innerHTML=selectedFunds.map((f,i)=>
    `<div class="chip chip-${i}"><span class="chip-name" title="${f.name}">${f.name}</span><button class="chip-remove" onclick="removeFund(${f.code})">✕</button></div>`
  ).join("");
}
function setPeriod(key,btn){
  currentPeriod=key;
  document.querySelectorAll(".period-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");renderAll();
}

// Parse a NAV date string "DD-MM-YYYY" → Date object
function parseNAVDate(str){
  const [d,m,y]=str.split("-");return new Date(+y,+m-1,+d);
}

// Compute the ideal cutoff date for currentPeriod relative to a given "newest" date.
function getPeriodCutoff(newest){
  if(currentPeriod==="MAX") return null;
  const cutoff=new Date(newest);
  const map={
    "1M": ()=>cutoff.setMonth(cutoff.getMonth()-1),
    "3M": ()=>cutoff.setMonth(cutoff.getMonth()-3),
    "6M": ()=>cutoff.setMonth(cutoff.getMonth()-6),
    "1Y": ()=>cutoff.setFullYear(cutoff.getFullYear()-1),
    "2Y": ()=>cutoff.setFullYear(cutoff.getFullYear()-2),
    "3Y": ()=>cutoff.setFullYear(cutoff.getFullYear()-3),
    "5Y": ()=>cutoff.setFullYear(cutoff.getFullYear()-5),
    "10Y":()=>cutoff.setFullYear(cutoff.getFullYear()-10),
  };
  if(map[currentPeriod]) map[currentPeriod]();
  return cutoff;
}

// Slice rawData from a given cutoff Date (or from start if null).
// Returns {data, insufficient} — insufficient means fund is older than cutoff.
function getSlice(rawData, forcedCutoff){
  if(!rawData.length) return {data:rawData,insufficient:false};
  const newest=parseNAVDate(rawData[rawData.length-1].date);
  const cutoff = forcedCutoff!==undefined ? forcedCutoff : getPeriodCutoff(newest);
  if(!cutoff) return {data:rawData,insufficient:false};
  const oldest=parseNAVDate(rawData[0].date);
  const insufficient=cutoff<=oldest;
  let idx=rawData.findIndex(d=>parseNAVDate(d.date)>=cutoff);
  if(idx<0) idx=0;
  return {data:rawData.slice(idx), insufficient};
}

// Compute the common cutoff for all selected funds so comparison is apples-to-apples.
// Strategy: use ideal cutoff, but if ANY fund doesn't reach back that far,
// cap at the oldest available start date among all funds (i.e. shortest history wins).
function getCommonCutoff(){
  if(!selectedFunds.length) return null;
  // Latest inception date across all funds — always the common start
  const oldestStarts = selectedFunds.map(f=>parseNAVDate(f.rawData[0].date));
  const latestStart = new Date(Math.max(...oldestStarts.map(d=>d.getTime())));
  // Fund(s) that CAUSED the clip = newest inception = shortest history
  const causedClip = selectedFunds.filter(f=>parseNAVDate(f.rawData[0].date).getTime()===latestStart.getTime());
  const clipped = selectedFunds.length>1 && selectedFunds.some(f=>parseNAVDate(f.rawData[0].date)<latestStart);

  if(currentPeriod==="MAX"){
    // For MAX: all funds start from the latest inception date among them
    return {cutoff:latestStart, clipped, clipFunds:causedClip};
  }
  // For other periods: compute ideal cutoff from common newest date
  const newestDates = selectedFunds.map(f=>parseNAVDate(f.rawData[f.rawData.length-1].date));
  const commonNewest = new Date(Math.min(...newestDates.map(d=>d.getTime())));
  const idealCutoff = getPeriodCutoff(commonNewest);
  // If any fund doesn't reach the ideal cutoff, clip all to latest inception
  if(latestStart > idealCutoff){
    const clipFunds = selectedFunds.filter(f=>parseNAVDate(f.rawData[0].date)>idealCutoff);
    return {cutoff:latestStart, clipped:true, clipFunds};
  }
  return {cutoff:idealCutoff, clipped:false, clipFunds:[]};
}

// Get the minimum available period key across all selected funds
function getInsufficientFunds(){
  return selectedFunds.map((f,i)=>({i,name:f.name,insuf:getSlice(f.rawData).insufficient})).filter(x=>x.insuf);
}

function getPeriodLabel(){
  const map={"1M":"1 Month","3M":"3 Months","6M":"6 Months","1Y":"1 Year",
             "2Y":"2 Years","3Y":"3 Years","5Y":"5 Years","10Y":"10 Years","MAX":"Since Inception"};
  return map[currentPeriod]||currentPeriod;
}
function setLoading(on){
  var lb=document.getElementById("loadingBar");
  if(!lb)return;
  lb.classList.toggle("active",on);
  if(!on) lb.style.removeProperty("display");
}

function calcPeriodReturn(rawData,months){
  if(!rawData||!rawData.length)return null;
  const newest=parseNAVDate(rawData[rawData.length-1].date);
  const cutoff=new Date(newest);cutoff.setMonth(cutoff.getMonth()-months);
  const oldest=parseNAVDate(rawData[0].date);
  if(cutoff<=oldest)return null;
  let i=rawData.findIndex(d=>parseNAVDate(d.date)>=cutoff);
  if(i<0)return null;
  const sl=rawData.slice(i);if(sl.length<5)return null;
  const v0=parseFloat(sl[0].nav),v1=parseFloat(sl[sl.length-1].nav);
  return((v1-v0)/v0*100).toFixed(2);
}
function calcRiskMetrics(rawData){
  if(!rawData||!rawData.length)return null;
  const newest=parseNAVDate(rawData[rawData.length-1].date);
  const c5=new Date(newest);c5.setFullYear(c5.getFullYear()-5);
  const oldest=parseNAVDate(rawData[0].date);
  let i=c5>oldest?rawData.findIndex(d=>parseNAVDate(d.date)>=c5):0;
  if(i<0)i=0;
  const sl=rawData.slice(i),navs=sl.map(d=>parseFloat(d.nav)),n=navs.length;
  if(n<20)return null;
  const dr=[];for(let j=1;j<n;j++)dr.push((navs[j]-navs[j-1])/navs[j-1]);
  const mean=dr.reduce((a,b)=>a+b,0)/dr.length;
  const vol=Math.sqrt(dr.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/dr.length)*Math.sqrt(252)*100;
  const yrs=n/252,ann=(Math.pow(navs[n-1]/navs[0],1/Math.max(yrs,.1))-1)*100;
  const sharpe=vol>0?((ann-6.5)/vol).toFixed(2):null;
  let peak=navs[0],dd=0;
  for(const v of navs){if(v>peak)peak=v;const d=(peak-v)/peak;if(d>dd)dd=d;}
  return{sharpe,annVol:vol.toFixed(2),maxDD:(dd*100).toFixed(2),
    years:yrs.toFixed(1),isFullHistory:c5<=oldest};
}
function calcMetrics(rawData, forcedCutoff){
  const {data,insufficient}=getSlice(rawData, forcedCutoff);
  const navs=data.map(d=>parseFloat(d.nav)),n=navs.length;
  const totalReturn=(navs[n-1]-navs[0])/navs[0]*100;
  const dailyRet=[];
  for(let i=1;i<n;i++)dailyRet.push((navs[i]-navs[i-1])/navs[i-1]);
  const mean=dailyRet.reduce((a,b)=>a+b,0)/dailyRet.length;
  const variance=dailyRet.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/dailyRet.length;
  const annVol=Math.sqrt(variance)*Math.sqrt(252)*100;
  const years=n/252,annReturn=(Math.pow(navs[n-1]/navs[0],1/Math.max(years,.1))-1)*100;
  const sharpe=annVol>0?((annReturn-6.5)/annVol).toFixed(2):"—";
  let peak=navs[0],maxDD=0;
  for(const nav of navs){if(nav>peak)peak=nav;const dd=(peak-nav)/peak;if(dd>maxDD)maxDD=dd;}
  const sorted=[...dailyRet].sort((a,b)=>a-b);
  const posDays=(dailyRet.filter(r=>r>0).length/dailyRet.length*100).toFixed(1);
  return{totalReturn:totalReturn.toFixed(2),annReturn:annReturn.toFixed(2),annVol:annVol.toFixed(2),
    sharpe,maxDD:(maxDD*100).toFixed(2),bestDay:(sorted[sorted.length-1]*100).toFixed(2),
    worstDay:(sorted[0]*100).toFixed(2),posDays,
    navs,insufficient,points:data.map(d=>({date:d.date,pct:((parseFloat(d.nav)-navs[0])/navs[0]*100).toFixed(2)}))};
}

function switchTab(tab,btn){
  currentTab=tab;document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");renderAll();
}

function renderAll(){
  const container=document.getElementById("mainContent");
  const toolbar=document.getElementById("toolbar"),tabsRow=document.getElementById("tabsRow");
  if(!selectedFunds.length){
    if(navChart){navChart.destroy();navChart=null;}
    toolbar.style.display="none";tabsRow.style.display="none";
    // Restore quick-add row and upgraded empty state
    const qa=document.getElementById('quickAddWrap');
    if(qa){ qa.style.display=''; qa.querySelectorAll('.qa-chip').forEach(c=>c.classList.remove('added')); }
    container.innerHTML=`<div class="empty-state" id="emptyState">
      <div class="es-chart"><svg viewBox="0 0 280 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="es-svg">
        <polyline class="es-line es-line-1" points="0,65 30,58 60,50 90,42 120,38 150,28 180,22 210,18 240,12 280,8"/>
        <polyline class="es-line es-line-2" points="0,72 30,68 60,62 90,55 120,52 150,46 180,40 210,36 240,30 280,24"/>
        <polyline class="es-line es-line-3" points="0,70 30,72 60,68 90,65 120,60 150,55 180,50 210,46 240,42 280,38"/>
      </svg></div>
      <div class="es-icon">📊</div>
      <div class="empty-title">Compare up to 5 funds side-by-side</div>
      <p class="empty-p">Search above or pick a popular fund below to get started</p>
      <div class="es-try-row" id="esTryRow"><span class="es-try-label">Try:</span><button class="es-try-btn" data-c1="125494" data-n1="SBI Small Cap Fund - Regular Plan - Growth" data-c2="113177" data-n2="Nippon India Small Cap Fund - Growth Plan - Growth Option" onclick="tryPairClick(this)">SBI Small Cap vs Nippon Small Cap</button><button class="es-try-btn" data-c1="122640" data-n1="Parag Parikh Flexi Cap Fund - Regular Plan - Growth" data-c2="101762" data-n2="HDFC Flexi Cap Fund - Growth Plan" onclick="tryPairClick(this)">Parag Parikh vs HDFC Flexi Cap</button><button class="es-try-btn" data-c1="140225" data-n1="Edelweiss Mid Cap Fund - Regular Plan - Growth Option" data-c2="105758" data-n2="HDFC Mid Cap Fund - Growth Plan" onclick="tryPairClick(this)">Edelweiss vs HDFC Mid Cap</button></div>
    </div>`;
    // Re-populate Try row with resolved picks
    setTimeout(populateTryRow, 0);
    return;
  }
  toolbar.style.display="flex";tabsRow.style.display="flex";
  // Compute a single shared cutoff so all funds cover identical date range
  const {cutoff:commonCutoff, clipped, clipFunds} = getCommonCutoff();
  const metrics=selectedFunds.map(f=>({...calcMetrics(f.rawData, commonCutoff),name:f.name,code:f.code,category:f.category||'',subCategory:f.subCategory||''}));
  // Attach clip info for banners
  metrics._clipped=clipped; metrics._clipFunds=clipFunds; metrics._commonCutoff=commonCutoff;
  if(currentTab==="nav") renderNavTab(container,metrics);
  else if(currentTab==="metrics") renderMetricsTab(container,metrics);
  // Store metrics on funds for War Room
  metrics.forEach((m,i)=>{ if(selectedFunds[i]) selectedFunds[i].metrics = m; });
  setTimeout(updateWarRoomStats, 80);
}

function buildBanner(metrics, actualStartDate, actualEndDate){
  const fmt=d=>d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
  let durStr="";
  if(actualStartDate){
    const endDate=actualEndDate||new Date();
    const pill=`<span style="margin-left:6px;padding:2px 8px;background:rgba(46,125,50,.12);border-radius:4px;font-size:.67rem;color:var(--g1);font-family:'JetBrains Mono',monospace;font-weight:700">`;
    if(currentPeriod==="MAX") durStr=pill+"Since Inception: "+fmt(actualStartDate)+"</span>";
    else durStr=pill+fmt(actualStartDate)+" → "+fmt(endDate)+"</span>";
  }
  if(selectedFunds.length===1 && metrics[0].insufficient){
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:9px 14px;background:#fff8e1;border:1.5px solid #ffe082;border-radius:8px;margin-bottom:12px;font-size:.75rem;color:#795548;font-weight:600"><span>⚠️</span><span><b>${metrics[0].name.split(" ").slice(0,4).join(" ")}…</b> doesn't have ${getPeriodLabel()} of data — showing full available history.${durStr}</span></div>`;
  }
  if(selectedFunds.length>1 && metrics._clipped){
    const names=metrics._clipFunds.map(f=>`<b>${f.name.split(" ").slice(0,3).join(" ")}…</b>`).join(", ");
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:9px 14px;background:#fff8e1;border:1.5px solid #ffe082;border-radius:8px;margin-bottom:12px;font-size:.75rem;color:#795548;font-weight:600"><span>⚠️</span><span>${names} ${metrics._clipFunds.length>1?"don't":"doesn't"} have full ${getPeriodLabel()} history — all funds aligned to same start date for fair comparison.${durStr}</span></div>`;
  }
  if(durStr){
    return `<div style="display:flex;align-items:center;gap:7px;padding:7px 14px;background:var(--g-xlight);border:1.5px solid var(--g-light);border-radius:8px;margin-bottom:12px;font-size:.74rem;color:var(--g2);font-weight:600">📅 ${getPeriodLabel()}${durStr}</div>`;
  }
  return "";
}

function renderNavTab(container,metrics){
    // Derive actual displayed date range from chart points (most accurate)
  const _minLen=Math.min(...metrics.map(m=>m.points.length));
  const _pts0=metrics[0].points.slice(-_minLen);
  const _navStart=_pts0.length?parseNAVDate(_pts0[0].date):null;
  const _navEnd=_pts0.length?parseNAVDate(_pts0[_pts0.length-1].date):null;
  container.innerHTML=buildBanner(metrics,_navStart,_navEnd)+`
    <div class="card"><div class="card-header"><div class="card-title">NAV Performance — % Change from Period Start</div></div>
    <div class="card-body"><div class="chart-container"><canvas id="navChart" role="img" aria-label="NAV performance chart comparing selected mutual funds"></canvas></div></div></div>
    <div class="card"><div class="card-header"><div class="card-title">Risk Summary Table</div></div>
    <div style="overflow:hidden"><table class="risk-table" id="riskTable"></table></div></div>`;
  if(navChart)navChart.destroy();
  const ctx=document.getElementById("navChart").getContext("2d");
  const minLen=Math.min(...metrics.map(m=>m.points.length));
  navChart=new Chart(ctx,{type:"line",data:{
    labels:metrics[0].points.slice(-minLen).map(p=>p.date),
    datasets:metrics.map((m,i)=>{
      const pts=m.points.slice(-minLen);
      const base=parseFloat(pts[0].pct); // rebase so first visible point = 0%
      return{label:m.name,data:pts.map(p=>parseFloat((parseFloat(p.pct)-base).toFixed(2))),
        navValues:m.navs.slice(-minLen), // raw NAV per point for tooltip
        borderColor:COLORS[i],backgroundColor:COLORS_LIGHT[i],borderWidth:2,
        pointRadius:0,pointHoverRadius:5,tension:.3,fill:metrics.length===1};
    })
  },options:chartOpts()});
  // Risk table: each fund uses its own full slice for the period (no common cutoff clipping)
  // Chart is aligned for visual comparison; table shows each fund's actual data
  const individualMetrics=selectedFunds.map(f=>({...calcMetrics(f.rawData),rawData:f.rawData,name:f.name,code:f.code,category:f.category||'',subCategory:f.subCategory||''}));
  renderRiskTable(individualMetrics,getPeriodLabel());
}

function renderMetricsTab(container,metrics){
  if(navChart){navChart.destroy();navChart=null;}
  const _ms=getSlice(selectedFunds[0].rawData,metrics._commonCutoff);
  const _md=_ms.data.length?parseNAVDate(_ms.data[0].date):null;
  const _me=_ms.data.length?parseNAVDate(_ms.data[_ms.data.length-1].date):null;
  container.innerHTML=buildBanner(metrics,_md,_me)+`<div class="card"><div class="card-header"><div class="card-title">Detailed Fund Metrics</div></div>
    <div class="card-body"><div class="metrics-grid">${metrics.map((m,i)=>`
      <div class="metric-card">
        <div class="metric-fund-name"><span class="metric-dot" style="background:${COLORS[i]}"></span>
        <span class="metric-name-text">${m.name.length>38?m.name.substring(0,38)+"…":m.name}</span></div>
        ${m.category?`<div style="font-size:.6rem;font-weight:700;letter-spacing:.4px;color:var(--muted);background:var(--surface2);border-radius:4px;padding:2px 8px;margin-bottom:6px;display:inline-block">${m.category}${m.subCategory&&m.subCategory!==m.category?' · '+m.subCategory:''}</div>`:''}
        ${mr(getPeriodLabel()+" Return",cv(m.totalReturn,true)+"%")}
        ${mr("Ann. Return (CAGR)",cv(m.annReturn,true)+"%")}
        ${mr("Ann. Volatility",`<span class="metric-val">${m.annVol}%</span>`)}
        ${mr("Sharpe Ratio",`<span class="metric-val">${m.sharpe}</span>`)}
        ${mr("Max Drawdown",`<span class="metric-val neg">-${m.maxDD}%</span>`)}
        ${mr("Best Day",`<span class="metric-val pos">+${m.bestDay}%</span>`)}
        ${mr("Worst Day",`<span class="metric-val neg">${m.worstDay}%</span>`)}
        ${mr("Positive Days",`<span class="metric-val">${m.posDays}%</span>`)}
      </div>`).join("")}</div></div></div>`;
}

function renderRiskTable(metrics){
  const PERIODS=[{l:'1M',m:1},{l:'3M',m:3},{l:'1Y',m:12},{l:'3Y',m:36},{l:'5Y',m:60}];
  const dash='<span style="color:var(--muted)">—</span>';
  function retCell(v,lbl){
    if(v===null)return`<td data-label="${lbl}">${dash}</td>`;
    const pos=parseFloat(v)>=0;
    return`<td data-label="${lbl}" style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${pos?'#1b5e20':'#b71c1c'}">${pos?'+':''}${v}%</td>`;
  }
  const pHeaders=PERIODS.map(p=>`<th>${p.l} Ret</th>`).join('');
  const rNote='<div style="font-size:.58rem;font-weight:400;color:var(--muted);margin-top:1px">5Y or max avail.</div>';
  const rows=metrics.map((m,i)=>{
    const rets=PERIODS.map(p=>calcPeriodReturn(m.rawData,p.m));
    const risk=calcRiskMetrics(m.rawData);
    const rLabel=risk?(risk.isFullHistory?`full ${risk.years}y`:'5Y'):'';
    const rSub=risk?`<div style="font-size:.58rem;color:var(--muted);margin-top:2px">${rLabel}</div>`:'';
    return`<tr>
      <td><div style="display:flex;align-items:center;gap:8px">
        <span class="fund-dot" style="background:${COLORS[i]};flex-shrink:0"></span>
        <span class="fund-name-text">${m.name}</span>
      </div></td>
      ${PERIODS.map((p,j)=>retCell(rets[j],p.l+' Ret')).join('')}
      ${risk
        ?`<td data-label="Sharpe" style="font-family:'JetBrains Mono',monospace;color:#2e4d2e">${risk.sharpe??'—'}${rSub}</td>
           <td data-label="Volatility" style="font-family:'JetBrains Mono',monospace;color:#2e4d2e">${risk.annVol}%${rSub}</td>
           <td data-label="Max DD" style="font-family:'JetBrains Mono',monospace;color:#b71c1c">-${risk.maxDD}%${rSub}</td>`
        :`<td>${dash}</td><td>${dash}</td><td>${dash}</td>`}
    </tr>`;
  }).join('');
  document.getElementById('riskTable').innerHTML=`
    <thead><tr><th>Fund</th>${pHeaders}
      <th>Sharpe${rNote}</th><th>Volatility${rNote}</th><th>Max DD${rNote}</th>
    </tr></thead><tbody>${rows}</tbody>`;
}

function mr(key,valHtml){return`<div class="metric-row"><span class="metric-key">${key}</span>${valHtml}</div>`;}
function cv(v,sign){const n=parseFloat(v),cls=n>=0?"pos":"neg";return`<span class="metric-val ${cls}">${sign&&n>=0?"+":""}${v}</span>`;}
function chartOpts(){
  return{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{
      legend:{position:"top",labels:{color:"#2e4d2e",font:{family:"Raleway",weight:"700",size:11},usePointStyle:true,padding:22,boxWidth:8}},
      tooltip:{backgroundColor:"#162616",borderColor:"#2e7d32",borderWidth:1,
        titleFont:{family:"JetBrains Mono",size:11},bodyFont:{family:"JetBrains Mono",size:12},padding:13,cornerRadius:8,
        callbacks:{
          label:c=>{
            const nav=c.dataset.navValues?c.dataset.navValues[c.dataIndex]:null;
            const pct=`${c.parsed.y>=0?"+":""}${c.parsed.y.toFixed(2)}%`;
            const navStr=nav!=null?`  ·  NAV ₹${parseFloat(nav).toFixed(4)}`:"";
            return ` ${c.dataset.label.substring(0,28)} ${pct}${navStr}`;
          }
        }}
    },
    scales:{
      x:{grid:{display:false},border:{color:"#c2dfc2"},ticks:{font:{family:"JetBrains Mono",size:10},color:"#5e8a5e",maxTicksLimit:8}},
      y:{grid:{color:"rgba(194,223,194,.5)"},border:{color:"#c2dfc2"},ticks:{font:{family:"JetBrains Mono",size:10},color:"#5e8a5e",callback:v=>(v>=0?"+":"")+v.toFixed(1)+"%"}}
    }};
}

// ════════════════════════════════════════
//  FUND BRIEFING — PDF EXPORT  (jsPDF)
//  Multi-section, device-agnostic, A4 portrait
//  No html2canvas — 100% vector/text PDF
// ════════════════════════════════════════

function exportPDF(){
  const chartImg = document.getElementById('navChart') ? document.getElementById('navChart').toDataURL('image/png') : '';
  const mainHTML  = document.getElementById('mainContent').innerHTML;
  const chipsHTML = document.getElementById('chips').outerHTML;
  const periodLabel = getPeriodLabel()||'Selected Period';
  const fundsCount = selectedFunds.length;

  const win = window.open('','_blank','width=960,height=760');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Fund Comparison | Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #2e7d32;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#2e7d32}.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:14px 0 7px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#c2dfc2}
/* Fund chips */
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px}
.fund-chip{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:20px;border:1.5px solid #c2dfc2;background:#edf6ed;font-size:.68rem;font-weight:700}
/* Banner / at-a-glance */
.banner-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px}
.banner-cell{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:8px;padding:10px 12px;text-align:center}
.banner-lbl{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5e8a5e;margin-bottom:3px}
.banner-val{font-family:"JetBrains Mono",monospace;font-size:.88rem;font-weight:700;color:#1b5e20}
/* Risk table */
.risk-table{width:100%;border-collapse:collapse;font-size:.62rem}
.risk-table th{background:#1e4d20;color:#fff;font-size:.58rem;font-weight:700;letter-spacing:.5px;padding:6px 8px;text-align:right}
.risk-table th:first-child{text-align:left}
.risk-table td{padding:5px 8px;border-bottom:1px solid #e8f5e9;text-align:right;font-family:"JetBrains Mono",monospace;font-size:.65rem;font-weight:600}
.risk-table td:first-child{text-align:left;font-family:"Raleway",sans-serif;font-weight:700;max-width:140px}
.risk-table tr:nth-child(even) td{background:#f5fbf5}
.pos{color:#1b5e20}.neg{color:#b71c1c}
/* Chart */
.ci img{width:100%;border-radius:8px;border:1px solid #c2dfc2;margin-bottom:12px}
/* Disclaimer */
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}}
</style></head><body>
<div class="ph">
  <div><div class="pt">Fund Comparison — ${fundsCount} Fund${fundsCount>1?'s':''} · ${periodLabel}</div>
  <div class="pa">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds Distributor &amp; SIF Distributor</div></div>
  <img class="logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>
<div class="sec">Funds Selected</div>
${chipsHTML}
<div class="sec">Performance &amp; Risk</div>
${mainHTML}
${chartImg?`<div class="sec">NAV Chart</div><div class="ci"><img src="${chartImg}"></div>`:''}
<div class="dis">&#9888;&#65039; <strong style="color:#e65100">Disclaimer:</strong> Mutual fund investments are subject to market risks. Past performance is not indicative of future returns. Data sourced from AMFI / mfapi.in. This is for illustrative purposes only and does not constitute financial advice. Consult your financial advisor before investing. | ARN-251838 | Abundance Financial Services | EUIN: E334718</div>
<script src="/api/picks-js" defer><\/script>
</body></html>`);
  win.document.close();
  win.onload = ()=>setTimeout(()=>{win.focus();win.print();},600);
  setTimeout(()=>{try{win.focus();win.print();}catch(e){}},1200);
}


// ════════════════════════════════════════
//  CALCULATOR PDF EXPORTS
//  SIP · Goal · SWP · EMI  (jsPDF)
// ════════════════════════════════════════

function _loadJsPDF(cb){
  if(typeof window.jspdf!=='undefined'){cb();return;}
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  s.onload=cb; document.head.appendChild(s);
}

// ── Logo loader: fetches logo as dataURL for embedding in PDFs ──
// Uses fetch + blob URL to bypass CORS, falls back silently to text
async function _fetchLogoDataURL(){
  // Try three methods in order: Image+canvas (no CORS), fetch+blob, silent fail
  const LOGO_URL = '/logo-og.png';

  // Method 1: HTMLImageElement -> canvas -> dataURL (works if server allows img cross-origin)
  try {
    const dataUrl = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), 4000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth; cv.height = img.naturalHeight;
          cv.getContext('2d').drawImage(img, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch(e) { resolve(null); }
      };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = LOGO_URL + '?_=' + Date.now(); // cache-bust to force fresh CORS headers
    });
    if (dataUrl && dataUrl.length > 100) return dataUrl;
  } catch(e) {}

  // Method 2: fetch + FileReader
  try {
    const resp = await fetch(LOGO_URL, { cache: 'no-store', mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
  } catch(e) {}

  return null; // Both methods failed — caller will use text fallback
}



// ── Shared PDF scaffold ──────────────────
function _makePDF(){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const PW=210,PH=297,ML=14,MR=14,MT=14,CW=182;

  // Palette
  const GDK=[30,94,32],GMD=[46,125,50],GLT=[67,160,71];
  const BG=[240,247,240],SRF=[237,246,237],BRD=[194,223,194];
  const TXT=[30,50,30],MUT=[110,140,110],WHT=[255,255,255];
  const POS=[27,94,32],NEG=[183,28,28];

  const S=(v,fb='—')=>(v===null||v===undefined||String(v)===''||String(v)==='null')?String(fb):String(v);
  const fmtINR_=n=>{n=Math.round(n);if(n>=1e7)return(n/1e7).toFixed(2)+' Cr';if(n>=1e5)return(n/1e5).toFixed(2)+' L';return n.toLocaleString('en-IN');};

  let pageNum=0;
  const newPage=(bg=true)=>{
    if(pageNum>0)doc.addPage();
    pageNum++;
    if(bg){doc.setFillColor(...BG);doc.rect(0,0,PW,PH,'F');}
  };
  const topBar=()=>{
    doc.setFillColor(...GDK);doc.rect(0,0,PW,1.5,'F');
    doc.setFillColor(...GMD);doc.rect(0,1.5,PW,1.2,'F');
    doc.setFillColor(...GLT);doc.rect(0,2.7,PW,0.8,'F');
  };
  const footer=(dateStr)=>{
    doc.setFontSize(6.5);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
    doc.text('Abundance MF Analyzer — mfcalc.getabundance.in  ·  '+dateStr,ML,PH-8);
    doc.text('Page '+pageNum,PW-MR,PH-8,{align:'right'});
  };
  const pageHeader=(title,subtitle,dateStr,timeStr,logoDataUrl=null)=>{
    topBar();
    // Brand block — logo if available, else text fallback
    doc.setFillColor(...WHT);doc.roundedRect(ML,5,70,15,2,2,'F');
    if(logoDataUrl){
      try{
        // Draw logo image, preserve aspect ratio within 62x12mm box
        doc.addImage(logoDataUrl,'PNG',ML+3,6.5,62,12,'','FAST');
      }catch(e){
        // Fallback to text
        doc.setFontSize(13);doc.setFont('helvetica','bold');doc.setTextColor(...GMD);
        doc.text('Abundance',ML+4,13);
        doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
        doc.text('Financial Services',ML+4,17.5);
      }
    } else {
      doc.setFontSize(13);doc.setFont('helvetica','bold');doc.setTextColor(...GMD);
      doc.text('Abundance',ML+4,13);
      doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
      doc.text('Financial Services',ML+4,17.5);
    }
    // ARN
    doc.setFillColor(...SRF);doc.setDrawColor(...BRD);doc.roundedRect(ML+64,5,62,15,2,2,'FD');
    doc.setFontSize(6.5);doc.setFont('helvetica','bold');doc.setTextColor(...MUT);
    doc.text('ARN-251838  ·  AMFI Registered MFD',ML+66,11);
    doc.setFont('helvetica','normal');
    doc.text('EUIN: E334718  ·  GST: 05AXYPA6954G1Z3',ML+66,15.5);
    // Date
    doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
    doc.text('Generated: '+dateStr+', '+timeStr,PW-MR,13,{align:'right'});
    // Title
    let y=26;
    doc.setFontSize(17);doc.setFont('helvetica','bold');doc.setTextColor(...GDK);
    doc.text(title,ML,y);
    y+=6;
    doc.setFontSize(8.5);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
    doc.text(subtitle,ML,y);
    y+=3;doc.setDrawColor(...BRD);doc.setLineWidth(0.4);doc.line(ML,y,PW-MR,y);
    return y+6;
  };
  const secTitle=(text,y)=>{
    doc.setFillColor(...SRF);doc.setDrawColor(...BRD);doc.setLineWidth(0.3);
    doc.rect(ML,y,CW,7,'FD');
    doc.setFillColor(...GMD);doc.rect(ML,y,2.5,7,'F');
    doc.setFontSize(7.5);doc.setFont('helvetica','bold');doc.setTextColor(...GDK);
    doc.text(text.toUpperCase(),ML+5,y+4.8);
    return y+10;
  };
  const paramsBox=(items,y)=>{
    const cols=Math.min(items.length,4);
    const cw=CW/cols;
    doc.setFillColor(...SRF);doc.setDrawColor(...BRD);doc.setLineWidth(0.3);
    doc.roundedRect(ML,y,CW,14,2,2,'FD');
    items.forEach((item,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const x=ML+col*cw+3, baseY=y+5+row*8;
      doc.setFontSize(5.8);doc.setFont('helvetica','bold');doc.setTextColor(...MUT);
      doc.text((item[0]||'').toUpperCase(),x,baseY);
      doc.setFontSize(8);doc.setFont('helvetica','bold');doc.setTextColor(...TXT);
      doc.text(S(item[1]),x,baseY+4.5);
    });
    return y+14+Math.floor((items.length-1)/cols)*8+4;
  };
  const bigResultBox=(label,value,sub,color,y)=>{
    doc.setFillColor(...(color||GMD));
    doc.roundedRect(ML,y,CW,22,2,2,'F');
    doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...WHT);
    doc.text(label,ML+CW/2,y+7,{align:'center'});
    doc.setFontSize(20);doc.setFont('helvetica','bold');
    doc.text(S(value),ML+CW/2,y+16,{align:'center'});
    if(sub){doc.setFontSize(7);doc.setFont('helvetica','normal');doc.text(S(sub),ML+CW/2,y+21,{align:'center'});}
    return y+25;
  };
  const metricsGrid=(items,y,cols=3)=>{
    const cw=(CW-(cols-1)*2)/cols;
    const rows=Math.ceil(items.length/cols);
    items.forEach((item,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const x=ML+col*(cw+2), gy=y+row*16;
      doc.setFillColor(...(col%2===0?WHT:SRF));
      doc.setDrawColor(...BRD);doc.setLineWidth(0.2);
      doc.roundedRect(x,gy,cw,14,1,1,'FD');
      doc.setFontSize(6);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
      doc.text(S(item[0]),x+2.5,gy+5);
      doc.setFontSize(9.5);doc.setFont('helvetica','bold');
      const col2=item[2]||TXT;
      doc.setTextColor(...(Array.isArray(col2)?col2:[46,125,50]));
      doc.text(S(item[1]),x+2.5,gy+11.5);
    });
    return y+rows*16+4;
  };
  const disclaimerBox=(y)=>{
    doc.setFillColor(255,253,231);doc.setDrawColor(249,168,37);doc.setLineWidth(0.4);
    doc.roundedRect(ML,y,CW,24,2,2,'FD');
    doc.setFillColor(249,168,37);doc.rect(ML,y,2.5,24,'F');
    doc.setFontSize(7);doc.setFont('helvetica','bold');doc.setTextColor(93,64,55);
    doc.text('DISCLAIMER',ML+5,y+5.5);
    doc.setFont('helvetica','normal');doc.setFontSize(6.5);
    const txt='Mutual Fund investments are subject to market risks. Please read all scheme-related documents carefully before investing. Past performance is not indicative of future results. This calculator is for illustrative purposes only and does not constitute financial advice. Please consult a SEBI-registered investment advisor before making any investment decision. | ARN-251838 | Abundance Financial Services | AMFI-Registered MFD | EUIN: E334718';
    const lines=doc.splitTextToSize(txt,CW-8);
    doc.text(lines,ML+5,y+9.5);
    return y+26;
  };
  const complianceBar=(y)=>{
    const barY=Math.min(y,PH-28);
    doc.setFillColor(...GDK);doc.roundedRect(ML,barY,CW,20,2,2,'F');
    doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(...WHT);
    doc.text('Abundance Financial Services',ML+4,barY+7);
    doc.setFontSize(7);doc.setFont('helvetica','normal');
    doc.text('ARN-251838  |  EUIN: E334718  |  AMFI-Registered Mutual Fund Distributor',ML+4,barY+12.5);
    doc.text('www.getabundance.in  |  +91 98081 05923  |  Moradabad, Uttar Pradesh',ML+4,barY+17);
    doc.setTextColor(190,225,190);
    doc.text('GST: 05AXYPA6954G1Z3',PW-MR-2,barY+17,{align:'right'});
  };
  const addChartImg=(cvs,y,maxH=90)=>{
    if(!cvs) return y;
    try{
      const img=cvs.toDataURL('image/png',1.0);
      const aspect=cvs.width/cvs.height;
      const h=Math.min(maxH,CW/aspect);
      doc.addImage(img,'PNG',ML,y,CW,h);
      return y+h+4;
    }catch(e){return y;}
  };

  return {doc,PW,PH,ML,MR,MT,CW,
    GDK,GMD,GLT,BG,SRF,BRD,TXT,MUT,WHT,POS,NEG,
    S,fmtINR_,
    newPage,topBar,footer,pageHeader,secTitle,paramsBox,
    bigResultBox,metricsGrid,disclaimerBox,complianceBar,addChartImg};
}

// ════════════════════════════════════════
//  SIP / LUMPSUM PDF
// ════════════════════════════════════════
function printCalc(){
  const summaryHTML  = document.getElementById('sipSummary').outerHTML;
  const cardsHTML    = document.getElementById('sipResultCards').outerHTML;
  const bigResultHTML= document.getElementById('sipBigResult').outerHTML;
  const chartImg     = document.getElementById('sipChart') ? document.getElementById('sipChart').toDataURL('image/png') : '';
  const modeLabel    = {sip:'SIP Returns',lump:'Lumpsum Returns',both:'SIP + Lumpsum'}[calcMode]||'SIP Returns';

  const win = window.open('','_blank','width=940,height=720');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>SIP Calculator | Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #2e7d32;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#2e7d32}.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:14px 0 7px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#c2dfc2}
/* Big result */
#sipBigResult{background:linear-gradient(135deg,#1a3a2a,#2e7d32);border-radius:12px;padding:18px 24px;margin-bottom:12px;color:#fff;text-align:center}
.sbr-eyebrow{font-size:.58rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;opacity:.75;margin-bottom:6px}
.sbr-corpus{font-family:"JetBrains Mono",monospace;font-size:2rem;font-weight:800;line-height:1.1;margin-bottom:6px}
.sbr-sub-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.sbr-chip{font-family:"JetBrains Mono",monospace;font-size:.68rem;font-weight:600;padding:3px 10px;border-radius:12px;background:rgba(255,255,255,.12)}
.sbr-gain{color:#a5d6a7}
/* Summary strip */
#sipSummary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.sip-sum-item{flex:1;min-width:110px;background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:8px;padding:9px 12px;text-align:center}
.sip-sum-label{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5e8a5e;margin-bottom:3px}
.sip-sum-val{font-family:"JetBrains Mono",monospace;font-size:.88rem;font-weight:700;color:#1b5e20}
/* Result cards */
#sipResultCards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.sip-result-card{background:#fff;border:1.5px solid #c2dfc2;border-radius:10px;padding:14px;position:relative;overflow:hidden}
.src-accent{position:absolute;top:0;left:0;width:3px;bottom:0}
.src-header{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.src-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.src-name{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
.src-corpus-label{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5e8a5e;margin-bottom:2px}
.src-corpus{font-family:"JetBrains Mono",monospace;font-size:1.1rem;font-weight:800;color:#1b5e20}
.src-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #e8f5e9;font-size:.62rem}
.src-row:last-child{border-bottom:none}
.src-key{color:#5e8a5e}.src-val{font-family:"JetBrains Mono",monospace;font-weight:700}
/* Chart */
.ci img{width:100%;border-radius:8px;border:1px solid #c2dfc2;margin-bottom:12px}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:12px}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}}
</style></head><body>
<div class="ph">
  <div><div class="pt">${modeLabel} Calculator</div>
  <div class="pa">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds Distributor &amp; SIF Distributor</div></div>
  <img class="logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>
<div class="sec">Result</div>
${bigResultHTML}
<div class="sec">Summary</div>
${summaryHTML}
${chartImg?`<div class="sec">Growth Chart</div><div class="ci"><img src="${chartImg}"></div>`:''}
<div class="sec">Scenarios</div>
${cardsHTML}
<div class="dis">&#9888;&#65039; <strong style="color:#e65100">Disclaimer:</strong> Mutual fund investments are subject to market risks. Projections are illustrative only and do not constitute financial advice. Consult your financial advisor before investing. | ARN-251838 | Abundance Financial Services | EUIN: E334718</div>
</body></html>`);
  win.document.close();
  win.onload = ()=>setTimeout(()=>{win.focus();win.print();},600);
  setTimeout(()=>{try{win.focus();win.print();}catch(e){}},1200);
}


// ════════════════════════════════════════
//  GOAL PLANNER PDF
// ════════════════════════════════════════
function printGoalPlan(){_loadJsPDF(_doPrintGoal);}
async function _doPrintGoal(){
  const btn=document.querySelector('[onclick="printGoalPlan()"]');
  if(btn){btn.disabled=true;btn.textContent='Building PDF…';}
  try{
    const logoDataUrl=await _fetchLogoDataURL();
    const b=_makePDF();
    const {doc,ML,MR,PH,CW,SRF,BRD,TXT,MUT,WHT,POS,NEG,GMD,GDK,BG,S,fmtINR_}=b;
    const dateStr=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
    const timeStr=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});

    const p=getGoalParams();
    const fmtY=p.unit==='months'?p.dur+' months':p.dur+' year'+(p.dur>1?'s':'');
    const target=p.netTarget;
    const sipOnly=calcRequiredSIP(target,p.rpp,p.totalInst,p.stepup,p.cfg.perYear);
    const lumpOnly=calcRequiredLump(target,p.rate,p.totalYears);
    const hybridLump=calcRequiredLump(target*(p.lumpsumPct/100),p.rate,p.totalYears);
    const hybridSIP=calcRequiredSIP(target*(1-p.lumpsumPct/100),p.rpp,p.totalInst,p.stepup,p.cfg.perYear);
    const freqL={monthly:'month',quarterly:'quarter',weekly:'week',annually:'year'}[p.freq]||'month';

    b.newPage();
    let y=b.pageHeader('Goal Planner — '+S(p.goalName),'Investment plans to achieve your financial goal  ·  Data: illustrative projection',dateStr,timeStr,logoDataUrl);

    // Goal summary box
    y=b.bigResultBox('Your Goal: '+S(p.goalName),'₹'+fmtINR_(p.goalAmt),'in '+fmtY+' · '+p.rate+'% expected return',[30,94,32],y);
    y+=2;

    // Params
    const paramItems=[
      ['Goal Amount','₹'+fmtINR_(p.goalAmt)],
      ['Duration',fmtY],
      ['Expected Return',p.rate+'% p.a.'],
      ['Freq.',p.cfg.label],
      p.inflation>0?['Inflation',p.inflation+'% p.a.']:null,
      p.existing>0?['Existing Inv.','₹'+fmtINR_(p.existing)]:null,
      p.stepup>0?['SIP Step-up',p.stepup+'%']:null,
      p.inflation>0?['Adj. Target','₹'+fmtINR_(p.realTarget)]:null,
    ].filter(Boolean);
    y=b.paramsBox(paramItems,y);
    y+=4;

    // 3 plan cards
    y=b.secTitle('Investment Plans',y);
    const planCards=[
      {label:'Plan A — Pure SIP',color:[21,101,192],mainVal:'₹'+fmtINR_(Math.round(sipOnly))+'/'+freqL,sub:'Monthly SIP, no upfront capital',rows:[['Total SIP Outflow','₹'+fmtINR_(Math.round(sipOnly*p.totalInst))],['Wealth Created','₹'+fmtINR_(Math.round(target-sipOnly*p.totalInst))]]},
      {label:'Plan B — Lumpsum',color:[230,81,0],mainVal:'₹'+fmtINR_(lumpOnly),sub:'One-time investment today',rows:[['Grows to','₹'+fmtINR_(target)],['Wealth Created','₹'+fmtINR_(target-lumpOnly)]]},
      {label:'Plan C — Hybrid ('+p.lumpsumPct+'%+SIP)',color:[46,125,50],mainVal:'₹'+fmtINR_(hybridLump)+' + ₹'+fmtINR_(Math.round(hybridSIP))+'/'+freqL,sub:'Lumpsum now + SIP',rows:[['Lumpsum','₹'+fmtINR_(hybridLump)],['SIP','₹'+fmtINR_(Math.round(hybridSIP))+'/'+freqL]]},
    ];
    const pcw=(CW-4)/3;
    planCards.forEach((pc,i)=>{
      const x=ML+i*(pcw+2);
      doc.setFillColor(255,255,255);doc.setDrawColor(...BRD);doc.setLineWidth(0.3);
      doc.roundedRect(x,y,pcw,46,2,2,'FD');
      doc.setFillColor(...pc.color);doc.rect(x,y,pcw,3.5,'F');
      doc.setFontSize(6.5);doc.setFont('helvetica','bold');doc.setTextColor(...pc.color);
      doc.text(pc.label,x+pcw/2,y+9,{align:'center'});
      doc.setFontSize(8.5);doc.setFont('helvetica','bold');doc.setTextColor(...GDK);
      const vLines=doc.splitTextToSize(pc.mainVal,pcw-4);
      doc.text(vLines,x+pcw/2,y+16,{align:'center'});
      doc.setFontSize(6);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
      doc.text(pc.sub,x+pcw/2,y+16+vLines.length*4.5,{align:'center'});
      let ry=y+26+vLines.length*2;
      pc.rows.forEach(([k,v])=>{
        doc.setFontSize(6.5);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
        doc.text(k,x+3,ry);
        doc.setFont('helvetica','bold');doc.setTextColor(...TXT);
        doc.text(v,x+pcw-3,ry,{align:'right'});
        ry+=5.5;
      });
    });
    y+=50;

    // Chart
    y=b.secTitle('Growth Projection Chart',y);
    y=b.addChartImg(document.getElementById('goalChart'),y,80);

    // Timeline milestones
    const tlEls=document.querySelectorAll('.tl-m');
    if(tlEls.length){
      y=b.secTitle('Milestones',y);
      const mItems=[...tlEls].map(el=>{
        const spans=el.querySelectorAll('div');
        return[spans[1]?.textContent||'',spans[0]?.textContent+' · '+spans[2]?.textContent||'',TXT];
      });
      y=b.metricsGrid(mItems,y,Math.min(mItems.length,4));
    }

    y=b.disclaimerBox(y+2);
    b.complianceBar(y+4);
    b.footer(dateStr);
    doc.save('Abundance-Goal-Plan_'+S(p.goalName).replace(/\s+/g,'-').slice(0,30)+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }catch(e){console.error(e);alert('PDF export failed: '+e.message);}
  if(btn){btn.disabled=false;btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Save PDF';}
}

// ════════════════════════════════════════
//  SWP CALCULATOR PDF
// ════════════════════════════════════════
function printSWP(){_loadJsPDF(_doPrintSWP);}
async function _doPrintSWP(){
  const btn=document.querySelector('[onclick="printSWP()"]');
  if(btn){btn.disabled=true;btn.textContent='Building PDF…';}
  try{
    const logoDataUrl=await _fetchLogoDataURL();
    const b=_makePDF();
    const {doc,ML,MR,PH,CW,SRF,BRD,TXT,MUT,WHT,POS,NEG,GMD,GDK,S,fmtINR_}=b;
    const dateStr=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
    const timeStr=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});

    // Collect params from DOM
    const corpus=parseFloat(document.getElementById('swpCorpus')?.value||0);
    const monthly=parseFloat(document.getElementById('swpMonthly')?.value||0);
    const rate=document.getElementById('swpRate')?.value||'10';
    const dur=document.getElementById('swpDuration')?.value||'20';
    const durUnit=document.getElementById('swpDurationUnit')?.value||'years';
    const inflation=parseFloat(document.getElementById('swpInflation')?.value||0);

    // Read results from DOM
    const fuelEls=document.querySelectorAll('#swpFuel .sip-sum-item');
    const statEls=document.querySelectorAll('#swpStatGrid .swp-stat');

    b.newPage();
    let y=b.pageHeader('SWP — Systematic Withdrawal Plan','How long your corpus lasts with regular withdrawals  ·  For illustrative purposes only',dateStr,timeStr,logoDataUrl);

    // Params
    const paramItems=[
      ['Starting Corpus','₹'+fmtINR_(corpus)],
      ['Monthly Withdrawal','₹'+fmtINR_(monthly)],
      ['Expected Return',rate+'% p.a.'],
      ['Duration',dur+' '+durUnit],
      inflation>0?['Inflation Adj.',inflation+'% p.a.']:null,
    ].filter(Boolean);
    y=b.paramsBox(paramItems,y);
    y+=2;

    // Key summary from fuel strip
    if(fuelEls.length){
      y=b.secTitle('Summary',y);
      const items=[...fuelEls].map(el=>{
        const lbl=el.querySelector('.sip-sum-label')?.textContent||'';
        const val=el.querySelector('.sip-sum-val')?.textContent||'';
        return[lbl,val,TXT];
      });
      y=b.metricsGrid(items,y,Math.min(items.length,4));
    }

    // Stat grid
    if(statEls.length){
      y=b.secTitle('Key Statistics',y);
      const items=[...statEls].map(el=>{
        const lbl=el.querySelector('.swp-stat-label')?.textContent||el.querySelector('[class*=label]')?.textContent||'';
        const val=el.querySelector('.swp-stat-val')?.textContent||el.querySelector('[class*=val]')?.textContent||'';
        return[lbl,val,TXT];
      });
      y=b.metricsGrid(items,y,Math.min(items.length,4));
    }

    // Chart
    y=b.secTitle('Corpus Depletion Chart',y);
    y=b.addChartImg(document.getElementById('swpChart'),y,85);

    // Result cards
    const cardEls=document.querySelectorAll('#swpResultCards .sip-result-card');
    if(cardEls.length){
      y=b.secTitle('Withdrawal Scenarios',y);
      const ccw=(CW-(cardEls.length-1)*2)/Math.min(cardEls.length,3);
      [...cardEls].slice(0,3).forEach((card,i)=>{
        const cx=ML+i*(ccw+2);
        const title=card.querySelector('.src-name')?.textContent||'Scenario '+(i+1);
        const corpus2=card.querySelector('.src-corpus')?.textContent||'—';
        doc.setFillColor(255,255,255);doc.setDrawColor(...BRD);doc.setLineWidth(0.3);
        doc.roundedRect(cx,y,ccw,38,2,2,'FD');
        const accentColor=[[21,101,192],[46,125,50],[230,81,0]][i]||[46,125,50];
        doc.setFillColor(...accentColor);doc.rect(cx,y,ccw,3,'F');
        doc.setFontSize(7);doc.setFont('helvetica','bold');doc.setTextColor(...TXT);
        doc.text(title.slice(0,28),cx+ccw/2,y+9,{align:'center'});
        doc.setFontSize(11);doc.setTextColor(...GDK);
        doc.text(S(corpus2),cx+ccw/2,y+18,{align:'center'});
        doc.setFontSize(6.5);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
        doc.text('Remaining Corpus',cx+ccw/2,y+23,{align:'center'});
        const rows=card.querySelectorAll('.src-row');
        let ry=y+27;
        [...rows].slice(0,2).forEach(row=>{
          const k=row.querySelector('.src-key')?.textContent||'';
          const v=row.querySelector('.src-val')?.textContent||'';
          if(!k||!v) return;
          doc.setFontSize(6);doc.setFont('helvetica','normal');doc.setTextColor(...MUT);
          doc.text(k.slice(0,18),cx+3,ry);
          doc.setFont('helvetica','bold');doc.setTextColor(...TXT);
          doc.text(v.slice(0,14),cx+ccw-3,ry,{align:'right'});
          ry+=5;
        });
      });
      y+=42;
    }

    y=b.disclaimerBox(y+2);
    b.complianceBar(y+4);
    b.footer(dateStr);
    doc.save('Abundance-SWP-Plan_'+new Date().toISOString().slice(0,10)+'.pdf');
  }catch(e){console.error(e);alert('PDF export failed: '+e.message);}
  if(btn){btn.disabled=false;btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Save PDF';}
}

// ════════════════════════════════════════
//  EMI CALCULATOR PDF
// ════════════════════════════════════════
function printEMI(){_loadJsPDF(_doPrintEMI);}
async function _doPrintEMI(){
  const btn=document.querySelector('[onclick="printEMI()"]');
  if(btn){btn.disabled=true;btn.textContent='Building PDF…';}
  try{
    const logoDataUrl=await _fetchLogoDataURL();
    const b=_makePDF();
    const {doc,ML,MR,PH,CW,SRF,BRD,TXT,MUT,WHT,POS,NEG,GMD,GDK,S,fmtINR_}=b;
    const dateStr=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
    const timeStr=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});

    // Collect params
    const p=getEMIParams();
    const emiAmt=(emiMode==='emi'||emiMode==='tenure')?calcEMIValue(p.loan,p.rate,p.tenure)
                :parseFloat(document.getElementById('emiAmount')?.value)||0;
    const totalPay=emiAmt*p.tenure;
    const totalInt=totalPay-p.loan;
    const intPct=p.loan>0?(totalInt/p.loan*100).toFixed(1):'0';

    const presetLabels={home:'Home Loan',car:'Car Loan',personal:'Personal Loan',education:'Education Loan',custom:'Custom Loan'};
    const loanType=presetLabels[document.querySelector('.emi-preset-btn.active')?.dataset?.preset||'custom']||'Loan';

    b.newPage();
    let y=b.pageHeader('EMI Calculator — '+loanType,'Loan repayment schedule and total cost analysis  ·  For illustrative purposes only',dateStr,timeStr,logoDataUrl);

    // Big EMI box
    y=b.bigResultBox('Monthly EMI','₹'+fmtINR_(emiAmt),'for '+p.tenure+' months at '+p.rate+'% p.a.',[30,94,32],y);
    y+=4;

    // Params
    y=b.paramsBox([
      ['Loan Amount','₹'+fmtINR_(p.loan)],
      ['Interest Rate',p.rate+'% p.a.'],
      ['Tenure',p.tenure+' months'],
      ['Loan Type',loanType],
    ],y);
    y+=4;

    // Key metrics
    y=b.secTitle('Loan Summary',y);
    y=b.metricsGrid([
      ['Monthly EMI','₹'+fmtINR_(emiAmt),TXT],
      ['Total Payment','₹'+fmtINR_(totalPay),TXT],
      ['Total Interest','₹'+fmtINR_(totalInt),NEG],
      ['Principal','₹'+fmtINR_(p.loan),TXT],
      ['Interest %',intPct+'% of principal',NEG],
      ['Tenure',p.tenure+' months / '+Math.round(p.tenure/12*10)/10+' yrs',TXT],
    ],y,3);

    // Chart
    y=b.secTitle('Payment Breakdown Chart',y);
    y=b.addChartImg(document.getElementById('emiChart'),y,80);

    // Amortisation table (first 12 months)
    const tableEl=document.getElementById('emiTableInner');
    if(tableEl){
      y=b.secTitle('Amortisation Schedule (First Year)',y);
      const rows=tableEl.querySelectorAll('tr');
      const headerRow=rows[0];
      if(headerRow){
        // Draw table header
        const ths=[...headerRow.querySelectorAll('th,td')].map(el=>el.textContent.trim());
        const colW=CW/Math.min(ths.length,6);
        doc.setFillColor(...GDK);doc.rect(ML,y,CW,6.5,'F');
        doc.setFontSize(6.5);doc.setFont('helvetica','bold');doc.setTextColor(255,255,255);
        ths.slice(0,6).forEach((h,ci)=>doc.text(h.slice(0,14),ML+ci*colW+2,y+4.3));
        y+=6.5;
        // Data rows (first 12)
        [...rows].slice(1,13).forEach((row,ri)=>{
          const tds=[...row.querySelectorAll('td')].map(el=>el.textContent.trim());
          doc.setFillColor(...(ri%2===0?[255,255,255]:[237,246,237]));
          doc.rect(ML,y,CW,6,'F');
          doc.setFontSize(6.5);doc.setFont('helvetica','normal');doc.setTextColor(...TXT);
          tds.slice(0,6).forEach((v,ci)=>doc.text(v.slice(0,14),ML+ci*colW+2,y+4));
          doc.setDrawColor(...BRD);doc.setLineWidth(0.1);doc.line(ML,y+6,ML+CW,y+6);
          y+=6;
        });
        if(rows.length>13){
          doc.setFontSize(6.5);doc.setFont('helvetica','italic');doc.setTextColor(...MUT);
          doc.text('… and '+(rows.length-13)+' more months. Full schedule available in the app.',ML,y+4);
          y+=7;
        }
      }
    }

    // Prepayment insight
    const insightEl=document.getElementById('emiSIPInsight');
    if(insightEl&&insightEl.style.display!=='none'){
      y+=2;
      doc.setFillColor(232,245,233);doc.setDrawColor(...BRD);doc.setLineWidth(0.3);
      doc.roundedRect(ML,y,CW,16,2,2,'FD');
      doc.setFontSize(7.5);doc.setFont('helvetica','bold');doc.setTextColor(...GDK);
      doc.text('💡 SIP vs EMI Insight',ML+4,y+6);
      doc.setFontSize(6.8);doc.setFont('helvetica','normal');doc.setTextColor(...TXT);
      const insightText=insightEl.textContent.replace(/\s+/g,' ').trim().slice(0,200);
      const iLines=doc.splitTextToSize(insightText,CW-8);
      doc.text(iLines.slice(0,2),ML+4,y+11);
      y+=19;
    }

    y=b.disclaimerBox(y+2);
    b.complianceBar(y+4);
    b.footer(dateStr);
    doc.save('Abundance-EMI-Calculator_'+loanType.replace(/\s/g,'-')+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }catch(e){console.error(e);alert('PDF export failed: '+e.message);}
  if(btn){btn.disabled=false;btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Save PDF';}
}


/* ════════════════════════════════════════
   SIP CALCULATOR
════════════════════════════════════════ */
let sipChartInst=null, calcMode='sip';

function setCalcMode(mode){
  // Deactivate ALL 4 toggle buttons (SIP/Lump/Both/Backtest) using CSS class only
  ['modeSIP','modeLump','modeBoth','modeBacktest'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.setAttribute('aria-checked', 'false');
    el.style.background = '';  // clear any lingering inline style
    el.style.color = '';
  });
  // Activate the chosen mode button
  const modeMap = {sip:'modeSIP', lump:'modeLump', both:'modeBoth'};
  const activeBtn = document.getElementById(modeMap[mode]);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-checked', 'true');
  }
  calcMode = mode;
  document.querySelectorAll('.sip-only').forEach(el=>el.style.display=(mode==='sip'||mode==='both')?'':'none');
  document.querySelectorAll('.lump-only').forEach(el=>el.style.display=(mode==='lump'||mode==='both')?'':'none');
  const titles={sip:'SIP Returns Calculator',lump:'Lumpsum Returns Calculator',both:'SIP + Lumpsum Calculator'};
  document.getElementById('calcModeTitle').textContent=titles[mode]||titles.sip;
  // Ensure SIP backtester panel is hidden when switching to calculator modes
  const _btP = document.getElementById('sipBTPanel');
  const _sb  = document.querySelector('#mpanel-sip .sip-split-body');
  if (_btP) _btP.style.display = 'none';
  if (_sb && _sb.style.display === 'none') _sb.style.display = '';
  calcSIP();
}

const FREQ={
  daily:    {perYear:252, label:"Daily"},
  weekly:   {perYear:52,  label:"Weekly"},
  monthly:  {perYear:12,  label:"Monthly"},
  quarterly:{perYear:4,   label:"Quarterly"},
  annually: {perYear:1,   label:"Annual"}
};

function getSIPParams(){
  const freq      = document.getElementById("sipFreq").value;
  const sipAmt    = Math.max(1, parseFloat(document.getElementById("sipAmount").value)||10000);
  const lumpAmt   = Math.max(0, parseFloat(document.getElementById("lumpAmount").value)||0);
  const durVal    = Math.max(1, parseFloat(document.getElementById("sipDuration").value)||10);
  const durUnit   = document.getElementById("sipDurationUnit").value;
  const annRate   = Math.max(0.01, parseFloat(document.getElementById("sipRate").value)||12);
  const stepupPct = (calcMode==='lump') ? 0 : Math.max(0, parseFloat(document.getElementById("sipStepup").value)||0);
  const cfg       = FREQ[freq];
  const totalYears = durUnit==="months" ? durVal/12 : durVal;
  const totalInstallments = Math.round(totalYears * cfg.perYear);
  const ratePerPeriod = Math.pow(1 + annRate/100, 1/cfg.perYear) - 1;
  return{freq, sipAmt, lumpAmt, durVal, durUnit, totalYears, totalInstallments,
         annualRate:annRate, ratePerPeriod, stepupPct, cfg,
         isLump:calcMode==='lump', isBoth:calcMode==='both'};
}

function simulate(p){
  if(p.isLump){
    // Pure lumpsum compounding
    const snaps=[{label:"Start",corpus:p.lumpAmt,invested:p.lumpAmt}];
    for(let y=1;y<=Math.ceil(p.totalYears);y++){
      const yr=Math.min(y,p.totalYears);
      snaps.push({label:yr+"Y",
        corpus:Math.round(p.lumpAmt*Math.pow(1+p.annualRate/100,yr)),
        invested:p.lumpAmt});
    }
    return snaps;
  }
  // SIP (with optional lump top-up at start)
  const lumpStart = p.isBoth ? p.lumpAmt : 0;
  const snaps=[{label:"Start",corpus:lumpStart,invested:lumpStart}];
  let corpus=lumpStart, invested=0, amt=p.sipAmt;
  const ipy=p.cfg.perYear;
  for(let i=1;i<=p.totalInstallments;i++){
    corpus=(corpus+amt)*(1+p.ratePerPeriod);
    invested+=amt;
    if(p.stepupPct>0 && i%ipy===0) amt*=(1+p.stepupPct/100);
    if(i%ipy===0)
      snaps.push({label:(i/ipy)+"Y",corpus:Math.round(corpus),invested:Math.round(invested+lumpStart)});
  }
  if(p.totalInstallments%ipy!==0)
    snaps.push({label:p.totalYears.toFixed(1)+"Y",corpus:Math.round(corpus),invested:Math.round(invested+lumpStart)});
  return snaps;
}

function calcSIP(){
  const p=getSIPParams();
  if(!p.isLump && p.totalInstallments<1) return;
  const base=simulate(p);
  const finalCorpus=base[base.length-1].corpus;
  const totalInvested=base[base.length-1].invested;
  const totalGain=finalCorpus-totalInvested;
  const wealthGain=totalInvested>0?((totalGain/totalInvested)*100).toFixed(1):0;

  const summaryRows=p.isLump?[
    ["Lumpsum",         "₹"+fmtINR(p.lumpAmt)],
    ["Duration",        p.durVal+" "+p.durUnit],
    ["Return (p.a.)",   p.annualRate+"%"],
    ["Total Invested",  "₹"+fmtINR(totalInvested)],
    ["Est. Corpus",     "₹"+fmtINR(finalCorpus)],
    ["Wealth Gain",     (totalGain>=0?"▲ ":"▼ ")+"₹"+fmtINR(Math.abs(totalGain))+" ("+wealthGain+"%)"],
  ]:p.isBoth?[
    ["SIP Amount",      "₹"+fmtINR(p.sipAmt)],
    ["SIP Frequency",   p.cfg.label],
    ["Lumpsum",         "₹"+fmtINR(p.lumpAmt)],
    ["Total Invested",  "₹"+fmtINR(totalInvested)],
    ["Est. Corpus",     "₹"+fmtINR(finalCorpus)],
    ["Wealth Gain",     (totalGain>=0?"▲ ":"▼ ")+"₹"+fmtINR(Math.abs(totalGain))+" ("+wealthGain+"%)"],
  ]:[
    ["Frequency",       p.cfg.label],
    ["Per Instalment",  "₹"+fmtINR(p.sipAmt)],
    ["# Instalments",   p.totalInstallments.toLocaleString("en-IN")],
    ["Total Invested",  "₹"+fmtINR(totalInvested)],
    ["Est. Corpus",     "₹"+fmtINR(finalCorpus)],
    ["Wealth Gain",     (totalGain>=0?"▲ ":"▼ ")+"₹"+fmtINR(Math.abs(totalGain))+" ("+wealthGain+"%)"],
  ];
  document.getElementById("sipSummary").innerHTML=summaryRows.map(([lbl,val],i)=>
    `<div class="sip-sum-item"><div class="sip-sum-label">${lbl}</div>
    <div class="sip-sum-val" style="${i>=4?"color:var(--pos)":""}">${val}</div></div>`).join("");

  const scenarios=[
    {label:"Conservative", rate:Math.max(1,p.annualRate-4),  color:"#1565c0"},
    {label:"Base Case",    rate:p.annualRate,                 color:"#2e7d32"},
    {label:"Optimistic",   rate:Math.min(50,p.annualRate+4), color:"#e65100"},
  ];

  document.getElementById("sipResultCards").innerHTML=scenarios.map(s=>{
    const sp={...p,annualRate:s.rate,ratePerPeriod:Math.pow(1+s.rate/100,1/p.cfg.perYear)-1};
    const sd=simulate(sp);
    const corp=sd[sd.length-1].corpus;
    const inv=sd[sd.length-1].invested;
    const gain=corp-inv;
    const wg=inv>0?((gain/inv)*100).toFixed(1):0;
    // For both mode: calculate lump gain and SIP gain separately
    let sipGainHtml='', lumpGainHtml='';
    if(p.isBoth){
      const lumpCorpus=Math.round(sp.lumpAmt*Math.pow(1+s.rate/100,sp.totalYears));
      const lumpGain=lumpCorpus-sp.lumpAmt;
      // SIP corpus = total corpus - lump corpus
      const sipCorpus=corp-lumpCorpus;
      const sipInv=inv-sp.lumpAmt;
      const sipGain=sipCorpus-sipInv;
      sipGainHtml=`<div class="src-row" style="opacity:.65;font-size:.9em"><span class="src-key">SIP Gain</span><span class="src-val" style="color:${sipGain>=0?'var(--pos)':'var(--neg)'}">₹${fmtINR(Math.abs(sipGain))}</span></div>`;
      lumpGainHtml=`<div class="src-row" style="opacity:.65;font-size:.9em"><span class="src-key">Lumpsum Gain</span><span class="src-val" style="color:${lumpGain>=0?'var(--pos)':'var(--neg)'}">₹${fmtINR(Math.abs(lumpGain))}</span></div>`;
    }
    return`<div class="sip-result-card">
      <div class="src-accent" style="background:${s.color}"></div>
      <div class="src-header"><span class="src-dot" style="background:${s.color}"></span><span class="src-name">${s.label} · ${s.rate}% p.a.</span></div>
      <div style="background:var(--g-xlight);border:1.5px solid var(--g-light);border-radius:8px;padding:10px 12px;margin-bottom:10px;text-align:center">
        <div class="src-corpus-label" style="margin-bottom:4px">Estimated Corpus</div>
        <div class="src-corpus">₹${fmtINR(corp)}</div>
      </div>
      ${sr("Total Invested","₹"+fmtINR(inv),"#2e4d2e")}
      ${sipGainHtml}
      ${lumpGainHtml}
      <div style="margin:8px 0 4px;padding:7px 10px;border-radius:7px;background:${gain>=0?'rgba(46,125,50,.1)':'rgba(183,28,28,.08)'}">
        <div class="src-row" style="border-bottom:none">
          <span class="src-key" style="font-weight:800;font-size:.75rem;color:#2e4d2e">Total Gain</span>
          <span class="src-val" style="color:${gain>=0?'var(--pos)':'var(--neg)'};font-size:1rem;font-weight:800">₹${fmtINR(Math.abs(gain))}</span>
        </div>
      </div>
      ${sr("Wealth Gain",wg+"%",gain>=0?"var(--pos)":"var(--neg)")}
      ${(!p.isLump&&p.stepupPct>0)?sr("Step-up",p.stepupPct+"% p.a.","#6a1b9a"):""}
    </div>`;
  }).join("");

  drawSIPChart(p,scenarios);
  // ── Update big result panel ──
  const mult = totalInvested>0 ? finalCorpus/totalInvested : 1;
  updateBigResult(finalCorpus, totalInvested, totalGain, mult, parseFloat(wealthGain), p);
}

function drawSIPChart(p,scenarios){
  if(sipChartInst){sipChartInst.destroy();sipChartInst=null;}
  const ctx=document.getElementById("sipChart").getContext("2d");
  const base=simulate(p);
  const labels=base.map(d=>d.label);
  const datasets=[
    {label:"Invested",data:base.map(d=>d.invested),
     borderColor:"#90a4ae",backgroundColor:"transparent",
     borderWidth:2,borderDash:[6,3],pointRadius:0,tension:.3,fill:false,order:10},
    ...scenarios.map((s,si)=>{
      const sp={...p,annualRate:s.rate,ratePerPeriod:Math.pow(1+s.rate/100,1/p.cfg.perYear)-1};
      return{
        label:`${s.label} (${s.rate}%)`,
        data:simulate(sp).map(d=>d.corpus),
        borderColor:s.color,backgroundColor:s.color+"18",
        borderWidth:si===1?2.5:1.5,
        pointRadius:0,pointHoverRadius:5,tension:.3,fill:si===1
      };
    })
  ];
  sipChartInst=new Chart(ctx,{type:"line",data:{labels,datasets},options:{
    responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{
      legend:{position:"top",labels:{color:"#2e4d2e",font:{family:"Raleway",weight:"700",size:11},usePointStyle:true,padding:20,boxWidth:8}},
      tooltip:{backgroundColor:"#162616",borderColor:"#2e7d32",borderWidth:1,
        titleFont:{family:"JetBrains Mono",size:11},bodyFont:{family:"JetBrains Mono",size:12},padding:13,cornerRadius:8,
        callbacks:{label:c=>`  ${c.dataset.label}: ₹${fmtINR(c.parsed.y)}`}}
    },
    scales:{
      x:{grid:{display:false},border:{color:"#c2dfc2"},ticks:{font:{family:"JetBrains Mono",size:10},color:"#5e8a5e"}},
      y:{grid:{color:"rgba(194,223,194,.5)"},border:{color:"#c2dfc2"},
        ticks:{font:{family:"JetBrains Mono",size:10},color:"#5e8a5e",callback:v=>"₹"+fmtINR(v)}}
    }
  }});
}


function sr(key,val,col="#2e4d2e"){
  return`<div class="src-row"><span class="src-key">${key}</span><span class="src-val" style="color:${col}">${val}</span></div>`;
}
function fmtINR(n){
  n=Math.round(n);
  if(n>=1e7) return(n/1e7).toFixed(2)+" Cr";
  if(n>=1e5) return(n/1e5).toFixed(2)+" L";
  return n.toLocaleString("en-IN");
}

// calcSIP();  // lazy-init via tab

/* ════════════════════════════════════════
   GOAL PLANNER
════════════════════════════════════════ */
let goalChartInst = null;

const GOAL_PRESETS = {
  retirement:  {name:"Retirement Corpus",    amount:50000000, dur:20, unit:"years"},
  child_edu:   {name:"Child Education Fund", amount:2000000,  dur:15, unit:"years"},
  home:        {name:"Home Down Payment",    amount:8000000,  dur:10, unit:"years"},
  emergency:   {name:"Emergency Fund",       amount:500000,   dur:3,  unit:"years"},
  travel:      {name:"Dream Vacation Fund",  amount:300000,   dur:2,  unit:"years"},
  car:         {name:"Car Purchase Fund",    amount:1500000,  dur:5,  unit:"years"},
  custom:      {name:"My Financial Goal",    amount:1000000,  dur:10, unit:"years"},
};

function applyGoalPreset(btn, key){
  document.querySelectorAll('.goal-preset-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const p = GOAL_PRESETS[key];
  document.getElementById('goalName').value = p.name;
  document.getElementById('goalAmount').value = p.amount;
  document.getElementById('goalDuration').value = p.dur;
  document.getElementById('goalDurationUnit').value = p.unit;
  calcGoal();
  updateGoalNorthStar();
  // Also update gp-preset-card active state
  document.querySelectorAll('.gp-preset-card').forEach(c=>c.classList.remove('active'));
  if(btn.classList.contains('gp-preset-card')) btn.classList.add('active');
}

function toggleGoalAdvanced(){
  const el = document.getElementById('goalAdvanced');
  const arrow = document.getElementById('goalAdvArrow');
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  arrow.style.transform = open ? 'rotate(180deg)' : '';
}

function getGoalParams(){
  const goalAmt    = Math.max(1000, parseFloat(document.getElementById('goalAmount').value)||1000000);
  const dur        = Math.max(1, parseFloat(document.getElementById('goalDuration').value)||10);
  const unit       = document.getElementById('goalDurationUnit').value;
  const rate       = Math.max(1, parseFloat(document.getElementById('goalRate').value)||12);
  const existing   = Math.max(0, parseFloat(document.getElementById('goalExisting').value)||0);
  const inflation  = Math.max(0, parseFloat(document.getElementById('goalInflation').value)||6);
  const freq       = document.getElementById('goalFreq').value;
  const stepup     = Math.max(0, parseFloat(document.getElementById('goalStepup').value)||0);
  const lumpsumPct = Math.min(100, Math.max(0, parseFloat(document.getElementById('goalLumpsumPct').value)||30));
  const goalName   = document.getElementById('goalName').value || 'My Goal';
  const totalYears = unit === 'months' ? dur/12 : dur;
  const cfg        = FREQ[freq];
  const totalInst  = Math.round(totalYears * cfg.perYear);
  const rpp        = Math.pow(1 + rate/100, 1/cfg.perYear) - 1;
  const realTarget = Math.round(goalAmt * Math.pow(1 + inflation/100, totalYears));
  const existingGrowth = existing > 0 ? Math.round(existing * Math.pow(1 + rate/100, totalYears)) : 0;
  const netTarget  = Math.max(0, realTarget - existingGrowth);
  return { goalAmt, dur, unit, rate, existing, inflation, freq, stepup, lumpsumPct,
           goalName, totalYears, cfg, totalInst, rpp, realTarget, existingGrowth, netTarget };
}

function calcRequiredSIP(target, rpp, n, stepupPct, ipy){
  if(n <= 0) return 0;
  if(stepupPct === 0){
    if(rpp === 0) return target / n;
    return (target * rpp) / (Math.pow(1 + rpp, n) - 1);
  }
  // Binary search for stepped SIP
  let lo = 1, hi = target * 10, mid, corpus;
  for(let iter = 0; iter < 60; iter++){
    mid = (lo + hi) / 2;
    corpus = 0; let amt = mid;
    for(let i = 1; i <= n; i++){
      corpus = (corpus + amt) * (1 + rpp);
      if(stepupPct > 0 && i % ipy === 0) amt *= (1 + stepupPct/100);
    }
    if(corpus < target) lo = mid; else hi = mid;
  }
  return Math.ceil(mid);
}

function calcRequiredLump(target, rate, years){
  return Math.round(target / Math.pow(1 + rate/100, years));
}

function gpr(key, val, col){
  return `<div class="gp-row"><span class="gp-key">${key}</span><span class="gp-val" style="${col?'color:'+col:''}">${val}</span></div>`;
}

/* ── War Room Hero: update stat chips ── */
function updateWarRoomStats() {
  const hint  = document.getElementById('wrEmptyHint');
  const stats = document.getElementById('wrStats');
  if (!hint || !stats) return;

  if (!selectedFunds.length) {
    hint.style.display = 'flex'; stats.style.display = 'none'; return;
  }
  hint.style.display = 'none'; stats.style.display = 'flex';

  // Aggregate best CAGR, lowest vol, highest Sharpe across loaded funds
  let bestCAGR = -Infinity, bestVol = Infinity, bestSharpe = -Infinity;
  let bestCAGRName = '', bestVolName = '', bestSharpeName = '';

  selectedFunds.forEach(f => {
    const m = f.metrics;
    if (!m || m.insufficient) return;
    const cagr = parseFloat(m.annReturn);
    const vol  = parseFloat(m.annVol);
    const sh   = parseFloat(m.sharpe);
    if (cagr > bestCAGR)   { bestCAGR = cagr; bestCAGRName = f.name.split(' ').slice(0,3).join(' '); }
    if (vol  < bestVol)    { bestVol  = vol;  bestVolName  = f.name.split(' ').slice(0,3).join(' '); }
    if (sh   > bestSharpe) { bestSharpe = sh; bestSharpeName = f.name.split(' ').slice(0,3).join(' '); }
  });

  const chips = [];
  if (isFinite(bestCAGR)) chips.push({ label: 'Best CAGR', val: bestCAGR.toFixed(1)+'%', cls: bestCAGR >= 0 ? 'pos' : 'neg', tip: bestCAGRName });
  if (isFinite(bestVol) && bestVol < 999) chips.push({ label: 'Lowest Vol', val: bestVol.toFixed(1)+'%', cls: '', tip: bestVolName });
  if (isFinite(bestSharpe)) chips.push({ label: 'Best Sharpe', val: bestSharpe.toFixed(2), cls: bestSharpe >= 1 ? 'pos' : '', tip: bestSharpeName });
  chips.push({ label: 'Funds', val: selectedFunds.length + '/5', cls: '' });

  stats.innerHTML = chips.map(c => `
    <div class="wr-stat-chip" title="${c.tip||''}">
      <div class="wr-stat-chip-label">${c.label}</div>
      <div class="wr-stat-chip-val ${c.cls}">${c.val}</div>
    </div>`).join('');
}

/* ── Mission Control Hero: update live SIP display ── */
function updateMCHero(sipOnly, p) {
  const el  = document.getElementById('mcHdrSIP');
  const sub = document.getElementById('mcHdrSub');
  if (!el) return;
  if (!sipOnly || isNaN(sipOnly)) { el.textContent = '₹—'; if(sub) sub.textContent='Enter your goal to launch'; return; }
  el.textContent = '₹' + fmtINR(Math.round(sipOnly));
  if (sub) {
    const fmtY = p.unit === 'months' ? p.dur+' months' : p.dur+' year'+(p.dur>1?'s':'');
    sub.textContent = 'to reach ₹'+fmtINR(p.goalAmt)+' in '+fmtY;
  }
}

/* ── Mission Control: starfield ── */
function initMCStars() {
  const c = document.getElementById('mcStars');
  if (!c || c.children.length) return;
  for (let i = 0; i < 30; i++) {
    const s = document.createElement('div');
    s.className = 'mc-star';
    s.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${(2+Math.random()*4).toFixed(1)}s;animation-delay:${(Math.random()*4).toFixed(1)}s`;
    c.appendChild(s);
  }
}

function calcGoal(){
  const p = getGoalParams();
  if(p.totalInst < 1) return;

  const fmtY = p.unit === 'months' ? `${p.dur} months` : `${p.dur} year${p.dur>1?'s':''}`;

  // ── Summary Banner ──
  document.getElementById('goalSummaryBanner').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;padding:14px 18px;background:linear-gradient(135deg,var(--g1),var(--g2));border-radius:10px;color:#fff;align-items:center">
      <div style="flex:1;min-width:200px">
        <div style="font-size:.6rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;opacity:.75;margin-bottom:4px">Your Goal: ${p.goalName}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.5rem;font-weight:800">₹${fmtINR(p.goalAmt)}</div>
        <div style="font-size:.72rem;opacity:.8;margin-top:2px">in ${fmtY} · ${p.rate}% expected return</div>
      </div>
      ${p.inflation > 0 ? `<div style="background:rgba(255,255,255,.12);border-radius:8px;padding:10px 14px;min-width:0;flex-shrink:1">
        <div style="font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:.7;margin-bottom:3px">Inflation-Adjusted Target</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:700">₹${fmtINR(p.realTarget)}</div>
        <div style="font-size:.62rem;opacity:.7">at ${p.inflation}% inflation p.a.</div>
      </div>` : ''}
      ${p.existing > 0 ? `<div style="background:rgba(255,255,255,.12);border-radius:8px;padding:10px 14px;min-width:160px">
        <div style="font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:.7;margin-bottom:3px">Existing Investments Grow to</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:700">₹${fmtINR(p.existingGrowth)}</div>
        <div style="font-size:.62rem;opacity:.7">Still need ₹${fmtINR(p.netTarget)}</div>
      </div>` : ''}
    </div>`;

  const target = p.netTarget;
  const freqLabel = {monthly:'month',quarterly:'quarter',weekly:'week',annually:'year'}[p.freq];

  // ── Plan A: Pure SIP ──
  const sipOnly = calcRequiredSIP(target, p.rpp, p.totalInst, p.stepup, p.cfg.perYear);
  let sipTotalInvested = 0;
  {let amt = sipOnly, ipy = p.cfg.perYear;
   for(let i=1;i<=p.totalInst;i++){sipTotalInvested+=amt; if(p.stepup>0&&i%ipy===0) amt*=(1+p.stepup/100);}}

  // ── Plan B: Pure Lumpsum ──
  const lumpOnly = calcRequiredLump(target, p.rate, p.totalYears);

  // ── Plan C: Hybrid ──
  const lumpShare = p.lumpsumPct / 100;
  const hybridLump = calcRequiredLump(target * lumpShare, p.rate, p.totalYears);
  const hybridSIPTarget = target * (1 - lumpShare);
  const hybridSIP = calcRequiredSIP(hybridSIPTarget, p.rpp, p.totalInst, p.stepup, p.cfg.perYear);
  let hybridSIPInvested = 0;
  {let amt = hybridSIP, ipy = p.cfg.perYear;
   for(let i=1;i<=p.totalInst;i++){hybridSIPInvested+=amt; if(p.stepup>0&&i%ipy===0) amt*=(1+p.stepup/100);}}

  const cards = [
    {
      color:'#1565c0', icon:'📈', type:'Plan A — Pure SIP',
      mainVal:'₹'+fmtINR(Math.round(sipOnly)),
      mainLabel:`Per ${freqLabel} · ${p.cfg.label}`,
      rows:[
        ['Total SIP Outflow', '₹'+fmtINR(Math.round(sipTotalInvested)), ''],
        ['Wealth Created', '₹'+fmtINR(Math.round(target - sipTotalInvested)), 'var(--pos)'],
        p.stepup>0 ? ['Annual Step-up', p.stepup+'% p.a.','#6a1b9a'] : null,
        ['No. of Instalments', p.totalInst.toLocaleString('en-IN'),''],
        ['Upfront Capital', 'None needed', 'var(--g2)'],
      ].filter(Boolean),
      badge:{text:'No Upfront Capital', bg:'rgba(21,101,192,.1)', col:'#1565c0'}
    },
    {
      color:'#e65100', icon:'💰', type:'Plan B — Pure Lumpsum',
      mainVal:'₹'+fmtINR(lumpOnly),
      mainLabel:'One-time investment today',
      rows:[
        ['Grows to Target', '₹'+fmtINR(target), 'var(--pos)'],
        ['Wealth Created', '₹'+fmtINR(target - lumpOnly), 'var(--pos)'],
        ['Return Rate', p.rate+'% p.a.', ''],
        ['Time to Grow', p.totalYears.toFixed(1)+' years', ''],
        ['No Monthly Commitment', 'Zero SIP needed', 'var(--g2)'],
      ],
      badge:{text:'One-time Payment', bg:'rgba(230,81,0,.1)', col:'#e65100'}
    },
    {
      color:'#2e7d32', icon:'⚖️', type:`Plan C — Hybrid (${p.lumpsumPct}% Lump + ${100-p.lumpsumPct}% SIP)`,
      mainVal:'₹'+fmtINR(hybridLump)+' now',
      mainLabel:'+ ₹'+fmtINR(Math.round(hybridSIP))+'/'+freqLabel+' SIP',
      rows:[
        ['Lumpsum Today', '₹'+fmtINR(hybridLump), ''],
        ['Monthly SIP', '₹'+fmtINR(Math.round(hybridSIP))+'/'+freqLabel, 'var(--g2)'],
        ['Total Outflow', '₹'+fmtINR(hybridLump + Math.round(hybridSIPInvested)), ''],
        ['Wealth Created', '₹'+fmtINR(Math.round(target - hybridLump - hybridSIPInvested)), 'var(--pos)'],
        p.stepup>0 ? ['SIP Step-up', p.stepup+'% p.a.','#6a1b9a'] : null,
      ].filter(Boolean),
      badge:{text:'Balanced Approach', bg:'rgba(46,125,50,.1)', col:'var(--g2)'}
    },
  ];

  document.getElementById('goalPlanCards').innerHTML = cards.map(c => `
    <div class="gp-card">
      <div class="gp-card-accent" style="background:${c.color}"></div>
      <div class="gp-card-type"><span class="gp-card-icon">${c.icon}</span>${c.type}</div>
      <div class="gp-highlight-box">
        <div class="gp-main-label" style="margin-bottom:4px">Required Investment</div>
        <div class="gp-main-val" style="font-size:${c.mainVal.length>14?'1.1rem':'1.6rem'}">${c.mainVal}</div>
        <div class="gp-main-label" style="margin-top:3px">${c.mainLabel}</div>
      </div>
      ${c.rows.map(([k,v,col])=>gpr(k,v,col)).join('')}
      <div style="margin-top:10px"><span class="gp-badge" style="background:${c.badge.bg};color:${c.badge.col}">${c.badge.text}</span></div>
    </div>`).join('');

  // ── Timeline ──
  const milestones = [0.25, 0.5, 0.75, 1.0].map(pct => {
    const yr = p.totalYears * pct;
    const n = Math.round(yr * p.cfg.perYear);
    let corpus = p.existing, amt = sipOnly;
    for(let i=1;i<=n;i++){corpus=(corpus+amt)*(1+p.rpp);if(p.stepup>0&&i%p.cfg.perYear===0)amt*=(1+p.stepup/100);}
    const prog = Math.min(100, corpus / p.realTarget * 100).toFixed(0);
    return {yr: yr.toFixed(1), corpus: Math.round(corpus), prog};
  });
  document.getElementById('goalTimeline').innerHTML = `
    <div class="timeline-bar">
      <div style="font-size:.62rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">📊 SIP Plan — Corpus at Key Milestones</div>
      <div class="tl-track"><div class="tl-fill" style="width:100%"></div></div>
      <div class="tl-milestones">
        ${milestones.map(m=>`<div class="tl-m">
          <div style="font-weight:800;color:var(--g2);font-size:.68rem">${m.prog}%</div>
          <div>Yr ${m.yr}</div>
          <div style="color:var(--text2);font-size:.65rem">₹${fmtINR(m.corpus)}</div>
        </div>`).join('')}
      </div>
    </div>`;

  drawGoalChart(p, sipOnly, lumpOnly, hybridLump, hybridSIP);
  updateGoalNorthStar();
  updateMCHero(sipOnly, p);
}

function drawGoalChart(p, sipOnly, lumpOnly, hybridLump, hybridSIP){
  if(goalChartInst){goalChartInst.destroy(); goalChartInst=null;}
  const ctx = document.getElementById('goalChart').getContext('2d');
  const years = Math.ceil(p.totalYears);
  const labels = Array.from({length:years+1}, (_,i) => i===0?'Now':i+'Y');

  function sipGrowthArr(sip, lump=0){
    return labels.map((_,y) => {
      const n = Math.round(Math.min(y, p.totalYears) * p.cfg.perYear);
      let corpus = lump + p.existing, amt = sip;
      for(let i=1;i<=n;i++){corpus=(corpus+amt)*(1+p.rpp);if(p.stepup>0&&i%p.cfg.perYear===0)amt*=(1+p.stepup/100);}
      return Math.round(corpus);
    });
  }
  function lumpGrowthArr(lump){
    return labels.map((_,y)=>Math.round((lump+p.existing)*Math.pow(1+p.rate/100,Math.min(y,p.totalYears))));
  }

  goalChartInst = new Chart(ctx, {type:'line', data:{
    labels,
    datasets:[
      {label:'Target (Inflation-adj.)', data:Array(years+1).fill(p.realTarget),
        borderColor:'#ef5350',backgroundColor:'transparent',borderWidth:1.5,borderDash:[5,4],pointRadius:0,tension:0,order:0},
      {label:'Plan A — Pure SIP', data:sipGrowthArr(sipOnly),
        borderColor:'#1565c0',backgroundColor:'rgba(21,101,192,.07)',borderWidth:2,pointRadius:0,pointHoverRadius:5,tension:.3,fill:false},
      {label:'Plan B — Pure Lumpsum', data:lumpGrowthArr(lumpOnly),
        borderColor:'#e65100',backgroundColor:'rgba(230,81,0,.06)',borderWidth:2,pointRadius:0,pointHoverRadius:5,tension:.3,fill:false},
      {label:'Plan C — Hybrid', data:sipGrowthArr(hybridSIP, hybridLump),
        borderColor:'#2e7d32',backgroundColor:'rgba(46,125,50,.08)',borderWidth:2.5,pointRadius:0,pointHoverRadius:5,tension:.3,fill:true},
    ]
  }, options:{
    responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{position:'top',labels:{color:'#2e4d2e',font:{family:'Raleway',weight:'700',size:11},usePointStyle:true,padding:20,boxWidth:8}},
      tooltip:{backgroundColor:'#162616',borderColor:'#2e7d32',borderWidth:1,
        titleFont:{family:'JetBrains Mono',size:11},bodyFont:{family:'JetBrains Mono',size:12},padding:13,cornerRadius:8,
        callbacks:{label:c=>`  ${c.dataset.label}: ₹${fmtINR(c.parsed.y)}`}}
    },
    scales:{
      x:{grid:{display:false},border:{color:'#c2dfc2'},ticks:{font:{family:'JetBrains Mono',size:10},color:'#5e8a5e'}},
      y:{grid:{color:'rgba(194,223,194,.5)'},border:{color:'#c2dfc2'},
        ticks:{font:{family:'JetBrains Mono',size:10},color:'#5e8a5e',callback:v=>'₹'+fmtINR(v)}}
    }
  }});
}

function printGoalPlan(){
  const p = getGoalParams();
  const bannerHTML = document.getElementById('goalSummaryBanner').outerHTML;
  const cardsHTML  = document.getElementById('goalPlanCards').outerHTML;
  const tlHTML     = document.getElementById('goalTimeline').outerHTML;
  const chartImg   = document.getElementById('goalChart') ? document.getElementById('goalChart').toDataURL('image/png') : '';
  const win = window.open('','_blank','width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>SIP &amp; SWP NAV Backtester, MF Comparison, Goal Planner &amp; EMI | Abundance</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:32px 40px}
  .print-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #2e7d32;margin-bottom:24px}
  .print-logo{height:48px;object-fit:contain;mix-blend-mode:multiply}
  .print-title{font-size:1.1rem;font-weight:800;color:#2e7d32}
  .print-arn{font-size:.62rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:3px}
  .sec{font-size:.58rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:16px 0 8px;display:flex;align-items:center;gap:8px}
  .sec::after{content:"";flex:1;height:1px;background:#c2dfc2}
  #goalPlanCards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
  .gp-card{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:10px;padding:14px;position:relative;overflow:hidden}
  .gp-card-accent{position:absolute;top:0;left:0;right:0;height:3px}
  .gp-card-type{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#5e8a5e;margin-bottom:8px;display:flex;align-items:center;gap:5px}
  .gp-card-icon{font-size:.9rem}
  .gp-highlight-box{background:#e8f5e9;border:1.5px solid #a5d6a7;border-radius:7px;padding:8px 12px;margin:7px 0;text-align:center}
  .gp-main-val{font-family:"JetBrains Mono",monospace;font-size:1rem;font-weight:800;color:#1b5e20;line-height:1.2}
  .gp-main-label{font-size:.57rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
  .gp-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #c2dfc2;font-size:.66rem}
  .gp-row:last-child{border-bottom:none}
  .gp-key{color:#2e4d2e}.gp-val{font-family:"JetBrains Mono",monospace;font-weight:600}
  .gp-badge{display:inline-flex;font-size:.58rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-top:6px}
  .timeline-bar{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:8px;padding:12px 16px;margin-bottom:14px}
  .tl-track{height:6px;background:#c2dfc2;border-radius:4px;margin:7px 0;overflow:hidden}
  .tl-fill{height:100%;background:linear-gradient(90deg,#2e7d32,#66bb6a);border-radius:4px;width:100%}
  .tl-milestones{display:flex;justify-content:space-between}
  .tl-m{font-size:.58rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;text-align:center;flex:1}
  .chart-section img{width:100%;border-radius:8px;border:1px solid #c2dfc2;margin-bottom:14px}
  .disclaimer{padding:10px 14px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.62rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:16px}
  @media print{body{padding:18px 22px}@page{margin:1cm;size:A4 portrait}}
</style></head><body>
<div class="print-header">
  <div><div class="print-title">Investment Goal Planner — ${p.goalName}</div>
  <div class="print-arn">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds Distributor &amp; SIF Distributor</div></div>
  <img class="print-logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>
<div class="sec">Goal Summary</div>${bannerHTML}
<div class="sec">Investment Plans</div>${cardsHTML}
<div class="sec">Progress Milestones</div>${tlHTML}
${chartImg?`<div class="sec">Growth Projection</div><div class="chart-section"><img src="${chartImg}"></div>`:''}
<div class="disclaimer">⚠️ <strong style="color:#e65100">Disclaimer:</strong> Mutual fund investments are subject to market risks. Past performance is not indicative of future returns. These projections are for illustrative purposes only and do not constitute financial advice. Consult your financial advisor before investing. | ARN-251838 | Abundance Financial Services</div>
</body></html>`);
  win.document.close();
  win.onload = ()=>setTimeout(()=>{win.focus();win.print();},600);
  setTimeout(()=>{try{win.focus();win.print();}catch(e){}},1200);
}

// calcGoal();  // lazy-init via tab

/* ════════════════════════════════════════
   SWP CALCULATOR — INCOME ENGINE
════════════════════════════════════════ */
let swpChartInst = null, swpChartView = 'both', swpCurrentMode = 'haveCorpus';

const SWPFREQ = {
  monthly:   {n:12,  lbl:'Month',   plbl:'Monthly',   months:1},
  quarterly: {n:4,   lbl:'Quarter', plbl:'Quarterly',  months:3},
  annually:  {n:1,   lbl:'Year',    plbl:'Annual',     months:12},
};

function toggleSWPDelay(){
  const cb = document.getElementById('swpDelayToggle');
  const fields = document.getElementById('swpDelayFields');
  const box    = document.getElementById('swpDelayBox');
  const hint   = document.getElementById('swpDelayHint');
  fields.classList.toggle('shown', cb.checked);
  box.classList.toggle('on', cb.checked);
  box.classList.toggle('off', !cb.checked);
  hint.style.display = cb.checked ? 'none' : 'block';
  calcSWP();
}

function setSWPChartView(view, btn){
  swpChartView = view;
  document.querySelectorAll('.swp-chart-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  drawSWPChart(window._swpLastSim);
}

function getSWPParams(){
  const delayOn   = document.getElementById('swpDelayToggle').checked;
  const delayVal  = delayOn ? Math.max(1, parseFloat(document.getElementById('swpDelay').value)||5) : 0;
  const delayUnit = delayOn ? document.getElementById('swpDelayUnit').value : 'years';
  const delayMonths = delayOn ? (delayUnit==='months' ? delayVal : delayVal*12) : 0;
  const delayRate = delayOn ? (parseFloat(document.getElementById('swpDelayRate').value)||12) : 0;

  if(swpCurrentMode === 'haveCorpus'){
    return {
      mode:'haveCorpus',
      corpus     : Math.max(1000, parseFloat(document.getElementById('swpCorpus').value)||5000000),
      withdrawal : Math.max(1,    parseFloat(document.getElementById('swpWithdrawal').value)||30000),
      rate       : Math.max(0.01, parseFloat(document.getElementById('swpRate').value)||10),
      durationVal: Math.max(1,    parseFloat(document.getElementById('swpDuration').value)||20),
      durationUnit: document.getElementById('swpDurationUnit').value,
      freq       : document.getElementById('swpFreq').value,
      stepup     : Math.max(0,    parseFloat(document.getElementById('swpStepup').value)||0),
      inflation  : Math.max(0,    parseFloat(document.getElementById('swpInflation').value)||6),
      delayOn, delayMonths, delayRate,
    };
  } else {
    return {
      mode:'needIncome',
      targetIncome: Math.max(1, parseFloat(document.getElementById('swpTargetIncome').value)||50000),
      durationVal : Math.max(1, parseFloat(document.getElementById('swpTargetDuration').value)||25),
      durationUnit: document.getElementById('swpTargetDurationUnit').value,
      rate        : Math.max(0.01, parseFloat(document.getElementById('swpTargetRate').value)||10),
      freq        : document.getElementById('swpTargetFreq').value,
      stepup      : Math.max(0, parseFloat(document.getElementById('swpTargetStepup').value)||0),
      inflation   : Math.max(0, parseFloat(document.getElementById('swpTargetInflation').value)||6),
      delayOn, delayMonths, delayRate,
    };
  }
}

// Core simulation: step through each period
function runSWPSim(startCorpus, annRate, freqN, withdrawalPerPeriod, stepupPct, totalPeriods){
  const rpp = Math.pow(1 + annRate/100, 1/freqN) - 1;
  let corpus = startCorpus, totalW = 0, amt = withdrawalPerPeriod;
  let depleted = -1;
  const snaps = [{period:0, corpus:Math.round(startCorpus), totalWithdrawn:0, payout:Math.round(amt)}];
  for(let i=1; i<=totalPeriods; i++){
    corpus *= (1+rpp);
    const w = Math.min(corpus, amt);
    corpus -= w; totalW += w;
    if(i % freqN === 0 || i === totalPeriods)
      snaps.push({period:i/freqN, corpus:Math.round(corpus), totalWithdrawn:Math.round(totalW), payout:Math.round(w)});
    if(corpus <= 0 && depleted < 0){ depleted = i/freqN; corpus = 0; }
    if(corpus <= 0) break;
    if(stepupPct > 0 && i % freqN === 0) amt *= (1+stepupPct/100);
  }
  return {snaps, depleted, totalWithdrawn:Math.round(totalW), finalCorpus:Math.round(corpus)};
}

// PV of growing annuity
function pvGrowingAnnuity(pmt, r, g, n){
  if(Math.abs(r-g) < 1e-9) return pmt * n / (1+r);
  return pmt * (1 - Math.pow((1+g)/(1+r), n)) / (r-g);
}

function calcSWP(){
  const p = getSWPParams();
  const cfg = SWPFREQ[p.freq || (p.mode==='needIncome' ? (SWPFREQ[p.freq]?p.freq:'monthly') : 'monthly')];
  const freqCfg = SWPFREQ[p.mode==='haveCorpus' ? p.freq : p.freq] || SWPFREQ.monthly;
  const durationMonths = p.durationUnit==='months' ? p.durationVal : p.durationVal*12;
  const totalPeriods = Math.round(durationMonths / (12/freqCfg.n));

  // Corpus after delay
  const corpusBeforeDelay = p.mode==='haveCorpus' ? p.corpus : null;
  let startCorpus;

  if(p.mode === 'haveCorpus'){
    startCorpus = p.delayOn && p.delayMonths > 0
      ? p.corpus * Math.pow(1+p.delayRate/100, p.delayMonths/12)
      : p.corpus;
    if(p.delayOn) document.getElementById('swpCorpusAfterDelay').textContent = '₹'+fmtINR(Math.round(startCorpus));
    const withdrawalPerPeriod = p.withdrawal * (12/freqCfg.n);
    const sim = runSWPSim(startCorpus, p.rate, freqCfg.n, withdrawalPerPeriod, p.stepup, totalPeriods);
    window._swpLastSim = {sim, p, freqCfg, startCorpus, totalPeriods};
    renderSWPCorpusMode(p, sim, freqCfg, startCorpus, totalPeriods);
  } else {
    const incomePerPeriod = p.targetIncome * (12/freqCfg.n);
    const rpp = Math.pow(1+p.rate/100, 1/freqCfg.n) - 1;
    const gpp = p.stepup > 0 ? Math.pow(1+p.stepup/100, 1/freqCfg.n) - 1 : 0;
    const corpusNeeded = p.stepup > 0
      ? pvGrowingAnnuity(incomePerPeriod, rpp, gpp, totalPeriods)
      : (rpp > 0 ? incomePerPeriod * (1-Math.pow(1+rpp,-totalPeriods))/rpp : incomePerPeriod*totalPeriods);
    startCorpus = p.delayOn && p.delayMonths > 0
      ? corpusNeeded / Math.pow(1+p.delayRate/100, p.delayMonths/12)
      : corpusNeeded;
    if(p.delayOn) document.getElementById('swpCorpusAfterDelay').textContent = '₹'+fmtINR(Math.round(corpusNeeded));
    const sim = runSWPSim(Math.round(corpusNeeded), p.rate, freqCfg.n, incomePerPeriod, p.stepup, totalPeriods);
    window._swpLastSim = {sim, p, freqCfg, startCorpus:Math.round(corpusNeeded), totalPeriods, corpusNow:Math.round(startCorpus)};
    renderSWPIncomeMode(p, sim, freqCfg, Math.round(corpusNeeded), Math.round(startCorpus), totalPeriods);
  }
  updateJourneyStrip(p, freqCfg);
}

function updateJourneyStrip(p, freqCfg){
  const delayEl = document.getElementById('swpJourneyDelay');
  const arrowEl = document.getElementById('swpJourneyArrow1');
  const corpusEl = document.getElementById('swpJourneyCorpus');
  const noteEl = document.getElementById('swpJourneyCorpusNote');
  if(p.mode==='haveCorpus'){
    corpusEl.textContent = '₹'+fmtINR(p.corpus);
    noteEl.textContent   = 'Initial corpus';
  } else {
    corpusEl.textContent = '₹'+fmtINR(Math.round(p.targetIncome))+'/mo';
    noteEl.textContent   = 'Target income';
  }
  if(p.delayOn && p.delayMonths > 0){
    delayEl.classList.add('shown'); arrowEl.classList.add('shown');
    const yrs = p.delayMonths/12;
    const corpus2 = p.mode==='haveCorpus'
      ? p.corpus * Math.pow(1+p.delayRate/100, yrs)
      : null;
    document.getElementById('swpJourneyDelayVal').textContent = corpus2 ? '₹'+fmtINR(Math.round(corpus2)) : p.delayMonths+'mo';
    document.getElementById('swpJourneyDelayNote').textContent = yrs.toFixed(1)+' yr delay @ '+p.delayRate+'%';
  } else {
    delayEl.classList.remove('shown'); arrowEl.classList.remove('shown');
  }
  const wdVal = p.mode==='haveCorpus' ? '₹'+fmtINR(p.withdrawal)+'/mo' : '₹'+fmtINR(p.targetIncome)+'/mo';
  document.getElementById('swpJourneyWithdraw').textContent = wdVal;
  const dMonths = p.durationUnit==='months' ? p.durationVal : p.durationVal*12;
  document.getElementById('swpJourneyWithdrawNote').textContent = (dMonths/12).toFixed(1)+' yr payout via '+freqCfg.plbl.toLowerCase();
}

function renderSWPCorpusMode(p, sim, freqCfg, startCorpus, totalPeriods){
  const {snaps, depleted, totalWithdrawn, finalCorpus} = sim;
  const survives = depleted < 0;
  const annualIncome = p.withdrawal * 12;
  const yieldPct = (annualIncome/startCorpus*100).toFixed(2);
  const durationYrs = p.durationUnit==='months' ? p.durationVal/12 : p.durationVal;

  // Fuel gauge
  const healthPct = survives ? Math.min(100, finalCorpus/startCorpus*100) : Math.max(0, (depleted||0)/durationYrs*100);
  const fuelColor = survives ? 'linear-gradient(90deg,#00897b,#26a69a,#4db6ac)' : healthPct>60 ? 'linear-gradient(90deg,#f57f17,#fb8c00,#ffa726)' : 'linear-gradient(90deg,#b71c1c,#e53935,#ef5350)';
  document.getElementById('swpFuel').style.display = 'block';
  document.getElementById('swpFuelFill').style.width = Math.max(2, healthPct)+'%';
  document.getElementById('swpFuelFill').style.background = fuelColor;
  document.getElementById('swpFuelPct').textContent = Math.round(healthPct)+'%';
  document.getElementById('swpFuelStats').innerHTML = [
    {v:'₹'+fmtINR(startCorpus), l:'Starting Corpus'},
    {v:'₹'+fmtINR(Math.round(p.withdrawal*(12/freqCfg.n)))+'/'+freqCfg.lbl, l:'Per '+freqCfg.plbl+' Payout'},
    {v:survives?'✅ Outlasts '+durationYrs.toFixed(0)+'Y':'⚠️ Yr '+(depleted).toFixed(1), l:'Status'},
    {v:'₹'+fmtINR(totalWithdrawn), l:'Total Withdrawn'},
    {v:survives?'₹'+fmtINR(finalCorpus):'₹0', l:'Remaining'},
  ].map(s=>`<div class="swp-fuel-stat"><div class="swp-fuel-stat-val">${s.v}</div><div class="swp-fuel-stat-lbl">${s.l}</div></div>`).join('');

  // Real value (inflation adjusted)
  const realPct = (annualIncome / Math.pow(1+p.inflation/100, durationYrs/2) / startCorpus * 100).toFixed(2);
  const sustWithdrawal = startCorpus * p.rate/100 / 12;
  const perpetualW = startCorpus * (p.rate/100) / freqCfg.n;

  // Stat grid
  document.getElementById('swpStatGrid').style.display = 'grid';
  document.getElementById('swpStatGrid').innerHTML = [
    {l:'Annual Income',v:'₹'+fmtINR(annualIncome),s:yieldPct+'% of corpus',c:'highlight'},
    {l:'Corpus Yield',v:yieldPct+'% p.a.',s:'withdrawal / corpus',c:''},
    {l:'Sustainable Withdrawal',v:'₹'+fmtINR(Math.round(sustWithdrawal))+'/mo',s:'corpus never depletes',c:''},
    {l:'Inflation Adj. Yield',v:realPct+'% p.a.',s:'real return at '+p.inflation+'% inflation',c:''},
    {l:survives?'Surplus Corpus':'Depletion Year',v:survives?'₹'+fmtINR(finalCorpus):'Year '+(depleted).toFixed(1),s:survives?'after '+durationYrs.toFixed(0)+' years':'corpus hits ₹0',c:survives?'highlight':'danger'},
    {l:'Total Withdrawn',v:'₹'+fmtINR(totalWithdrawn),s:'over '+durationYrs.toFixed(0)+' years',c:''},
    {l:'Wealth Multiple',v:((totalWithdrawn+finalCorpus)/startCorpus).toFixed(2)+'x',s:'(withdrawn+remaining)/corpus',c:''},
    {l:'Perpetual Payout',v:'₹'+fmtINR(Math.round(perpetualW))+'/'+freqCfg.lbl,s:'withdraw only returns',c:'warn'},
  ].map(s=>`<div class="swp-stat ${s.c}"><div class="swp-stat-label">${s.l}</div><div class="swp-stat-val">${s.v}</div><div class="swp-stat-sub">${s.s}</div></div>`).join('');

  // Result cards
  document.getElementById('swpResultCards').style.display = 'grid';
  const cards = [
    {bg:'#e0f2f1',border:'#80cbc4',accent:'#00695c',tc:'#004d40',icon:'💰',lbl:'Monthly Payout',
     val:'₹'+fmtINR(p.withdrawal),sub:'per month · '+freqCfg.plbl+' withdrawals',
     rows:[['Annual Income','₹'+fmtINR(annualIncome)],[p.stepup>0?'Annual Step-up':'No Step-up',p.stepup>0?p.stepup+'% p.a.':'Fixed withdrawal'],['Frequency',freqCfg.plbl]]},
    {bg:survives?'#e8f5e9':'#fbe9e7',border:survives?'#a5d6a7':'#ffab91',accent:survives?'#2e7d32':'#bf360c',tc:survives?'#1b5e20':'#b71c1c',
     icon:survives?'🏆':'⚠️',lbl:survives?'Corpus Health: Strong':'Corpus Alert',
     val:survives?'₹'+fmtINR(finalCorpus):'Year '+(depleted).toFixed(1),
     sub:survives?'remaining after '+durationYrs.toFixed(0)+' yrs':'depletes at this point',
     rows:[['Total Withdrawn','₹'+fmtINR(totalWithdrawn)],['Starting Corpus','₹'+fmtINR(startCorpus)],['Wealth Multiple',((totalWithdrawn+finalCorpus)/startCorpus).toFixed(2)+'x']]},
    {bg:'#fff8e1',border:'#ffe082',accent:'#f57f17',tc:'#e65100',icon:'📊',lbl:'Break-even Analysis',
     val:yieldPct+'% p.a.',sub:'your annual withdrawal yield',
     rows:[['Your Return',p.rate+'% p.a.'],['Perpetual Payout','₹'+fmtINR(Math.round(perpetualW))+'/'+freqCfg.lbl],['Surplus Return',Math.max(0,p.rate-parseFloat(yieldPct)).toFixed(2)+'% p.a.']]},
  ];
  document.getElementById('swpResultCards').innerHTML = cards.map(c=>`
    <div class="swp-rcard" style="background:${c.bg};border-color:${c.border}">
      <div class="swp-rcard-accent" style="background:${c.accent}"></div>
      <div class="swp-rc-label" style="color:${c.accent}">${c.icon} ${c.lbl}</div>
      <div class="swp-rc-val" style="color:${c.tc};font-size:${c.val.length>14?'1.1rem':'1.5rem'}">${c.val}</div>
      <div class="swp-rc-sub" style="color:${c.accent}">${c.sub}</div>
      ${c.rows.map(([k,v])=>`<div class="swp-row"><span class="swp-row-key" style="color:${c.tc};opacity:.75">${k}</span><span class="swp-row-val" style="color:${c.tc}">${v}</span></div>`).join('')}
    </div>`).join('');

  // Longevity bars (different withdrawal rates)
  document.getElementById('swpRunwaySection').style.display = 'block';
  const multiples = [{m:.5,tag:'50%'},{m:.75,tag:'75%'},{m:1,tag:'Current'},{m:1.25,tag:'125%'},{m:1.5,tag:'150%'},{m:2,tag:'200%'}];
  const wPerPeriod = p.withdrawal * (12/freqCfg.n);
  document.getElementById('swpRunwayBars').innerHTML = multiples.map(({m,tag})=>{
    const w = wPerPeriod * m;
    const {depleted:d} = runSWPSim(startCorpus, p.rate, freqCfg.n, w, p.stepup, 80*freqCfg.n);
    const durNum = d > 0 ? d : 80;
    const durStr = d > 0 ? d.toFixed(1)+' yrs' : '80+ yrs';
    const pct = Math.min(100, durNum/80*100);
    const col = durNum>=40?'#2e7d32':durNum>=20?'#f57f17':'#b71c1c';
    const isCurrent = m === 1;
    return `<div class="swp-runway-row" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div class="swp-runway-label" style="font-size:.64rem;font-weight:${isCurrent?800:600};min-width:160px;color:${isCurrent?'var(--g1)':'var(--text2)'};flex-shrink:0">${tag}: ₹${fmtINR(Math.round(w))}/mo</div>
      <div class="swp-runway-bar-wrap swp-runway-bar" style="flex:1"><div class="swp-runway-fill" style="width:${pct}%;background:${col}"></div></div>
      <div class="swp-runway-val" style="font-family:'JetBrains Mono',monospace;font-size:.72rem;font-weight:700;min-width:65px;text-align:right;color:${col}">${durStr}</div>
    </div>`;
  }).join('');

  // Smart insights
  document.getElementById('swpInsights').style.display = 'grid';
  const insights = [
    {icon:'🎯',title:'Withdrawal Rate',val:yieldPct+'%',desc:parseFloat(yieldPct)<4?'Conservative — corpus likely to grow':'Above 4% safe withdrawal rate threshold'},
    {icon:'🔮',title:'Real Corpus @ Midpoint',val:'₹'+fmtINR(Math.round(startCorpus/Math.pow(1+p.inflation/100,durationYrs/2))),desc:'Inflation-adjusted corpus value at '+Math.round(durationYrs/2)+' years'},
    {icon:p.stepup>0?'📈':'➡️',title:p.stepup>0?'Step-up Strategy':'Tip: Add Step-up',val:p.stepup>0?p.stepup+'% p.a. step-up':'Enable for inflation hedge',desc:p.stepup>0?'Your payout increases annually — protecting real income':'Set annual step-up to protect purchasing power over time'},
  ];
  document.getElementById('swpInsights').innerHTML = insights.map(s=>`
    <div class="swp-insight">
      <div class="swp-insight-icon">${s.icon}</div>
      <div class="swp-insight-title">${s.title}</div>
      <div class="swp-insight-val">${s.val}</div>
      <div class="swp-insight-desc">${s.desc}</div>
    </div>`).join('');

  document.getElementById('swpChartSection').style.display = 'block';
  drawSWPChart({sim, p, freqCfg, startCorpus, totalPeriods});
}

function renderSWPIncomeMode(p, sim, freqCfg, corpusNeeded, corpusNow, totalPeriods){
  const annualIncome = p.targetIncome * 12;
  const durationYrs  = (p.durationUnit==='months' ? p.durationVal : p.durationVal*12) / 12;
  const totalIncome  = sim.totalWithdrawn;
  const yieldPct     = (annualIncome/corpusNeeded*100).toFixed(2);

  document.getElementById('swpFuel').style.display = 'block';
  document.getElementById('swpFuelFill').style.width = '100%';
  document.getElementById('swpFuelFill').style.background = 'linear-gradient(90deg,#00897b,#26a69a,#4db6ac)';
  document.getElementById('swpFuelPct').textContent = '100%';
  document.getElementById('swpFuelStats').innerHTML = [
    {v:'₹'+fmtINR(corpusNow), l:p.delayOn?'Invest Today':'Corpus Needed'},
    {v:'₹'+fmtINR(corpusNeeded), l:p.delayOn?'Corpus at Withdrawal Start':'Required Corpus'},
    {v:'₹'+fmtINR(Math.round(annualIncome))+'/yr', l:'Annual Income'},
    {v:durationYrs.toFixed(0)+' years', l:'Income Duration'},
    {v:'₹'+fmtINR(Math.round(totalIncome)), l:'Total Payout'},
  ].map(s=>`<div class="swp-fuel-stat"><div class="swp-fuel-stat-val">${s.v}</div><div class="swp-fuel-stat-lbl">${s.l}</div></div>`).join('');

  document.getElementById('swpStatGrid').style.display = 'grid';
  document.getElementById('swpStatGrid').innerHTML = [
    {l:p.delayOn?'Invest Now':'Corpus Required',v:'₹'+fmtINR(corpusNow),s:p.delayOn?'grows to ₹'+fmtINR(corpusNeeded)+' in '+p.delayMonths/12+'Y':'lumpsum to deploy',c:'highlight'},
    {l:'Corpus at Withdrawal Start',v:'₹'+fmtINR(corpusNeeded),s:'after '+(p.delayOn?(p.delayMonths/12).toFixed(1)+'Y delay':'no delay'),c:''},
    {l:'Monthly Payout',v:'₹'+fmtINR(p.targetIncome),s:freqCfg.plbl+' withdrawals',c:'highlight'},
    {l:'Corpus Yield',v:yieldPct+'% p.a.',s:'annual withdrawal rate',c:''},
    {l:'Total Income',v:'₹'+fmtINR(Math.round(totalIncome)),s:'over '+durationYrs.toFixed(0)+' years',c:''},
    {l:'Wealth Multiple',v:(totalIncome/corpusNeeded).toFixed(2)+'x',s:'income / corpus',c:'warn'},
    {l:'Surplus Return',v:Math.max(0,p.rate-parseFloat(yieldPct)).toFixed(2)+'% p.a.',s:'corpus growth buffer',c:''},
    {l:p.stepup>0?'Final Monthly Payout':'Income Type',v:p.stepup>0?'₹'+fmtINR(Math.round(p.targetIncome*Math.pow(1+p.stepup/100,durationYrs)))+'/mo':'Fixed income',s:p.stepup>0?'after '+p.stepup+'% step-up for '+durationYrs.toFixed(0)+'Y':'no annual increase',c:''},
  ].map(s=>`<div class="swp-stat ${s.c}"><div class="swp-stat-label">${s.l}</div><div class="swp-stat-val">${s.v}</div><div class="swp-stat-sub">${s.s}</div></div>`).join('');

  document.getElementById('swpResultCards').style.display = 'grid';
  const cards = [
    {bg:'#e0f2f1',border:'#80cbc4',accent:'#00695c',tc:'#004d40',icon:'🎯',lbl:p.delayOn?'Invest Today':'Corpus Required',
     val:'₹'+fmtINR(corpusNow),sub:p.delayOn?'lumpsum → grows to ₹'+fmtINR(corpusNeeded):'deploy as lumpsum',
     rows:[['Annual Withdrawal','₹'+fmtINR(Math.round(annualIncome))],['Corpus Yield',yieldPct+'% p.a.'],[p.delayOn?'Delay':'Duration',p.delayOn?(p.delayMonths/12).toFixed(1)+' years':durationYrs.toFixed(0)+' years']]},
    {bg:'#e8f5e9',border:'#a5d6a7',accent:'#2e7d32',tc:'#1b5e20',icon:'💸',lbl:'Total Income Generated',
     val:'₹'+fmtINR(Math.round(totalIncome)),sub:'₹'+fmtINR(p.targetIncome)+'/month for '+durationYrs.toFixed(0)+' years',
     rows:[['Per '+freqCfg.lbl,'₹'+fmtINR(Math.round(p.targetIncome*(12/freqCfg.n)))],[p.stepup>0?'Step-up':'Fixed Income',p.stepup>0?p.stepup+'% p.a.':'No annual increase'],['Wealth Multiple',(totalIncome/corpusNeeded).toFixed(2)+'x']]},
    {bg:'#fff8e1',border:'#ffe082',accent:'#f57f17',tc:'#e65100',icon:'📊',lbl:'Yield & Return',
     val:yieldPct+'%',sub:'annual withdrawal yield on corpus',
     rows:[['Expected Return',p.rate+'% p.a.'],['Surplus',Math.max(0,p.rate-parseFloat(yieldPct)).toFixed(2)+'% growth buffer'],['Inflation',p.inflation+'% p.a.']]},
  ];
  document.getElementById('swpResultCards').innerHTML = cards.map(c=>`
    <div class="swp-rcard" style="background:${c.bg};border-color:${c.border}">
      <div class="swp-rcard-accent" style="background:${c.accent}"></div>
      <div class="swp-rc-label" style="color:${c.accent}">${c.icon} ${c.lbl}</div>
      <div class="swp-rc-val" style="color:${c.tc};font-size:${c.val.length>14?'1.1rem':'1.5rem'}">${c.val}</div>
      <div class="swp-rc-sub" style="color:${c.accent}">${c.sub}</div>
      ${c.rows.map(([k,v])=>`<div class="swp-row"><span class="swp-row-key" style="color:${c.tc};opacity:.75">${k}</span><span class="swp-row-val" style="color:${c.tc}">${v}</span></div>`).join('')}
    </div>`).join('');

  document.getElementById('swpRunwaySection').style.display = 'none';

  document.getElementById('swpInsights').style.display = 'grid';
  document.getElementById('swpInsights').innerHTML = [
    {icon:'🎯',title:'Required Corpus',val:'₹'+fmtINR(corpusNow),desc:p.delayOn?'Invest this now — it compounds to the full amount before withdrawals begin':'Deploy this as a lumpsum to fund your income plan'},
    {icon:'📈',title:'Effective Yield',val:yieldPct+'%',desc:parseFloat(yieldPct)<4?'Conservative plan — low depletion risk':'Ensure returns consistently exceed this yield'},
    {icon:'💡',title:p.stepup>0?'Step-up Enabled':'Inflation Risk',val:p.stepup>0?p.stepup+'% / yr':'Enable step-up',desc:p.stepup>0?'Your real income stays protected over time':'Without step-up, ₹'+fmtINR(p.targetIncome)+' today = ₹'+fmtINR(Math.round(p.targetIncome/Math.pow(1+p.inflation/100,durationYrs)))+' real value in '+durationYrs.toFixed(0)+' yrs'},
  ].map(s=>`<div class="swp-insight"><div class="swp-insight-icon">${s.icon}</div><div class="swp-insight-title">${s.title}</div><div class="swp-insight-val">${s.val}</div><div class="swp-insight-desc">${s.desc}</div></div>`).join('');

  document.getElementById('swpChartSection').style.display = 'block';
  drawSWPChart({sim, p, freqCfg, startCorpus:corpusNeeded, totalPeriods});
}

function drawSWPChart(bundle){
  if(!bundle) return;
  if(swpChartInst){ swpChartInst.destroy(); swpChartInst=null; }
  const {sim:{snaps}, p, freqCfg, startCorpus} = bundle;

  // Build delay arc
  const delaySnaps = [];
  if(p.delayOn && p.delayMonths > 0){
    const steps = Math.min(p.delayMonths, 24);
    const baseC = p.mode==='haveCorpus' ? p.corpus : (bundle.corpusNow||startCorpus);
    for(let i=0; i<=steps; i++){
      const months = p.delayMonths * i/steps;
      delaySnaps.push({label:'D+'+months.toFixed(0)+'M', val:Math.round(baseC*Math.pow(1+p.delayRate/100,months/12))});
    }
  }
  const wLabels = snaps.map(s=>s.period===0?(p.delayOn?'W-Start':'Now'):'Y'+s.period);
  const allLabels = p.delayOn&&delaySnaps.length ? [...delaySnaps.slice(0,-1).map(d=>d.label), ...wLabels] : wLabels;
  const off = p.delayOn&&delaySnaps.length ? delaySnaps.length-1 : 0;
  const pad = arr => [...Array(off).fill(null), ...arr];

  const delayDs = p.delayOn&&delaySnaps.length ? [{
    label:'⏳ Delay Growth', data:[...delaySnaps.slice(0,-1).map(d=>d.val), ...Array(wLabels.length).fill(null)],
    borderColor:'#42a5f5', backgroundColor:'rgba(66,165,245,.07)',
    borderWidth:2, borderDash:[6,4], pointRadius:0, tension:.4, fill:true, order:4
  }] : [];

  const showCorpus    = swpChartView !== 'withdrawn';
  const showWithdrawn = swpChartView !== 'corpus';

  const datasets = [
    ...delayDs,
    showCorpus && {
      label:'💰 Remaining Corpus', data:pad(snaps.map(s=>s.corpus)),
      borderColor:'#00897b', backgroundColor:'rgba(0,137,123,.1)',
      borderWidth:2.5, pointRadius:0, pointHoverRadius:5, tension:.3, fill:true, order:1
    },
    showWithdrawn && {
      label:'💸 Total Withdrawn', data:pad(snaps.map(s=>s.totalWithdrawn)),
      borderColor:'#ef5350', backgroundColor:'rgba(239,83,80,.06)',
      borderWidth:1.8, pointRadius:0, pointHoverRadius:4, tension:.3, fill:false, order:2
    },
    {
      label:'— Starting Corpus', data:Array(allLabels.length).fill(Math.round(startCorpus)),
      borderColor:'rgba(150,150,150,.3)', backgroundColor:'transparent',
      borderWidth:1, borderDash:[4,4], pointRadius:0, tension:0, order:5
    },
  ].filter(Boolean);

  swpChartInst = new Chart(document.getElementById('swpChart').getContext('2d'), {
    type:'line', data:{labels:allLabels, datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{
        legend:{position:'top',labels:{color:'#2e4d2e',font:{family:'Raleway',weight:'700',size:11},usePointStyle:true,padding:20,boxWidth:8}},
        tooltip:{backgroundColor:'#162616',borderColor:'#00695c',borderWidth:1,
          titleFont:{family:'JetBrains Mono',size:11},bodyFont:{family:'JetBrains Mono',size:12},
          padding:13,cornerRadius:8,callbacks:{label:c=>`  ${c.dataset.label}: ₹${fmtINR(c.parsed.y)}`}}
      },
      scales:{
        x:{grid:{display:false},border:{color:'#80cbc4'},ticks:{font:{family:'JetBrains Mono',size:10},color:'#00695c',maxTicksLimit:10}},
        y:{grid:{color:'rgba(128,203,196,.25)'},border:{color:'#80cbc4'},ticks:{font:{family:'JetBrains Mono',size:10},color:'#00695c',callback:v=>'₹'+fmtINR(v)}}
      }
    }
  });
}

function printSWP(){
  const fuelHTML   = document.getElementById('swpFuel').outerHTML;
  const statsHTML  = document.getElementById('swpStatGrid').outerHTML;
  const cardsHTML  = document.getElementById('swpResultCards').outerHTML;
  const chartImg   = document.getElementById('swpChart')?document.getElementById('swpChart').toDataURL('image/png'):'';
  const runwayEl   = document.getElementById('swpRunwaySection');
  const runwayHTML = runwayEl&&runwayEl.style.display!=='none'?runwayEl.outerHTML:'';
  const insightEl  = document.getElementById('swpInsights');
  const insightHTML= insightEl&&insightEl.style.display!=='none'?insightEl.outerHTML:'';

  const win = window.open('','_blank','width=940,height=720');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SIP &amp; SWP NAV Backtester, MF Comparison, Goal Planner &amp; EMI | Abundance</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #00695c;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#00695c}.pa{font-size:.6rem;color:#00695c;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#00695c;margin:12px 0 7px;display:flex;align-items:center;gap:7px}
.sec::after{content:'';flex:1;height:1px;background:#80cbc4}
.swp-fuel{background:linear-gradient(135deg,#1a3a2a,#1e4530);border-radius:12px;padding:16px 20px;margin-bottom:12px}
.swp-fuel-label{font-size:.55rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#80cbc4;margin-bottom:10px}
.swp-fuel-track{height:12px;background:rgba(255,255,255,.1);border-radius:6px;overflow:hidden;margin-bottom:8px}.swp-fuel-fill{height:100%;border-radius:6px}
.swp-fuel-stats{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}.swp-fuel-stat{text-align:center}
.swp-fuel-stat{text-align:center;min-width:80px}
.swp-fuel-stat-val{font-family:"JetBrains Mono",monospace;font-size:.82rem;font-weight:700;color:#e0f2f1}.swp-fuel-stat-lbl{font-size:.52rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:rgba(128,203,196,.7);margin-top:1px}
.swp-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.swp-stat{background:#f5f5f5;border:1.5px solid #e0e0e0;border-radius:9px;padding:10px 12px;text-align:center}
.swp-stat.highlight{background:#e0f2f1;border-color:#80cbc4}.swp-stat.highlight .swp-stat-val{color:#00695c}
.swp-stat.warn{background:#fff8e1;border-color:#ffe082}.swp-stat.warn .swp-stat-val{color:#e65100}
.swp-stat.danger{background:#ffebee;border-color:#ef9a9a}.swp-stat.danger .swp-stat-val{color:#b71c1c}
.swp-stat-label{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:4px}
.swp-stat-val{font-family:"JetBrains Mono",monospace;font-size:.9rem;font-weight:700;line-height:1.1}
.swp-stat-sub{font-size:.54rem;color:#999;margin-top:2px}
.swp-result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.swp-rcard{border-radius:10px;padding:14px;position:relative;overflow:hidden;border:1.5px solid}
.swp-rcard-accent{position:absolute;top:0;left:0;width:3px;bottom:0}
.swp-rc-label{font-size:.54rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;display:flex;align-items:center;gap:6px}
.swp-rc-val{font-family:"JetBrains Mono",monospace;font-size:.95rem;font-weight:800;line-height:1.1;margin-bottom:2px}
.swp-rc-sub{font-size:.56rem;font-family:"JetBrains Mono",monospace;margin-bottom:9px}
.swp-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.6rem}.swp-row:last-child{border-bottom:none}
.swp-row-key{opacity:.75}.swp-row-val{font-family:"JetBrains Mono",monospace;font-weight:600}
.swp-runway-bar{height:9px;background:#e0f2f1;border-radius:5px;overflow:hidden;margin:5px 0}
.swp-runway-fill{height:100%;border-radius:5px}
.swp-insight-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.swp-insight{background:#f5f5f5;border:1.5px solid #e0e0e0;border-radius:9px;padding:12px}
.swp-insight-icon{font-size:1.2rem;margin-bottom:4px}.swp-insight-title{font-size:.54rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:3px}
.swp-insight-val{font-family:"JetBrains Mono",monospace;font-size:.9rem;font-weight:700;margin-bottom:3px}.swp-insight-desc{font-size:.6rem;color:#666;line-height:1.5}
.ci img{width:100%;border-radius:8px;border:1px solid #80cbc4}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:12px}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}}
</style></head><body>
<div class="ph"><div><div class="pt">SWP — Systematic Withdrawal Plan</div><div class="pa">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds Distributor &amp; SIF Distributor</div></div><img class="logo" src="/logo-og.png" onerror="this.style.display='none'"></div>
<div class="sec">Corpus Health</div>${fuelHTML}
<div class="sec">Statistics</div>${statsHTML}
<div class="sec">Analysis</div>${cardsHTML}
${runwayHTML?`<div class="sec">Longevity Comparison</div>${runwayHTML}`:''}
${insightHTML?`<div class="sec">Smart Insights</div>${insightHTML}`:''}
${chartImg?`<div class="sec">Projection</div><div class="ci"><img src="${chartImg}"></div>`:''}
<div class="dis">⚠️ <strong style="color:#e65100">Disclaimer:</strong> Mutual fund investments are subject to market risks. Past performance is not indicative of future returns. Projections are illustrative only and do not constitute financial advice. Consult your financial advisor before investing. | ARN-251838`);
  win.document.close();
  win.onload = ()=>setTimeout(()=>{win.focus();win.print();},600);
  setTimeout(()=>{try{win.focus();win.print();}catch(e){}},1200);
}



// ════════════════════════════════════════
//  SWP NAV BACKTESTER
// ════════════════════════════════════════
let btFundData = null;   // {code, name, navMap: {YYYY-MM: navValue}}
let _btFetchSeq = 0;      // guards against race conditions between concurrent fund fetches
let btChartInst = null;
let btSearchTimer = null;

// ── Override setSWPMode to handle backtest tab ──
function setSWPMode(mode, btn){
  swpCurrentMode = mode;
  document.querySelectorAll('.swp-mode-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('swpPanelCorpus').classList.toggle('active', mode==='haveCorpus');
  document.getElementById('swpPanelIncome').classList.toggle('active', mode==='needIncome');
  document.getElementById('swpPanelBacktest').classList.toggle('active', mode==='backtest');

  const isBacktest = mode === 'backtest';

  // Shared sections (journey strip, delay box, all results): hide in backtest mode
  const SHARED = ['swpDelayBox','swpJourney','swpFuel','swpStatGrid','swpResultCards','swpRunwaySection','swpInsights','swpChartSection'];
  SHARED.forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });

  // Show/hide top Save PDF button — only relevant for projected modes
  const swpPrintBtn = document.getElementById('swpPrintBtn');
  if(swpPrintBtn) swpPrintBtn.style.display = isBacktest ? 'none' : '';

  if(isBacktest){
    btRun();
  } else {
    // Restore journey and delay box visibility for projected modes
    const journey=document.getElementById('swpJourney'); if(journey) journey.style.display='';
    const delayBox=document.getElementById('swpDelayBox'); if(delayBox) delayBox.style.display='';
    calcSWP();
  }
}

// ── Delay toggle ──
function btToggleDelay(){
  const on = document.getElementById('btDelayToggle').checked;
  document.getElementById('btDelayPanel').style.display = on ? 'block' : 'none';
  dBtRun();
}

// ── Debounce ──
function dBtRun(){ clearTimeout(btSearchTimer); btSearchTimer = setTimeout(btRun, 300); }

// ── Fund search for backtester ──
let btSearchTimer2=null, btSearchAbort=null;
function btOnSearch(q){
  const dd = document.getElementById('btDropdown');
  if(!q || q.length < 2){ dd.classList.remove('open'); return; }
  clearTimeout(btSearchTimer2);
  btSearchTimer2 = setTimeout(()=>btDoSearch(q), 300);
}
async function btDoSearch(q){
  const dd = document.getElementById('btDropdown');
  dd.innerHTML = '<div class="dropdown-loading">Searching…</div>';
  dd.classList.add('open');
  if(btSearchAbort){ btSearchAbort.abort(); }
  btSearchAbort = new AbortController();
  try{
    const res = await fetch('/api/mf?q='+encodeURIComponent(q), {signal:btSearchAbort.signal});
    const data = await res.json();
    if(!data || !data.length){ dd.innerHTML='<div class="dropdown-loading">No results found</div>'; return; }
    // Same filter + rank as Fund Comparison renderSearchResults
    const hideDeadAMC = !deadAMCQueried(q);
    const filtered = data.filter(f=>!/direct/i.test(f.schemeName)&&(!hideDeadAMC||!isDeadAMC(f.schemeName)));
    const ranked   = filtered.slice().sort((a,b)=>fundRank(a)-fundRank(b));
    const results  = ranked.slice(0,25);
    const ql = q.toLowerCase();
    function btHighlight(name){
      const i=name.toLowerCase().indexOf(ql);
      if(i<0) return name;
      return name.slice(0,i)+'<mark style="background:rgba(67,160,71,.18);color:var(--g1);border-radius:2px;padding:0 1px">'+name.slice(i,i+q.length)+'</mark>'+name.slice(i+q.length);
    }
    if(!results.length){ dd.innerHTML='<div class="dropdown-loading">No results (try without "Regular")</div>'; return; }
    dd.innerHTML = '<div class="dd-count">'+results.length+' of '+filtered.length+' results</div>'+
      results.map(f=>`<div class="dropdown-item" onclick="btSelectFund(${f.schemeCode},'${f.schemeName.replace(/'/g,"\'")}')"><span style="flex:1;min-width:0;white-space:normal;word-break:break-word">${btHighlight(f.schemeName)}</span><span class="di-code">${f.schemeCode}</span></div>`).join('');
  }catch(e){
    if(e.name!=='AbortError') dd.innerHTML='<div class="dropdown-loading">⚠️ Search failed. Check connection.</div>';
  }
}
document.addEventListener('click', e=>{
  if(!e.target.closest('#swpPanelBacktest'))
    document.getElementById('btDropdown')?.classList.remove('open');
  if(!e.target.closest('#sipBTPanel'))
    document.getElementById('sipBTDropdown')?.classList.remove('open');
});

async function btSelectFund(code, name){
  document.getElementById('btDropdown').classList.remove('open');
  document.getElementById('btFundInput').value = '';
  document.getElementById('btFundName').textContent = name;
  document.getElementById('btFundChipWrap').style.display = 'block';
  document.getElementById('btEmpty').textContent = 'Loading NAV data…';
  document.getElementById('btEmpty').style.display = 'block';
  document.getElementById('btWhatIfWrap').style.display = 'none';

  try{
    const _mySeq = ++_btFetchSeq;
    const res = await fetch('/api/mf?code='+code);
    const json = await res.json();
    if (_mySeq !== _btFetchSeq) return; // newer fund request superseded this one
    const navRaw = json.data; // [{date:'DD-MM-YYYY', nav:'123.45'}, ...]
    // Build navMap: YYYY-MM → last NAV of that month
    const navMap = {};
    navRaw.forEach(d=>{
      const [dd,mm,yyyy] = d.date.split('-');
      const key = yyyy+'-'+mm;
      // mfapi returns newest first; we want last available NAV per month
      // Since it's newest-first, first occurrence of each month is the last trading day
      if(!navMap[key]) navMap[key] = parseFloat(d.nav);
    });
    btFundData = {code, name, navMap};
    btBuildDateDropdowns();
    btRun();
  }catch(e){
    document.getElementById('btEmpty').textContent = 'Failed to load NAV data. Try again.';
  }
}

function btClearFund(){
  btFundData = null;
  document.getElementById('btFundChipWrap').style.display = 'none';
  document.getElementById('btFundName').textContent = '—';
  document.getElementById('btEmpty').textContent = 'Search and select a fund to run the backtest';
  document.getElementById('btEmpty').style.display = 'block';
  document.getElementById('btWhatIfWrap').style.display = 'none';
  // Hide SWP result sections
  ['swpFuel','swpStatGrid','swpResultCards','swpRunwaySection','swpInsights','swpChartSection'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  if(btChartInst){btChartInst.destroy();btChartInst=null;}
}

// Build year + month dropdowns constrained to available NAV data
function btBuildDateDropdowns(){
  if(!btFundData) return;
  const keys = Object.keys(btFundData.navMap).sort(); // YYYY-MM ascending
  const years = [...new Set(keys.map(k=>k.slice(0,4)))];
  const lastYear = parseInt(years[years.length-1]);
  const defaultStartYear = Math.max(parseInt(years[0]), lastYear - 5);

  // Start year
  const ySel = document.getElementById('btStartYear');
  ySel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
  ySel.value = String(defaultStartYear);
  btUpdateMonths();

  // End year — all available years, default = last
  const yeYSel = document.getElementById('btEndYear');
  yeYSel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
  yeYSel.value = String(lastYear);
  btUpdateEndMonths();
}

function btUpdateMonths(){
  if(!btFundData) return;
  const year = document.getElementById('btStartYear').value;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const availableMonths = Object.keys(btFundData.navMap)
    .filter(k=>k.startsWith(year))
    .map(k=>parseInt(k.slice(5))-1);
  const mSel = document.getElementById('btStartMonth');
  mSel.innerHTML = availableMonths.map(m=>`<option value="${m+1}">${MONTHS[m]}</option>`).join('');
}

function btUpdateEndMonths(){
  if(!btFundData) return;
  const year = document.getElementById('btEndYear').value;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const availableMonths = Object.keys(btFundData.navMap)
    .filter(k=>k.startsWith(year))
    .map(k=>parseInt(k.slice(5))-1);
  const mSel = document.getElementById('btEndMonth');
  mSel.innerHTML = availableMonths.map(m=>`<option value="${m+1}">${MONTHS[m]}</option>`).join('');
  // Default to last available month of the year
  if(mSel.options.length) mSel.selectedIndex = mSel.options.length - 1;
}

// ── Core backtest engine ──
// Returns snaps array + stats, using actual monthly NAVs
function runNAVBacktest(navMap, startYear, startMonth, corpus, monthlyWithdrawal, stepupPct, inflationPct, delayMonths, endYear, endMonth){
  // delayMonths: 0 = no delay, N = N months of accumulation before withdrawals start
  delayMonths = delayMonths || 0;

  let units = null;
  let currentWithdrawal = monthlyWithdrawal;
  const snaps = [];
  let totalWithdrawn = 0;
  let depleted = null;
  let month = startMonth, year = startYear;
  let monthsRun = 0;

  // Get NAV for a YYYY-MM, walking forward up to 5 months if missing
  function getNAV(y, m){
    for(let offset=0; offset<5; offset++){
      let mm = m + offset, yy = y;
      if(mm > 12){ mm -= 12; yy++; }
      const key = yy+'-'+String(mm).padStart(2,'0');
      if(navMap[key]) return {nav: navMap[key], key};
    }
    return null;
  }

  // Buy units at start — real NAV on start date
  const startEntry = getNAV(year, month);
  if(!startEntry) return null;
  units = corpus / startEntry.nav;
  snaps.push({
    label: startEntry.key, corpus: Math.round(corpus),
    withdrawn: 0, nav: startEntry.nav,
    units: Math.round(units*100)/100, payout: 0,
    phase: delayMonths > 0 ? 'delay' : 'withdraw'
  });

  const maxMonths = 50 * 12;
  while(monthsRun < maxMonths){
    month++; if(month > 12){ month = 1; year++; }
    monthsRun++;

    // Stop if we've passed the requested end date
    if(endYear && endMonth){
      if(year > endYear || (year === endYear && month > endMonth)) break;
    }
    const entry = getNAV(year, month);
    if(!entry) break;

    if(monthsRun <= delayMonths){
      // ── DELAY PHASE: units just sit invested, NAV changes, no selling ──
      snaps.push({
        label: entry.key,
        corpus: Math.round(units * entry.nav),
        withdrawn: 0, nav: entry.nav,
        units: Math.round(units*100)/100, payout: 0,
        phase: 'delay'
      });
      continue;
    }

    // ── WITHDRAWAL PHASE ──
    // Step-up counts from first withdrawal month
    const withdrawalMonth = monthsRun - delayMonths;
    if(withdrawalMonth % 12 === 0 && stepupPct > 0)
      currentWithdrawal *= (1 + stepupPct/100);

    const corpusNow = units * entry.nav;
    const actualWithdrawal = Math.min(corpusNow, currentWithdrawal);
    const unitsToSell = actualWithdrawal / entry.nav;
    units -= unitsToSell;
    totalWithdrawn += actualWithdrawal;

    snaps.push({
      label: entry.key,
      corpus: Math.round(units * entry.nav),
      withdrawn: Math.round(totalWithdrawn),
      nav: entry.nav,
      units: Math.round(units*100)/100,
      payout: Math.round(actualWithdrawal),
      phase: 'withdraw'
    });

    if(units <= 0){ depleted = withdrawalMonth; break; }
  }

  const finalCorpus = units > 0 ? Math.round(units * snaps[snaps.length-1].nav) : 0;
  const totalMonths = monthsRun;
  const withdrawalMonths = Math.max(0, totalMonths - delayMonths);
  const durationYrs = totalMonths / 12;

  // XIRR: corpus out at t=0, each monthly payout in, final corpus in at end
  const cashflows = [{t: 0, v: -corpus}];
  snaps.slice(1).forEach((s, i) => {
    if(s.payout > 0) cashflows.push({t: (i+1)/12, v: s.payout});
  });
  if(finalCorpus > 0) cashflows.push({t: durationYrs, v: finalCorpus});
  const xirr = cashflows.length > 1 ? calcXIRR(cashflows) : null;

  // Corpus at end of delay (for display)
  const delayEndSnap = delayMonths > 0 ? snaps[Math.min(delayMonths, snaps.length-1)] : null;
  const corpusAfterDelay = delayEndSnap ? delayEndSnap.corpus : corpus;

  return {
    snaps, depleted, totalWithdrawn: Math.round(totalWithdrawn),
    finalCorpus, durationYrs, withdrawalMonths, delayMonths,
    xirr, startNAV: startEntry.nav, corpusAfterDelay
  };
}

// XIRR via Newton-Raphson
function calcXIRR(cashflows, guess=0.1){
  function npv(r){
    return cashflows.reduce((s,cf)=> s + cf.v / Math.pow(1+r, cf.t), 0);
  }
  function dnpv(r){
    return cashflows.reduce((s,cf)=> s - cf.t * cf.v / Math.pow(1+r, cf.t+1), 0);
  }
  let r = guess;
  for(let i=0; i<100; i++){
    const n = npv(r), d = dnpv(r);
    if(Math.abs(d) < 1e-12) break;
    const nr = r - n/d;
    if(Math.abs(nr-r) < 1e-8){ r = nr; break; }
    r = nr;
    if(r < -0.99) r = -0.99;
  }
  return isFinite(r) ? (r*100).toFixed(2) : null;
}


// ── Main backtester render ──
function btRun(){
  if(!btFundData){
    // No fund loaded yet — just ensure shared results stay hidden
    ['swpFuel','swpStatGrid','swpResultCards','swpRunwaySection','swpInsights','swpChartSection']
      .forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
    return;
  }

  const corpus     = Math.max(10000, parseFloat(document.getElementById('btCorpus').value)||5000000);
  const withdrawal = Math.max(100,   parseFloat(document.getElementById('btWithdrawal').value)||30000);
  const stepup     = Math.max(0,     parseFloat(document.getElementById('btStepup').value)||0);
  const inflation  = Math.max(0,     parseFloat(document.getElementById('btInflation').value)||6);
  const startYear  = parseInt(document.getElementById('btStartYear').value);
  const startMonth = parseInt(document.getElementById('btStartMonth').value||1);
  // Delay: read from backtester's own delay inputs — real NAV accumulation
  const delayOn    = document.getElementById('btDelayToggle').checked;
  const delayVal   = delayOn ? Math.max(1, parseFloat(document.getElementById('btDelayVal').value)||3) : 0;
  const delayUnit  = delayOn ? document.getElementById('btDelayUnit').value : 'years';
  const delayMonths = delayOn ? (delayUnit==='months' ? delayVal : delayVal*12) : 0;
  // End date — default is today (last available NAV)
  const endYear  = parseInt(document.getElementById('btEndYear')?.value) || null;
  const endMonth = parseInt(document.getElementById('btEndMonth')?.value) || null;

  // Make sure shared SWP result sections remain hidden
  ['swpFuel','swpStatGrid','swpResultCards','swpRunwaySection','swpInsights','swpChartSection']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });

  document.getElementById('btEmpty').style.display = 'none';

  const result = runNAVBacktest(btFundData.navMap, startYear, startMonth, corpus, withdrawal, stepup, inflation, delayMonths, endYear, endMonth);
  if(!result){
    document.getElementById('btEmpty').textContent = 'No NAV data for selected period';
    document.getElementById('btEmpty').style.display = 'block';
    document.getElementById('btResults').style.display = 'none';
    return;
  }

  document.getElementById('btResults').style.display = 'block';
  // Store raw numbers for btShareURL — avoids parsing formatted strings
  window._btLastResult = result;

  const {snaps, depleted, totalWithdrawn, finalCorpus, durationYrs, withdrawalMonths, xirr, startNAV, corpusAfterDelay} = result;
  const survives = depleted === null;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const startLabel = MONTHS[startMonth-1]+' '+startYear;
  const endSnap = snaps[snaps.length-1];
  const endLabel = endSnap.label.slice(0,4)+' '+MONTHS[parseInt(endSnap.label.slice(5))-1];
  const withdrawalStartLabel = delayMonths > 0
    ? (()=>{ const s=snaps[Math.min(delayMonths,snaps.length-1)]; return s.label.slice(0,4)+' '+MONTHS[parseInt(s.label.slice(5))-1]; })()
    : startLabel;

  // ── Fuel gauge — write into #btFuel ──
  const healthPct = survives ? Math.min(100, finalCorpus/corpus*100) : 0;
  const fuelColor = survives
    ? 'linear-gradient(90deg,#00897b,#26a69a,#4db6ac)'
    : 'linear-gradient(90deg,#b71c1c,#e53935,#ef5350)';
  document.getElementById('btFuelFill').style.width   = Math.max(2, healthPct)+'%';
  document.getElementById('btFuelFill').style.background = fuelColor;
  document.getElementById('btFuelPct').textContent    = Math.round(healthPct)+'%';
  document.getElementById('btFuelStats').innerHTML    = [
    {v:'₹'+fmtINR(corpus),             l:'Starting Corpus'},
    {v:'₹'+fmtINR(withdrawal)+'/mo',   l:'Monthly Withdrawal'},
    {v:survives?'✅ Still going':'⚠️ Depleted mo '+(depleted), l:'Status'},
    {v:'₹'+fmtINR(totalWithdrawn),     l:'Total Withdrawn'},
    {v:survives?'₹'+fmtINR(finalCorpus):'₹0', l:'Remaining'},
  ].map(s=>`<div class="swp-fuel-stat"><div class="swp-fuel-stat-val">${s.v}</div><div class="swp-fuel-stat-lbl">${s.l}</div></div>`).join('');

  // ── Stat grid — write into #btStatGrid ──
  const annualIncome = withdrawal * 12;
  const yieldPct = (annualIncome/corpus*100).toFixed(2);
  const statItems = [
    {l:'Backtest Period',  v:startLabel+' → '+endLabel,          s:durationYrs.toFixed(1)+' yrs of actual NAV', c:''},
    {l:'XIRR',            v:xirr!==null?xirr+'% p.a.':'N/A',    s:'actual return on this SWP',                 c:xirr&&parseFloat(xirr)>0?'highlight':'warn'},
    delayMonths>0 ? {l:'Delay Phase',   v:(delayMonths/12).toFixed(1)+' yrs ('+delayMonths+' mo)', s:'corpus grew: ₹'+fmtINR(corpus)+' → ₹'+fmtINR(corpusAfterDelay)+' at real NAV', c:'highlight'} : null,
    delayMonths>0 ? {l:'Withdrawals From', v:withdrawalStartLabel, s:(withdrawalMonths/12).toFixed(1)+' yrs of actual withdrawals', c:''} : null,
    {l:'Start NAV',       v:'₹'+startNAV.toFixed(4),             s:btFundData.name.slice(0,30),                 c:''},
    {l:'End NAV',         v:'₹'+snaps[snaps.length-1].nav.toFixed(4), s:endLabel,                              c:''},
    {l:survives?'Corpus Remaining':'Depleted Month',
                          v:survives?'₹'+fmtINR(finalCorpus):'Month '+depleted,
                                                                  s:survives?'after '+(withdrawalMonths/12).toFixed(1)+' yrs withdrawals':'corpus hit ₹0', c:survives?'highlight':'danger'},
    {l:'Total Withdrawn', v:'₹'+fmtINR(totalWithdrawn),          s:'over '+(withdrawalMonths/12).toFixed(1)+' years',    c:''},
    {l:'Wealth Multiple', v:((totalWithdrawn+finalCorpus)/corpus).toFixed(2)+'x', s:'(withdrawn+remaining)/corpus', c:''},
    {l:'Units Remaining', v:survives?snaps[snaps.length-1].units.toLocaleString('en-IN'):'0', s:'fund units left', c:''},
  ].filter(Boolean);
  document.getElementById('btStatGrid').innerHTML = statItems
    .map(s=>`<div class="swp-stat ${s.c}"><div class="swp-stat-label">${s.l}</div><div class="swp-stat-val" style="font-size:${s.v.length>14?'.78rem':'.9rem'}">${s.v}</div><div class="swp-stat-sub">${s.s}</div></div>`).join('');

  // ── Result cards — write into #btResultCards ──
  document.getElementById('btResultCards').innerHTML = [
    {bg:'#e0f2f1',border:'#80cbc4',accent:'#00695c',tc:'#004d40',icon:'📊',lbl:'Backtest Summary',
     val:durationYrs.toFixed(1)+' years',sub:startLabel+' → '+endLabel,
     rows:[['Total Withdrawn','₹'+fmtINR(totalWithdrawn)],['Monthly Withdrawal','₹'+fmtINR(withdrawal)],['Step-up',stepup>0?stepup+'% p.a.':'None']]},
    {bg:survives?'#e8f5e9':'#fbe9e7',border:survives?'#a5d6a7':'#ffab91',accent:survives?'#2e7d32':'#bf360c',tc:survives?'#1b5e20':'#b71c1c',
     icon:survives?'🏆':'⚠️',lbl:survives?'Corpus Survived':'Corpus Depleted',
     val:survives?'₹'+fmtINR(finalCorpus):'Month '+depleted,
     sub:survives?'intact after full period':'ran out of funds',
     rows:[['Starting Corpus','₹'+fmtINR(corpus)],['Remaining','₹'+fmtINR(finalCorpus)],['Wealth Multiple',((totalWithdrawn+finalCorpus)/corpus).toFixed(2)+'x']]},
    {bg:'#fff8e1',border:'#ffe082',accent:'#f57f17',tc:'#e65100',icon:'📈',lbl:'XIRR on this SWP',
     val:xirr!==null?xirr+'% p.a.':'N/A',sub:'actual annualised return',
     rows:[['Withdrawal Yield',yieldPct+'% p.a.'],['Start NAV','₹'+startNAV.toFixed(3)],['End NAV','₹'+snaps[snaps.length-1].nav.toFixed(3)]]},
  ].map(c=>`
    <div class="swp-rcard" style="background:${c.bg};border-color:${c.border}">
      <div class="swp-rcard-accent" style="background:${c.accent}"></div>
      <div class="swp-rc-label" style="color:${c.accent}">${c.icon} ${c.lbl}</div>
      <div class="swp-rc-val" style="color:${c.tc};font-size:${c.val.length>14?'1.1rem':'1.5rem'}">${c.val}</div>
      <div class="swp-rc-sub" style="color:${c.accent}">${c.sub}</div>
      ${c.rows.map(([k,v])=>`<div class="swp-row"><span class="swp-row-key" style="color:${c.tc};opacity:.75">${k}</span><span class="swp-row-val" style="color:${c.tc}">${v}</span></div>`).join('')}
    </div>`).join('');

  // ── Chart — write into #btChart ──
  btDrawChart(snaps, corpus, delayMonths);

  // ── What-if ──
  btRenderWhatIf(corpus, withdrawal, stepup, startMonth);
}

function btDrawChart(snaps, startCorpus, delayMonths){
  if(btChartInst){btChartInst.destroy();btChartInst=null;}
  const ctx = document.getElementById('btChart').getContext('2d');
  const labels = snaps.map(s=>s.label);
  delayMonths = delayMonths || 0;

  // Annotation plugin isn't loaded — draw delay boundary via a vertical line dataset
  const delayLineData = Array(snaps.length).fill(null);
  if(delayMonths > 0 && delayMonths < snaps.length){
    // Put a tall value at the delay boundary point to mark it
    delayLineData[delayMonths] = Math.max(...snaps.map(s=>s.corpus)) * 1.05;
    delayLineData[delayMonths-1] = delayLineData[delayMonths];
  }

  const datasets = [
    {label:'Corpus Value', data:snaps.map(s=>s.corpus),
     borderColor:'#00897b', backgroundColor:'rgba(0,137,123,.08)',
     borderWidth:2, pointRadius:0, pointHoverRadius:4, tension:.2, fill:true},
    {label:'Total Withdrawn', data:snaps.map(s=>s.withdrawn),
     borderColor:'#e65100', backgroundColor:'transparent',
     borderWidth:1.5, borderDash:[5,4], pointRadius:0, tension:.2},
    {label:'Starting Corpus', data:Array(snaps.length).fill(startCorpus),
     borderColor:'#90a4ae', backgroundColor:'transparent',
     borderWidth:1, borderDash:[3,3], pointRadius:0},
  ];
  if(delayMonths > 0){
    datasets.push({
      label:'← Accumulation | Withdrawal →',
      data: delayLineData,
      borderColor:'rgba(63,81,181,.5)',
      backgroundColor:'transparent',
      borderWidth:1.5, borderDash:[4,4],
      pointRadius:0, tension:0,
    });
  }

  btChartInst = new Chart(ctx, {type:'line', data:{labels, datasets}, options:{
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{position:'top',labels:{color:'#2e4d2e',font:{family:'Raleway',weight:'700',size:11},usePointStyle:true,padding:18,boxWidth:8}},
      tooltip:{backgroundColor:'#162616',borderColor:'#00695c',borderWidth:1,
        titleFont:{family:'JetBrains Mono',size:11},bodyFont:{family:'JetBrains Mono',size:12},padding:12,cornerRadius:8,
        callbacks:{
          label:c=>{
            if(c.dataset.label.includes('Accumulation')) return null;
            return `  ${c.dataset.label}: ₹${fmtINR(c.parsed.y)}`;
          },
          afterTitle: items => {
            if(delayMonths>0 && items[0]){
              const idx = items[0].dataIndex;
              const phase = idx <= delayMonths ? '⏳ Accumulation phase' : '💸 Withdrawal phase';
              return phase;
            }
          }
        }
      }
    },
    scales:{
      x:{grid:{display:false},border:{color:'#b2dfdb'},
         ticks:{font:{family:'JetBrains Mono',size:9},color:'#5e8a5e',maxTicksLimit:12}},
      y:{grid:{color:'rgba(178,223,219,.4)'},border:{color:'#b2dfdb'},
         ticks:{font:{family:'JetBrains Mono',size:9},color:'#5e8a5e',callback:v=>'₹'+fmtINR(v)}}
    }
  }});
}

function btRenderWhatIf(corpus, withdrawal, stepup, startMonth){
  if(!btFundData) return;
  const navKeys    = Object.keys(btFundData.navMap).sort();
  const availYears = [...new Set(navKeys.map(k=>k.slice(0,4)))].map(Number);
  if(availYears.length < 2){ document.getElementById('btWhatIfWrap').style.display='none'; return; }

  const last  = availYears[availYears.length-1];
  const first = availYears[0];
  const spread= last - first;
  // Pick 5 evenly spread start years for richer comparison
  const count = Math.min(5, availYears.length);
  const candidates = count <= 3 ? availYears.slice(0, count)
    : Array.from({length:count}, (_,i)=> availYears[Math.round(i*(availYears.length-1)/(count-1))]);

  const selectedYear = parseInt(document.getElementById('btStartYear').value);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const endYear  = parseInt(document.getElementById('btEndYear')?.value) || null;
  const endMonth = parseInt(document.getElementById('btEndMonth')?.value) || null;

  const rows = candidates.map(yr=>{
    const r = runNAVBacktest(btFundData.navMap, yr, startMonth, corpus, withdrawal, stepup, 0, 0, endYear, endMonth);
    return r ? {yr, r} : null;
  }).filter(Boolean);

  if(!rows.length){ document.getElementById('btWhatIfWrap').style.display='none'; return; }

  document.getElementById('btWhatIfWrap').style.display = 'block';
  // Table view
  document.getElementById('btWhatIfBars').innerHTML = `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
    <table style="width:100%;border-collapse:collapse;font-size:.68rem">
      <thead>
        <tr style="background:var(--g2);color:#fff">
          <th style="padding:7px 10px;text-align:left;font-weight:800;letter-spacing:.5px;white-space:nowrap">Start</th>
          <th style="padding:7px 10px;text-align:center;font-weight:800;letter-spacing:.5px;white-space:nowrap">Status</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;letter-spacing:.5px;white-space:nowrap">Duration</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;letter-spacing:.5px;white-space:nowrap">Remaining</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;letter-spacing:.5px;white-space:nowrap">Withdrawn</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;letter-spacing:.5px;white-space:nowrap">XIRR</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;letter-spacing:.5px;white-space:nowrap">Multiple</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({yr,r},ri)=>{
          const survives = r.depleted===null;
          const isSel = yr===selectedYear;
          const col = survives?'#1b5e20':r.durationYrs>10?'#e65100':'#b71c1c';
          const bg = isSel ? 'rgba(46,125,50,.08)' : ri%2===0?'var(--surface2)':'#fff';
          const multiple = ((r.totalWithdrawn + r.finalCorpus)/corpus).toFixed(2);
          return `<tr style="background:${bg};${isSel?'outline:1.5px solid var(--g3);outline-offset:-1px':''}">
            <td style="padding:7px 10px;font-weight:${isSel?800:600};color:${isSel?'var(--g1)':'var(--text)'}">
              ${MONTHS[startMonth-1]} ${yr}${isSel?' ◀':''}
            </td>
            <td style="padding:7px 10px;text-align:center">
              <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:.6rem;font-weight:800;
                background:${survives?'rgba(46,125,50,.12)':'rgba(183,28,28,.1)'};
                color:${survives?'#1b5e20':'#b71c1c'}">
                ${survives?'✅ Survives':'⚠️ Depleted'}
              </span>
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:${col}">
              ${r.durationYrs.toFixed(1)} yrs
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:${survives?'var(--g1)':'var(--muted)'}">
              ${survives?'₹'+fmtINR(r.finalCorpus):'₹0'}
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;color:var(--text2)">
              ₹${fmtINR(r.totalWithdrawn)}
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;
              color:${r.xirr&&parseFloat(r.xirr)>0?'var(--g1)':'#b71c1c'}">
              ${r.xirr||'—'}%
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;color:var(--text2)">
              ${multiple}x
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
}


// ── Backtester: Share URL ──
function btShareURL(){
  if(!btFundData){ alert('Select a fund first'); return; }

  // Collect result stats for dynamic OG image
  const xirrEl   = document.querySelector('#btStatGrid .swp-stat.highlight .swp-stat-val');
  const corpusEl = document.querySelector('#btStatGrid .swp-stat.highlight:last-of-type .swp-stat-val');
  const xirr = window._btLastResult?.xirr || '';
  const survived = document.getElementById('btStatGrid')
    ? (() => {
        const items = [...document.getElementById('btStatGrid').querySelectorAll('.swp-stat')];
        const statusItem = items.find(el => el.querySelector('.swp-stat-label')?.textContent?.includes('Status') || el.querySelector('.swp-stat-label')?.textContent?.includes('Remaining'));
        if(!statusItem) return '';
        const val = statusItem.querySelector('.swp-stat-val')?.textContent || '';
        return val.includes('₹') && !val.includes('₹0') ? '1' : val.includes('₹0') ? '0' : '';
      })() : '';

  const params = new URLSearchParams({
    tab:'swp',
    btMode:'1',
    btCode: btFundData.code,
    btName: btFundData.name,
    btCorpus: document.getElementById('btCorpus').value,
    btWithdrawal: document.getElementById('btWithdrawal').value,
    btStepup: document.getElementById('btStepup').value,
    btInflation: document.getElementById('btInflation').value,
    btSY: document.getElementById('btStartYear').value,
    btSM: document.getElementById('btStartMonth').value,
    btEY: document.getElementById('btEndYear')?.value||'',
    btEM: document.getElementById('btEndMonth')?.value||'',
    btDelay: document.getElementById('btDelayToggle').checked?'1':'0',
    btDV: document.getElementById('btDelayVal')?.value||'',
    btDU: document.getElementById('btDelayUnit')?.value||'',
    xirr, survived, finalC: window._btLastResult ? String(window._btLastResult.finalCorpus) : '',
    withdrawn: window._btLastResult ? String(window._btLastResult.totalWithdrawn) : '',
  });
  const url = location.origin + location.pathname + '?' + params.toString();
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>btToast('🔗 Link copied to clipboard!'));
  } else {
    prompt('Copy this link:', url);
  }
}

function btToast(msg){
  let t = document.getElementById('btToast');
  if(!t){ t=document.createElement('div'); t.id='btToast';
    t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e4d20;color:#fff;padding:10px 20px;border-radius:24px;font-size:.78rem;font-weight:700;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.2);transition:opacity .3s';
    document.body.appendChild(t); }
  t.textContent=msg; t.style.opacity='1';
  clearTimeout(t._tid);
  t._tid=setTimeout(()=>t.style.opacity='0',2500);
}

// ── Backtester: Read URL params on load ──
function btReadURL(){
  const p = new URLSearchParams(location.search);
  const isSWPBT2 = !!p.get('btMode');
  const isSIPBT2 = !!p.get('sipBTMode');
  if(!isSWPBT2 && !isSIPBT2) return;
  if(isSIPBT2) {
    const sn = p.get('sipBTName')||'SIP Backtest';
    const sx = p.get('sipXirr')||'';
    const sc = p.get('sipCorpus')||'';
    const sTitle = 'SIP Backtest: '+(sn.length>32?sn.slice(0,32)+'...':sn)+' | Abundance';
    const sDesc  = (['SIP backtest: '+sn, sx?'XIRR '+sx+'% p.a.':'', sc?'Final corpus Rs'+sc:''].filter(Boolean).join(' | ')+' — Abundance ARN-251838').slice(0,160);
    const sOgP   = new URLSearchParams({sipBTMode:'1',sipBTName:sn,sipBTAmount:p.get('sipBTAmount')||'',sipBTSY:p.get('sipBTSY')||'',sipBTSM:p.get('sipBTSM')||'',sipBTEY:p.get('sipBTEY')||'',sipBTEM:p.get('sipBTEM')||'',sipXirr:sx,sipCorpus:sc,sipInvested:p.get('sipInvested')||'',sipGain:p.get('sipGain')||''});
    const sImg   = location.origin+'/api/og?'+sOgP;
    document.title = sTitle;
    function smS(pr,vl,isN){let e=document.querySelector('meta['+(isN?'name':'property')+'="'+pr+'"]');if(!e){e=document.createElement('meta');e.setAttribute(isN?'name':'property',pr);document.head.appendChild(e);}e.setAttribute('content',vl);}
    smS('og:title',sTitle);smS('og:description',sDesc);smS('og:url',location.href);smS('og:image',sImg);smS('twitter:title',sTitle,true);smS('twitter:description',sDesc,true);smS('twitter:image',sImg,true);
    return;
  }
  if(!isSWPBT2) return;

  // readURLParams already switched to SWP tab via tab=swp param.
  // Now switch the SWP sub-tab to backtest — find the 3rd mode tab button
  const modeTabBtns = document.querySelectorAll('.swp-mode-tab');
  const btModeBtn = modeTabBtns[2]; // 0=haveCorpus, 1=needIncome, 2=backtest
  if(btModeBtn) setSWPMode('backtest', btModeBtn);

  const setV=(id,v)=>{ const el=document.getElementById(id); if(el&&v!==null&&v!=='') el.value=v; };
  setV('btCorpus',     p.get('btCorpus'));
  setV('btWithdrawal', p.get('btWithdrawal'));
  setV('btStepup',     p.get('btStepup'));
  setV('btInflation',  p.get('btInflation'));
  if(p.get('btDelay')==='1'){
    const tog = document.getElementById('btDelayToggle');
    if(tog){ tog.checked=true; btToggleDelay(); }
    setV('btDelayVal',  p.get('btDV'));
    setV('btDelayUnit', p.get('btDU'));
  }

  const schemeCode = p.get('btCode');
  const schemeName = p.get('btName');
  if(!schemeCode) return;

  document.getElementById('btFundName').textContent = schemeName || schemeCode;
  document.getElementById('btFundChipWrap').style.display = 'block';
  document.getElementById('btEmpty').textContent = 'Loading fund from shared link…';
  document.getElementById('btEmpty').style.display = 'block';

  const _rdSeq = ++_btFetchSeq;
  fetch('/api/mf?code=' + schemeCode)
    .then(r=>r.json())
    .then(json=>{
      if (_rdSeq !== _btFetchSeq) return; // superseded by user-initiated fund change
      const navMap={};
      (json.data||[]).forEach(d=>{
        const [dd,mm,yyyy]=d.date.split('-');
        const key=yyyy+'-'+mm;
        if(!navMap[key]) navMap[key]=parseFloat(d.nav);
      });
      btFundData = {code:schemeCode, name:schemeName||json.meta.scheme_name, navMap};
      btBuildDateDropdowns();
      // Override dropdowns with URL dates after btBuildDateDropdowns sets defaults
      if(p.get('btSY')){ setV('btStartYear', p.get('btSY')); btUpdateMonths(); }
      if(p.get('btSM')){ setV('btStartMonth', p.get('btSM')); }
      if(p.get('btEY')){ setV('btEndYear', p.get('btEY')); btUpdateEndMonths(); }
      if(p.get('btEM')){ setV('btEndMonth', p.get('btEM')); }
      btRun();
    })
    .catch(()=>{
      if(document.getElementById('btEmpty'))
        document.getElementById('btEmpty').textContent='Failed to load shared fund. Try again.';
    });
}

// ── Backtester: Print/PDF (same window.open pattern as printSWP) ──
function btPrint(){
  if(!btFundData){ alert('Run a backtest first'); return; }
  const fuelHTML   = document.getElementById('btFuel').outerHTML;
  const statHTML   = document.getElementById('btStatGrid').outerHTML;
  const cardsHTML  = document.getElementById('btResultCards').outerHTML;
  const whatifEl   = document.getElementById('btWhatIfWrap');
  const whatifHTML = whatifEl && whatifEl.style.display !== 'none' ? whatifEl.outerHTML : '';
  const chartEl    = document.getElementById('btChart');
  const chartImg   = chartEl ? chartEl.toDataURL('image/png') : '';

  const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #00695c;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#00695c}
.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:14px 0 7px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#b2dfdb}
.swp-fuel{background:linear-gradient(135deg,#1a3a2a,#1e4530);border-radius:12px;padding:16px 20px;margin-bottom:12px}
.swp-fuel-label{font-size:.55rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#80cbc4;margin-bottom:10px}
.swp-fuel-track{height:12px;background:rgba(255,255,255,.1);border-radius:6px;overflow:hidden;margin-bottom:8px}
.swp-fuel-fill{height:100%;border-radius:6px}
.swp-fuel-bottom{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.swp-fuel-stats{display:flex;flex-wrap:wrap;gap:12px}
.swp-fuel-stat{text-align:center;min-width:80px}
.swp-fuel-stat-val{font-family:"JetBrains Mono",monospace;font-size:.82rem;font-weight:700;color:#e0f2f1}
.swp-fuel-stat-lbl{font-size:.52rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:rgba(128,203,196,.7)}
.swp-fuel-pct{font-family:"JetBrains Mono",monospace;font-size:1.2rem;font-weight:800;color:#fff}
.swp-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.swp-stat{background:#f5f5f5;border:1.5px solid #e0e0e0;border-radius:9px;padding:10px 12px;text-align:center;position:relative}
.swp-stat.highlight{background:#e0f2f1;border-color:#80cbc4}
.swp-stat.highlight .swp-stat-val{color:#00695c}
.swp-stat.warn{background:#fff8e1;border-color:#ffe082}
.swp-stat.warn .swp-stat-val{color:#e65100}
.swp-stat.danger{background:#ffebee;border-color:#ef9a9a}
.swp-stat.danger .swp-stat-val{color:#b71c1c}
.swp-stat-label{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:4px}
.swp-stat-val{font-family:"JetBrains Mono",monospace;font-size:.88rem;font-weight:700;line-height:1.2;overflow-wrap:break-word;word-break:break-word}
.swp-stat-sub{font-size:.54rem;color:#999;margin-top:2px}
.swp-result-grid{display:grid!important;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.swp-rcard{border-radius:10px;padding:14px;position:relative;overflow:hidden;border:1.5px solid}
.swp-rcard-accent{position:absolute;top:0;left:0;width:3px;bottom:0}
.swp-rc-label{font-size:.54rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;display:flex;align-items:center;gap:6px}
.swp-rc-val{font-family:"JetBrains Mono",monospace;font-size:1.1rem;font-weight:800;line-height:1.1;margin-bottom:2px}
.swp-rc-sub{font-size:.56rem;font-family:"JetBrains Mono",monospace;margin-bottom:9px}
.swp-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.62rem}
.swp-row:last-child{border-bottom:none}
.swp-row-key{opacity:.75}
.swp-row-val{font-family:"JetBrains Mono",monospace;font-weight:600}
.ci img{width:100%;border-radius:8px;border:1px solid #b2dfdb;margin-bottom:12px}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
table{width:100%;border-collapse:collapse;font-size:.68rem}
th{background:#00695c;color:#fff;padding:7px 10px;font-weight:800}th:first-child{text-align:left}
td{padding:6px 10px;border-bottom:1px solid #e0f2f1;font-family:"JetBrains Mono",monospace}td:first-child{font-family:"Raleway",sans-serif}
tr:nth-child(even) td{background:#f5faf5}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}}`;

  const body = '<div class="ph"><div><div class="pt">SWP Backtester \u2014 ' + btFundData.name + '</div>'
    + '<div class="pa">Abundance Financial Services\u00ae \u00b7 ARN-251838 \u00b7 AMFI Registered Mutual Funds Distributor</div></div>'
    + '<img class="logo" src="/logo-og.png" onerror="this.style.display=\'none\'"></div>'
    + '<div class="sec">Corpus Health</div>' + fuelHTML
    + '<div class="sec">Statistics</div>' + statHTML
    + '<div class="sec">Result Cards</div>' + cardsHTML
    + (whatifHTML ? '<div class="sec">What-if Comparison</div>' + whatifHTML : '')
    + (chartImg ? '<div class="sec">NAV Chart</div><div class="ci"><img src="' + chartImg + '"></div>' : '')
    + '<div class="dis">&#9888;&#65039; <strong style="color:#e65100">Disclaimer:</strong> Mutual fund investments are subject to market risks. Past performance is not indicative of future returns. Backtested results use actual historical NAV data from AMFI / mfapi.in but do not guarantee future performance. This is for illustrative purposes only. | ARN-251838 | Abundance Financial Services | EUIN: E334718</div>';

  const win = window.open('','_blank','width=960,height=760');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SWP Backtest | Abundance Financial Services</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">'
    + '<style>' + CSS + '</style></head><body>' + body + '</body></html>');
  win.document.close();
  win.onload = ()=>setTimeout(()=>{win.focus();win.print();},600);
  setTimeout(()=>{try{win.focus();win.print();}catch(e){}},1200);
}



// ══════════════════════════════════════════════════════════════
//  SIP NAV BACKTESTER
//  Same engine as SWP BT but reversed: invest monthly at real NAV
// ══════════════════════════════════════════════════════════════

let sipBTFundData  = null;   // { code, name, navMap }
let sipBTChartInst = null;
let _sipBTSearchTimer = null;
let _sipBTSearchCtrl  = null;

// ── setSIPMode: show/hide SIP BT panel ──
function setSIPMode(mode, btn) {
  const isBacktest = mode === 'backtest';
  const btPanel = document.getElementById('sipBTPanel');
  const splitBody = document.querySelector('#mpanel-sip .sip-split-body');
  if (!btPanel || !splitBody) return;
  btPanel.style.display   = isBacktest ? 'block' : 'none';
  splitBody.style.display = isBacktest ? 'none'  : '';
  // Update calc mode button states — clear all, then activate chosen
  document.querySelectorAll('#mpanel-sip .smt-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-checked','false');
    b.style.background = '';  // clear any lingering inline styles
    b.style.color = '';
  });
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-checked','true'); }
  // Show/hide Save PDF button — hidden in backtest mode (has its own print)
  const sipPrintBtn = document.getElementById('sipPrintBtn');
  if (sipPrintBtn) sipPrintBtn.style.display = isBacktest ? 'none' : '';
  // Also update calcModeTitle
  const titleEl = document.getElementById('calcModeTitle');
  if (titleEl) titleEl.textContent = isBacktest ? 'SIP NAV Backtester' : 'SIP Returns Calculator';
}

// ── Fund search ──
function sipBTOnSearch(q) {
  clearTimeout(_sipBTSearchTimer);
  _sipBTSearchTimer = setTimeout(() => sipBTDoSearch(q), 300);
}

function sipBTDoSearch(q) {
  if (!q || q.length < 2) { document.getElementById('sipBTDropdown').classList.remove('open'); return; }
  if (_sipBTSearchCtrl) _sipBTSearchCtrl.abort();
  _sipBTSearchCtrl = new AbortController();
  const dd = document.getElementById('sipBTDropdown');
  dd.innerHTML = '<div class="dropdown-loading">Searching…</div>';
  dd.classList.add('open');
  fetch('/api/mf?q=' + encodeURIComponent(q), { signal: _sipBTSearchCtrl.signal })
    .then(r => r.json())
    .then(data => {
      const funds = (data || [])
        .filter(f => !/direct/i.test(f.schemeName) && !/institutional/i.test(f.schemeName) && !isDeadAMC(f.schemeName))
        .sort((a,b) => fundRank(a) - fundRank(b))
        .slice(0, 25);
      if (!funds.length) { dd.innerHTML = '<div class="dropdown-loading">No results</div>'; return; }
      const q2 = q.toLowerCase();
      dd.innerHTML = `<div class="dd-count">${funds.length} fund${funds.length!==1?'s':''}</div>` +
        funds.map(f => {
          const hi = f.schemeName.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'), '<strong>$1</strong>');
          return `<div class="dropdown-item" onclick="sipBTSelectFund('${f.schemeCode}','${f.schemeName.replace(/'/g,"\'")}')">
            <div>${hi}</div><span class="di-code">${f.schemeCode}</span>
          </div>`;
        }).join('');
      dd.classList.add('open');
    })
    .catch(() => {});
}

function sipBTSelectFund(code, name) {
  document.getElementById('sipBTDropdown').classList.remove('open');
  document.getElementById('sipBTFundInput').value = '';
  document.getElementById('sipBTFundName').textContent = name;
  document.getElementById('sipBTFundChipWrap').style.display = 'block';
  document.getElementById('sipBTEmpty').textContent = 'Loading NAV data…';
  document.getElementById('sipBTEmpty').style.display = 'block';
  document.getElementById('sipBTResults').style.display = 'none';

  fetch('/api/mf?code=' + code)
    .then(r => r.json())
    .then(json => {
      const navMap = {};
      (json.data || []).forEach(d => {
        const [dd,mm,yyyy] = d.date.split('-');
        const key = yyyy + '-' + mm;
        if (!navMap[key]) navMap[key] = parseFloat(d.nav);
      });
      sipBTFundData = { code, name, navMap };
      sipBTBuildDateDropdowns();
      sipBTRun();
    })
    .catch(() => {
      document.getElementById('sipBTEmpty').textContent = 'Failed to load fund data. Try again.';
    });
}

function sipBTClearFund() {
  sipBTFundData = null;
  document.getElementById('sipBTFundChipWrap').style.display = 'none';
  document.getElementById('sipBTFundInput').value = '';
  document.getElementById('sipBTResults').style.display = 'none';
  document.getElementById('sipBTEmpty').textContent = 'Search for a fund to begin the SIP backtest';
  document.getElementById('sipBTEmpty').style.display = 'block';
  if (sipBTChartInst) { sipBTChartInst.destroy(); sipBTChartInst = null; }
}

function sipBTStep(id, delta, min, max) {
  const el = document.getElementById(id);
  if (!el) return;
  let v = parseFloat(el.value) + delta;
  v = Math.max(min, Math.min(max, v));
  el.value = Math.round(v);
  dSipBTRun();
}

// ── Date dropdowns ──
function sipBTBuildDateDropdowns() {
  if (!sipBTFundData) return;
  const navKeys    = Object.keys(sipBTFundData.navMap).sort();
  if (!navKeys.length) return;
  const availYears = [...new Set(navKeys.map(k => k.slice(0,4)))].sort();
  const firstYear  = parseInt(availYears[0]);
  const lastYear   = parseInt(availYears[availYears.length-1]);

  // Start year: default to earliest or earliest+5 if available
  const defStart = Math.min(firstYear + 5, lastYear - 1);
  const syEl = document.getElementById('sipBTStartYear');
  const eyEl = document.getElementById('sipBTEndYear');
  syEl.innerHTML = availYears.map(y => `<option value="${y}"${parseInt(y)===defStart?' selected':''}>${y}</option>`).join('');
  eyEl.innerHTML = availYears.map(y => `<option value="${y}"${parseInt(y)===lastYear?' selected':''}>${y}</option>`).join('');
  sipBTUpdateMonths();
  sipBTUpdateEndMonths();
}

function sipBTUpdateMonths() {
  if (!sipBTFundData) return;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yr = document.getElementById('sipBTStartYear')?.value;
  if (!yr) return;
  const avail = Object.keys(sipBTFundData.navMap).filter(k => k.startsWith(yr)).map(k => parseInt(k.slice(5)));
  const sel = document.getElementById('sipBTStartMonth');
  sel.innerHTML = avail.map(m => `<option value="${m}">${MONTHS[m-1]}</option>`).join('');
}

function sipBTUpdateEndMonths() {
  if (!sipBTFundData) return;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yr = document.getElementById('sipBTEndYear')?.value;
  if (!yr) return;
  const avail = Object.keys(sipBTFundData.navMap).filter(k => k.startsWith(yr)).map(k => parseInt(k.slice(5))).sort((a,b)=>a-b);
  const sel = document.getElementById('sipBTEndMonth');
  const last = avail[avail.length-1] || 12;
  sel.innerHTML = avail.map(m => `<option value="${m}"${m===last?' selected':''}>${MONTHS[m-1]}</option>`).join('');
}

// ── Core SIP Backtest Engine ──
function runSIPBacktest(navMap, startYear, startMonth, monthlySIP, stepupPct, endYear, endMonth) {
  let currentSIP = monthlySIP;
  const snaps    = [];
  let totalInvested = 0;
  let units = 0;
  let month = startMonth, year = startMonth === 1 ? startYear : startYear;
  // First month: buy at start NAV
  month = startMonth; year = startYear;

  function getNAV(y, m) {
    for (let offset = 0; offset < 5; offset++) {
      let mm = m + offset, yy = y;
      if (mm > 12) { mm -= 12; yy++; }
      const key = yy + '-' + String(mm).padStart(2,'0');
      if (navMap[key]) return { nav: navMap[key], key };
    }
    return null;
  }

  const startEntry = getNAV(year, month);
  if (!startEntry) return null;

  // Buy first instalment
  units += currentSIP / startEntry.nav;
  totalInvested += currentSIP;
  snaps.push({
    label: startEntry.key,
    corpus: Math.round(units * startEntry.nav),
    invested: Math.round(totalInvested),
    nav: startEntry.nav,
    units: Math.round(units * 100) / 100,
    sip: currentSIP
  });

  const maxMonths = 50 * 12;
  let monthsRun = 0;

  while (monthsRun < maxMonths) {
    month++; if (month > 12) { month = 1; year++; }
    monthsRun++;
    if (endYear && endMonth && (year > endYear || (year === endYear && month > endMonth))) break;

    const entry = getNAV(year, month);
    if (!entry) break;

    // Annual step-up
    if (monthsRun % 12 === 0 && stepupPct > 0)
      currentSIP *= (1 + stepupPct / 100);

    units += currentSIP / entry.nav;
    totalInvested += currentSIP;

    snaps.push({
      label: entry.key,
      corpus: Math.round(units * entry.nav),
      invested: Math.round(totalInvested),
      nav: entry.nav,
      units: Math.round(units * 100) / 100,
      sip: Math.round(currentSIP)
    });
  }

  const finalCorpus  = snaps[snaps.length - 1].corpus;
  const finalNAV     = snaps[snaps.length - 1].nav;
  const totalMonths  = snaps.length;
  const absoluteGain = finalCorpus - totalInvested;
  const multiple     = totalInvested > 0 ? finalCorpus / totalInvested : 0;

  // XIRR: each SIP instalment is a cashflow out, final corpus is in
  const cashflows = snaps.map((s, i) => ({ t: i / 12, v: -s.sip }));
  cashflows.push({ t: (totalMonths - 1) / 12, v: finalCorpus });
  const xirr = cashflows.length > 1 ? calcXIRR(cashflows) : null;

  return {
    snaps, totalInvested, finalCorpus, finalNAV,
    absoluteGain, multiple, xirr, totalMonths,
    startNAV: startEntry.nav, units
  };
}

const dSipBTRun = (() => { let t; return () => { clearTimeout(t); t = setTimeout(sipBTRun, 300); }; })();

function sipBTRun() {
  if (!sipBTFundData) return;
  const monthlySIP = Math.max(100, parseFloat(document.getElementById('sipBTAmount').value) || 10000);
  const stepup     = Math.max(0,   parseFloat(document.getElementById('sipBTStepup').value) || 0);
  const startYear  = parseInt(document.getElementById('sipBTStartYear').value);
  const startMonth = parseInt(document.getElementById('sipBTStartMonth').value || 1);
  const endYear    = parseInt(document.getElementById('sipBTEndYear')?.value) || null;
  const endMonth   = parseInt(document.getElementById('sipBTEndMonth')?.value) || null;

  document.getElementById('sipBTEmpty').style.display = 'none';

  const result = runSIPBacktest(sipBTFundData.navMap, startYear, startMonth, monthlySIP, stepup, endYear, endMonth);
  if (!result) {
    document.getElementById('sipBTEmpty').textContent = 'No NAV data for selected period';
    document.getElementById('sipBTEmpty').style.display = 'block';
    document.getElementById('sipBTResults').style.display = 'none';
    return;
  }

  document.getElementById('sipBTResults').style.display = 'block';
  window._sipBTLastResult = result;

  const { snaps, totalInvested, finalCorpus, absoluteGain, multiple, xirr, totalMonths, startNAV, units } = result;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const startLabel = MONTHS[startMonth-1] + ' ' + startYear;
  const endSnap    = snaps[snaps.length - 1];
  const endLabel   = endSnap.label.slice(0,4) + ' ' + MONTHS[parseInt(endSnap.label.slice(5))-1];

  // ── Stat grid ──
  const statItems = [
    { l:'Backtest Period',   v: startLabel + ' → ' + endLabel,         s: (totalMonths/12).toFixed(1) + ' yrs of actual NAV', c: '' },
    { l:'XIRR',              v: xirr !== null ? xirr + '% p.a.' : 'N/A', s: 'actual SIP return on this fund',                c: xirr && parseFloat(xirr) > 0 ? 'highlight' : 'warn' },
    { l:'Total Invested',    v: '₹' + fmtINR(totalInvested),           s: (totalMonths) + ' monthly instalments',             c: '' },
    { l:'Final Corpus',      v: '₹' + fmtINR(finalCorpus),             s: 'at actual NAV on ' + endLabel,                    c: 'highlight' },
    { l:'Absolute Gain',     v: '₹' + fmtINR(absoluteGain),            s: absoluteGain > 0 ? 'profit on investment' : 'loss', c: absoluteGain > 0 ? 'highlight' : 'danger' },
    { l:'Wealth Multiple',   v: multiple.toFixed(2) + 'x',             s: 'corpus / total invested',                          c: multiple >= 2 ? 'highlight' : '' },
    { l:'Start NAV',         v: '₹' + startNAV.toFixed(4),             s: sipBTFundData.name.slice(0,30),                    c: '' },
    { l:'End NAV',           v: '₹' + endSnap.nav.toFixed(4),          s: endLabel,                                           c: '' },
    { l:'Units Accumulated', v: units.toFixed(3),                      s: 'fund units bought at real prices',                 c: '' },
  ];
  document.getElementById('sipBTStatGrid').innerHTML = statItems
    .map(s => `<div class="swp-stat ${s.c}">
      <div class="swp-stat-label">${s.l}</div>
      <div class="swp-stat-val" style="font-size:${s.v.length>14?'.78rem':'.9rem'}">${s.v}</div>
      <div class="swp-stat-sub">${s.s}</div>
    </div>`).join('');

  // ── Result cards ──
  const gainColor  = absoluteGain >= 0 ? '#1b5e20' : '#b71c1c';
  const gainBg     = absoluteGain >= 0 ? '#e8f5e9' : '#ffebee';
  const gainBorder = absoluteGain >= 0 ? '#a5d6a7' : '#ef9a9a';
  document.getElementById('sipBTResultCards').innerHTML = [
    { bg:'#e0f2f1', border:'#80cbc4', accent:'#00695c', tc:'#004d40', icon:'📊', lbl:'SIP Summary',
      val: (totalMonths/12).toFixed(1) + ' years', sub: startLabel + ' → ' + endLabel,
      rows: [['Monthly SIP','₹'+fmtINR(monthlySIP)], ['Step-up', stepup > 0 ? stepup+'% p.a.' : 'None'], ['Instalments', totalMonths+' months']] },
    { bg: gainBg, border: gainBorder, accent: gainColor, tc: gainColor, icon: absoluteGain >= 0 ? '🏆' : '⚠️',
      lbl: absoluteGain >= 0 ? 'Profit Earned' : 'Loss Incurred',
      val: '₹' + fmtINR(Math.abs(absoluteGain)), sub: absoluteGain >= 0 ? 'above total invested' : 'below total invested',
      rows: [['Total Invested','₹'+fmtINR(totalInvested)], ['Final Corpus','₹'+fmtINR(finalCorpus)], ['Multiple', multiple.toFixed(2)+'x']] },
    { bg:'#fff8e1', border:'#ffe082', accent:'#f57f17', tc:'#e65100', icon:'📈', lbl:'XIRR — Actual Return',
      val: xirr !== null ? xirr + '% p.a.' : 'N/A', sub: 'annualised return on SIP cashflows',
      rows: [['Start NAV','₹'+startNAV.toFixed(3)], ['End NAV','₹'+endSnap.nav.toFixed(3)], ['Units', units.toFixed(3)]] },
  ].map(c => `
    <div class="swp-rcard" style="background:${c.bg};border-color:${c.border}">
      <div class="swp-rcard-accent" style="background:${c.accent}"></div>
      <div class="swp-rc-label" style="color:${c.accent}">${c.icon} ${c.lbl}</div>
      <div class="swp-rc-val" style="color:${c.tc}">${c.val}</div>
      <div class="swp-rc-sub" style="color:${c.accent}">${c.sub}</div>
      ${c.rows.map(([k,v]) => `<div class="swp-row"><span class="swp-row-key" style="color:${c.tc};opacity:.75">${k}</span><span class="swp-row-val" style="color:${c.tc}">${v}</span></div>`).join('')}
    </div>`).join('');

  // ── Chart ──
  sipBTDrawChart(snaps);

  // ── What-if table ──
  sipBTRenderWhatIf(monthlySIP, stepup, startMonth, endYear, endMonth);
}

function sipBTDrawChart(snaps) {
  if (sipBTChartInst) { sipBTChartInst.destroy(); sipBTChartInst = null; }
  const ctx = document.getElementById('sipBTChart').getContext('2d');
  sipBTChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: snaps.map(s => s.label),
      datasets: [
        { label:'Corpus Value', data: snaps.map(s => s.corpus),
          borderColor:'#2e7d32', backgroundColor:'rgba(46,125,50,.1)',
          borderWidth:2, pointRadius:0, pointHoverRadius:4, tension:.2, fill:true },
        { label:'Total Invested', data: snaps.map(s => s.invested),
          borderColor:'#1565c0', backgroundColor:'transparent',
          borderWidth:1.5, borderDash:[5,4], pointRadius:0, tension:.2 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ position:'top', labels:{ color:'#2e4d2e', font:{family:'Raleway',weight:'700',size:11}, usePointStyle:true, padding:18, boxWidth:8 } },
        tooltip:{ backgroundColor:'#162616', borderColor:'#2e7d32', borderWidth:1,
          titleFont:{family:'JetBrains Mono',size:11}, bodyFont:{family:'JetBrains Mono',size:12}, padding:12, cornerRadius:8,
          callbacks:{ label: c => `  ${c.dataset.label}: ₹${fmtINR(c.parsed.y)}` }
        }
      },
      scales:{
        x:{ grid:{display:false}, border:{color:'#a5d6a7'}, ticks:{font:{family:'JetBrains Mono',size:9}, color:'#5e8a5e', maxTicksLimit:12} },
        y:{ grid:{color:'rgba(165,214,167,.3)'}, border:{color:'#a5d6a7'}, ticks:{font:{family:'JetBrains Mono',size:9}, color:'#5e8a5e', callback:v=>'₹'+fmtINR(v)} }
      }
    }
  });
}

function sipBTRenderWhatIf(monthlySIP, stepup, startMonth, endYear, endMonth) {
  if (!sipBTFundData) return;
  const navKeys    = Object.keys(sipBTFundData.navMap).sort();
  const availYears = [...new Set(navKeys.map(k => k.slice(0,4)))].map(Number);
  if (availYears.length < 2) { document.getElementById('sipBTWhatIfWrap').style.display = 'none'; return; }
  const count = Math.min(5, availYears.length);
  const candidates = count <= 3 ? availYears.slice(0, count)
    : Array.from({length:count}, (_,i) => availYears[Math.round(i*(availYears.length-1)/(count-1))]);
  const selectedYear = parseInt(document.getElementById('sipBTStartYear').value);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const rows = candidates.map(yr => {
    const r = runSIPBacktest(sipBTFundData.navMap, yr, startMonth, monthlySIP, stepup, endYear, endMonth);
    return r ? { yr, r } : null;
  }).filter(Boolean);

  if (!rows.length) { document.getElementById('sipBTWhatIfWrap').style.display = 'none'; return; }
  document.getElementById('sipBTWhatIfWrap').style.display = 'block';

  document.getElementById('sipBTWhatIfBars').innerHTML = `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
    <table style="width:100%;border-collapse:collapse;font-size:.68rem">
      <thead>
        <tr style="background:var(--g2);color:#fff">
          <th style="padding:7px 10px;text-align:left;font-weight:800;white-space:nowrap">Start</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;white-space:nowrap">Duration</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;white-space:nowrap">Invested</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;white-space:nowrap">Corpus</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;white-space:nowrap">Gain/Loss</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;white-space:nowrap">XIRR</th>
          <th style="padding:7px 10px;text-align:right;font-weight:800;white-space:nowrap">Multiple</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({yr,r}, ri) => {
          const isSel = yr === selectedYear;
          const profit = r.absoluteGain >= 0;
          const bg = isSel ? 'rgba(46,125,50,.08)' : ri%2===0 ? 'var(--surface2)' : '#fff';
          return `<tr style="background:${bg};${isSel?'outline:1.5px solid var(--g3);outline-offset:-1px':''}">
            <td style="padding:7px 10px;font-weight:${isSel?800:600};color:${isSel?'var(--g1)':'var(--text)'}">
              ${MONTHS[startMonth-1]} ${yr}${isSel?' ◀':''}
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700">${(r.totalMonths/12).toFixed(1)} yrs</td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace">₹${fmtINR(r.totalInvested)}</td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--g1)">₹${fmtINR(r.finalCorpus)}</td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:${profit?'var(--g1)':'#b71c1c'}">
              ${profit?'+':'−'}₹${fmtINR(Math.abs(r.absoluteGain))}
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:${r.xirr&&parseFloat(r.xirr)>0?'var(--g1)':'#b71c1c'}">
              ${r.xirr||'—'}%
            </td>
            <td style="padding:7px 10px;text-align:right;font-family:'JetBrains Mono',monospace;color:var(--text2)">${r.multiple.toFixed(2)}x</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

// ── Share URL ──
function sipBTShareURL() {
  if (!sipBTFundData) { alert('Run a backtest first'); return; }
  const r = window._sipBTLastResult;
  const params = new URLSearchParams({
    tab: 'sip', sipBTMode: '1',
    sipBTCode: sipBTFundData.code,
    sipBTName: sipBTFundData.name,
    sipBTAmount: document.getElementById('sipBTAmount').value,
    sipBTStepup: document.getElementById('sipBTStepup').value,
    sipBTSY: document.getElementById('sipBTStartYear').value,
    sipBTSM: document.getElementById('sipBTStartMonth').value,
    sipBTEY: document.getElementById('sipBTEndYear')?.value || '',
    sipBTEM: document.getElementById('sipBTEndMonth')?.value || '',
    sipXirr:    r ? String(r.xirr || '') : '',
    sipCorpus:  r ? String(r.finalCorpus) : '',
    sipInvested:r ? String(r.totalInvested) : '',
    sipGain:    r ? String(Math.round((r.finalCorpus||0)-(r.totalInvested||0))) : '',
  });
  const url = location.origin + location.pathname + '?' + params.toString();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => sipBTToast('🔗 Link copied!'));
  } else { prompt('Copy this link:', url); }
}

function sipBTToast(msg) {
  let t = document.getElementById('sipBTToast');
  if (!t) {
    t = document.createElement('div'); t.id = 'sipBTToast';
    t.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#1e4d20;color:#fff;padding:10px 20px;border-radius:24px;font-size:.78rem;font-weight:700;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.2);transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._tid); t._tid = setTimeout(() => t.style.opacity = '0', 2500);
}

// ── Read URL params on load ──
function sipBTReadURL() {
  const p = new URLSearchParams(location.search);
  if (!p.get('sipBTMode')) return;
  // Switch to SIP tab
  const sipTabBtn = document.getElementById('mtab-sip');
  if (sipTabBtn) switchMainTab('sip', sipTabBtn);
  // Switch to backtest mode
  const btBtn = document.getElementById('modeBacktest');
  if (btBtn) setSIPMode('backtest', btBtn);

  const setV = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  setV('sipBTAmount', p.get('sipBTAmount'));
  setV('sipBTStepup', p.get('sipBTStepup'));

  const code = p.get('sipBTCode');
  const name = p.get('sipBTName');
  if (!code) return;

  document.getElementById('sipBTFundName').textContent = name || code;
  document.getElementById('sipBTFundChipWrap').style.display = 'block';
  document.getElementById('sipBTEmpty').textContent = 'Loading fund from shared link…';
  document.getElementById('sipBTEmpty').style.display = 'block';

  fetch('/api/mf?code=' + code)
    .then(r => r.json())
    .then(json => {
      const navMap = {};
      (json.data || []).forEach(d => {
        const [dd,mm,yyyy] = d.date.split('-');
        const key = yyyy + '-' + mm;
        if (!navMap[key]) navMap[key] = parseFloat(d.nav);
      });
      sipBTFundData = { code, name: name || json.meta.scheme_name, navMap };
      sipBTBuildDateDropdowns();
      if (p.get('sipBTSY')) { setV('sipBTStartYear', p.get('sipBTSY')); sipBTUpdateMonths(); }
      if (p.get('sipBTSM')) setV('sipBTStartMonth', p.get('sipBTSM'));
      if (p.get('sipBTEY')) { setV('sipBTEndYear', p.get('sipBTEY')); sipBTUpdateEndMonths(); }
      if (p.get('sipBTEM')) setV('sipBTEndMonth', p.get('sipBTEM'));
      sipBTRun();
    })
    .catch(() => {
      document.getElementById('sipBTEmpty').textContent = 'Failed to load shared fund.';
    });
}

// ── Print/PDF ──
function sipBTPrint() {
  if (!sipBTFundData) { alert('Run a backtest first'); return; }
  const statHTML  = document.getElementById('sipBTStatGrid').outerHTML;
  const cardsHTML = document.getElementById('sipBTResultCards').outerHTML;
  const whatifEl  = document.getElementById('sipBTWhatIfWrap');
  const whatifHTML = whatifEl?.style.display !== 'none' ? whatifEl.outerHTML : '';
  const chartEl   = document.getElementById('sipBTChart');
  const chartImg  = chartEl ? chartEl.toDataURL('image/png') : '';
  const r         = window._sipBTLastResult;

  const win = window.open('','_blank','width=960,height=760');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>SIP Backtest | Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #2e7d32;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#2e7d32}.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:14px 0 7px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#a5d6a7}
.swp-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.swp-stat{background:#f5f5f5;border:1.5px solid #e0e0e0;border-radius:9px;padding:10px 12px;text-align:center}
.swp-stat.highlight{background:#e0f2f1;border-color:#80cbc4}.swp-stat.highlight .swp-stat-val{color:#00695c}
.swp-stat.warn{background:#fff8e1;border-color:#ffe082}.swp-stat.warn .swp-stat-val{color:#e65100}
.swp-stat.danger{background:#ffebee;border-color:#ef9a9a}.swp-stat.danger .swp-stat-val{color:#b71c1c}
.swp-stat-label{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:4px}
.swp-stat-val{font-family:"JetBrains Mono",monospace;font-size:.88rem;font-weight:700;line-height:1.2;overflow-wrap:break-word;word-break:break-word}
.swp-stat-sub{font-size:.54rem;color:#999;margin-top:2px}
.swp-result-grid{display:grid!important;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.swp-rcard{border-radius:10px;padding:14px;position:relative;overflow:hidden;border:1.5px solid}
.swp-rcard-accent{position:absolute;top:0;left:0;width:3px;bottom:0}
.swp-rc-label{font-size:.54rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;display:flex;align-items:center;gap:6px}
.swp-rc-val{font-family:"JetBrains Mono",monospace;font-size:1.1rem;font-weight:800;line-height:1.1;margin-bottom:2px}
.swp-rc-sub{font-size:.56rem;font-family:"JetBrains Mono",monospace;margin-bottom:9px}
.swp-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.62rem}
.swp-row:last-child{border-bottom:none}.swp-row-key{opacity:.75}.swp-row-val{font-family:"JetBrains Mono",monospace;font-weight:600}
.ci img{width:100%;border-radius:8px;border:1px solid #a5d6a7;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:.68rem}th{background:#2e7d32;color:#fff;padding:7px 10px;font-weight:800}
th:first-child{text-align:left}td{padding:6px 10px;border-bottom:1px solid #e0f2f1;font-family:"JetBrains Mono",monospace}td:first-child{font-family:"Raleway",sans-serif}
tr:nth-child(even) td{background:#f5faf5}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}}
</style></head><body>
<div class="ph"><div><div class="pt">SIP Backtester — ${sipBTFundData.name}</div>
<div class="pa">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds Distributor</div></div>
<img class="logo" src="/logo-og.png" onerror="this.style.display='none'"></div>
<div class="sec">Statistics</div>${statHTML}
<div class="sec">Result Cards</div>${cardsHTML}
${whatifHTML ? '<div class="sec">What-If Comparison</div>' + whatifHTML : ''}
${chartImg ? '<div class="sec">Corpus Growth Chart</div><div class="ci"><img src="' + chartImg + '"></div>' : ''}
<div class="dis">⚠️ <strong style="color:#e65100">Disclaimer:</strong> Mutual fund investments are subject to market risks. Past performance is not indicative of future returns. SIP backtest uses actual historical NAV data from AMFI / mfapi.in but does not guarantee future performance. For illustrative purposes only. | ARN-251838 | Abundance Financial Services | EUIN: E334718</div>
</body></html>`);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 600);
  setTimeout(() => { try{win.focus();win.print();}catch(e){} }, 1200);
}


calcSWP();
// Pre-init SIP so big result is ready when tab is first opened
initSIPSliders();
calcSIP();
_tabInited['sip'] = true;

const _footerYearEl = document.getElementById('footerYear');
if (_footerYearEl) _footerYearEl.textContent = new Date().getFullYear();

// ── Debounce utility ──
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const dCalcSIP  = debounce(calcSIP,  120);
const dCalcGoal = debounce(calcGoal, 120);
const dCalcSWP  = debounce(calcSWP,  120);
const dCalcEMI  = debounce(calcEMI,  120);
// Load dynamic quick picks from AMFI API

/* ════════════════════════════════════════
   EMI CALCULATOR — Debt Decoder
   (emiChartInst and emiTableOpen declared at top of file to avoid TDZ)
════════════════════════════════════════ */

function initEMIStars() {
  const c = document.getElementById('emiStars');
  if (!c || c.children.length) return;
  for (let i = 0; i < 35; i++) {
    const s = document.createElement('div');
    s.className = 'mc-star';
    s.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${(2+Math.random()*4).toFixed(1)}s;animation-delay:${(Math.random()*4).toFixed(1)}s;background:rgba(239,154,154,.8)`;
    c.appendChild(s);
  }
}

function applyEMIPreset(btn, key) {
  document.querySelectorAll('.emi-preset').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
  btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
  const p = EMI_PRESETS[key];
  setEMIField('emiLoanAmt', p.loan);
  setEMIField('emiRate', p.rate);
  setEMIField('emiTenure', p.tenure);
  document.getElementById('emiTenureUnit').value = 'years';
  calcEMI();
}

function setEMIMode(mode, btn) {
  emiMode = mode;
  document.querySelectorAll('.emt-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked','false'); });
  btn.classList.add('active'); btn.setAttribute('aria-checked','true');
  // Show/hide fields
  document.getElementById('emiFieldLoan').style.display    = (mode === 'loan')   ? 'none' : '';
  document.getElementById('emiFieldTenure').style.display  = (mode === 'tenure') ? 'none' : '';
  document.getElementById('emiFieldEMI').style.display     = (mode === 'emi')    ? 'none' : '';
  // Update header label
  const labels = { emi:'Monthly EMI', loan:'Max Loan Amount', tenure:'Loan Tenure' };
  const el = document.getElementById('emiHdrLabel');
  if (el) el.textContent = labels[mode];
  calcEMI();
}

function stepEMI(id, delta, min, max) {
  const el = document.getElementById(id);
  if (!el) return;
  let v = parseFloat(el.value) + delta;
  v = Math.max(min, Math.min(max, v));
  el.value = (Number.isInteger(delta) && Math.abs(delta) >= 1) ? Math.round(v) : parseFloat(v.toFixed(2));
  calcEMI();
}

function setEMIField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function setEMIUnit(unit) {
  const el = document.getElementById('emiTenureUnit');
  if (el) el.value = unit;
}

function togglePrepay() {
  emiPrepayOn = document.getElementById('emiPrepayToggle').checked;
  const fields = document.getElementById('emiPrepayFields');
  if (fields) fields.classList.toggle('shown', emiPrepayOn);
  calcEMI();
}

function toggleEMITable() {
  emiTableOpen = !emiTableOpen;
  const wrap  = document.getElementById('emiTableWrap');
  const arrow = document.getElementById('emiToggleArrow');
  const btn   = document.getElementById('emiTableToggle');
  if (wrap)  wrap.style.display  = emiTableOpen ? 'block' : 'none';
  if (arrow) arrow.classList.toggle('open', emiTableOpen);
  if (btn)   btn.setAttribute('aria-expanded', emiTableOpen ? 'true' : 'false');
  if (btn)   btn.querySelector('span:not(.emi-toggle-arrow)') && (btn.childNodes[2].textContent = emiTableOpen ? ' Hide Year-by-Year Schedule' : ' Show Year-by-Year Schedule');
}

function toggleBT() {
  emiBTOn = document.getElementById('emiBTToggle').checked;
  const fields = document.getElementById('emiBTFields');
  if (fields) fields.classList.toggle('shown', emiBTOn);
  if (!emiBTOn) {
    const r = document.getElementById('emiBTResult');
    if (r) r.style.display = 'none';
  }
  calcEMI();
}

function calcBT(loanAmt, currentRate, currentEMI, remainingMonths, newRate, feePct) {
  // Outstanding principal after elapsed months (already computed by caller)
  const outstanding = loanAmt; // caller passes remaining balance directly
  const fee = outstanding * feePct / 100;

  // Current loan: remaining cost
  const currentRemaining = currentEMI * remainingMonths;
  const currentIntRemaining = currentRemaining - outstanding;

  // New loan at newRate for same remaining tenure
  const newEMI = calcEMIValue(outstanding, newRate, remainingMonths);
  const newTotal = newEMI * remainingMonths;
  const newInt = newTotal - outstanding;

  // Net saving = interest saved minus transfer fee
  const grossSaving = currentIntRemaining - newInt;
  const netSaving = grossSaving - fee;

  // Break-even month: when cumulative monthly saving exceeds fee
  const monthlySaving = currentEMI - newEMI;
  const breakEvenMonth = monthlySaving > 0 ? Math.ceil(fee / monthlySaving) : Infinity;

  return {
    outstanding,
    fee,
    currentEMI,
    newEMI,
    currentIntRemaining,
    newInt,
    currentRemaining,
    newTotal,
    grossSaving,
    netSaving,
    breakEvenMonth,
    monthlySaving,
    remainingMonths,
  };
}

function renderBTResult(bt, newRate) {
  const result = document.getElementById('emiBTResult');
  const cols   = document.getElementById('emiBTCols');
  const verdict = document.getElementById('emiBTVerdict');
  if (!result || !cols || !verdict) return;

  result.style.display = 'block';

  const remYrs = Math.floor(bt.remainingMonths / 12);
  const remMo  = bt.remainingMonths % 12;
  const remStr = remYrs > 0 ? remYrs + 'Y' + (remMo > 0 ? ' ' + remMo + 'M' : '') : remMo + 'M';

  cols.innerHTML = `
    <div class="emi-bt-col current">
      <div class="emi-bt-col-head">🏦 Current Loan</div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Outstanding</span><span class="emi-bt-row-val">₹${fmtINR(Math.round(bt.outstanding))}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Monthly EMI</span><span class="emi-bt-row-val">₹${fmtINR(Math.round(bt.currentEMI))}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Remaining tenure</span><span class="emi-bt-row-val">${remStr}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Interest left</span><span class="emi-bt-row-val" style="color:#b71c1c">₹${fmtINR(Math.round(bt.currentIntRemaining))}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Total outflow left</span><span class="emi-bt-row-val">₹${fmtINR(Math.round(bt.currentRemaining))}</span></div>
    </div>
    <div class="emi-bt-col transfer">
      <div class="emi-bt-col-head">🔄 After Transfer (${newRate}%)</div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Transfer fee</span><span class="emi-bt-row-val" style="color:#e65100">₹${fmtINR(Math.round(bt.fee))}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">New monthly EMI</span><span class="emi-bt-row-val">₹${fmtINR(Math.round(bt.newEMI))}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Remaining tenure</span><span class="emi-bt-row-val">${remStr}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Interest left</span><span class="emi-bt-row-val" style="color:#1565c0">₹${fmtINR(Math.round(bt.newInt))}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Total outflow left</span><span class="emi-bt-row-val">₹${fmtINR(Math.round(bt.newTotal + bt.fee))}</span></div>
    </div>
    <div class="emi-bt-col saving">
      <div class="emi-bt-col-head">💰 Net Benefit</div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Interest saved</span><span class="emi-bt-row-val" style="color:#2e7d32">₹${fmtINR(Math.round(bt.grossSaving))}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Less transfer fee</span><span class="emi-bt-row-val" style="color:#e65100">−₹${fmtINR(Math.round(bt.fee))}</span></div>
      <div class="emi-bt-row" style="border-top:1.5px solid rgba(46,125,50,.2);margin-top:3px;padding-top:5px"><span class="emi-bt-row-key" style="font-weight:800;color:var(--text)">Net saving</span><span class="emi-bt-row-val" style="color:${bt.netSaving > 0 ? '#2e7d32' : '#b71c1c'};font-size:.75rem">₹${fmtINR(Math.round(Math.abs(bt.netSaving)))} ${bt.netSaving > 0 ? '✅' : '⚠️'}</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">EMI reduction</span><span class="emi-bt-row-val" style="color:#2e7d32">₹${fmtINR(Math.round(bt.monthlySaving))}/mo</span></div>
      <div class="emi-bt-row"><span class="emi-bt-row-key">Break-even</span><span class="emi-bt-row-val">${bt.breakEvenMonth === Infinity ? 'Never' : bt.breakEvenMonth <= bt.remainingMonths ? 'Month ' + bt.breakEvenMonth : 'After loan ends'}</span></div>
    </div>`;

  // Verdict
  if (bt.netSaving > 0 && bt.breakEvenMonth <= bt.remainingMonths) {
    const beYr = Math.ceil(bt.breakEvenMonth / 12);
    verdict.className = 'emi-bt-verdict good';
    verdict.innerHTML = `✅ <span>Transfer is <strong>worth it</strong>. You save ₹${fmtINR(Math.round(bt.netSaving))} net. Break-even in <strong>month ${bt.breakEvenMonth}</strong> (~${beYr} yr${beYr!==1?'s':''}). EMI drops by ₹${fmtINR(Math.round(bt.monthlySaving))}/month.</span>`;
  } else if (bt.netSaving > 0 && bt.breakEvenMonth > bt.remainingMonths) {
    verdict.className = 'emi-bt-verdict neutral';
    verdict.innerHTML = `⏱ <span>Savings exist but break-even (month ${bt.breakEvenMonth}) is beyond your remaining tenure. Consider only if you plan to extend.</span>`;
  } else {
    verdict.className = 'emi-bt-verdict bad';
    verdict.innerHTML = `⚠️ <span>Transfer <strong>not recommended</strong>. Transfer fee (₹${fmtINR(Math.round(bt.fee))}) exceeds interest savings (₹${fmtINR(Math.round(bt.grossSaving))}). The rate difference is too small to justify the switch.</span>`;
  }
}

function getEMIParams() {
  const tenureRaw = parseFloat(document.getElementById('emiTenure')?.value) || 20;
  const tenureUnit = document.getElementById('emiTenureUnit')?.value || 'years';
  const tenureMonths = tenureUnit === 'years' ? tenureRaw * 12 : tenureRaw;
  return {
    loan:    parseFloat(document.getElementById('emiLoanAmt')?.value)  || 5000000,
    rate:    parseFloat(document.getElementById('emiRate')?.value)      || 8.5,
    tenure:  tenureMonths,
    tenureYears: tenureMonths / 12,
    emiAmt:  parseFloat(document.getElementById('emiAmount')?.value)    || 40000,
    prepayAmt:  parseFloat(document.getElementById('emiPrepayAmt')?.value)  || 0,
    prepayFrom: parseInt(document.getElementById('emiPrepayFrom')?.value)   || 1,
  };
}

function calcEMIValue(principal, annualRate, months) {
  if (annualRate === 0) return principal / months;
  const r = annualRate / 100 / 12;
  return principal * r * Math.pow(1+r, months) / (Math.pow(1+r, months) - 1);
}

function calcMaxLoan(emi, annualRate, months) {
  if (annualRate === 0) return emi * months;
  const r = annualRate / 100 / 12;
  return emi * (1 - Math.pow(1+r, -months)) / r;
}

function calcTenureMonths(principal, annualRate, emi) {
  if (annualRate === 0) return Math.ceil(principal / emi);
  const r = annualRate / 100 / 12;
  if (emi <= principal * r) return Infinity; // EMI too low
  return Math.ceil(-Math.log(1 - (principal * r) / emi) / Math.log(1 + r));
}

function buildAmortisation(principal, annualRate, emiAmt, prepayAmt, prepayFrom) {
  const r = annualRate / 100 / 12;
  let balance = principal;
  const months = [];
  let month = 0;
  const maxMonths = 480; // 40 years cap

  while (balance > 0.5 && month < maxMonths) {
    month++;
    const year = Math.ceil(month / 12);
    const interest = balance * r;
    let principal_paid = Math.min(emiAmt - interest, balance);
    if (principal_paid < 0) principal_paid = 0;
    let prepay = 0;
    if (prepayAmt > 0 && year >= prepayFrom && month % 12 === 0) {
      prepay = Math.min(prepayAmt, balance - principal_paid);
    }
    balance -= (principal_paid + prepay);
    if (balance < 0) balance = 0;
    months.push({ month, year, interest, principal: principal_paid, prepay, balance });
  }
  return months;
}

function calcEMI() {
  const p = getEMIParams();
  const r = p.rate / 100 / 12;

  let emiAmt, loanAmt, tenureMonths;

  if (emiMode === 'emi') {
    loanAmt = p.loan;
    tenureMonths = p.tenure;
    emiAmt = calcEMIValue(loanAmt, p.rate, tenureMonths);
  } else if (emiMode === 'loan') {
    emiAmt = p.emiAmt;
    tenureMonths = p.tenure;
    loanAmt = calcMaxLoan(emiAmt, p.rate, tenureMonths);
  } else { // tenure
    loanAmt = p.loan;
    emiAmt = p.emiAmt;
    tenureMonths = calcTenureMonths(loanAmt, p.rate, emiAmt);
    if (!isFinite(tenureMonths) || tenureMonths > 480) {
      document.getElementById('emiHdrVal').textContent = 'EMI too low';
      return;
    }
  }

  const totalPaid    = emiAmt * tenureMonths;
  const totalInterest = totalPaid - loanAmt;
  const interestPct  = totalPaid > 0 ? (totalInterest / totalPaid) * 100 : 0;
  const tenureYears  = tenureMonths / 12;

  // ── Update hero arc ──
  const circ = 351.86;
  const intOffset = circ * (1 - interestPct / 100);
  const arcInt  = document.getElementById('emiArcInterest');
  const arcGlow = document.getElementById('emiArcGlow');
  const arcPct  = document.getElementById('emiArcPct');
  if (arcInt)  arcInt.style.strokeDashoffset  = intOffset;
  if (arcGlow) arcGlow.style.strokeDashoffset = intOffset;
  if (arcPct)  arcPct.textContent = interestPct.toFixed(1) + '%';

  // ── Update hero EMI box ──
  const hdrVal = document.getElementById('emiHdrVal');
  if (emiMode === 'emi')    hdrVal.textContent = '₹' + fmtINR(Math.round(emiAmt));
  else if (emiMode === 'loan')   hdrVal.textContent = '₹' + fmtINR(Math.round(loanAmt));
  else hdrVal.textContent = Math.floor(tenureMonths/12) + 'Y ' + (tenureMonths%12) + 'M';

  // ── Journey strip ──
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ejLoanAmt',  '₹' + fmtINR(Math.round(loanAmt)));
  set('ejEMI',      '₹' + fmtINR(Math.round(emiAmt)));
  set('ejTotal',    '₹' + fmtINR(Math.round(totalPaid)));
  set('ejInterest', '₹' + fmtINR(Math.round(totalInterest)));

  // ── Summary cards ──
  const tenureStr = tenureMonths < 12
    ? tenureMonths + ' months'
    : Math.floor(tenureMonths/12) + 'Y' + (tenureMonths%12 > 0 ? ' '+tenureMonths%12+'M' : '');

  const cards = [
    { label:'Monthly EMI',     val:'₹'+fmtINR(Math.round(emiAmt)),           sub:'Fixed monthly outflow',          color:'#1565c0', bg:'rgba(21,101,192,.08)' },
    { label:'Total Interest',  val:'₹'+fmtINR(Math.round(totalInterest)),     sub:interestPct.toFixed(1)+'% of total outflow', color:'#b71c1c', bg:'rgba(183,28,28,.08)' },
    { label:'Total Payment',   val:'₹'+fmtINR(Math.round(totalPaid)),         sub:'Principal + Interest',           color:'#e65100', bg:'rgba(230,81,0,.08)' },
    { label:'Loan Tenure',     val:tenureStr,                                  sub:'Effective repayment period',     color:'#2e7d32', bg:'rgba(46,125,50,.08)' },
  ];
  const grid = document.getElementById('emiSummaryGrid');
  if (grid) grid.innerHTML = cards.map(c => `
    <div class="emi-sum-card" style="border-color:${c.color}22;background:${c.bg}">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${c.color};border-radius:2px 2px 0 0"></div>
      <div class="emi-sum-label">${c.label}</div>
      <div class="emi-sum-val" style="color:${c.color}">${c.val}</div>
      <div class="emi-sum-sub">${c.sub}</div>
    </div>`).join('');

  // ── SIP insight: what if EMI invested instead ──
  const sipGrowth12 = calcEMIValue; // reuse function
  const sipCorpus = emiAmt * ((Math.pow(1+0.12/12, tenureMonths) - 1) / (0.12/12)); // 12% p.a.
  const insightEl = document.getElementById('emiSIPInsight');
  const esiText = document.getElementById('esiText');
  if (insightEl && esiText && emiMode === 'emi') {
    insightEl.style.display = 'flex';
    esiText.innerHTML = `Investing <strong>₹${fmtINR(Math.round(emiAmt))}/month</strong> in an equity mutual fund (assumed 12% p.a.) instead of paying this loan would grow to <strong>₹${fmtINR(Math.round(sipCorpus))}</strong> in ${tenureStr}. That's <strong>₹${fmtINR(Math.round(sipCorpus - totalPaid))} more</strong> than your total loan outflow. This is why low-cost, long-tenure home loans are often better to keep while investing the surplus.`;
  } else if (insightEl) {
    insightEl.style.display = 'none';
  }

  // ── Prepayment analysis ──
  const prepayResult = document.getElementById('emiPrepayResult');
  if (emiPrepayOn && emiMode === 'emi') {
    const withoutPrepay = buildAmortisation(loanAmt, p.rate, emiAmt, 0, 0);
    const withPrepay    = buildAmortisation(loanAmt, p.rate, emiAmt, p.prepayAmt, p.prepayFrom);
    const totalWithout  = withoutPrepay.length * emiAmt;
    const intWithout    = totalWithout - loanAmt;
    const totalWith     = withPrepay.reduce((s,m) => s + emiAmt + m.prepay, 0);
    const intWith       = totalWith - loanAmt;
    const saved         = totalWithout - totalWith;
    const monthsSaved   = withoutPrepay.length - withPrepay.length;

    if (prepayResult) {
      prepayResult.style.display = 'block';
      const cmp = document.getElementById('emiPrepayCompare');
      if (cmp) cmp.innerHTML = `
        <div class="epc-col without">
          <div class="epc-label">⛔ Without Prepayment</div>
          <div class="epc-row"><span class="epc-key">Tenure</span><span class="epc-val">${Math.round(withoutPrepay.length/12*10)/10}Y</span></div>
          <div class="epc-row"><span class="epc-key">Total Interest</span><span class="epc-val" style="color:#b71c1c">₹${fmtINR(Math.round(intWithout))}</span></div>
          <div class="epc-row"><span class="epc-key">Total Outflow</span><span class="epc-val">₹${fmtINR(Math.round(totalWithout))}</span></div>
        </div>
        <div class="epc-col with">
          <div class="epc-label">✅ With Prepayment</div>
          <div class="epc-row"><span class="epc-key">Tenure</span><span class="epc-val">${Math.round(withPrepay.length/12*10)/10}Y</span></div>
          <div class="epc-row"><span class="epc-key">Total Interest</span><span class="epc-val" style="color:#1b5e20">₹${fmtINR(Math.round(intWith))}</span></div>
          <div class="epc-row"><span class="epc-key">Total Outflow</span><span class="epc-val">₹${fmtINR(Math.round(totalWith))}</span></div>
        </div>
        <div class="epc-saved" style="grid-column:1/-1">
          🎉 You save ₹${fmtINR(Math.round(saved))} and close the loan ${Math.round(monthsSaved/12*10)/10} years earlier!
        </div>`;
    }
  } else if (prepayResult) {
    prepayResult.style.display = 'none';
  }

  // ── Balance Transfer ──
  const btResult = document.getElementById('emiBTResult');
  if (emiBTOn && emiMode === 'emi') {
    const btRate    = parseFloat(document.getElementById('emiBTRate')?.value)    || 7.5;
    const btFeePct  = parseFloat(document.getElementById('emiBTFee')?.value)     || 0.5;
    const btElapsed = parseInt(document.getElementById('emiBTElapsed')?.value)   || 0;

    // Compute outstanding principal after btElapsed months
    const r0 = p.rate / 100 / 12;
    const outstanding = loanAmt * Math.pow(1 + r0, btElapsed) - emiAmt * (Math.pow(1 + r0, btElapsed) - 1) / r0;
    const remainingMonths = Math.max(1, tenureMonths - btElapsed);

    if (outstanding > 0 && btElapsed < tenureMonths) {
      const bt = calcBT(Math.round(outstanding), p.rate, emiAmt, remainingMonths, btRate, btFeePct);
      renderBTResult(bt, btRate);
    } else if (btResult) {
      btResult.style.display = 'none';
    }
  } else if (btResult) {
    btResult.style.display = 'none';
  }

  // ── Chart ──
  drawEMIChart(loanAmt, p.rate, emiAmt, tenureMonths, emiBTOn ? {
    on: true,
    elapsed: parseInt(document.getElementById('emiBTElapsed')?.value) || 0,
    newRate: parseFloat(document.getElementById('emiBTRate')?.value)   || 7.5,
  } : null);

  // ── Amortisation table ──
  buildEMITable(loanAmt, p.rate, emiAmt, tenureMonths, emiPrepayOn ? p.prepayAmt : 0, p.prepayFrom);

  // ── Live region announcement ──
  const liveEl = document.getElementById('a11yLive');
  if (liveEl) liveEl.textContent = `EMI: ${fmtINR(Math.round(emiAmt))} rupees per month. Total interest: ${fmtINR(Math.round(totalInterest))} rupees over ${tenureStr}.`;
}


function drawEMIChart(principal, rate, emiAmt, months, btParams) {
  if (emiChartInst) { emiChartInst.destroy(); emiChartInst = null; }
  const ctx = document.getElementById('emiChart');
  if (!ctx) return;

  // Build yearly data
  const r = rate / 100 / 12;
  let balance = principal;
  const years = [], principalData = [], interestData = [], balanceData = [];

  for (let y = 1; y <= Math.ceil(months/12); y++) {
    let yPrincipal = 0, yInterest = 0;
    for (let m = 0; m < 12 && balance > 0.5; m++) {
      const int = balance * r;
      const prin = Math.min(emiAmt - int, balance);
      yInterest  += int;
      yPrincipal += prin;
      balance    -= prin;
    }
    years.push('Year ' + y);
    principalData.push(Math.round(yPrincipal));
    interestData.push(Math.round(yInterest));
    balanceData.push(Math.max(0, Math.round(balance)));
  }

  // ── BT comparison line (optional) ──
  let btBalanceData = null;
  if (btParams && btParams.on && btParams.elapsed >= 0 && btParams.newRate > 0) {
    const { elapsed, newRate } = btParams;
    // Replay current loan up to elapsed months to find outstanding
    const r0 = rate / 100 / 12;
    let bal0 = principal;
    for (let m = 0; m < elapsed; m++) {
      const int0 = bal0 * r0;
      const pri0 = Math.min(emiAmt - int0, bal0);
      bal0 -= pri0;
      if (bal0 <= 0) { bal0 = 0; break; }
    }
    // New EMI at newRate for remaining months
    const remMonths = Math.max(1, months - elapsed);
    const newEMI = calcEMIValue(Math.round(bal0), newRate, remMonths);
    const rNew = newRate / 100 / 12;
    let balNew = bal0;
    btBalanceData = new Array(Math.ceil(months / 12)).fill(null);
    // Before transfer: same as original (null = use original line)
    // After transfer: simulate new amortisation
    for (let y = 1; y <= Math.ceil(months / 12); y++) {
      const monthEnd = y * 12;
      if (monthEnd <= elapsed) {
        btBalanceData[y - 1] = null; // merged with original line before transfer
      } else {
        // Advance balNew month by month for this year segment
        const startMonth = Math.max(elapsed, (y - 1) * 12);
        const endMonth = Math.min(months, y * 12);
        for (let m = startMonth; m < endMonth; m++) {
          if (balNew <= 0.5) break;
          const intN = balNew * rNew;
          const priN = Math.min(newEMI - intN, balNew);
          balNew -= priN;
        }
        btBalanceData[y - 1] = Math.max(0, Math.round(balNew));
        if (balNew <= 0.5) break;
      }
    }
  }

  emiChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        { label:'Principal', data: principalData, backgroundColor:'rgba(46,125,50,.75)', borderRadius:3, stack:'a' },
        { label:'Interest',  data: interestData,  backgroundColor:'rgba(198,40,40,.7)',  borderRadius:3, stack:'a' },
        { label:'Balance',   data: balanceData,   type:'line', borderColor:'#1565c0', backgroundColor:'rgba(21,101,192,.08)', borderWidth:2, pointRadius:2, pointHoverRadius:4, fill:true, yAxisID:'y2', tension:.3 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ font:{family:'Raleway',size:11}, color:'#2e4d2e', boxWidth:12 } },
        tooltip:{ callbacks:{ label: ctx => ` ₹${fmtINR(ctx.raw)}` } }
      },
      scales:{
        x:{ stacked:true, grid:{color:'rgba(0,0,0,.04)'}, ticks:{font:{family:'JetBrains Mono',size:10},color:'#5e8a5e'} },
        y:{ stacked:true, grid:{color:'rgba(0,0,0,.04)'}, ticks:{font:{family:'JetBrains Mono',size:10},color:'#5e8a5e', callback:v=>'₹'+fmtINR(v)} },
        y2:{ position:'right', grid:{display:false}, ticks:{font:{family:'JetBrains Mono',size:10},color:'#1565c0', callback:v=>'₹'+fmtINR(v)} }
      }
    }
  });
}

function buildEMITable(principal, rate, emiAmt, totalMonths, prepayAmt, prepayFrom) {
  const inner = document.getElementById('emiTableInner');
  if (!inner) return;
  const r = rate / 100 / 12;
  let balance = principal;
  let rows = '';
  let grandPrin = 0, grandInt = 0, grandPrepay = 0;

  for (let y = 1; y <= Math.ceil(totalMonths/12); y++) {
    let yPrincipal = 0, yInterest = 0, yPrepay = 0;
    for (let m = 0; m < 12 && balance > 0.5; m++) {
      const month = (y-1)*12 + m + 1;
      const int  = balance * r;
      const prin = Math.min(emiAmt - int, balance);
      yInterest  += int;
      yPrincipal += prin;
      balance    -= prin;
    }
    // Annual prepay
    if (prepayAmt > 0 && y >= prepayFrom && balance > 0) {
      yPrepay = Math.min(prepayAmt, balance);
      balance -= yPrepay;
    }
    grandPrin += yPrincipal; grandInt += yInterest; grandPrepay += yPrepay;
    rows += `<tr>
      <td>Year ${y}</td>
      <td class="principal-cell">₹${fmtINR(Math.round(yPrincipal))}</td>
      <td class="interest-cell">₹${fmtINR(Math.round(yInterest))}</td>
      ${prepayAmt > 0 ? `<td>₹${fmtINR(Math.round(yPrepay))}</td>` : ''}
      <td class="balance-cell">₹${fmtINR(Math.max(0,Math.round(balance)))}</td>
    </tr>`;
  }
  const prepayCol = prepayAmt > 0 ? '<th>Prepayment</th>' : '';
  const prepayTot = prepayAmt > 0 ? `<td>₹${fmtINR(Math.round(grandPrepay))}</td>` : '';
  inner.innerHTML = `<table class="emi-table">
    <thead><tr><th>Period</th><th>Principal Paid</th><th>Interest Paid</th>${prepayCol}<th>Outstanding</th></tr></thead>
    <tbody>${rows}
    <tr><td>Total</td><td class="principal-cell">₹${fmtINR(Math.round(grandPrin))}</td><td class="interest-cell">₹${fmtINR(Math.round(grandInt))}</td>${prepayTot}<td>₹0</td></tr>
    </tbody></table>`;
}

function printEMI() {
  // Collect data
  const p = getEMIParams();
  const emiAmt    = (emiMode === 'emi')    ? calcEMIValue(p.loan, p.rate, p.tenure)
                  : (emiMode === 'tenure') ? calcEMIValue(p.loan, p.rate, p.tenure)
                  : parseFloat(document.getElementById('emiAmount')?.value) || 0;
  const totalPay  = emiAmt * p.tenure;
  const totalInt  = totalPay - p.loan;

  // Gather rendered sections
  const prepayEl   = document.getElementById('emiPrepayResult');
  const insightEl  = document.getElementById('emiSIPInsight');
  const tableEl    = document.getElementById('emiTableInner');
  const chartEl    = document.getElementById('emiChart');


  const prepayHTML  = (prepayEl  && prepayEl.style.display  !== 'none') ? prepayEl.outerHTML  : '';
  const insightHTML = (insightEl && insightEl.style.display !== 'none') ? insightEl.outerHTML : '';
  const tableHTML   = tableEl    ? tableEl.innerHTML    : '';
  const chartImg    = chartEl    ? chartEl.toDataURL('image/png') : '';

  // Loan type label
  const presetLabels = {home:'Home Loan',car:'Car Loan',personal:'Personal Loan',education:'Education Loan',custom:'Custom Loan'};
  const presetActive = document.querySelector('.emi-preset.active');
  const presetKey    = presetActive ? presetActive.getAttribute('onclick').match(/'(\w+)'/)?.[1] : 'custom';
  const loanLabel    = presetLabels[presetKey] || 'Loan';

  const tenureYrs = Math.round(p.tenure / 12 * 10) / 10;
  const closureDate = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + p.tenure);
    return d.toLocaleDateString('en-IN', {month:'short', year:'numeric'});
  })();

  const win = window.open('', '_blank', 'width=960,height=760');
  win.document.write(`<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<title>SIP &amp; SWP NAV Backtester, MF Comparison, Goal Planner &amp; EMI | Abundance</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#1a0a0a;padding:30px 36px;font-size:13px}
/* Header */
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #b71c1c;margin-bottom:20px}
.pt{font-size:1.1rem;font-weight:800;color:#b71c1c}
.pt span{font-size:.65rem;font-weight:700;color:#888;display:block;margin-top:2px;font-family:"JetBrains Mono",monospace}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
/* Section headings */
.sec{font-size:.55rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#b71c1c;margin:16px 0 8px;display:flex;align-items:center;gap:8px}
.sec::after{content:'';flex:1;height:1px;background:#ffcdd2}
/* Summary hero */
.hero-band{background:linear-gradient(135deg,#1a0a0a 0%,#4a1414 60%,#6d2020 100%);border-radius:12px;padding:18px 22px;margin-bottom:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.hb-item{text-align:center}
.hb-label{font-size:.5rem;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.45);font-family:"JetBrains Mono",monospace;margin-bottom:4px}
.hb-val{font-family:"JetBrains Mono",monospace;font-size:1rem;font-weight:800;color:#ffcdd2;line-height:1.1}
.hb-sub{font-size:.52rem;color:rgba(255,255,255,.35);font-family:"JetBrains Mono",monospace;margin-top:2px}
/* Split bar */
.split-bar-wrap{margin:10px 0 14px}
.split-bar-track{height:10px;background:#ffebee;border-radius:5px;overflow:hidden;display:flex}
.split-bar-p{height:100%;background:#2e7d32;border-radius:5px 0 0 5px;transition:width .6s}
.split-bar-i{height:100%;background:#c62828;border-radius:0 5px 5px 0}
.split-bar-legend{display:flex;justify-content:space-between;margin-top:6px;font-size:.58rem;font-weight:700}
.sbl-p{color:#2e7d32}.sbl-i{color:#c62828}
/* Summary grid */
.emi-summary-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}
.emi-sum-card{border:1.5px solid #e0e0e0;border-radius:10px;padding:12px 14px}
.esc-label{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.9px;color:#888;margin-bottom:5px;display:flex;align-items:center;gap:6px}
.esc-val{font-family:"JetBrains Mono",monospace;font-size:.95rem;font-weight:800;margin-bottom:2px}
.esc-sub{font-size:.58rem;font-family:"JetBrains Mono",monospace;color:#999}
/* Prepay result */
.emi-prepay-result{border:1.5px solid #bbdefb;border-radius:12px;padding:14px 16px;background:#e3f2fd;margin-bottom:12px}
.epc-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.62rem}
.epc-row:last-child{border-bottom:none}
.epc-key{opacity:.75}.epc-val{font-family:"JetBrains Mono",monospace;font-weight:700}
.epc-saved{margin-top:8px;padding:8px 12px;background:#e8f5e9;border-radius:8px;font-size:.65rem;font-weight:700;color:#2e7d32;text-align:center}
.emi-prepay-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}
/* SIP insight */
.emi-sip-insight{background:linear-gradient(135deg,#e8f5e9,#f1f8e9);border:1.5px solid #a5d6a7;border-radius:11px;padding:13px 16px;margin-bottom:12px;display:flex;align-items:flex-start;gap:12px}
.esi-icon{font-size:1.5rem;flex-shrink:0;margin-top:2px}
.esi-title{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#2e7d32;margin-bottom:4px}
.esi-body{font-size:.7rem;color:#1b5e20;line-height:1.6;font-weight:600}
/* Chart */
.ci img{width:100%;border-radius:8px;border:1px solid #ffcdd2;margin-bottom:12px}
/* Balance transfer cols */
.emi-bt-col{border-radius:9px;padding:11px 13px;border:1.5px solid #e0e0e0}
.emi-bt-col.current{background:#fff5f5;border-color:#ffcdd2}
.emi-bt-col.transfer{background:#e3f2fd;border-color:#90caf9}
.emi-bt-col.saving{background:#e8f5e9;border-color:#a5d6a7}
.emi-bt-col-head{font-size:.5rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.emi-bt-col.current .emi-bt-col-head{color:#b71c1c}
.emi-bt-col.transfer .emi-bt-col-head{color:#1565c0}
.emi-bt-col.saving .emi-bt-col-head{color:#2e7d32}
.emi-bt-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.6rem}
.emi-bt-row:last-child{border-bottom:none}
.emi-bt-row-key{opacity:.7}.emi-bt-row-val{font-family:"JetBrains Mono",monospace;font-weight:700}
/* Amortisation table */
.emi-table{width:100%;border-collapse:collapse;font-size:.68rem}
.emi-table th{padding:8px 12px;background:#b71c1c;color:#fff;font-size:.54rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;text-align:right;white-space:nowrap}
.emi-table th:first-child{text-align:left}
.emi-table td{padding:7px 12px;border-bottom:1px solid #f5f5f5;text-align:right;font-family:"JetBrains Mono",monospace}
.emi-table td:first-child{text-align:left;font-family:"Raleway",sans-serif;font-weight:700;color:#555}
.emi-table tr:last-child td{font-weight:800;background:#fff8e1;border-bottom:none}
.emi-table tr:nth-child(even) td{background:#fafafa}
.principal-cell{color:#2e7d32;font-weight:700!important}
.interest-cell{color:#c62828;font-weight:700!important}
.balance-cell{color:#555}
.prepay-row td{background:#e8eaf6!important;color:#3949ab!important;font-weight:700!important}
/* Insights grid */
.sum-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.sum-card{border:1.5px solid #e0e0e0;border-radius:9px;padding:11px 13px;background:#fafafa}
.sum-label{font-size:.5rem;font-weight:800;text-transform:uppercase;letter-spacing:.9px;color:#888;margin-bottom:5px}
.sum-val{font-family:"JetBrains Mono",monospace;font-size:.95rem;font-weight:800;margin-bottom:2px;line-height:1.2}
.sum-sub{font-size:.56rem;font-family:"JetBrains Mono",monospace;color:#999}
/* Prepayment compare columns */
.emi-prepay-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.epc-col{background:#fff;border:1.5px solid #e0e0e0;border-radius:9px;padding:11px 13px}
.epc-col.with{border-color:#a5d6a7;background:#f1f8e9}
.epc-col.without{border-color:#ef9a9a;background:#fff5f5}
.epc-label{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;color:#555}
/* SIP insight */
.sip-insight{background:#e8f5e9;border:1.5px solid #a5d6a7;border-radius:10px;padding:12px 15px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px}
.si-icon{font-size:1.4rem;flex-shrink:0}
.si-title{font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#2e7d32;margin-bottom:3px}
.si-body{font-size:.68rem;color:#1b5e20;line-height:1.6;font-weight:600}
/* Disclaimer */
.dis{padding:10px 14px;border-radius:8px;background:#fffde7;border-left:3px solid #f9a825;font-size:.58rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}.no-print{display:none}}
</style>
</head>
<body>

<div class="ph">
  <div>
    <div class="pt">${loanLabel} — EMI Plan
      <span>Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds Distributor &amp; SIF Distributor</span>
    </div>
  </div>
  <img class="logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>

<div class="sec">Loan Summary</div>
<div class="hero-band">
  <div class="hb-item">
    <div class="hb-label">Monthly EMI</div>
    <div class="hb-val">₹${fmtINR(Math.round(emiAmt))}</div>
    <div class="hb-sub">per month</div>
  </div>
  <div class="hb-item">
    <div class="hb-label">Loan Amount</div>
    <div class="hb-val">₹${fmtINR(p.loan)}</div>
    <div class="hb-sub">${p.rate.toFixed(1)}% p.a.</div>
  </div>
  <div class="hb-item">
    <div class="hb-label">Total Interest</div>
    <div class="hb-val">₹${fmtINR(Math.round(totalInt))}</div>
    <div class="hb-sub">${Math.round(totalInt/p.loan*100)}% of principal</div>
  </div>
  <div class="hb-item">
    <div class="hb-label">Loan Closes</div>
    <div class="hb-val">${closureDate}</div>
    <div class="hb-sub">${Math.round(p.tenure/12*10)/10} years tenure</div>
  </div>
</div>

<div class="split-bar-wrap">
  <div class="split-bar-track">
    <div class="split-bar-p" style="width:${Math.round(p.loan/totalPay*100)}%"></div>
    <div class="split-bar-i" style="width:${Math.round(totalInt/totalPay*100)}%"></div>
  </div>
  <div class="split-bar-legend">
    <span class="sbl-p">● Principal ₹${fmtINR(p.loan)} (${Math.round(p.loan/totalPay*100)}%)</span>
    <span class="sbl-i">● Interest ₹${fmtINR(Math.round(totalInt))} (${Math.round(totalInt/totalPay*100)}%) · Total Outflow ₹${fmtINR(Math.round(totalPay))}</span>
  </div>
</div>

${(()=>{
    const cards=[
      {label:'Monthly EMI',     val:'₹'+fmtINR(Math.round(emiAmt)),        sub:'Fixed monthly outflow',              color:'#1565c0'},
      {label:'Total Interest',  val:'₹'+fmtINR(Math.round(totalInt)),       sub:(Math.round(totalInt/totalPay*100))+'% of total outflow', color:'#b71c1c'},
      {label:'Total Payment',   val:'₹'+fmtINR(Math.round(totalPay)),       sub:'Principal + Interest',               color:'#e65100'},
      {label:'Interest Year 1', val:'₹'+fmtINR(Math.round(p.rate/100/12*p.loan*12)), sub:'Highest interest burden year', color:'#6a1b9a'},
    ];
    return `<div class="sec">Insights</div><div class="sum-grid">${cards.map(c=>`
      <div class="sum-card" style="border-top:3px solid ${c.color}">
        <div class="sum-label">${c.label}</div>
        <div class="sum-val" style="color:${c.color}">${c.val}</div>
        <div class="sum-sub">${c.sub}</div>
      </div>`).join('')}</div>`;
  })()}
${(()=>{
    const insightEl = document.getElementById('emiSIPInsight');
    if (!insightEl || insightEl.style.display==='none') return '';
    const sipCorpus = emiAmt * ((Math.pow(1+0.12/12, p.tenure)-1)/(0.12/12));
    return `<div class="sec">SIP Opportunity</div>
    <div class="sip-insight">
      <div class="si-icon">💡</div>
      <div><div class="si-title">What if you invested instead?</div>
      <div class="si-body">Investing <strong>₹${fmtINR(Math.round(emiAmt))}/month</strong> in an equity mutual fund at 12% p.a. would grow to <strong>₹${fmtINR(Math.round(sipCorpus))}</strong> — ₹${fmtINR(Math.round(sipCorpus-totalPay))} more than your total loan outflow of ₹${fmtINR(Math.round(totalPay))}.</div></div>
    </div>`;
  })()}
${prepayHTML  ? `<div class="sec">Prepayment Analysis</div>${prepayHTML}` : ''}
${(()=>{
    if (!emiBTOn || emiMode !== 'emi') return '';
    const btColsEl = document.getElementById('emiBTCols');
    const btVerdEl = document.getElementById('emiBTVerdict');
    const btRate   = parseFloat(document.getElementById('emiBTRate')?.value) || 7.5;
    const feePct   = parseFloat(document.getElementById('emiBTFee')?.value) || 0.5;
    const elapsed  = parseInt(document.getElementById('emiBTElapsed')?.value) || 0;
    if (!btColsEl || btColsEl.innerHTML.trim()==='') return '';
    return `<div class="sec">Balance Transfer Analysis (${p.rate}% → ${btRate}%, ${elapsed} months elapsed)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">${btColsEl.innerHTML}</div>
    ${btVerdEl ? `<div style="padding:10px 14px;border-radius:9px;font-size:.68rem;font-weight:700;background:#e8f5e9;border:1.5px solid #a5d6a7;color:#1b5e20">${btVerdEl.innerHTML}</div>` : ''}`;
  })()}
${chartImg    ? `<div class="sec">Year-by-Year Breakdown</div><div class="ci"><img src="${chartImg}"></div>` : ''}
${tableHTML   ? `<div class="sec">Amortisation Schedule</div><table class="emi-table">${tableHTML}</table>` : ''}

<div class="dis">⚠️ <strong style="color:#e65100">Disclaimer:</strong> EMI and loan calculations are illustrative. Actual repayment schedules may vary based on lender terms, processing charges, and compounding conventions. This document does not constitute financial or legal advice. Please consult your financial advisor before taking any loan. | Abundance Financial Services® · ARN-251838</div>

<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
</body>
</html>`);
  win.document.close();
}

// ══════════════════════════════════════════════
// localStorage persistence — remember last inputs
// ══════════════════════════════════════════════
const LS_KEY = 'mfcalc_v1';

function saveState() {
  try {
    const ids = [
      'sipAmount','lumpAmount','sipDuration','sipDurationUnit','sipRate','sipStepup','sipFreq',
      'emiLoanAmt','emiRate','emiTenure','emiTenureUnit',
      'goalAmount','goalName','goalDuration','goalDurationUnit','goalRate','goalInflation',
      'goalExisting','goalFreq','goalStepup','goalLumpsumPct',
      'swpCorpus','swpWithdrawal','swpRate','swpDuration','swpDurationUnit'
    ];
    const state = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) state[id] = el.value;
    });
    // Note: tab selection intentionally NOT saved — URL params handle sharing,
    // and restoring tab on every reload is disorienting.
    state._calcMode = document.querySelector('.smt-btn.active')?.id || 'modeSIP';
    state._emiMode  = document.querySelector('.emt-btn.active')?.id  || 'emtEMI';
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch(e) {}
}

function restoreState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    Object.entries(state).forEach(([id, val]) => {
      if (id.startsWith('_')) return;
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
    // Restore calc mode
    if (state._calcMode) {
      const modeBtn = document.getElementById(state._calcMode);
      if (modeBtn) modeBtn.click();
    }
    // Restore EMI mode
    if (state._emiMode) {
      const emiBtn = document.getElementById(state._emiMode);
      if (emiBtn) emiBtn.click();
    }
  } catch(e) {}
}

// Save on any input/change event (debounced)
const dSaveState = debounce(saveState, 600);
document.addEventListener('input',  () => dSaveState());
document.addEventListener('change', () => dSaveState());

// ── URL params: read on load, write on calc ──
function readURLParams() {
  try {
    const p = new URLSearchParams(window.location.search);
    const tab = p.get('tab');
    if (tab) {
      const tabBtn = document.getElementById('mtab-'+tab);
      if (tabBtn) switchMainTab(tab, tabBtn);
    }
    const map = {
      loan:'emiLoanAmt', rate:'emiRate', tenure:'emiTenure',
      sip:'sipAmount', years:'sipDuration', ret:'sipRate',
      goal:'goalTarget', gyears:'goalYears',
      corpus:'swpCorpus', withdraw:'swpMonthly'
    };
    let any = false;
    Object.entries(map).forEach(([param, id]) => {
      const val = p.get(param);
      if (val) { const el = document.getElementById(id); if (el) { el.value = val; any = true; } }
    });
    if (any) { calcSIP(); calcGoal(); calcSWP(); calcEMI(); }
  } catch(e) {}
}

// ── Dynamic OG meta injection for shared backtester URLs ──
function injectBTShareMeta(){
  const p = new URLSearchParams(location.search);

  // Handle SIP Backtester share links
  if(p.get('sipBTMode')){
    const fundName = p.get('sipBTName') || 'SIP Backtest';
    const xirr     = p.get('sipXirr') || '';
    const corpus   = p.get('sipCorpus') || '';
    const invested = p.get('sipInvested') || '';
    const gain     = p.get('sipGain') || '';
    const btSY     = p.get('sipBTSY') || '';
    const ogParams = new URLSearchParams({
      sipBTMode:'1',
      sipBTName: fundName,
      sipBTAmount: p.get('sipBTAmount') || '',
      sipBTSY: btSY,
      sipBTSM: p.get('sipBTSM') || '',
      sipBTEY: p.get('sipBTEY') || '',
      sipBTEM: p.get('sipBTEM') || '',
      sipXirr: xirr,
      sipCorpus: corpus,
      sipInvested: invested,
      sipGain: gain,
    });
    const ogImageURL = location.origin + '/api/og?' + ogParams.toString();
    const titleText  = 'SIP Backtester — ' + (fundName.length>40?fundName.slice(0,40)+'…':fundName) + ' | Abundance';
    const descText   = 'SIP backtest on ' + fundName + (btSY?' from '+btSY:'') +
      (corpus?' · Corpus ₹'+Number(corpus).toLocaleString('en-IN'):'') +
      (xirr?' · XIRR '+xirr+'% p.a.':'') + ' | Abundance ARN-251838';
    function setMeta2(prop, val, isName){
      const attr = isName ? 'name' : 'property';
      let el = document.querySelector('meta['+attr+'="'+prop+'"]');
      if(!el){ el = document.createElement('meta'); el.setAttribute(attr, prop); document.head.appendChild(el); }
      el.setAttribute('content', val);
    }
    document.title = titleText;
    setMeta2('og:title', titleText);
    setMeta2('og:description', descText);
    setMeta2('og:url', location.href);
    setMeta2('og:image', ogImageURL);
    setMeta2('og:image:width', '1200');
    setMeta2('og:image:height', '630');
    setMeta2('twitter:card', 'summary_large_image', true);
    setMeta2('twitter:title', titleText, true);
    setMeta2('twitter:description', descText, true);
    setMeta2('twitter:image', ogImageURL, true);
    return;
  }

  const isSWPBT2 = !!p.get('btMode');
  const isSIPBT2 = !!p.get('sipBTMode');
  if(!isSWPBT2 && !isSIPBT2) return;
  if(isSIPBT2) {
    const sn = p.get('sipBTName')||'SIP Backtest';
    const sx = p.get('sipXirr')||'';
    const sc = p.get('sipCorpus')||'';
    const sTitle = 'SIP Backtest: '+(sn.length>32?sn.slice(0,32)+'...':sn)+' | Abundance';
    const sDesc  = (['SIP backtest: '+sn, sx?'XIRR '+sx+'% p.a.':'', sc?'Final corpus Rs'+sc:''].filter(Boolean).join(' | ')+' — Abundance ARN-251838').slice(0,160);
    const sOgP   = new URLSearchParams({sipBTMode:'1',sipBTName:sn,sipBTAmount:p.get('sipBTAmount')||'',sipBTSY:p.get('sipBTSY')||'',sipBTSM:p.get('sipBTSM')||'',sipBTEY:p.get('sipBTEY')||'',sipBTEM:p.get('sipBTEM')||'',sipXirr:sx,sipCorpus:sc,sipInvested:p.get('sipInvested')||'',sipGain:p.get('sipGain')||''});
    const sImg   = location.origin+'/api/og?'+sOgP;
    document.title = sTitle;
    function smS(pr,vl,isN){let e=document.querySelector('meta['+(isN?'name':'property')+'="'+pr+'"]');if(!e){e=document.createElement('meta');e.setAttribute(isN?'name':'property',pr);document.head.appendChild(e);}e.setAttribute('content',vl);}
    smS('og:title',sTitle);smS('og:description',sDesc);smS('og:url',location.href);smS('og:image',sImg);smS('twitter:title',sTitle,true);smS('twitter:description',sDesc,true);smS('twitter:image',sImg,true);
    return;
  }
  if(!isSWPBT2) return;
  // Build OG image URL pointing to our /api/og endpoint
  const ogParams = new URLSearchParams({
    tab: 'swp',
    btName: p.get('btName')||'',
    btCorpus: p.get('btCorpus')||'',
    btWithdrawal: p.get('btWithdrawal')||'',
    btSY: p.get('btSY')||'',
    btSM: p.get('btSM')||'',
    btEY: p.get('btEY')||'',
    btEM: p.get('btEM')||'',
    xirr: p.get('xirr')||'',
    survived: p.get('survived')||'',
    finalC: p.get('finalC')||'',
  });
  const ogImageURL = location.origin + '/api/og?' + ogParams.toString();
  const pageURL    = location.href;
  const fundName   = p.get('btName') || 'SWP Backtester';
  const titleText  = 'SWP Backtester — ' + (fundName.length>50?fundName.slice(0,50)+'…':fundName) + ' | Abundance';
  const descText   = 'SWP backtest on ' + fundName
    + (p.get('btSY') ? ' from ' + p.get('btSY') : '')
    + (p.get('btCorpus') ? ' · Corpus ₹' + Number(p.get('btCorpus')).toLocaleString('en-IN') : '')
    + (p.get('xirr') ? ' · XIRR ' + p.get('xirr') + '% p.a.' : '')
    + ' | Abundance Financial Services ARN-251838';

  // Update or create OG meta tags
  function setMeta(prop, val, isName){
    const attr = isName ? 'name' : 'property';
    let el = document.querySelector('meta['+attr+'="'+prop+'"]');
    if(!el){ el = document.createElement('meta'); el.setAttribute(attr, prop); document.head.appendChild(el); }
    el.setAttribute('content', val);
  }
  document.title = titleText;
  setMeta('og:title', titleText);
  setMeta('og:description', descText);
  setMeta('og:url', pageURL);
  setMeta('og:image', ogImageURL);
  setMeta('og:image:width', '1200');
  setMeta('og:image:height', '630');
  setMeta('twitter:card', 'summary_large_image', true);
  setMeta('twitter:title', titleText, true);
  setMeta('twitter:description', descText, true);
  setMeta('twitter:image', ogImageURL, true);
}

function writeURLParams() {
  try {
    const activeTab = document.querySelector('.main-tab.active')?.id?.replace('mtab-','') || 'fund';
    const p = new URLSearchParams();
    p.set('tab', activeTab);
    const getVal = id => document.getElementById(id)?.value || '';
    if (activeTab === 'sip') {
      p.set('sip', getVal('sipAmount'));
      p.set('years', getVal('sipDuration'));
      p.set('ret', getVal('sipRate'));
    } else if (activeTab === 'emi') {
      p.set('loan', getVal('emiLoanAmt'));
      p.set('rate', getVal('emiRate'));
      p.set('tenure', getVal('emiTenure'));
    } else if (activeTab === 'goal') {
      p.set('goal', getVal('goalTarget'));
      p.set('gyears', getVal('goalYears'));
    } else if (activeTab === 'swp') {
      // Don't overwrite URL when in backtester sub-mode — BT has its own share URL
      const _swpTabs = document.querySelectorAll('.swp-mode-tab');
      if (_swpTabs[2] && _swpTabs[2].classList.contains('active')) return;
      p.set('corpus', getVal('swpCorpus'));
      p.set('withdraw', getVal('swpMonthly'));
    }
    const newURL = window.location.pathname + '?' + p.toString();
    window.history.replaceState(null, '', newURL);
  } catch(e) {}
}

const dWriteURL = debounce(writeURLParams, 800);
document.addEventListener('input',  () => dWriteURL());
document.addEventListener('change', () => dWriteURL());

// Restore on load
restoreState();
readURLParams();
injectBTShareMeta();
btReadURL();
sipBTReadURL();
loadQuickPicks();




if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.update();
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              const b = document.createElement('div');
              b.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:9999;background:#1b5e20;color:#fff;padding:10px 20px;border-radius:30px;font-family:Raleway,sans-serif;font-size:.78rem;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,.3);cursor:pointer;white-space:nowrap';
              b.textContent = '\ud83d\udd04 Update available — tap to refresh';
              b.onclick = () => window.location.reload();
              document.body.appendChild(b);
              setTimeout(() => b.remove(), 8000);
            }
          });
        });
      })
      .catch(() => {});
  });
}
