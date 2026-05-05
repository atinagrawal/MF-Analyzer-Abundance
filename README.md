# 📊 Abundance MF Analyzer
### by [Abundance Financial Services](https://www.getabundance.in) · ARN-251838 · Haldwani, Uttarakhand

A free, full-stack mutual fund analytics platform for Indian investors and distributors — built on Next.js 15, powered by live AMFI, NSE, and SEBI data.

🔗 **Live Platform:** [mfcalc.getabundance.in](https://mfcalc.getabundance.in)

---

## 🗺 Platform Overview

| Page | Path | Description |
|---|---|---|
| MF Calculator | `/` | Compare up to 5 funds · SIP calculator · CAGR · Sharpe · Drawdown |
| My Portfolio | `/portfolio` | CAS-powered live portfolio with multi-PAN family support |
| SIF Screener | `/sifs` | All 29 SEBI-regulated Specialised Investment Funds with NAV history |
| Market Watch | `/market-watch` | Live NSE indices, sectoral heatmap, FII/DII, top movers, holidays |
| Industry Pulse | `/industry` | MF industry AUM, category flows, SIP 12-month trend |
| Report Card | `/report` | India MF industry scorecard |
| Geography | `/geography` | State-wise AUM distribution across India |
| Rolling Returns | `/rolling` | Rolling return analysis across periods and categories |
| Index Dashboard | `/indices` | PE/PB/DY for 135 NSE indices with valuation gauge |
| CAS Tracker | `/cas-tracker` | Upload CAMS/KFintech CAS PDF for live NAV + FIFO gains |
| Admin | `/admin` | Distributor dashboard — manual holdings, client management |

---

## ✨ Features by Module

### 📐 MF Calculator (Home)
- Compare up to 5 mutual funds side-by-side using live AMFI NAVs
- 9 period selectors: 1M · 3M · 6M · 1Y · 2Y · 3Y · 5Y · 10Y · Max
- All funds rebased to a common start date for fair comparison
- Metrics: Period Return, CAGR, Volatility, Sharpe Ratio, Max Drawdown, Best/Worst Day, % Positive Days
- SIP Returns Calculator with step-up, 3 scenarios, growth chart
- Export PNG · Print/PDF

### 💼 My Portfolio
- Upload CAMS or KFintech CAS PDF — Python parser via FastAPI
- Live AMFI NAVs for all holdings
- Multi-PAN family support — view combined or per-member portfolio
- ELSS lock-in tracker (3-year)
- FIFO capital gains calculation
- SIF holdings with live NAVs
- Manual holdings with CRUD (admin-managed)

### 🔬 SIF Screener
- All SEBI-regulated Specialised Investment Funds (regular plans only)
- Filters: SIF company, strategy category, type
- Watchlist (persisted via localStorage)
- Grid and list views with sortable columns
- **NAV History Modal** — per-scheme historical NAV chart (30D/6M/1Y), AMFI data
- Performance data: 1M, 3M, 6M, since-inception returns

### 📡 Live Market Watch
- Live NSE India indices: Nifty 50, Bank Nifty, Midcap, Smallcap, IT, VIX, USD/INR
- Auto-refreshes every 60 seconds via server-side proxy (Blob-cached 5 min)
- **Sectoral Heatmap** — 26 sectors colour-coded by daily % change; tap any tile to open a detail panel with:
  - Constituent stock movers (top 5 gainers + losers)
  - 30D and 1Y NSE SVG price charts
  - 52-week range bar with needle
  - Advances/declines for that sector
  - Stocks near 52W high/low
- FII / DII cash market flows (provisional, same-day)
- Advances/Declines bar for Nifty 50
- OHLC range bar with volume and turnover
- 52-Week High/Low tracker for 9 major indices
- Market Holidays Calendar (NSE CM segment)
- Tabbed secondary sections on mobile

### 📈 Industry Pulse
- Total industry AUM, total folios, net flows by category
- 12-month trend charts: AUM, equity net flows, folio growth, MoM change
- **SIP Pulse** — SIP monthly inflow, total SIP AUM, active SIP accounts from AMFI Monthly Note PDFs
- 12-month SIP inflow trend bar chart

### 📊 Index Dashboard
- Full table of 135 NSE indices with PE, PB, Dividend Yield, 1M/6M/1Y returns
- **Market Valuation Gauge** — PE zone bars (Undervalued/Fair/Overvalued) for Nifty 50, Midcap 150, Smallcap 250
- Sticky header rows + sticky first column for mobile scrolling
- Sort, search, category filter

---

## 🏗 Technical Architecture

### Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Runtime | Node.js 24.x + Python 3.x (serverless) |
| Database | Vercel Postgres (PostgreSQL) |
| Blob storage | Vercel Blob (private) |
| Auth | NextAuth v5 (Auth.js) with Postgres adapter |
| CSS | Vanilla CSS with design tokens (no Tailwind) |
| Hosting | Vercel (auto-deploy on `main` push) |

### Data Sources
| Source | Used For |
|---|---|
| AMFI India (`amfiindia.com`) | SIF NAVs, Monthly Note PDFs, industry data |
| mfapi.in | MF NAV history (10,000+ schemes) |
| NSE India (`nseindia.com`) | Live indices, sector constituents, FII/DII, holidays |
| casparser (Python) | CAS PDF parsing for portfolio import |
| Vercel Blob | API response caching (market-watch 5min, SIF 4h, historical immutable) |

### API Routes
```
/api/market-watch          NSE live indices, FII/DII, gainers/losers (5min Blob cache)
/api/sector-detail         NSE sector constituent stocks + charts (5min Blob cache)
/api/sif-nav               AMFI SIF latest NAVs — regular plans only (4h Blob cache)
/api/sif-history           CORS proxy for AMFI SIF NAV history (strategy lookup + historical)
/api/amfi-monthly-note     AMFI Monthly Note PDF parser — SIP metrics (1d cache, historical immutable)
/api/holdings              Client-facing manual holdings CRUD
/api/admin/holdings        Admin manual holdings CRUD
/api/og-sif                OG image for /sifs (edge, dynamic fund count)
/api/og-market-watch       OG image for /market-watch (edge, live Nifty 50 value)
/api/cron/fetch-pms        Scheduled PMS data fetch
api/parse.py               Python FastAPI — CAS PDF parser (casparser v2, 60s timeout)
```

### Database Schema (Vercel Postgres)
```sql
users              -- NextAuth accounts
accounts           -- OAuth providers
sessions           -- Active sessions
manual_holdings    -- Distributor-entered client holdings (fund, units, NAV, PAN, folio)
```

---

## 🚀 Local Development

```bash
git clone https://github.com/atinagrawal/MF-Analyzer-Abundance.git
cd MF-Analyzer-Abundance
npm install
```

Create `.env.local`:
```
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=...
BLOB_READ_WRITE_TOKEN=...
```

```bash
npm run dev        # Next.js on :3000
# Python parser runs as a separate Vercel serverless function in production
```

---

## 💡 What Could Be Added Next

### High Impact
- **XIRR Calculator** — irregular investment return calculation
- **Tax P&L Report** — STCG/LTCG summary from CAS data (FIFO already computed)
- **NFO Tracker** — upcoming and live NFOs from AMFI
- **Goal-based Planning** — retirement, child education, home purchase calculators

### Medium Impact
- **Fund vs Benchmark** — compare any fund against its category benchmark
- **AMC / Fund House Comparison** — AUM, fund count, category-wise performance by AMC
- **Debt Fund Navigator** — duration, credit risk, yield matrix for debt funds
- **Lumpsum vs SIP Comparison** — same corpus, different strategies, same period
- **Portfolio Rebalancing Tool** — target allocation vs current, rebalance calculator

### Nice to Have
- **WhatsApp Alerts** — NAV milestone alerts via existing nodemailer infrastructure
- **Peer Comparison** — fund vs category average on all metrics
- **Market Breadth** — Advance-decline ratio history chart on Market Watch
- **Sector Rotation Chart** — rolling 3M returns heatmap across sectors over time

---

## ⚠️ Regulatory Disclaimer

Mutual fund and SIF investments are subject to market risks. Read all scheme-related documents carefully before investing. Past performance is not indicative of future returns. This platform is for **informational and educational purposes only** and does not constitute financial advice. Please consult your AMFI-registered financial advisor before making investment decisions.

Data sourced from AMFI India and NSE India. Abundance Financial Services is an AMFI Registered Mutual Fund Distributor (ARN-251838) and is registered as a SIF Distributor.

---

## 👤 About

**Atin Kumar Agrawal**  
AMFI Registered Mutual Funds Distributor & SIF Distributor · ARN-251838  
GST: 05AKYPA469G1Z3

📞 [+91 98081 05923](tel:+919808105923)  
✉️ [contact@getabundance.in](mailto:contact@getabundance.in)  
🌐 [www.getabundance.in](https://www.getabundance.in)  
🏢 1st Floor, Kapil Complex, Mukhani, Haldwani (Nainital) — 263139, Uttarakhand

[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat&logo=instagram&logoColor=white)](https://www.instagram.com/abundancefinancialservices/)
[![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=flat&logo=facebook&logoColor=white)](https://www.facebook.com/abundancefinancialservices)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white)](https://x.com/abundancefinsvs)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=flat&logo=whatsapp&logoColor=white)](https://wa.me/919808105923)

---

*Built with ❤️ for Indian mutual fund investors and distributors*
