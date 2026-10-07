/**
 * app/sifs/reports/aum-leaderboard/page.jsx
 *
 * India's SIF AUM Leaderboard -- real HTML rendering of the same data
 * app/api/og-sif-aum/route.js turns into a downloadable branded PNG.
 * Data layer: lib/sifReports.js's getSifAumLeaderboard().
 */

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getSifAumLeaderboard } from '@/lib/sifReports';
import '../sif-reports.css';

export const revalidate = 21600;

const SITE = 'https://mfcalc.getabundance.in';
const PAGE_URL = `${SITE}/sifs/reports/aum-leaderboard`;
const OG_IMAGE = `${SITE}/api/og-sif-aum`;

function fmtCr(n) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

// `<`-escape guard for scraped/variable text inside JSON-LD, matching the
// repo-majority pattern (see app/stocks-in-funds/[ticker]/page.jsx).
function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export async function generateMetadata() {
  const board = await getSifAumLeaderboard().catch(() => null);
  const title = 'India’s SIF AUM Leaderboard — AMC-wise Assets Under Management | Abundance';
  const description = board
    ? `₹${board.totalAumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr across ${board.sifCount} Specialized Investment Funds in India, ranked by AUM, as of ${board.asOf}. Free report, downloadable and shareable. Abundance Financial Services (ARN-251838).`
    : 'AMC-wise AUM leaderboard for Specialized Investment Funds (SIFs) in India. Abundance Financial Services (ARN-251838).';
  return {
    title,
    description,
    alternates: { canonical: PAGE_URL },
    openGraph: { title, description, url: PAGE_URL, siteName: 'Abundance', locale: 'en_IN', type: 'website', images: [{ url: OG_IMAGE, width: 1600, height: 900 }] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE] },
  };
}

export default async function SifAumLeaderboardPage() {
  // No try/catch: a genuine DB/R2 error should surface as a real error
  // rather than silently rendering an empty report under ISR -- same
  // reasoning as app/fund/[code]/page.js's fix this session.
  const board = await getSifAumLeaderboard();

  const jsonLd = board ? {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: "India's SIF AUM Leaderboard",
    description: `AMC-wise assets under management for ${board.sifCount} Specialized Investment Funds in India, as of ${board.asOf}.`,
    url: PAGE_URL,
    license: 'https://www.amfiindia.com',
    creator: { '@type': 'FinancialService', name: 'Abundance Financial Services', identifier: 'ARN-251838' },
    variableMeasured: 'Assets Under Management (AUM)',
  } : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      )}
      <Navbar />
      <main className="sifr-wrap">
        <div className="sifr-eyebrow"><a href="/sifs/reports">SIF Reports</a> &middot; AUM Leaderboard</div>
        <h1 className="sifr-title">India&rsquo;s SIF AUM Leaderboard</h1>
        {board && <p className="sifr-sub">SIF-wise assets under management &middot; as of {board.asOf}</p>}

        <div className="sifr-download-row">
          <a className="sifr-download-btn" href={OG_IMAGE} target="_blank" rel="noopener noreferrer">
            &#8681; Download shareable image
          </a>
          {board && <span className="sifr-asof">Updated quarterly from AMFI&rsquo;s SIF Average AUM disclosure</span>}
        </div>

        {!board ? (
          <p>SIF AUM data is temporarily unavailable. Please check back shortly.</p>
        ) : (
          <>
            <div className="sifr-kpis">
              <div className="sifr-kpi">
                <div className="sifr-kpi-label">Average SIF AUM (Monthly)</div>
                <div className="sifr-kpi-value">{fmtCr(board.totalAumCr)}</div>
                {board.momDeltaCr != null && (
                  <div className={`sifr-mom ${board.momDeltaCr >= 0 ? 'up' : 'down'}`}>
                    {board.momDeltaCr >= 0 ? '▲' : '▼'} {fmtCr(Math.abs(board.momDeltaCr))}
                    {board.momDeltaPct != null && ` (${board.momDeltaPct >= 0 ? '+' : ''}${board.momDeltaPct.toFixed(1)}%)`}
                    {' '}since {board.previousAsOf}
                  </div>
                )}
              </div>
              <div className="sifr-kpi">
                <div className="sifr-kpi-label">SIFs Tracked</div>
                <div className="sifr-kpi-value">{board.sifCount}</div>
              </div>
              <div className="sifr-kpi">
                <div className="sifr-kpi-label">Top 5 Concentration</div>
                <div className="sifr-kpi-value">{board.top5SharePct.toFixed(1)}%</div>
              </div>
            </div>
            <p className="sifr-metric-note">
              AUM figures are AMFI&rsquo;s disclosed <strong>average AUM for the month</strong>, not a
              same-day snapshot &mdash; during periods of rapid growth (like now), this reads lower than a
              point-in-time figure. AMFI does not publish a point-in-time AUM feed for SIFs.
            </p>

            <div className="sifr-board">
              {board.rows.map((r, i) => (
                <div className="sifr-row" key={r.sifName}>
                  <div className="sifr-rank">{i + 1}</div>
                  <div className="sifr-name">{r.sifName}</div>
                  <div className="sifr-bar-track">
                    <div
                      className={`sifr-bar-fill${i === 0 ? ' top' : ''}`}
                      style={{ width: `${Math.max((r.aumCr / board.rows[0].aumCr) * 100, 2)}%` }}
                    />
                  </div>
                  <div className="sifr-aum">{fmtCr(r.aumCr)}</div>
                  <div className="sifr-share">{r.sharePct.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="sifr-disclaimer">
          Source: AMFI, SIF Average AUM disclosure (quarterly). Figures rolled up from each SIF&rsquo;s own
          Direct/Regular &times; Growth/IDCW plan-variants to a single AUM figure per SIF. Investments in
          Specialized Investment Funds involve relatively higher risk including potential loss of capital,
          liquidity risk and market volatility. This report is for informational purposes only and does not
          constitute investment advice. Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund
          Distributor) &middot; Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).
        </p>
      </main>
      <Footer />
    </>
  );
}
