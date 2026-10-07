/**
 * app/api/og-sif-performance/route.js
 *
 * GET /api/og-sif-performance?category=<slug>
 *
 * Downloadable branded PNG heatmap table for one SIF category's
 * performance comparison (app/sifs/reports/performance/[category]/page.jsx)
 * -- same return/volatility data as /sifs' screener, re-shaped into the
 * color-coded comparison format SIF360 publishes per category. See
 * lib/sifReports.js's header comment for the data-coverage gap vs.
 * SIF360's own version (no portfolio-composition columns yet).
 *
 * Node.js runtime (App Router default) so this can query Postgres
 * directly via lib/sifReports.js -- see app/api/og-sif-aum/route.js's
 * header comment for why Node.js over Edge here.
 *
 * No `export const revalidate` here (unlike og-sif-aum, which has no
 * query params) -- confirmed live (2026-10) that combining `revalidate`
 * with reading request.url's searchParams throws a DynamicServerError at
 * runtime in production (500, no stack trace in logs; didn't reproduce
 * locally in either dev or `next start`, only on Vercel's actual
 * environment). The ImageResponse's own Cache-Control header below
 * already caches per full URL (including ?category=) at the CDN, which
 * is the correct mechanism for a query-parameterized route anyway.
 */

import { ImageResponse } from '@vercel/og';
import { getSifCategoryPerformance, listSifCategories } from '@/lib/sifReports';
import { OG_LOGO_MARK_URL } from '@/lib/ogAssets';

