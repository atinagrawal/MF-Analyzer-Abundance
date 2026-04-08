# Next.js Migration — Phase 1 Setup Guide

## What This Does

Converts the MF Analyzer project from static HTML + Vercel serverless functions to a Next.js application. All existing pages continue working during migration — nothing breaks.

## Your File Structure After Setup

```
MF-Analyzer-Abundance/
├── app/                          ← NEW: Next.js App Router
│   ├── layout.js                 ← Root layout (fonts, analytics, metadata)
│   ├── globals.css               ← Design system (replaces duplicated CSS)
│   ├── not-found.js              ← 404 page (first ported page)
│   ├── sitemap.js                ← Dynamic sitemap (replaces sitemap.xml)
│   └── robots.js                 ← Dynamic robots.txt
├── components/                   ← NEW: Shared React components
│   ├── Navbar.jsx                ← Shared navbar
│   └── Footer.jsx                ← Shared footer
├── lib/                          ← NEW: Shared utilities
│   └── metadata.js               ← Centralized SEO config for all pages
├── api/                          ← UNCHANGED: All API routes stay as-is
│   ├── mf.js
│   ├── nifty-tri.js
│   ├── parse.py
│   ├── ... (all other API routes)
│   └── requirements.txt
├── public/                       ← UNCHANGED: Static assets + legacy HTML
│   ├── index.html                ← Served via rewrite until ported
│   ├── rolling.html              ← Served via rewrite until ported
│   ├── ... (all other HTML pages)
│   ├── logo-*.png                ← All logo variants
│   ├── og-*.png                  ← OG images
│   ├── india-states.geojson
│   ├── manifest.json
│   └── sw.js
├── middleware.js                 ← UPDATED: Added NextResponse import
├── next.config.js                ← NEW: Rewrites, headers, redirects
├── jsconfig.json                 ← NEW: @/ import alias
├── package.json                  ← UPDATED: Added next, react, react-dom
├── vercel.json                   ← SLIMMED: Most config moved to next.config.js
├── .gitignore                    ← UPDATED: Added .next/, out/, etc.
├── CNAME
├── LICENSE
└── README.md
```

## Step-by-Step Setup

### 1. Create a new branch (DO NOT work on main)

```bash
cd MF-Analyzer-Abundance
git checkout -b nextjs
```

### 2. Copy the new/updated files

Copy these files from the scaffold into your project:

**NEW files (just add):**
- `app/layout.js`
- `app/globals.css`
- `app/not-found.js`
- `app/sitemap.js`
- `app/robots.js`
- `components/Navbar.jsx`
- `components/Footer.jsx`
- `lib/metadata.js`
- `next.config.js`
- `jsconfig.json`

**REPLACE these files:**
- `package.json` → replace with the new one
- `vercel.json` → replace with the slimmed one
- `middleware.js` → replace with the Next.js-compatible one
- `.gitignore` → replace with the updated one

### 3. Delete the old static sitemap and robots (Next.js generates them dynamically now)

```bash
rm public/sitemap.xml
rm public/robots.txt
```

### 4. Install dependencies

```bash
npm install
```

This installs `next`, `react`, and `react-dom` alongside your existing deps.

### 5. Test locally

```bash
npm run dev
```

Then verify:
- `http://localhost:3000/` → should show your main calculator (served from index.html via rewrite)
- `http://localhost:3000/rolling` → should show rolling returns page (via rewrite)
- `http://localhost:3000/nonexistent-page` → should show the new 404 page with shared Navbar + Footer
- `http://localhost:3000/sitemap.xml` → should show auto-generated sitemap
- `http://localhost:3000/robots.txt` → should show auto-generated robots.txt
- All API routes should work: `/api/mf?q=hdfc`, `/api/health`, etc.

### 6. Push to get a preview deployment

```bash
git add .
git commit -m "Phase 1: Next.js scaffold with shared layout, components, and SEO infrastructure"
git push -u origin nextjs
```

Vercel automatically creates a preview deployment for the `nextjs` branch. You'll get a URL like `mfcalc-abundance-xxx.vercel.app` — test everything there before merging to main.

### 7. Verify on preview deployment

Check all pages work:
- [ ] Homepage loads (all 5 calculator tabs work)
- [ ] /rolling works
- [ ] /industry works
- [ ] /report works
- [ ] /geography works
- [ ] /cas-tracker works
- [ ] /indices works
- [ ] /portfolio works
- [ ] /api/mf?q=hdfc returns data
- [ ] /api/parse (POST with PDF) works
- [ ] /api/nifty-tri?health=1 returns status
- [ ] /sitemap.xml is correct
- [ ] 404 page shows for invalid URLs
- [ ] Share URLs with ?btMode=1 or ?sipBTMode=1 show OG tags to bots

### 8. Merge when ready

```bash
git checkout main
git merge nextjs
git push
```

Your production site switches to Next.js. Zero downtime.

---

## What Changed (Summary)

| What | Before | After |
|------|--------|-------|
| Build system | No build step, static HTML | Next.js with App Router |
| CSS | Copy-pasted in every HTML file | Single `globals.css` + shared components |
| Navbar | Copy-pasted HTML in 10 files | Single `Navbar.jsx` component |
| Footer | Copy-pasted HTML in 10 files | Single `Footer.jsx` component |
| SEO metadata | Hardcoded in each HTML `<head>` | Centralized `lib/metadata.js` |
| Sitemap | Static `sitemap.xml` | Dynamic `app/sitemap.js` (auto-updates) |
| Robots.txt | Static file | Dynamic `app/robots.js` |
| API routes | `/api/*.js` Vercel serverless | Same — untouched, still works |
| Python API | `/api/parse.py` | Same — untouched, still works |
| Middleware | Plain Vercel middleware | Next.js middleware (same logic) |
| Pages | Static HTML in `/public` | Served via rewrites (until ported) |
| 404 page | `public/404.html` | `app/not-found.js` (uses shared components) |

