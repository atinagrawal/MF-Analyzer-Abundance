# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on :3000
npm run build    # Production build (also runs lint)
npm run lint     # ESLint
npm run start    # Start production server
```

Python functions (in `api/`) run as Vercel serverless functions with 60s timeout and are not part of the npm workflow.

## What This Is

**Abundance MF Analyzer** — a fintech platform for Indian mutual fund investors and distributors (built by Atin Kumar Agrawal, ARN-251838). Features: MF comparison, SIP/SWP backtesting (XIRR), CAS PDF portfolio tracking, live NSE market data, industry analytics, index valuation dashboard, loan calculators, and a distributor admin portal.

## Tech Stack

- **Framework**: Next.js 16 App Router, React 19
- **Styling**: Single monolithic `app/globals.css` — no Tailwind, no CSS modules
- **Database**: Vercel Postgres (`lib/db.js`) — tables: `users`, `accounts`, `sessions`, `manual_holdings`
- **Auth**: NextAuth v5 (Auth.js) — Google OAuth + Resend email magic links; roles: `client` | `distributor` | `admin`
- **Caching**: Vercel Blob for server-side API response caching
- **Charts**: Chart.js (line/bar) + D3.js (choropleth maps)
- **Python**: `api/parse.py` and `api/parse-mfc.py` — CAS PDF parsing via `casparser`
- **OG Images**: `@vercel/og` edge functions

## Architecture

### Directory Layout

```
app/
  page.js / layout.js       → Root (home MF calculator — uses dangerouslySetInnerHTML)
  */page.js + */layout.js   → Feature pages (server components for metadata/SEO)
  api/*/route.js            → Serverless API routes
  globals.css               → All styles (~320KB, CSS custom properties for tokens)
components/                 → Navbar.jsx, Footer.jsx, AuthProvider.jsx
lib/
  db.js                     → Postgres client
  metadata.js               → getPageMeta(page) — centralized SEO metadata
  helpers.js                → fmtINR, etc.
public/                     → Static assets, GeoJSON, legacy JS
scripts/                    → Python/Node offline scripts (portfolio aggregator, OG gen)
api/parse.py                → FastAPI CAS PDF parser (Vercel Python function)
```

### Data Flow Pattern

All external data routes follow this pattern:
1. Check Vercel Blob for cached response (compare timestamp to TTL)
2. If stale, fetch from external source (AMFI, NSE, mfapi.in)
3. Store result in Blob with `addRandomSuffix: false` for predictable keys
4. Return JSON to client

Cache TTLs: 5 min (market-watch), 4h (SIF NAVs), immutable (historical NAVs).

NSE routes require spoofed headers (`Referer: https://www.nseindia.com`).

### Auth Pattern

- **Middleware** (`middleware.js`): Route-level guard via `__Secure-authjs.session-token` cookie presence
- **Page-level**: `await auth()` → validate session + check `session.user.role`
- **API-level**: Same session validation + role check before any mutation

### Page Pattern

Server components handle metadata (JSON-LD, OG) and render the shell. Interactive features are `'use client'` child components using `useState`/`useEffect`. The home page is an exception — it injects a legacy HTML blob via `dangerouslySetInnerHTML` with global `onclick` handlers in `public/mfcalc-main.js`.

### CSS Conventions

- CSS variables for all design tokens (colors, spacing) defined in `:root`
- BEM-like class naming: `.component-child-state` (e.g., `.mw-ticker-bar`, `.idx-card`)
- Mobile breakpoint: `768px`
- No component-scoped styles — all in `globals.css`

### Key External APIs

| Source | Used For |
|--------|----------|
| `amfiindia.com` | SIF NAVs, Monthly Note PDFs, AMFI data |
| `nseindia.com` | Live indices, FII/DII flows, sector data |
| `mfapi.in` | Historical fund NAV data |
| `Resend` | Magic link email delivery |

### Vercel Configuration (`vercel.json`)

- Cron: `/api/cron/fetch-pms` runs `0 2 5-12 * *`
- Python functions: 60s `maxDuration`
- CORS headers on all `/api/*` routes
- Legacy HTML rewrites: `/portfolio` → `portfolio.html`, `/xls-pdf-extractor` → `xls-pdf-extractor.html`

## Environment Variables

Required in `.env.local` for local dev:
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `DATABASE_URL` (Vercel Postgres)
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `RESEND_KEY`

## Migration Status

Two pages still use legacy HTML rewrites (not yet ported to App Router):
- `/portfolio` → `portfolio.html`
- `/xls-pdf-extractor` → `xls-pdf-extractor.html`

All other feature pages are App Router React components.
