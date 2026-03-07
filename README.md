<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MF Risk & Return Analyzer | Abundance Financial Services</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#f0f7f0;--surface:#fff;--surface2:#edf6ed;--surface3:#dff0df;
  --border:#c2dfc2;--border2:#a8cfa8;
  --text:#162616;--text2:#2e4d2e;--muted:#5e8a5e;
  --g1:#1b5e20;--g2:#2e7d32;--g3:#43a047;--g4:#66bb6a;
  --g-light:#a5d6a7;--g-xlight:#e8f5e9;
  --c0:#2e7d32;--c1:#1565c0;--c2:#e65100;--c3:#6a1b9a;--c4:#00838f;
  --c0d:rgba(46,125,50,.1);--c1d:rgba(21,101,192,.1);--c2d:rgba(230,81,0,.1);--c3d:rgba(106,27,154,.1);--c4d:rgba(0,131,143,.1);
  --pos:#1b5e20;--neg:#b71c1c;
  --shadow:0 2px 16px rgba(46,125,50,.09);--shadow-lg:0 8px 40px rgba(46,125,50,.14);
  --radius:14px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;
  background-image:radial-gradient(ellipse 70% 40% at 50% -10%,rgba(46,125,50,.07) 0%,transparent 60%)}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
.accent-line{height:3px;background:linear-gradient(90deg,var(--g1),var(--g3),var(--g4),var(--g3),var(--g1))}
.page{max-width:1160px;margin:0 auto;padding:0 24px 80px}

/* NAVBAR */
.navbar{display:flex;align-items:center;justify-content:space-between;padding:20px 0 18px;margin-bottom:32px;border-bottom:1.5px solid var(--border);gap:16px;flex-wrap:wrap;animation:fadeDown .5s ease both}
.logo-wrap{display:flex;align-items:center;gap:13px;text-decoration:none}
.logo-img{height:56px;width:auto;max-width:140px;object-fit:contain;mix-blend-mode:multiply}
.logo-icon{width:50px;height:50px;border-radius:10px;background:linear-gradient(135deg,var(--g1),var(--g3));display:none;align-items:center;justify-content:center;font-size:1.3rem;font-weight:800;color:#fff;flex-shrink:0}
.logo-text .brand{font-size:1.12rem;font-weight:800;color:var(--g2);letter-spacing:-.3px}
.logo-text .sub{font-size:.62rem;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin-top:1px}
.nav-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.nav-link{font-size:.76rem;font-weight:700;color:var(--muted);text-decoration:none;padding:7px 13px;border-radius:8px;border:1px solid transparent;transition:all .18s}
.nav-link:hover{color:var(--g2);border-color:var(--border2);background:var(--g-xlight)}
.nav-tag{font-size:.64rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:7px 14px;border-radius:8px;background:var(--g-xlight);border:1.5px solid var(--g-light);color:var(--g2)}

/* HERO */
.hero{background:linear-gradient(135deg,var(--g1) 0%,var(--g2) 55%,var(--g3) 100%);border-radius:var(--radius);padding:34px 40px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap;box-shadow:var(--shadow-lg);position:relative;overflow:hidden;animation:fadeUp .5s .1s ease both}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:36px 36px;pointer-events:none;mask-image:radial-gradient(ellipse 80% 100% at 0% 50%,black 30%,transparent 75%)}
.hero::after{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.05);pointer-events:none}
.hero-left{position:relative;z-index:1}
.hero-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:.62rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.9);margin-bottom:13px;padding:5px 12px;border-radius:20px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)}
.hero-eyebrow::before{content:"";width:6px;height:6px;border-radius:50%;background:#a5d6a7;animation:pulse 2s ease infinite}
.hero-text h1{font-size:clamp(1.5rem,3.2vw,2.2rem);font-weight:800;color:#fff;letter-spacing:-.4px;line-height:1.18}
.hero-text p{margin-top:11px;color:rgba(255,255,255,.78);font-size:.86rem;line-height:1.72;max-width:500px}
.hero-stats{display:flex;gap:10px;flex-wrap:wrap;position:relative;z-index:1}
.hero-stat{background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.22);border-radius:10px;padding:16px 20px;text-align:center;min-width:110px;transition:background .2s}
.hero-stat:hover{background:rgba(255,255,255,.18)}
.hero-stat-val{font-family:"JetBrains Mono",monospace;font-size:clamp(1rem,2.5vw,1.45rem);font-weight:600;color:#fff}
.hero-stat-label{font-size:.59rem;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1.2px;margin-top:4px;font-weight:700}

/* SEARCH */
.search-card{background:var(--surface);border-radius:var(--radius);padding:24px 28px;box-shadow:var(--shadow);border:1.5px solid var(--border);margin-bottom:18px;animation:fadeUp .5s .15s ease both;position:relative;z-index:100}
.section-label{font-size:.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:13px;display:flex;align-items:center;gap:9px}
.section-label::after{content:"";flex:1;height:1px;background:var(--border)}
.search-wrap{position:relative}
.search-input{width:100%;padding:13px 20px;font-family:"Raleway",sans-serif;font-size:.92rem;font-weight:600;border:1.5px solid var(--border);border-radius:10px;background:var(--surface2);color:var(--text);outline:none;transition:all .2s}
.search-input:focus{border-color:var(--g3);background:#fff;box-shadow:0 0 0 4px rgba(67,160,71,.1)}
.search-input::placeholder{color:var(--muted);font-weight:400}
.search-hint{font-size:.71rem;color:var(--muted);margin-top:8px}
.dropdown{position:absolute;top:calc(100% + 7px);left:0;right:0;background:#fff;border:1.5px solid var(--border);border-radius:10px;box-shadow:var(--shadow-lg);z-index:1000;display:none;max-height:420px;overflow-y:auto;scroll-behavior:smooth}
.dropdown.open{display:block}
.dropdown-item{padding:9px 16px;cursor:pointer;font-size:.82rem;font-weight:600;border-bottom:1px solid var(--surface2);display:flex;align-items:center;gap:10px;transition:background .12s;color:var(--text2);line-height:1.35}
.dropdown-item:last-child{border-bottom:none}
.dropdown-item:hover{background:var(--g-xlight);color:var(--g2)}
.di-code{font-family:"JetBrains Mono",monospace;font-size:.68rem;color:var(--muted);background:var(--surface2);padding:2px 7px;border-radius:4px;flex-shrink:0}
.dd-count{padding:7px 16px;font-size:.62rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);background:var(--surface2);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:1}
.dropdown-loading{padding:16px 18px;color:var(--muted);font-size:.84rem;text-align:center}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 14px;border-radius:7px;font-size:.76rem;font-weight:700;max-width:330px}
.chip-0{background:var(--c0d);color:var(--c0);border:1.5px solid rgba(46,125,50,.25)}
.chip-1{background:var(--c1d);color:var(--c1);border:1.5px solid rgba(21,101,192,.25)}
.chip-2{background:var(--c2d);color:var(--c2);border:1.5px solid rgba(230,81,0,.25)}
.chip-3{background:var(--c3d);color:var(--c3);border:1.5px solid rgba(106,27,154,.25)}
.chip-4{background:var(--c4d);color:var(--c4);border:1.5px solid rgba(0,131,143,.25)}
.chip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip-remove{flex-shrink:0;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.08);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:inherit;transition:background .15s}
.chip-remove:hover{background:rgba(0,0,0,.16)}
.loading-bar{height:2px;background:var(--surface3);border-radius:1px;margin-top:10px;overflow:hidden;display:none}
.loading-bar.active{display:block}
.loading-bar-inner{height:100%;width:30%;background:linear-gradient(90deg,var(--g2),var(--g4));animation:slide 1s ease-in-out infinite}

/* TOOLBAR */
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap;animation:fadeUp .3s ease both}
.period-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.period-label{font-size:.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-right:4px}
.period-btn{padding:7px 16px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--muted);font-family:"JetBrains Mono",monospace;font-size:.76rem;font-weight:600;cursor:pointer;transition:all .15s}
.period-btn:hover{border-color:var(--g3);color:var(--g2);background:var(--g-xlight)}
.period-btn.active{background:var(--g2);border-color:var(--g2);color:#fff}
.export-btn{display:flex;align-items:center;gap:7px;padding:8px 16px;border:1.5px solid var(--border2);border-radius:8px;background:#fff;color:var(--g2);font-family:"Raleway",sans-serif;font-size:.76rem;font-weight:700;cursor:pointer;transition:all .15s}
.export-btn:hover{background:var(--g-xlight);border-color:var(--g3)}

/* TABS */
.tabs-row{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:18px;background:var(--surface2);padding:5px;border-radius:10px;border:1.5px solid var(--border);animation:fadeUp .35s ease both}
.tab-btn{flex:1;min-width:100px;padding:9px 14px;border:none;border-radius:7px;background:transparent;color:var(--muted);font-family:"Raleway",sans-serif;font-size:.76rem;font-weight:700;cursor:pointer;transition:all .18s;white-space:nowrap}
.tab-btn:hover{color:var(--g2);background:rgba(46,125,50,.06)}
.tab-btn.active{background:#fff;color:var(--g2);box-shadow:var(--shadow)}

/* CARDS */
.card{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:16px;box-shadow:var(--shadow);animation:fadeUp .4s ease both}
.card-header{padding:20px 24px 0}
.card-title{font-size:.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);padding-bottom:15px;border-bottom:1px solid var(--surface2);display:flex;align-items:center;gap:10px}
.card-title::before{content:"";width:3px;height:13px;background:var(--g3);border-radius:2px}
.card-body{padding:20px 24px 24px}
.chart-container{height:350px;position:relative}

/* METRICS */
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:13px}
.metric-card{border:1.5px solid var(--border);border-radius:10px;padding:17px 19px;background:var(--surface2);transition:all .2s;position:relative;overflow:hidden}
.metric-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:transparent;transition:background .2s}
.metric-card:hover{border-color:var(--g3);transform:translateY(-2px);box-shadow:var(--shadow)}
.metric-card:hover::before{background:linear-gradient(90deg,var(--g2),var(--g4))}
.metric-fund-name{font-size:.68rem;font-weight:800;color:var(--muted);margin-bottom:13px;display:flex;align-items:center;gap:7px;letter-spacing:.3px;text-transform:uppercase}
.metric-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.metric-name-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.metric-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)}
.metric-row:last-child{border-bottom:none}
.metric-key{font-size:.72rem;color:var(--text2)}
.metric-val{font-family:"JetBrains Mono",monospace;font-size:.82rem;font-weight:500;color:var(--text)}
.pos{color:var(--pos)!important;font-weight:700!important}
.neg{color:var(--neg)!important;font-weight:700!important}