## What's Next (Phase 2+)

Pages will be ported one at a time from smallest to largest:
1. ~~`xls-pdf-extractor` (218 lines)~~ — SKIPPED (not in use)
2. ~~`portfolio` (348 lines)~~ — SKIPPED (not in use)
3. ✅ `indices` (416 lines) — **PORTED** to `app/indices/page.js`
4. ✅ `cas-tracker` (605 lines) — **PORTED** to `app/cas-tracker/page.js`
5. `geography` (755 lines)
6. `report` (1079 lines)
7. `industry` (1182 lines)
8. `rolling` (1608 lines)
9. `index` (8735 lines) — decompose into 5 separate tool pages

For each page:
1. Create `app/<page>/page.js` with metadata + React component
2. Remove its rewrite entry from `next.config.js`
3. Delete the old `public/<page>.html`
4. Test and deploy

Auth integration and feature gating can happen in parallel with page porting.

## Phase 2 Progress

### ✅ `/indices` — COMPLETED (2026-04-08)

**What was ported:**
- `app/indices/layout.js` — Server Component with metadata + JSON-LD structured data
- `app/indices/page.js` — Client Component with sortable table, filters, search
- Added indices-specific styles to `app/globals.css`:
  - Controls bar (category buttons, search box, data badge)
  - Table styling (headers, cells, hover states, sort indicators)
  - Category pills (Broad, Sectoral, Strategy, Thematic)
  - Return colors (positive/negative/neutral)
  - Risk badges (Very High, High, Moderate, Low)
  - Rolling returns comparison button
  - Skeleton loading animation
  - Source attribution footer
- Removed `/indices` rewrite from `next.config.js`
- Deleted `public/indices.html`

**Features preserved:**
- Fetches data from `/api/index-dashboard`
- Sortable by any column (click headers)
- Filter by category (All, Broad, Sectoral, Strategy, Thematic)
- Search by index name
- Shows 100+ NSE indices with 1M/3M/1Y/3Y/5Y returns
- Risk metrics (Vol, Beta), Valuation (P/E, P/B, D.Y.)
- Risk score badges with colors
- "Compare" button links to `/rolling?bench=<index_name>`
- Responsive table with horizontal scroll on mobile
- Loading skeleton with smooth fade-in
- Error handling with user-friendly messages

**SEO improvements:**
- Metadata from `lib/metadata.js` (title, description, keywords, OG tags)
- JSON-LD structured data (WebApplication + BreadcrumbList)
- Proper hreflang tags
- Canonical URL
- Updated sitemap (auto-generated from `app/sitemap.js`)

---

### ✅ `/cas-tracker` — COMPLETED (2026-04-08)

**What was ported:**
- `app/cas-tracker/layout.js` — Server Component with metadata + JSON-LD (SoftwareApplication + FAQPage schemas)
- `app/cas-tracker/page.js` — Client Component with file upload, parsing, and portfolio dashboard
- Added 500+ lines of CAS-specific styles to `app/globals.css`:
  - Upload card (file input, password field, submit button, security note)
  - Loading states (spinner animation, loading text, progress messages)
  - Dashboard header (title, cache badge, new upload button)
  - Multi-PAN tabs for family CAS statements
  - Stat cards grid (Current Value, Invested, Wealth Gain with color-coded accents)
  - Fund cards (2-column grid with hover effects)
  - Folio metadata panels (Folio, Nominee, Advisor)
  - ELSS lock-in badges (locked/unlocked states)
  - NAV comparison grid (Avg Buy NAV vs Live NAV)
  - Gain percentage indicators (positive/negative colors)
  - Stagger animation for smooth card reveals
  - Responsive breakpoints for mobile/tablet
- Removed `/cas-tracker` rewrite from `next.config.js`
- Deleted `public/cas-tracker.html`

**Features preserved:**
- File upload form (PDF + password input)
- Session storage caching (reuse parsed data without re-upload)
- Multi-PAN family CAS support with investor tabs
- Live NAV fetching from `/api/mf` for each holding
- FIFO cost basis calculation with transaction processing
- ELSS lock-in tracking (3-year holding period)
- Nominee and Advisor extraction from casparser
- Stat cards showing:
  - Current portfolio value
  - Total invested amount (FIFO-based)
  - Wealth gain (absolute + percentage)
- Fund cards showing:
  - Fund name, folio number, nominee, advisor
  - ELSS lock status with locked value
  - Average buy NAV (from CAS) vs Live NAV
  - Units held, invested amount, current value
  - Per-fund gain percentage
- Error handling with user-friendly messages
- Loading states with progress indicators
- Smooth animations for dashboard reveal

**Technical improvements:**
- React hooks for state management (useState)
- Proper form handling with FormData API
- Async/await for API calls and NAV fetching
- Session storage abstraction for caching
- FIFO algorithm preserved from original implementation
- Investor name resolution logic (handles single-PAN and multi-PAN CAS)
- PAN validation and masking for privacy

**SEO improvements:**
- Metadata from `lib/metadata.js`
- JSON-LD SoftwareApplication schema with feature list
- JSON-LD FAQPage schema with common CAS questions
- Proper structured data for finance applications


