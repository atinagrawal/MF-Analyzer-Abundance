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
1. `xls-pdf-extractor` (218 lines)
2. `portfolio` (348 lines)
3. `indices` (416 lines)
4. `cas-tracker` (605 lines)
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
