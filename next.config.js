/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Image optimization ──
  images: {
    unoptimized: true, // logos are pre-optimized PNGs
  },

  // ── Allow network access for dev server ──
  allowedDevOrigins: ['192.168.29.64'],

  // ── Rewrites: serve legacy HTML pages until they're ported ──────────────
  // HOW THIS WORKS:
  // - `beforeFiles` rewrites run BEFORE the App Router checks for pages.
  // - If `/rolling` doesn't have an `app/rolling/page.js`, the rewrite
  //   serves `public/rolling.html` instead → seamless for users.
  // - When you port a page (e.g., create `app/rolling/page.js`), REMOVE
  //   its entry from this list. The App Router page takes over.
  // - Also delete the old `public/rolling.html` after porting.
  //
  // MIGRATION CHECKLIST — delete rewrite + HTML file after porting each:
  // [✓] / (index.html)           — PORTED (app/page.js)
  // [✓] /rolling                 — PORTED (app/rolling/page.js)
  // [✓] /industry                — PORTED (app/industry/page.js)
  // [✓] /report                  — PORTED (app/report/page.js)
  // [✓] /geography               — PORTED (app/geography/page.js)
  // [✓] /cas-tracker             — PORTED (app/cas-tracker/page.js)
  // [✓] /indices                 — PORTED (app/indices/page.js)
  // [ ] /portfolio               — SKIPPED (no Next.js port yet)
  // [ ] /xls-pdf-extractor       — SKIPPED (no Next.js port yet)
  // [ ] /404                     — → app/not-found.js
  async rewrites() {
    return [
      // NOTE: / (index.html) has been removed — app/page.js now serves it.
      { source: '/portfolio',         destination: '/portfolio.html' },
      { source: '/xls-pdf-extractor', destination: '/xls-pdf-extractor.html' },
    ];
  },

  // ── Headers ──
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
        ],
      },
      {
        source: '/logo-:slug.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // ── SEO Redirects: .html → clean URL (301) ──
  async redirects() {
    return [
      { source: '/index.html',             destination: '/',                  permanent: true },
      { source: '/cas-tracker.html',       destination: '/cas-tracker',       permanent: true },
      { source: '/portfolio.html',         destination: '/portfolio',         permanent: true },
      { source: '/rolling.html',           destination: '/rolling',           permanent: true },
      { source: '/industry.html',          destination: '/industry',          permanent: true },
      { source: '/report.html',            destination: '/report',            permanent: true },
      { source: '/geography.html',         destination: '/geography',         permanent: true },
      { source: '/indices.html',           destination: '/indices',           permanent: true },
      { source: '/xls-pdf-extractor.html', destination: '/xls-pdf-extractor', permanent: true },
    ];
  },
};

module.exports = nextConfig;