/* RISK TABLE */
.risk-table{width:100%;border-collapse:collapse}
.risk-table th{text-align:left;padding:11px 20px;background:var(--surface2);font-size:.6rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);border-bottom:1.5px solid var(--border);font-family:"JetBrains Mono",monospace}
.risk-table td{padding:13px 20px;border-bottom:1px solid var(--surface2);font-size:.83rem}
.risk-table tr:last-child td{border-bottom:none}
.risk-table tbody tr:hover td{background:var(--g-xlight)}
.fund-dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:10px}
.fund-name-cell{display:flex;align-items:flex-start}
.fund-name-text{font-weight:700;font-size:.8rem;line-height:1.4;max-width:240px;color:var(--text)}

/* EMPTY */
.empty-state{text-align:center;padding:78px 20px;border:2px dashed var(--border);border-radius:var(--radius);color:var(--muted);background:var(--surface);animation:fadeUp .5s ease both}
.empty-icon{font-size:2.6rem;margin-bottom:14px;opacity:.45}
.empty-title{font-size:.98rem;font-weight:700;color:var(--text2);margin-bottom:5px}
.empty-p{font-size:.82rem;color:var(--muted)}

/* SECTION DIVIDER */
.section-divider{display:flex;align-items:center;gap:16px;margin:44px 0 26px}
.section-divider-line{flex:1;height:1.5px;background:var(--border)}
.section-divider-label{font-size:.68rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);white-space:nowrap;padding:6px 18px;background:var(--surface2);border:1.5px solid var(--border);border-radius:20px}

