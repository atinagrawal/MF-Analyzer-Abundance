/**
 * app/api/og-sif-aum/route.js
 *
 * Downloadable branded PNG for the SIF AUM Leaderboard
 * (app/sifs/reports/aum-leaderboard/page.jsx) -- the shareable artifact
 * itself, not a link-preview card, so sized larger (1600x900) than this
 * app's other @vercel/og routes (1200x630, e.g. pages/api/og-screener.js).
 *
 * Node.js runtime, not Edge -- App Router Route Handlers return a
 * Web-standard Response on either runtime (unlike pages/api/*.js, where
 * returning an ImageResponse directly requires Edge), and Node.js lets
 * this route query Postgres directly via lib/sifReports.js instead of an
 * extra internal fetch hop.
 */

import { ImageResponse } from '@vercel/og';
import { getSifAumLeaderboard } from '@/lib/sifReports';
import { OG_LOGO_MARK_URL } from '@/lib/ogAssets';

export const revalidate = 21600;

const GREEN_GRAD = 'linear-gradient(90deg,#43a047,#1b5e20)';
const TOP_GRAD = 'linear-gradient(90deg,#ffd54f,#ffb300)';

function fmtCr(n) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

export async function GET() {
  const board = await getSifAumLeaderboard();

  if (!board) {
    const el = {
      type: 'div',
      props: {
        style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1f0a', color: '#fff', fontSize: 28, fontFamily: 'sans-serif' },
        children: 'SIF AUM data temporarily unavailable',
      },
    };
    return new ImageResponse(el, { width: 1600, height: 900 });
  }

  const TOP_N = 12;
  const top = board.rows.slice(0, TOP_N);
  const maxAum = top[0]?.aumCr || 1;
  const remaining = board.rows.length - top.length;

  const rankRows = top.map((r, i) => ({
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: i === top.length - 1 ? 0 : 11 },
      children: [
        { type: 'div', props: { style: { width: 22, color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: 700, display: 'flex' }, children: String(i + 1) } },
        { type: 'div', props: { style: { width: 158, color: '#fff', fontSize: 16, fontWeight: i < 3 ? 800 : 600, display: 'flex' }, children: r.sifName } },
        { type: 'div', props: {
          style: { flex: 1, display: 'flex', alignItems: 'center', height: 16 },
          children: { type: 'div', props: { style: { width: `${Math.max((r.aumCr / maxAum) * 100, 3)}%`, height: 16, borderRadius: 4, background: i === 0 ? TOP_GRAD : GREEN_GRAD, display: 'flex' } } },
        } },
        { type: 'div', props: { style: { width: 108, textAlign: 'right', color: '#fff', fontSize: 16, fontWeight: 800, display: 'flex', justifyContent: 'flex-end' }, children: fmtCr(r.aumCr) } },
        { type: 'div', props: { style: { width: 58, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'flex', justifyContent: 'flex-end' }, children: `${r.sharePct.toFixed(1)}%` } },
      ],
    },
  }));

  const el = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)', fontFamily: 'sans-serif' },
      children: [
        { type: 'div', props: { style: { width: '100%', height: 6, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', display: 'flex' } } },
        // Header
        { type: 'div', props: {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 56px 0' },
          children: [
            { type: 'div', props: {
              style: { display: 'flex', alignItems: 'center', gap: 14 },
              children: [
                { type: 'img', props: { src: OG_LOGO_MARK_URL, style: { height: 40, width: 40, objectFit: 'contain' } } },
                { type: 'div', props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    { type: 'div', props: { style: { color: '#66bb6a', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', display: 'flex' }, children: 'ABUNDANCE FINANCIAL SERVICES' } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1, display: 'flex' }, children: 'ARN-251838 · AMFI Registered MFD & SIF Distributor' } },
                  ],
                } },
              ],
            } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'flex' }, children: 'mfcalc.getabundance.in/sifs/reports' } },
          ],
        } },
        // Title
        { type: 'div', props: {
          style: { display: 'flex', flexDirection: 'column', padding: '18px 56px 0' },
          children: [
            { type: 'div', props: { style: { color: '#fff', fontSize: 42, fontWeight: 800, display: 'flex' }, children: "India's SIF AUM Leaderboard" } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.6)', fontSize: 17, marginTop: 4, display: 'flex' }, children: `SIF-wise assets under management · as of ${board.asOf || 'latest quarter'}` } },
          ],
        } },
        // Body: two columns
        { type: 'div', props: {
          style: { display: 'flex', flex: 1, padding: '26px 56px', gap: 44 },
          children: [
            // Left: KPI card
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', width: 320 },
              children: [
                { type: 'div', props: {
                  style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '22px 24px', marginBottom: 18 },
                  children: [
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', display: 'flex' }, children: 'Total SIF AUM' } },
                    { type: 'div', props: { style: { color: '#fff', fontSize: 44, fontWeight: 800, marginTop: 8, display: 'flex' }, children: fmtCr(board.totalAumCr) } },
                  ],
                } },
                { type: 'div', props: {
                  style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '22px 24px' },
                  children: [
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.4, display: 'flex' }, children: [
                      { type: 'span', props: { style: { color: '#ffb300', fontWeight: 800, fontSize: 22, display: 'flex', marginRight: 6 }, children: `${board.top5SharePct.toFixed(1)}%` } },
                      { type: 'span', props: { style: { display: 'flex' }, children: 'held by the top 5 SIFs' } },
                    ] } },
                    { type: 'div', props: { style: { display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 14 }, children: [
                      { type: 'div', props: { style: { width: `${board.top5SharePct}%`, background: TOP_GRAD, display: 'flex' } } },
                      { type: 'div', props: { style: { width: `${100 - board.top5SharePct}%`, background: 'rgba(255,255,255,0.15)', display: 'flex' } } },
                    ] } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 16, display: 'flex' }, children: `${board.sifCount} SIFs tracked across ${board.categoryCount} categories` } },
                  ],
                } },
              ],
            } },
            // Right: ranked list
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '20px 24px' },
              children: [
                ...rankRows,
                ...(remaining > 0 ? [{ type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 12, display: 'flex' }, children: `+ ${remaining} more at mfcalc.getabundance.in/sifs/reports/aum-leaderboard` } }] : []),
              ],
            } },
          ],
        } },
        // Footer
        { type: 'div', props: {
          style: { display: 'flex', flexDirection: 'column', padding: '12px 56px 20px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', gap: 3 },
          children: [
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'flex' }, children: 'Source: AMFI quarterly Average AUM disclosure · Investments in SIFs carry relatively higher risk including potential loss of capital · Not investment advice.' } },
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