function fmtPct(n, { signed = true } = {}) {
  if (n == null) return '—';
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

// Green for positive, red for negative, scaled by magnitude (capped at
// +/-15% so one outlier scheme doesn't wash out every other cell's color).
function heatColor(n) {
  if (n == null) return 'rgba(255,255,255,0.04)';
  const capped = Math.max(-15, Math.min(15, n));
  const t = Math.abs(capped) / 15; // 0..1
  if (capped >= 0) {
    const alpha = 0.12 + t * 0.45;
    return `rgba(76,175,80,${alpha.toFixed(2)})`;
  }
  const alpha = 0.12 + t * 0.45;
  return `rgba(229,57,53,${alpha.toFixed(2)})`;
}

function textColor(n) {
  if (n == null) return 'rgba(255,255,255,0.35)';
  return n >= 0 ? '#a5d6a7' : '#ef9a9a';
}

const COLS = [
  { key: 'ret1m', label: '1M', width: 110 },
  { key: 'ret3m', label: '3M', width: 110 },
  { key: 'ret6m', label: '6M', width: 110 },
  { key: 'ret1y', label: '1Y', width: 110 },
  { key: 'ret3y', label: '3Y (Ann.)', width: 130 },
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('category') || '';
  const report = await getSifCategoryPerformance(slug);

  if (!report) {
    const available = listSifCategories().map((c) => c.slug).join(', ');
    const el = {
      type: 'div',
      props: {
        style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a1f0a', color: '#fff', fontSize: 24, fontFamily: 'sans-serif', padding: 60, textAlign: 'center' },
        children: [
          { type: 'div', props: { style: { display: 'flex', marginBottom: 16 }, children: `Unknown or empty SIF category: "${slug}"` } },
          { type: 'div', props: { style: { display: 'flex', fontSize: 15, color: 'rgba(255,255,255,0.5)' }, children: `Available: ${available}` } },
        ],
      },
    };
    return new ImageResponse(el, { width: 1600, height: 500 });
  }

  const TOP_N = 12;
  const schemes = report.schemes.slice(0, TOP_N);
  const remaining = report.schemes.length - schemes.length;

  const headerRow = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', padding: '0 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.15)' },
      children: [
        { type: 'div', props: { style: { width: 360, color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'flex' }, children: 'SIF' } },
        { type: 'div', props: { style: { width: 100, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'flex-end' }, children: 'NAV' } },
        ...COLS.map((c) => ({ type: 'div', props: { style: { width: c.width, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'flex-end' }, children: c.label } } )),
        { type: 'div', props: { style: { width: 90, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'flex-end' }, children: 'Vol' } },
      ],
    },
  };

  const dataRows = schemes.map((s, i) => ({
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', padding: '9px 14px', background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent', borderRadius: 8 },
      children: [
        { type: 'div', props: { style: { width: 360, color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex' }, children: s.name } },
        { type: 'div', props: { style: { width: 100, textAlign: 'right', color: 'rgba(255,255,255,0.75)', fontSize: 14, display: 'flex', justifyContent: 'flex-end' }, children: s.nav != null ? s.nav.toFixed(2) : '—' } },
        ...COLS.map((c) => {
          const v = s[c.key];
          return {
            type: 'div',
            props: {
              style: { width: c.width, display: 'flex', justifyContent: 'flex-end' },
              children: { type: 'div', props: {
                style: { background: heatColor(v), color: textColor(v), fontSize: 14, fontWeight: 700, padding: '5px 10px', borderRadius: 6, display: 'flex' },
                children: fmtPct(v),
              } },
            },
          };
        }),
        { type: 'div', props: { style: { width: 90, textAlign: 'right', color: 'rgba(255,255,255,0.6)', fontSize: 14, display: 'flex', justifyContent: 'flex-end' }, children: s.vol != null ? `${s.vol.toFixed(2)}%` : '—' } },
      ],
    },
  }));

  const el = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)', fontFamily: 'sans-serif' },
      children: [
        { type: 'div', props: { style: { width: '100%', height: 6, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', display: 'flex' } } },
        { type: 'div', props: {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 56px 0' },
          children: [
            { type: 'div', props: {
              style: { display: 'flex', alignItems: 'center', gap: 14 },
              children: [
                { type: 'img', props: { src: OG_LOGO_MARK_URL, style: { height: 38, width: 38, objectFit: 'contain' } } },
                { type: 'div', props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    { type: 'div', props: { style: { color: '#66bb6a', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', display: 'flex' }, children: 'ABUNDANCE FINANCIAL SERVICES' } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1, display: 'flex' }, children: 'ARN-251838 · AMFI Registered MFD & SIF Distributor' } },
                  ],
                } },
              ],
            } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'flex' }, children: `As of ${report.asOf || 'latest NAV'}` } },
          ],
        } },
        { type: 'div', props: {
          style: { display: 'flex', flexDirection: 'column', padding: '14px 56px 0' },
          children: [
            { type: 'div', props: { style: { color: '#fff', fontSize: 34, fontWeight: 800, display: 'flex' }, children: `${report.label} SIFs — Performance Comparison` } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 15, marginTop: 4, display: 'flex' }, children: `${report.schemes.length} tracked strategies · absolute returns to 1Y, annualized for 3Y` } },
          ],
        } },
        { type: 'div', props: {
          style: { display: 'flex', flexDirection: 'column', flex: 1, margin: '20px 56px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '16px 10px' },
          children: [
            headerRow,
            ...dataRows,
            ...(remaining > 0 ? [{ type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '10px 14px 0', display: 'flex' }, children: `+ ${remaining} more at mfcalc.getabundance.in/sifs/reports/performance/${report.slug}` } }] : []),
          ],
        } },
        { type: 'div', props: {
          style: { display: 'flex', flexDirection: 'column', padding: '10px 56px 18px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', gap: 3 },
          children: [
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'flex' }, children: 'Source: AMFI NAV history · Past performance may or may not be sustained in the future · Investments in SIFs carry relatively higher risk · Not investment advice.' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, display: 'flex' }, children: 'Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal, APMI Registered PMS Distributor (APRN04279)' } },
          ],
        } },
      ],
    },
  };

  return new ImageResponse(el, {
    width: 1600,
    height: 900,
    headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
  });
}
