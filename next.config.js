/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Image optimization ──
  images: {
    unoptimized: true, // logos are pre-optimized PNGs
  },

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
  // [ ] / (index.html)           — 8735 lines, port last
  // [ ] /rolling                 — 1608 lines
  // [ ] /industry                — 1182 lines
  // [ ] /report                  — 1079 lines
  // [ ] /geography               — 755 lines
  // [ ] /cas-tracker             — 605 lines
  // [ ] /indices                 — 416 lines
  // [ ] /portfolio               — 348 lines
  // [ ] /xls-pdf-extractor       — 218 lines
  // [ ] /404                     — 329 lines (→ app/not-found.js)
  async rewrites() {
    return {
      beforeFiles: [
        // Homepage — largest page, port last
        { source: '/', destination: '/index.html' },

        // Tool pages — port from smallest to largest
        { source: '/rolling', destination: '/rolling.html' },
        { source: '/industry', destination: '/industry.html' },
        { source: '/report', destination: '/report.html' },
        { source: '/geography', destination: '/geography.html' },
        { source: '/cas-tracker', destination: '/cas-tracker.html' },
        { source: '/indices', destination: '/indices.html' },
        { source: '/portfolio', destination: '/portfolio.html' },
        { source: '/xls-pdf-extractor', destination: '/xls-pdf-extractor.html' },
      ],
    };
  },

  // ── Headers ──
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
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
      { source: '/cas-tracker.html', destination: '/cas-tracker', permanent: true },
      { source: '/portfolio.html', destination: '/portfolio', permanent: true },
      { source: '/rolling.html', destination: '/rolling', permanent: true },
      { source: '/industry.html', destination: '/industry', permanent: true },
      { source: '/report.html', destination: '/report', permanent: true },
      { source: '/geography.html', destination: '/geography', permanent: true },
      { source: '/indices.html', destination: '/indices', permanent: true },
      { source: '/xls-pdf-extractor.html', destination: '/xls-pdf-extractor', permanent: true },
    ];
  },
};

module.exports = nextConfig;