/* SIP CALCULATOR */
.sip-card{background:var(--surface);border-radius:var(--radius);border:1.5px solid var(--border);box-shadow:var(--shadow);overflow:hidden;animation:fadeUp .4s .2s ease both}
.sip-card-header{padding:20px 24px 0}
.sip-card-title{font-size:.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);padding-bottom:15px;border-bottom:1px solid var(--surface2);display:flex;align-items:center;gap:10px}
.sip-card-title::before{content:"";width:3px;height:13px;background:var(--g3);border-radius:2px}
.sip-card-body{padding:22px 24px 28px}
.sip-params{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:24px}
.sip-field label{display:block;font-size:.62rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.sip-input{width:100%;padding:11px 14px;font-family:"JetBrains Mono",monospace;font-size:.9rem;font-weight:600;border:1.5px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);outline:none;transition:all .2s}
.sip-input:focus{border-color:var(--g3);background:#fff;box-shadow:0 0 0 3px rgba(67,160,71,.1)}
.sip-select{width:100%;padding:11px 14px;font-family:"Raleway",sans-serif;font-size:.84rem;font-weight:700;border:1.5px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);outline:none;cursor:pointer;transition:all .2s;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235e8a5e' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.sip-select:focus{border-color:var(--g3);background-color:#fff;box-shadow:0 0 0 3px rgba(67,160,71,.1)}
.dur-row{display:flex;gap:8px}
.dur-row .sip-input{flex:1;min-width:0}
.dur-row .sip-select{width:106px;flex-shrink:0}
.sip-summary{display:flex;flex-wrap:wrap;border-radius:11px;border:1.5px solid var(--g-light);overflow:hidden;background:var(--g-xlight);margin-bottom:22px}
.sip-sum-item{flex:1;min-width:100px;padding:14px 16px;border-right:1px solid var(--g-light);text-align:center}
.sip-sum-item:last-child{border-right:none}
.sip-sum-label{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:5px}
.sip-sum-val{font-family:"JetBrains Mono",monospace;font-size:.96rem;font-weight:700;color:var(--g1)}
.sip-results-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:26px}
.sip-result-card{background:var(--surface2);border:1.5px solid var(--border);border-radius:11px;padding:20px;position:relative;overflow:hidden;transition:all .2s}
.sip-result-card:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:var(--border2)}
.src-accent{position:absolute;top:0;left:0;right:0;height:3px;border-radius:2px 2px 0 0}
.src-header{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.src-dot{width:10px;height:10px;border-radius:50%}
.src-name{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}
.src-corpus{font-family:"JetBrains Mono",monospace;font-size:1.55rem;font-weight:600;color:var(--text);line-height:1.1;margin-bottom:2px}
.src-corpus-label{font-size:.63rem;color:var(--muted);margin-bottom:14px;font-family:"JetBrains Mono",monospace}
.src-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)}
.src-row:last-child{border-bottom:none}
.src-key{font-size:.7rem;color:var(--text2)}
.src-val{font-family:"JetBrains Mono",monospace;font-size:.8rem;font-weight:600}
.sip-chart-wrap{height:300px;position:relative}

