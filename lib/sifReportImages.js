/**
 * lib/sifReportImages.js
 *
 * Pure @vercel/og element-tree builders for the SIF report images --
 * no Request/Response, no Next.js imports beyond the shared logo asset,
 * so this is importable from both a live route handler
 * (app/api/og-sif-aum/route.js) and a plain Node script
 * (scripts/generate_sif_report_images.js) equally.
 */

import { OG_LOGO_MARK_URL } from './ogAssets.js';

const GREEN_GRAD = 'linear-gradient(90deg,#43a047,#1b5e20)';
const TOP_GRAD = 'linear-gradient(90deg,#ffd54f,#ffb300)';

function fmtCr(n) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

export function buildAumImageElement(board) {
  if (!board) {
    return {
      type: 'div',
      props: {
        style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1f0a', color: '#fff', fontSize: 28, fontFamily: 'sans-serif' },
        children: 'SIF AUM data temporarily unavailable',
      },
    };
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

  return {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)', fontFamily: 'sans-serif' },
      children: [
        { type: 'div', props: { style: { width: '100%', height: 6, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', display: 'flex' } } },
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
        { type: 'div', props: {
          style: { display: 'flex', flexDirection: 'column', padding: '18px 56px 0' },
          children: [
            { type: 'div', props: { style: { color: '#fff', fontSize: 42, fontWeight: 800, display: 'flex' }, children: "India's SIF AUM Leaderboard" } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.6)', fontSize: 17, marginTop: 4, display: 'flex' }, children: `SIF-wise Average AUM for the Month · ${board.asOf || 'latest quarter'}` } },
          ],
        } },
        { type: 'div', props: {
          style: { display: 'flex', flex: 1, padding: '26px 56px', gap: 44 },
          children: [
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', width: 320 },
              children: [
                { type: 'div', props: {
                  style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '22px 24px', marginBottom: 18 },
                  children: [
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', display: 'flex' }, children: 'Average SIF AUM (Monthly)' } },
                    { type: 'div', props: { style: { color: '#fff', fontSize: 44, fontWeight: 800, marginTop: 8, display: 'flex' }, children: fmtCr(board.totalAumCr) } },
                    ...(board.momDeltaCr != null ? [{ type: 'div', props: {
                      style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 },
                      children: [
                        { type: 'span', props: { style: { color: board.momDeltaCr >= 0 ? '#66bb6a' : '#ef5350', fontSize: 15, fontWeight: 700, display: 'flex' }, children: `${board.momDeltaCr >= 0 ? '▲' : '▼'} ${fmtCr(Math.abs(board.momDeltaCr))}` } },
                        { type: 'span', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 13, display: 'flex' }, children: board.momDeltaPct != null ? `(${board.momDeltaPct >= 0 ? '+' : ''}${board.momDeltaPct.toFixed(1)}%) since ${board.previousAsOf}` : `since ${board.previousAsOf}` } },
                      ],
                    } }] : []),
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
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 16, display: 'flex' }, children: `${board.sifCount} SIFs tracked` } },
                  ],
                } },
              ],
            } },
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '20px 24px' },
              children: [
                ...rankRows,
                ...(remaining > 0 ? [{ type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 12, display: 'flex' }, children: `+ ${remaining} more at mfcalc.getabundance.in/sifs/reports/aum-leaderboard` } }] : []),
              ],
            } },
          ],
        } },
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
}

function fmtPct(n, { signed = true } = {}) {
  if (n == null) return '—';
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function heatColor(n) {
  if (n == null) return 'rgba(255,255,255,0.04)';
  const capped = Math.max(-15, Math.min(15, n));
  const t = Math.abs(capped) / 15;
  const alpha = 0.12 + t * 0.45;
  return n >= 0 ? `rgba(76,175,80,${alpha.toFixed(2)})` : `rgba(229,57,53,${alpha.toFixed(2)})`;
}

function textColor(n) {
  if (n == null) return 'rgba(255,255,255,0.35)';
  return n >= 0 ? '#a5d6a7' : '#ef9a9a';
}

// Available canvas width for period columns after the fixed SIF-name
// (360px), NAV (100px) and Vol (90px) columns, within the 1600px canvas
// minus padding.
const PERIOD_COLS_WIDTH = 1050;

/**
 * @param {object} report - lib/sifReports.js's getSifCategoryPerformance() result
 * @param {{key: string, label: string}[]} periods - lib/sifReports.js's
 *   availableReturnPeriods(report.schemes) -- passed in rather than
 *   recomputed here, since this module has no DB/Next.js imports of its
 *   own and stays that way deliberately (importable from a plain Node
 *   script, see this file's header comment).
 */
export function buildPerformanceImageElement(report, periods) {
  const COLS = periods.map((p) => ({ ...p, width: Math.floor(PERIOD_COLS_WIDTH / periods.length) }));
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
        ...COLS.map((c) => ({ type: 'div', props: { style: { width: c.width, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'flex-end' }, children: c.label } })),
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
              style: { width: c.width, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' },
              children: { type: 'span', props: {
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

  return {
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
}
