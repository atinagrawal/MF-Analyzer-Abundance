/**
 * app/pms-preferred/page.jsx
 *
 * See app/pms-preferred/PmsPreferredTable.jsx's header comment for why
 * this page is a server component rendering the free content directly
 * (SEO requirement -- see docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md).
 */

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getPreferredStrategies } from '@/lib/pmsPreferredCache';
import { getPMSLogo } from '@/lib/providerLogos';
import PmsPreferredTable from './PmsPreferredTable';
import './pms-preferred.css';

export const dynamic = 'force-dynamic';

const SITE = 'https://mfcalc.getabundance.in';
const PAGE_URL = `${SITE}/pms-preferred`;

// Shared so generateMetadata() and the page body produce identical copy.
function pageCopy(count) {
  return {
    title: `${count} Abundance Preferred PMS Strategies — Top Quartile Portfolios | Abundance`,
    description: count > 0
      ? `${count} PMS strategies currently Top Quartile vs APMI peers, with real extracted holdings, sector allocation and fundamentals vs benchmark. Curated by disclosed, factual criteria -- not investment advice. By Abundance Financial Services, APRN04279.`
      : `PMS strategies that are Top Quartile vs APMI peers, with real extracted holdings, sector allocation and fundamentals. By Abundance Financial Services, APRN04279.`,
  };
}

function buildJsonLd(doc, description) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: 'Abundance Preferred PMS Strategies',
        description,
        url: PAGE_URL,
        numberOfItems: doc?.strategies?.length ?? 0,
        itemListElement: (doc?.strategies || []).map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${s.strategyName} by ${s.providerName}`,
          url: `${SITE}/pms/${s.iaid}`,
        })),
      },
    ],
  };
}

export async function generateMetadata() {
  const doc = await getPreferredStrategies().catch(() => null);
  const { title, description } = pageCopy(doc?.strategies?.length ?? 0);

  return {
    title,
    description,
    alternates: { canonical: PAGE_URL },
    openGraph: { title, description, type: 'website', url: PAGE_URL },
    twitter: { card: 'summary_large_image', title, description },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  };
}

export default async function PmsPreferredPage() {
  const doc = await getPreferredStrategies().catch(() => null);
  const strategies = doc?.strategies || [];
  const insights = doc?.insights || null;
  const { description } = pageCopy(strategies.length);
  const jsonLd = buildJsonLd(doc, description);

  return (
    <>
      {/* Rendered as a real <script type="application/ld+json"> (the repo-majority
          pattern, e.g. app/articles/[slug]/page.jsx) -- the metadata `other:
          {'script:ld+json': ...}` form only emits an inert <meta> tag crawlers ignore. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main className="pmspref-main">
        <h1 className="pmspref-title">Abundance Preferred PMS Strategies</h1>
        <p className="pmspref-intro">
          Strategies here are Top Quartile against their APMI peer group over 3 years
          (or, for strategies too new to have 3 years of peer data yet, Top Quartile
          in at least half of the periods they do have real data for). This is a
          disclosed, factual, automatically-recomputed rule, not a personal
          recommendation.
        </p>

        {!doc && (
          <p className="pmspref-empty">This list is being computed — check back soon.</p>
        )}

        {doc && strategies.length === 0 && (
          <p className="pmspref-empty">No strategies currently meet this bar. Check back next month.</p>
        )}

        {insights && strategies.length > 0 && (
          <section className="pmspref-insights">
            <h2 className="pmspref-section-title">This Month's Insights</h2>
            <div className="pmspref-insights-grid">
              {insights.mostHeldStock && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Most-Held Stock</div>
                  <div className="pmspref-insight-value">{insights.mostHeldStock.name}</div>
                  <div className="pmspref-insight-sub">Held by {insights.mostHeldStock.count} of {strategies.length} preferred strategies</div>
                </div>
              )}
              {insights.topSector && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Top Aggregate Sector Conviction</div>
                  <div className="pmspref-insight-value">{insights.topSector.sector}</div>
                  <div className="pmspref-insight-sub">{insights.topSector.totalWeightPct}% combined weight across {insights.topSector.strategies.length} strategies</div>
                </div>
              )}
              {insights.bestAlpha && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Best 1-Year Alpha</div>
                  <div className="pmspref-insight-value">+{insights.bestAlpha.alphaPct}pp</div>
                  <div className="pmspref-insight-sub">{insights.bestAlpha.strategyName} ({insights.bestAlpha.providerName})</div>
                </div>
              )}
              {insights.bestSharpe && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Best Sharpe Ratio</div>
                  <div className="pmspref-insight-value">{insights.bestSharpe.sharpeRatio}</div>
                  <div className="pmspref-insight-sub">{insights.bestSharpe.strategyName} ({insights.bestSharpe.providerName})</div>
                </div>
              )}
            </div>
          </section>
        )}

        {strategies.length > 0 && (
          <section className="pmspref-grid-section">
            <h2 className="pmspref-section-title">{strategies.length} Preferred Strategies</h2>
            <div className="pmspref-grid">
              {strategies.map((s) => (
                <a key={s.iaid} href={`/pms/${s.iaid}`} className="pmspref-card">
                  <div className="pmspref-card-head">
                    {getPMSLogo(s.providerName) && (
                      <img src={getPMSLogo(s.providerName)} alt="" className="pmspref-card-logo" />
                    )}
                    <span className="pmspref-card-category">{s.category}</span>
                  </div>
                  <div className="pmspref-card-name">{s.strategyName}</div>
                  <div className="pmspref-card-provider">{s.providerName}</div>
                  <div className="pmspref-card-stats">
                    {s.aumCr != null && <span>AUM ₹{s.aumCr} Cr</span>}
                    {s.qualifyingPeriod && <span className="pmspref-card-badge">{s.qualifyingPeriod} {s.quartile}</span>}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {strategies.length > 0 && <PmsPreferredTable strategies={strategies} />}

        <div className="pmspref-disclosure">
          Data sourced from APMI India (Association of Portfolio Managers in India).
          Min PMS investment ₹50L per SEBI. Past performance is not indicative of future results.
          This is not investment advice. Abundance Financial Services — Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered PMS Distributor.
        </div>
      </main>
      <Footer />
    </>
  );
}