/* FOOTER */
.footer{margin-top:52px;padding:30px 34px;background:var(--surface);border-radius:var(--radius);border:1.5px solid var(--border);box-shadow:var(--shadow)}
.footer-main{display:flex;align-items:flex-start;justify-content:space-between;gap:26px;flex-wrap:wrap;margin-bottom:22px}
.footer-info .footer-brand{font-size:1rem;font-weight:800;color:var(--g2);margin-bottom:5px}
.footer-arn{font-size:.65rem;font-weight:800;color:var(--g2);margin-bottom:10px;letter-spacing:.5px;font-family:"JetBrains Mono",monospace;background:var(--g-xlight);display:inline-block;padding:3px 10px;border-radius:5px;border:1px solid var(--g-light)}
.footer-info p{font-size:.78rem;color:var(--text2);line-height:1.95;margin-top:8px}
.footer-info a{color:var(--g2);text-decoration:none;font-weight:700}
.footer-info a:hover{text-decoration:underline}
.social-row{display:flex;align-items:center;gap:8px;margin-top:14px}
.social-label{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-right:4px}
.social-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:var(--surface2);border:1.5px solid var(--border);text-decoration:none;transition:all .2s;color:var(--text2)}
.social-btn:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.social-btn.instagram:hover{background:radial-gradient(circle at 30% 107%,#fdf497 0%,#fd5949 45%,#d6249f 60%,#285aeb 90%);border-color:#d6249f;color:#fff}
.social-btn.facebook:hover{background:#1877f2;border-color:#1877f2;color:#fff}
.social-btn.twitter:hover{background:#000;border-color:#000;color:#fff}
.social-btn.whatsapp:hover{background:#25d366;border-color:#25d366;color:#fff}
.footer-logo-wrap{display:flex;flex-direction:column;align-items:center;gap:7px}
.footer-logo{height:80px;width:auto;max-width:180px;object-fit:contain;mix-blend-mode:multiply}
.footer-logo-name{font-size:.6rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px}
.footer-divider{border:none;border-top:1px solid var(--border);margin:0 0 16px}
.disclaimer{padding:13px 17px;border-radius:8px;background:#fffde7;border-left:3px solid #f9a825;font-size:.7rem;color:#5d4037;line-height:1.75;font-family:"JetBrains Mono",monospace}
.disclaimer strong{color:#e65100;font-weight:700}

@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes slide{0%{transform:translateX(-200%)}100%{transform:translateX(500%)}}

@media(max-width:640px){
  .page{padding:0 14px 44px}.hero{padding:22px 20px}.chart-container{height:250px}
  .search-card,.footer,.sip-card-body{padding:16px}
  .hero-stats{display:none}.tab-btn{font-size:.68rem;padding:8px 10px}
  .sip-sum-item{min-width:80px;padding:10px 10px}
  /* Risk table → card layout on mobile */
  .risk-table,.risk-table thead,.risk-table tbody,.risk-table tr{display:block;width:100%}
  .risk-table thead{display:none}
  .risk-table tr{margin-bottom:12px;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:#fff}
  .risk-table tr:last-child{margin-bottom:0}
  .risk-table td{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--surface2);font-size:.8rem}
  .risk-table td:last-child{border-bottom:none}
  .risk-table td:first-child{background:var(--surface2);padding:10px 14px;font-weight:700}
  .risk-table td[data-label]:before{content:attr(data-label);font-size:.58rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-family:"JetBrains Mono",monospace;flex-shrink:0;margin-right:8px}
}
</style>
</head>
<body>
<div class="accent-line"></div>
<div class="page">

<!-- NAVBAR -->
<nav class="navbar">
  <a class="logo-wrap" href="https://www.getabundance.in" target="_blank">
    <img class="logo-img" src="https://www.getabundance.in/images/logo.png" alt="Abundance Logo"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <div class="logo-icon">A</div>
    <div class="logo-text"><div class="brand">Abundance</div><div class="sub">Financial Services</div></div>
  </a>
  <div class="nav-right">
    <a class="nav-link" href="https://www.getabundance.in" target="_blank">🏠 Home</a>
    <a class="nav-link" href="https://www.getabundance.in/contact-us" target="_blank">📞 Contact</a>
    <div class="nav-tag">📊 MF Analyzer</div>
  </div>
</nav>

<!-- HERO -->
<div class="hero">
  <div class="hero-grid"></div>
  <div class="hero-left">
    <div class="hero-eyebrow">Live AMFI Data</div>
    <div class="hero-text">
      <h1>Mutual Fund Risk &amp;<br>Return Analyzer</h1>
      <p>Compare up to 5 funds · NAV performance · Fund metrics · SIP calculator — powered by live AMFI data.</p>
    </div>
  </div>
  <div class="hero-stats">
    <div class="hero-stat"><div class="hero-stat-val">₹250Cr+</div><div class="hero-stat-label">Assets Under Mgmt.</div></div>
    <div class="hero-stat"><div class="hero-stat-val">350+</div><div class="hero-stat-label">Happy Clients</div></div>
    <div class="hero-stat"><div class="hero-stat-val">ARN-251838</div><div class="hero-stat-label">AMFI Regd. MF Distributor</div></div>
  </div>
</div>

<!-- SEARCH -->
<div class="search-card">
  <div class="section-label">🔍 Search &amp; Add Funds (up to 5)</div>
  <div class="search-wrap">
    <input class="search-input" type="text" id="mfInput"
      placeholder="Type fund name e.g. 'Parag Parikh', 'Quant Small Cap', 'HDFC Flexi Cap'..."
      oninput="onSearch()" autocomplete="off">
    <div class="dropdown" id="dropdown"></div>
  </div>
  <div class="search-hint">↳ Live search powered by mfapi.in · AMFI registered data</div>
  <div class="loading-bar" id="loadingBar"><div class="loading-bar-inner"></div></div>
  <div class="chips" id="chips"></div>
</div>

<!-- TOOLBAR -->
<div class="toolbar" id="toolbar" style="display:none">
  <div class="period-row">
    <span class="period-label">Period</span>
    <button class="period-btn" onclick="setPeriod('1M',this)">1M</button>
    <button class="period-btn" onclick="setPeriod('3M',this)">3M</button>
    <button class="period-btn" onclick="setPeriod('6M',this)">6M</button>
    <button class="period-btn active" onclick="setPeriod('1Y',this)">1Y</button>
    <button class="period-btn" onclick="setPeriod('2Y',this)">2Y</button>
    <button class="period-btn" onclick="setPeriod('3Y',this)">3Y</button>
    <button class="period-btn" onclick="setPeriod('5Y',this)">5Y</button>
    <button class="period-btn" onclick="setPeriod('10Y',this)">10Y</button>
    <button class="period-btn" onclick="setPeriod('MAX',this)">Max</button>
  </div>
  <button class="export-btn" onclick="exportPNG()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Export PNG
  </button>
</div>

<!-- TABS -->
<div class="tabs-row" id="tabsRow" style="display:none">
  <button class="tab-btn active" onclick="switchTab('nav',this)">📈 NAV Performance</button>
  <button class="tab-btn" onclick="switchTab('metrics',this)">📊 Fund Metrics</button>
</div>

<!-- FUND CONTENT -->
<div id="mainContent">
  <div class="empty-state">
    <div class="empty-icon">🌿</div>
    <div class="empty-title">No funds selected</div>
    <p class="empty-p">Search and add up to 5 funds above to begin your analysis</p>
  </div>
</div>

<!-- DIVIDER -->
<div class="section-divider">
  <div class="section-divider-line"></div>
  <div class="section-divider-label">💰 SIP Returns Calculator</div>
  <div class="section-divider-line"></div>
</div>

<!-- SIP CALCULATOR -->
<div class="sip-card">
  <div class="sip-card-header">
    <div class="sip-card-title" style="justify-content:space-between">
      <span>SIP Returns Calculator</span>
      <button onclick="printCalc()" style="display:flex;align-items:center;gap:6px;padding:6px 14px;border:1.5px solid var(--border2);border-radius:8px;background:#fff;color:var(--g2);font-family:'Raleway',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.3px;text-transform:none" onmouseover="this.style.background='var(--g-xlight)'" onmouseout="this.style.background='#fff'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print / PDF
      </button>
    </div>
  </div>
  <div class="sip-card-body">
    <div class="sip-params">
      <div class="sip-field">
        <label>SIP Frequency</label>
        <select class="sip-select" id="sipFreq" onchange="calcSIP()">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly" selected>Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annually">Annually</option>
        </select>
      </div>
      <div class="sip-field">
        <label>SIP Amount (₹)</label>
        <input class="sip-input" id="sipAmount" type="number" value="10000" min="1" step="100" oninput="calcSIP()">
      </div>
      <div class="sip-field">
        <label>Duration</label>
        <div class="dur-row">
          <input class="sip-input" id="sipDuration" type="number" value="10" min="1" step="1" oninput="calcSIP()">
          <select class="sip-select" id="sipDurationUnit" onchange="calcSIP()">
            <option value="years" selected>Years</option>
            <option value="months">Months</option>
          </select>
        </div>
      </div>
      <div class="sip-field">
        <label>Expected Return (% p.a.)</label>
        <input class="sip-input" id="sipRate" type="number" value="12" min="0.1" max="100" step="0.1" oninput="calcSIP()">
      </div>
      <div class="sip-field">
        <label>Annual Step-up (%)</label>
        <input class="sip-input" id="sipStepup" type="number" value="0" min="0" max="50" step="1" oninput="calcSIP()">
      </div>
    </div>
    <div class="sip-summary" id="sipSummary"></div>
    <div class="sip-results-grid" id="sipResultCards"></div>
    <div class="sip-chart-wrap"><canvas id="sipChart"></canvas></div>
  </div>
</div>

<!-- FOOTER -->
<div class="footer">
  <div class="footer-main">
    <div class="footer-info">
      <div class="footer-brand">Abundance Financial Services®</div>
      <div class="footer-arn">ARN-251838 · AMFI Registered Mutual Funds Distributor & SIF Distributor</div>
      <p>Atin Kumar Agrawal<br>
        📞 <a href="tel:+919808105923">+91 98081 05923</a> &nbsp;|&nbsp;
        ✉️ <a href="mailto:contact@getabundance.in">contact@getabundance.in</a><br>
        🏢 <a href="https://maps.app.goo.gl/TgQSLRDo3UBKR77g7" target="_blank" style="color:inherit;text-decoration:underline dotted;text-underline-offset:3px">1st Floor, Kapil Complex, Mukhani, Haldwani (Nainital) — 263139, Uttarakhand</a><br>
        🌐 <a href="https://www.getabundance.in" target="_blank">www.getabundance.in</a>
      </p>
      <div class="social-row">
        <span class="social-label">Follow</span>
        <a class="social-btn instagram" href="https://www.instagram.com/abundancefinancialservices/" target="_blank" title="Instagram"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>
        <a class="social-btn facebook" href="https://www.facebook.com/abundancefinancialservices" target="_blank" title="Facebook"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
        <a class="social-btn twitter" href="https://x.com/abundancefinsvs" target="_blank" title="X (Twitter)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
        <a class="social-btn whatsapp" href="https://wa.me/919808105923" target="_blank" title="WhatsApp"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>
      </div>
    </div>
    <div class="footer-logo-wrap">
      <img class="footer-logo" src="https://www.getabundance.in/images/logo.png" alt="Abundance Financial Services">
      <div class="footer-logo-name">getabundance.in</div>
    </div>
  </div>
  <hr class="footer-divider">
  <div class="disclaimer">
    ⚠️ <strong>Disclaimer:</strong> Mutual fund investments are subject to market risks. Read all scheme-related documents carefully before investing. Past performance is not indicative of future returns. This tool is for informational and educational purposes only and does not constitute financial advice. Please consult your AMFI-registered financial advisor before making investment decisions. Data sourced from AMFI via mfapi.in. | ARN-251838
  </div>
</div>

</div>

<script>
/* ════════════════════════════════════════
   FUND COMPARISON
════════════════════════════════════════ */
const COLORS=["#2e7d32","#1565c0","#e65100","#6a1b9a","#00838f"];
const COLORS_LIGHT=["rgba(46,125,50,.13)","rgba(21,101,192,.13)","rgba(230,81,0,.13)","rgba(106,27,154,.13)","rgba(0,131,143,.13)"];
let selectedFunds=[],currentPeriod='1Y',searchTimeout=null;
let navChart=null,currentTab="nav";

function onSearch(){
  const q=document.getElementById("mfInput").value.trim(),dd=document.getElementById("dropdown");
  clearTimeout(searchTimeout);
  if(q.length<2){dd.classList.remove("open");return;}
  searchTimeout=setTimeout(()=>doSearch(q),300);
}
async function doSearch(q){
  const dd=document.getElementById("dropdown");
  dd.innerHTML='<div class="dropdown-loading">Searching…</div>';dd.classList.add("open");
  try{
    const r=await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
    const data=await r.json();
    if(!data.length){dd.innerHTML='<div class="dropdown-loading">No results found</div>';return;}
    const results=data.slice(0,25);
    const ql=q.toLowerCase();
    // Highlight matched portion in fund name
    function highlight(name){
      const i=name.toLowerCase().indexOf(ql);
      if(i<0) return name;
      return name.slice(0,i)+'<mark style="background:rgba(67,160,71,.18);color:var(--g1);border-radius:2px;padding:0 1px">'+name.slice(i,i+q.length)+'</mark>'+name.slice(i+q.length);
    }
    dd.innerHTML=
      `<div class="dd-count">${results.length} of ${data.length} results</div>`+
      results.map(f=>`<div class="dropdown-item" onclick="addFund(${f.schemeCode})">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${highlight(f.schemeName)}</span>
        <span class="di-code">${f.schemeCode}</span>
      </div>`).join("");
  }catch(e){dd.innerHTML='<div class="dropdown-loading">⚠️ Search failed. Check connection.</div>';}
}
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))document.getElementById("dropdown").classList.remove("open");});

async function addFund(code){
  if(selectedFunds.length>=5){alert("Max 5 funds.");return;}
  if(selectedFunds.find(f=>f.code===code)){alert("Already added.");return;}
  document.getElementById("dropdown").classList.remove("open");
  document.getElementById("mfInput").value="";
  setLoading(true);
  try{
    const r=await fetch(`https://api.mfapi.in/mf/${code}`);
    const res=await r.json();
    if(!res.data||!res.data.length)throw new Error();
    // Clean: remove zero/invalid NAVs, then sort ascending by date
    // (AMFI data is not always perfectly ordered for some fund houses like SBI)
    const cleaned=res.data
      .filter(d=>{const v=parseFloat(d.nav);return!isNaN(v)&&v>0;})
      .sort((a,b)=>parseNAVDate(a.date)-parseNAVDate(b.date));
    selectedFunds.push({code,name:res.meta.scheme_name,rawData:cleaned});
    renderChips();renderAll();
  }catch(e){alert("Failed to load. Try again.");}
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
function setLoading(on){document.getElementById("loadingBar").classList.toggle("active",on);}

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
    container.innerHTML=`<div class="empty-state"><div class="empty-icon">🌿</div><div class="empty-title">No funds selected</div><p class="empty-p">Search and add up to 5 funds above to begin your analysis</p></div>`;
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
    <div class="card-body"><div class="chart-container"><canvas id="navChart"></canvas></div></div></div>
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
  const individualMetrics=selectedFunds.map(f=>({...calcMetrics(f.rawData),name:f.name,code:f.code,category:f.category||'',subCategory:f.subCategory||''}));
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

function renderRiskTable(metrics,periodLabel){
  // Check if funds have different data ranges — only then show date pills
  const starts=metrics.map(m=>m.points&&m.points.length?m.points[0].date:"");
  const ends=metrics.map(m=>m.points&&m.points.length?m.points[m.points.length-1].date:"");
  const allSameStart=starts.every(d=>d===starts[0]);
  const allSameEnd=ends.every(d=>d===ends[0]);
  const showDatePill=metrics.length>1&&(!allSameStart||!allSameEnd);
  const fmtD=str=>{
    if(!str)return"";
    const [d,mo,y]=str.split("-");
    const mNames=["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d} ${mNames[+mo]} ${y}`;
  };
  document.getElementById("riskTable").innerHTML=`
    <thead><tr><th>Fund</th><th>${periodLabel||"Period"} Return</th><th>Ann. Return</th><th>Volatility</th><th>Sharpe</th><th>Max DD</th></tr></thead>
    <tbody>${metrics.map((m,i)=>{
      const s=m.points&&m.points.length?m.points[0].date:"";
      const e=m.points&&m.points.length?m.points[m.points.length-1].date:"";
      const datePill=showDatePill?`<div style="margin-top:3px;font-size:.62rem;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--muted);background:var(--surface2);border-radius:4px;padding:1px 6px;display:inline-block;letter-spacing:.2px">${fmtD(s)} → ${fmtD(e)}</div>`:"";
      return`<tr>
      <td><div class="fund-name-cell" style="flex-direction:column;align-items:flex-start;gap:2px"><div style="display:flex;align-items:center;gap:8px"><span class="fund-dot" style="background:${COLORS[i]};flex-shrink:0"></span><span class="fund-name-text">${m.name}</span></div>${datePill}</div></td>
      <td data-label="${periodLabel||'Period'} Ret" style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${parseFloat(m.totalReturn)>=0?"#1b5e20":"#b71c1c"}">${parseFloat(m.totalReturn)>=0?"+":""}${m.totalReturn}%</td>
      <td data-label="Ann. Return" style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${parseFloat(m.annReturn)>=0?"#1b5e20":"#b71c1c"}">${parseFloat(m.annReturn)>=0?"+":""}${m.annReturn}%</td>
      <td data-label="Volatility" style="font-family:'JetBrains Mono',monospace;color:#2e4d2e">${m.annVol}%</td>
      <td data-label="Sharpe" style="font-family:'JetBrains Mono',monospace;color:#2e4d2e">${m.sharpe}</td>
      <td data-label="Max DD" style="font-family:'JetBrains Mono',monospace;color:#b71c1c">-${m.maxDD}%</td>
    </tr>`;}).join("")}</tbody>`;
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

async function exportPNG(){
  const btn=document.querySelector(".export-btn"),orig=btn.innerHTML;
  btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Exporting…';
  btn.disabled=true;
  try{
    const SCALE=2, PAD=32;

    // ── 1. Capture live chart canvas (Chart.js renders to real canvas) ──
    const liveChart=document.querySelector("#mainContent canvas");
    const chartDataURL=liveChart?liveChart.toDataURL("image/png"):"";

    // ── 2. Capture the rest of mainContent via html2canvas ──
    //    Temporarily hide the chart canvas so html2canvas renders the
    //    surrounding card structure cleanly, then we composite the chart back.
    if(liveChart) liveChart.style.visibility="hidden";
    const contentEl=document.getElementById("mainContent");
    const capturedContent=await html2canvas(contentEl,{
      backgroundColor:"#f0f7f0",scale:SCALE,useCORS:true,logging:false,
      scrollX:-window.scrollX,scrollY:-window.scrollY,
      windowWidth:document.documentElement.scrollWidth,
      width:contentEl.offsetWidth,height:contentEl.offsetHeight
    });
    if(liveChart) liveChart.style.visibility="";

    // ── 3. Load logo as blob URL to bypass CORS ──
    let logoImg=null;
    try{
      const logoResp=await fetch("https://www.getabundance.in/images/logo.png");
      const logoBlob=await logoResp.blob();
      const logoURL=URL.createObjectURL(logoBlob);
      logoImg=await new Promise((res,rej)=>{
        const img=new Image(); img.onload=()=>res(img); img.onerror=()=>res(null); img.src=logoURL;
      });
      URL.revokeObjectURL(logoURL);
    }catch(e){ logoImg=null; }

    // ── 4. Load chart image ──
    let chartImg=null;
    if(chartDataURL){
      chartImg=await new Promise((res)=>{
        const img=new Image(); img.onload=()=>res(img); img.onerror=()=>res(null); img.src=chartDataURL;
      });
    }

    // ── 5. Composite everything onto final canvas ──
    const funds=selectedFunds.map(f=>f.name.length>44?f.name.slice(0,44)+"…":f.name);
    const dateStr=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});

    const HEADER_H=80*SCALE;
    const FOOTER_H=36*SCALE;
    const W=(contentEl.offsetWidth+PAD*2)*SCALE;
    const H=HEADER_H + capturedContent.height + FOOTER_H + PAD*SCALE;

    const final=document.createElement("canvas");
    final.width=W; final.height=H;
    const ctx=final.getContext("2d");

    // Background
    ctx.fillStyle="#f0f7f0";
    ctx.fillRect(0,0,W,H);

    // ── Header ──
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,W,HEADER_H);

    // Green accent line at top
    const grad=ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0,"#1b5e20"); grad.addColorStop(0.5,"#43a047"); grad.addColorStop(1,"#1b5e20");
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,W,6*SCALE);

    // Logo (left side)
    if(logoImg){
      const logoH=40*SCALE, logoW=logoH*(logoImg.naturalWidth/logoImg.naturalHeight);
      ctx.save();
      ctx.globalCompositeOperation="multiply";
      ctx.drawImage(logoImg, PAD*SCALE, 18*SCALE, logoW, logoH);
      ctx.restore();
    } else {
      // Fallback: draw "A" badge
      ctx.fillStyle="#2e7d32";
      ctx.beginPath();
      ctx.roundRect(PAD*SCALE, 16*SCALE, 40*SCALE, 40*SCALE, 8*SCALE);
      ctx.fill();
      ctx.fillStyle="#fff";
      ctx.font=`800 ${22*SCALE}px Raleway,sans-serif`;
      ctx.textAlign="center";
      ctx.fillText("A", PAD*SCALE+20*SCALE, 16*SCALE+28*SCALE);
    }

    // Title + fund names (centre-left)
    const textX=(logoImg?120:100)*SCALE;
    ctx.textAlign="left";
    ctx.fillStyle="#2e7d32";
    ctx.font=`800 ${13*SCALE}px Raleway,sans-serif`;
    ctx.fillText("MF Risk & Return Analysis", textX, 30*SCALE);
    ctx.fillStyle="#5e8a5e";
    ctx.font=`500 ${9*SCALE}px "JetBrains Mono",monospace`;
    const fundLine=funds.join("  ·  ");
    ctx.fillText(fundLine.length>90?fundLine.slice(0,90)+"…":fundLine, textX, 46*SCALE);

    // Abundance info (right side)
    ctx.textAlign="right";
    ctx.fillStyle="#2e7d32";
    ctx.font=`700 ${10*SCALE}px Raleway,sans-serif`;
    ctx.fillText("Abundance Financial Services", W-PAD*SCALE, 30*SCALE);
    ctx.fillStyle="#5e8a5e";
    ctx.font=`500 ${8.5*SCALE}px "JetBrains Mono",monospace`;
    ctx.fillText("ARN-251838 · AMFI Regd. MF Distributor · "+dateStr, W-PAD*SCALE, 46*SCALE);

    // Divider line
    ctx.strokeStyle="#c2dfc2"; ctx.lineWidth=1.5*SCALE;
    ctx.beginPath(); ctx.moveTo(PAD*SCALE,HEADER_H-8*SCALE); ctx.lineTo(W-PAD*SCALE,HEADER_H-8*SCALE); ctx.stroke();

    // ── Main content snapshot ──
    ctx.drawImage(capturedContent, PAD*SCALE, HEADER_H, capturedContent.width, capturedContent.height);

    // ── Composite live chart over cloned chart area ──
    if(chartImg && liveChart){
      const rect=liveChart.getBoundingClientRect();
      const contentRect=contentEl.getBoundingClientRect();
      const relX=(rect.left-contentRect.left)*SCALE;
      const relY=(rect.top-contentRect.top)*SCALE;
      ctx.drawImage(chartImg, PAD*SCALE+relX, HEADER_H+relY, rect.width*SCALE, rect.height*SCALE);
    }

    // ── Footer watermark ──
    ctx.textAlign="center";
    ctx.fillStyle="rgba(46,125,50,0.25)";
    ctx.font=`500 ${8*SCALE}px Raleway,sans-serif`;
    ctx.fillText("getabundance.in · ARN-251838 · AMFI Registered Mutual Funds Distributor & SIF Distributor", W/2, H-12*SCALE);

    const link=document.createElement("a");
    link.download=`MF-Analysis-${selectedFunds.map(f=>f.code).join("-")}-${new Date().toISOString().slice(0,10)}.png`;
    link.href=final.toDataURL("image/png",1.0);
    link.click();
  }catch(e){console.error(e);alert("Export failed: "+e.message);}
  btn.innerHTML=orig;btn.disabled=false;
}

/* ════════════════════════════════════════
   PRINT CALCULATOR
════════════════════════════════════════ */
function printCalc(){
  // Capture current summary, cards, and chart as image
  const summaryHTML = document.getElementById("sipSummary").outerHTML;
  const cardsHTML   = document.getElementById("sipResultCards").outerHTML;
  const chartCanvas = document.getElementById("sipChart");
  const chartImg    = chartCanvas ? chartCanvas.toDataURL("image/png") : "";

  // Build params display
  const freq     = document.getElementById("sipFreq").value;
  const amount   = document.getElementById("sipAmount").value;
  const dur      = document.getElementById("sipDuration").value;
  const durUnit  = document.getElementById("sipDurationUnit").value;
  const rate     = document.getElementById("sipRate").value;
  const stepup   = document.getElementById("sipStepup").value;
  const freqLabel= {daily:"Daily",weekly:"Weekly",monthly:"Monthly",quarterly:"Quarterly",annually:"Annual"}[freq];

  const win = window.open("","_blank","width=900,height=700");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>SIP Calculator — Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:32px 40px}
  .print-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #2e7d32;margin-bottom:24px}
  .print-logo{height:48px;object-fit:contain;mix-blend-mode:multiply}
  .print-title{font-size:1.1rem;font-weight:800;color:#2e7d32;letter-spacing:-.3px}
  .print-arn{font-size:.62rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:3px}
  .params-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px;padding:14px 18px;background:#f0f7f0;border-radius:10px;border:1.5px solid #c2dfc2}
  .param-item{display:flex;flex-direction:column;gap:2px;min-width:100px}
  .param-label{font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#5e8a5e}
  .param-val{font-family:"JetBrains Mono",monospace;font-size:.82rem;font-weight:600;color:#162616}
  .sip-summary{display:flex;flex-wrap:wrap;border-radius:10px;border:1.5px solid #a5d6a7;overflow:hidden;background:#e8f5e9;margin-bottom:20px}
  .sip-sum-item{flex:1;min-width:90px;padding:12px 14px;border-right:1px solid #a5d6a7;text-align:center}
  .sip-sum-item:last-child{border-right:none}
  .sip-sum-label{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#5e8a5e;margin-bottom:4px}
  .sip-sum-val{font-family:"JetBrains Mono",monospace;font-size:.88rem;font-weight:700;color:#1b5e20}
  .sip-results-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
  .sip-result-card{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:10px;padding:16px;position:relative;overflow:hidden}
  .src-accent{position:absolute;top:0;left:0;right:0;height:3px;border-radius:2px 2px 0 0}
  .src-header{display:flex;align-items:center;gap:7px;margin-bottom:12px}
  .src-dot{width:9px;height:9px;border-radius:50%}
  .src-name{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#5e8a5e}
  .src-corpus{font-family:"JetBrains Mono",monospace;font-size:1.3rem;font-weight:600;color:#162616;line-height:1.1;margin-bottom:1px}
  .src-corpus-label{font-size:.58rem;color:#5e8a5e;margin-bottom:12px;font-family:"JetBrains Mono",monospace}
  .src-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #c2dfc2}
  .src-row:last-child{border-bottom:none}
  .src-key{font-size:.65rem;color:#2e4d2e}
  .src-val{font-family:"JetBrains Mono",monospace;font-size:.75rem;font-weight:600}
  .chart-section{margin-bottom:20px}
  .chart-section img{width:100%;border-radius:8px;border:1px solid #c2dfc2}
  .section-title{font-size:.58rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin-bottom:10px;display:flex;align-items:center;gap:8px}
  .section-title::after{content:"";flex:1;height:1px;background:#c2dfc2}
  .disclaimer{padding:10px 14px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.62rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:18px}
  .pos{color:#1b5e20!important;font-weight:700!important}
  .neg{color:#b71c1c!important;font-weight:700!important}
  @media print{
    body{padding:18px 22px}
    @page{margin:1cm;size:A4 portrait}
    .no-print{display:none}
  }
</style></head><body>
<div class="print-header">
  <div>
    <div class="print-title">SIP Returns Calculator</div>
    <div class="print-arn">Abundance Financial Services · ARN-251838 · AMFI Registered Mutual Funds Distributor &amp; SIF Distributor</div>
  </div>
  <img class="print-logo" src="https://www.getabundance.in/images/logo.png" onerror="this.style.display='none'">
</div>

<div class="params-row">
  <div class="param-item"><div class="param-label">Frequency</div><div class="param-val">${freqLabel}</div></div>
  <div class="param-item"><div class="param-label">SIP Amount</div><div class="param-val">₹${parseFloat(amount).toLocaleString("en-IN")}</div></div>
  <div class="param-item"><div class="param-label">Duration</div><div class="param-val">${dur} ${durUnit}</div></div>
  <div class="param-item"><div class="param-label">Expected Return</div><div class="param-val">${rate}% p.a.</div></div>
  ${parseFloat(stepup)>0?`<div class="param-item"><div class="param-label">Annual Step-up</div><div class="param-val">${stepup}%</div></div>`:""}
</div>

<div class="section-title">Summary</div>
${summaryHTML}

<div class="section-title" style="margin-top:18px">Scenario Analysis</div>
${cardsHTML}

${chartImg?`<div class="section-title" style="margin-top:4px">Growth Projection</div>
<div class="chart-section"><img src="${chartImg}" alt="SIP Growth Chart"></div>`:""}

<div class="disclaimer">⚠️ <strong style="color:#e65100">Disclaimer:</strong> Mutual fund investments are subject to market risks. Past performance is not indicative of future returns. This projection is for illustrative purposes only and does not constitute financial advice. Consult your AMFI-registered advisor before investing. | ARN-251838 | Abundance Financial Services</div>
</body></html>`);
  win.document.close();
  // Wait for fonts/images to load then print
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 600);
  setTimeout(() => { try{ win.focus(); win.print(); }catch(e){} }, 1200);
}

/* ════════════════════════════════════════
   SIP CALCULATOR
════════════════════════════════════════ */
let sipChartInst=null;

const FREQ={
  daily:    {perYear:252, label:"Daily"},
  weekly:   {perYear:52,  label:"Weekly"},
  monthly:  {perYear:12,  label:"Monthly"},
  quarterly:{perYear:4,   label:"Quarterly"},
  annually: {perYear:1,   label:"Annual"}
};

function getSIPParams(){
  const freq     = document.getElementById("sipFreq").value;
  const amount   = Math.max(1, parseFloat(document.getElementById("sipAmount").value)||10000);
  const durVal   = Math.max(1, parseFloat(document.getElementById("sipDuration").value)||10);
  const durUnit  = document.getElementById("sipDurationUnit").value;
  const annRate  = Math.max(0.01, parseFloat(document.getElementById("sipRate").value)||12);
  const stepupPct= Math.max(0, parseFloat(document.getElementById("sipStepup").value)||0);
  const cfg = FREQ[freq];
  const totalYears = durUnit==="months" ? durVal/12 : durVal;
  const totalInstallments = Math.round(totalYears * cfg.perYear);
  const ratePerPeriod = Math.pow(1 + annRate/100, 1/cfg.perYear) - 1;
  return{freq,amount,durVal,durUnit,totalYears,totalInstallments,annualRate:annRate,ratePerPeriod,stepupPct,cfg};
}

function simulate(p){
  const snapshots=[{label:"Start",corpus:0,invested:0}];
  let corpus=0, invested=0, amt=p.amount;
  const ipy=p.cfg.perYear;
  for(let i=1;i<=p.totalInstallments;i++){
    corpus=(corpus+amt)*(1+p.ratePerPeriod);
    invested+=amt;
    if(p.stepupPct>0 && i%ipy===0){
      amt=amt*(1+p.stepupPct/100);
    }
    if(i%ipy===0){
      snapshots.push({label:(i/ipy)+"Y",corpus:Math.round(corpus),invested:Math.round(invested)});
    }
  }
  if(p.totalInstallments%ipy!==0){
    snapshots.push({label:p.totalYears.toFixed(1)+"Y",corpus:Math.round(corpus),invested:Math.round(invested)});
  }
  return snapshots;
}

function calcSIP(){
  const p=getSIPParams();
  if(p.totalInstallments<1)return;
  const base=simulate(p);
  const finalCorpus=base[base.length-1].corpus;
  const totalInvested=base[base.length-1].invested;
  const totalGain=finalCorpus-totalInvested;
  const wealthGain=totalInvested>0?((totalGain/totalInvested)*100).toFixed(1):0;

  document.getElementById("sipSummary").innerHTML=[
    ["Frequency",           p.cfg.label],
    ["Per Installment",     "₹"+fmtINR(p.amount)],
    ["# Installments",      p.totalInstallments.toLocaleString("en-IN")],
    ["Total Invested",      "₹"+fmtINR(totalInvested)],
    ["Estimated Corpus",    "₹"+fmtINR(finalCorpus)],
    ["Wealth Gain",         (totalGain>=0?"▲ ":"▼ ")+"₹"+fmtINR(Math.abs(totalGain))+" ("+wealthGain+"%)"],
  ].map(([lbl,val],i)=>`<div class="sip-sum-item"><div class="sip-sum-label">${lbl}</div>
    <div class="sip-sum-val" style="${i>=4?"color:var(--pos)":""}">${val}</div></div>`).join("");

  const scenarios=[
    {label:"Conservative", rate:Math.max(1,p.annualRate-4), color:"#1565c0"},
    {label:"Base Case",    rate:p.annualRate,                color:"#2e7d32"},
    {label:"Optimistic",   rate:Math.min(50,p.annualRate+4),color:"#e65100"},
  ];

  document.getElementById("sipResultCards").innerHTML=scenarios.map(s=>{
    const sp={...p,annualRate:s.rate,ratePerPeriod:Math.pow(1+s.rate/100,1/p.cfg.perYear)-1};
    const sd=simulate(sp);
    const corp=sd[sd.length-1].corpus;
    const inv=sd[sd.length-1].invested;
    const gain=corp-inv;
    const wg=inv>0?((gain/inv)*100).toFixed(1):0;
    return`<div class="sip-result-card">
      <div class="src-accent" style="background:${s.color}"></div>
      <div class="src-header"><span class="src-dot" style="background:${s.color}"></span><span class="src-name">${s.label} · ${s.rate}% p.a.</span></div>
      <div class="src-corpus">₹${fmtINR(corp)}</div>
      <div class="src-corpus-label">Estimated Corpus</div>
      ${sr("Total Invested","₹"+fmtINR(inv),"#2e4d2e")}
      ${sr("Total Gain","₹"+fmtINR(Math.abs(gain)),gain>=0?"var(--pos)":"var(--neg)")}
      ${sr("Wealth Gain",wg+"%",gain>=0?"var(--pos)":"var(--neg)")}
      ${p.stepupPct>0?sr("Step-up",p.stepupPct+"% p.a.","#6a1b9a"):""}
    </div>`;
  }).join("");

  drawSIPChart(p,scenarios);
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
  if(n>=1e7)return(n/1e7).toFixed(2)+" Cr";
  if(n>=1e5)return(n/1e5).toFixed(2)+" L";
  return n.toLocaleString("en-IN");
}

calcSIP();
</script>
</body>
</html>
