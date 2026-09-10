/**
 * app/pms-preferred/page.jsx
 *
 * Server component: renders the free showcase (insights + strategy grid +
 * the sortable table's initial state) as real, crawlable HTML. See the
 * design spec at
 * docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md.
 *
 * Data provenance: AUM, 1-year return / alpha and quartile ranking are
 * live APMI data as on `doc.asOnMonth`. Holdings, sector & market-cap
 * allocation and portfolio ratios (Sharpe) come from each strategy's most
 * recently published factsheet -- `doc.factsheetAsOfRange` shows the span,
 * which can lag the APMI month. Where a metric is in both sources the APMI
 * value is used.
 */

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getPageMeta } from '@/lib/metadata';
import { getPreferredStrategies } from '@/lib/pmsPreferredCache';
import { getPMSLogo } from '@/lib/providerLogos';
import PmsPreferredTable from './PmsPreferredTable';
import './pms-preferred.css';

export const dynamic = 'force-dynamic';

const SITE = 'https://mfcalc.getabundance.in';
const PAGE_URL = `${SITE}/pms-preferred`;

// Shared so generateMetadata() and the JSON-LD in the body stay in sync.
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
        numberOfItems: doc.strategies.length,
        itemListElement: doc.strategies.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${s.strategyName} by ${s.providerName}`,
          url: `${SITE}/pms/${s.iaid}`,
        })),
      },
    ],
  };
}

// Human-readable "31 Jul 2026" from an ISO "2026-07-31".
function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function generateMetadata() {
  const doc = await getPreferredStrategies().catch(() => null);
  const { title, description } = pageCopy(doc?.strategies?.length ?? 0);
  return getPageMeta('pms-preferred', { title, description });
}

export default async function PmsPreferredPage() {
  const doc = await getPreferredStrategies().catch(() => null);
  const strategies = doc?.strategies || [];
  const insights = doc?.insights || null;
  const { description } = pageCopy(strategies.length);

  // Real <script type="application/ld+json"> in the body -- the repo-majority
  // pattern (e.g. app/articles/[slug]/page.jsx). The metadata `other:
  // {'script:ld+json': ...}` form only emits an inert <meta> crawlers ignore.
  // `<`-escape guards against a stray "</script>" in scraped strategy names.
  const jsonLdHtml = strategies.length > 0
    ? JSON.stringify(buildJsonLd(doc, description)).replace(/</g, '\\u003c')
    : null;

  const asOn = doc?.asOnMonth || null;
  const fsRange = doc?.factsheetAsOfRange || null;
  const computedOn = doc?.computedAt ? fmtDate(doc.computedAt.slice(0, 10)) : null;
  const provenance = doc?.criteria?.dataSources || null;
  const fallbackRule = doc?.criteria?.fallbackRule || null;

  return (
    <>
      {jsonLdHtml && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />
      )}
      <Navbar />
      <main className="pmspref-main">
        <h1 className="pmspref-title">Abundance Preferred PMS Strategies</h1>
        <p className="pmspref-intro">
          Strategies here are Top Quartile against their APMI peer group over 3 years
          {fallbackRule ? ` (or, for strategies too new for 3 years of peer data, ${fallbackRule.charAt(0).toLowerCase()}${fallbackRule.slice(1)})` : ''}.
          This is a disclosed, factual, automatically-recomputed rule — not a personal recommendation.
        </p>

        {(asOn || computedOn) && (
          <p className="pmspref-asof">
            {asOn && <>APMI data as on <strong>{asOn}</strong>. </>}
            {fsRange && fsRange.earliest === fsRange.latest && <>Factsheet holdings as on <strong>{fmtDate(fsRange.latest)}</strong>. </>}
            {fsRange && fsRange.earliest !== fsRange.latest && <>Factsheet holdings as on <strong>{fmtDate(fsRange.earliest)}–{fmtDate(fsRange.latest)}</strong> (varies by provider). </>}
            {computedOn && <>List recomputed {computedOn}.</>}
          </p>
        )}

        {!doc && (
          <p className="pmspref-empty">This list is being computed — check back soon.</p>
        )}

        {doc && strategies.length === 0 && (
          <p className="pmspref-empty">No strategies currently meet this bar. Check back next month.</p>
        )}

        {insights && strategies.length > 0 && (
          <section className="pmspref-insights">
            <h2 className="pmspref-section-title">This Month&apos;s Insights</h2>
            <div className="pmspref-insights-grid">
              {insights.mostHeldStock && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Most-Held Stock</div>
                  <div className="pmspref-insight-value">{insights.mostHeldStock.name}</div>
                  <div className="pmspref-insight-sub">
                    Held by {insights.mostHeldStock.count} of {strategies.length} preferred strategies
                    <span className="pmspref-insight-src"> · from latest factsheets</span>
                  </div>
                </div>
              )}
              {insights.topSector && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Top Aggregate Sector Conviction</div>
                  <div className="pmspref-insight-value">{insights.topSector.sector}</div>
                  <div className="pmspref-insight-sub">
                    {Math.round(insights.topSector.totalWeightPct / insights.topSector.strategies.length)}% average
                    weight across {insights.topSector.strategies.length} strategies
                    <span className="pmspref-insight-src"> · from latest factsheets</span>
                  </div>
                </div>
              )}
              {insights.bestAlpha && (
                <a
                  className="pmspref-insight-card pmspref-insight-link"
                  href={insights.bestAlpha.iaid ? `/pms/${insights.bestAlpha.iaid}` : undefined}
                >
                  <div className="pmspref-insight-label">Best 1-Year Alpha</div>
                  <div className="pmspref-insight-value">+{insights.bestAlpha.alphaPct}pp</div>
                  <div className="pmspref-insight-sub">
                    {insights.bestAlpha.strategyName} ({insights.bestAlpha.providerName})
                    <span className="pmspref-insight-src"> · APMI, as on {asOn}</span>
                  </div>
                </a>
              )}
              {insights.bestSharpe && (
                <a
                  className="pmspref-insight-card pmspref-insight-link"
                  href={insights.bestSharpe.iaid ? `/pms/${insights.bestSharpe.iaid}` : undefined}
                >
                  <div className="pmspref-insight-label">Best Sharpe Ratio</div>
                  <div className="pmspref-insight-value">{insights.bestSharpe.sharpeRatio}</div>
                  <div className="pmspref-insight-sub">
                    {insights.bestSharpe.strategyName} ({insights.bestSharpe.providerName})
                    <span className="pmspref-insight-src"> · from latest factsheet</span>
                  </div>
                </a>
              )}
            </div>
          </section>
        )}

        {strategies.length > 0 && (
          <section className="pmspref-grid-section">
            <h2 className="pmspref-section-title">{strategies.length} Preferred Strategies</h2>
            <div className="pmspref-grid">
              {strategies.map((s) => {
                const logo = getPMSLogo(s.providerName);
                return (
                  <a key={s.iaid} href={`/pms/${s.iaid}`} className="pmspref-card">
                    <div className="pmspref-card-head">
                      {logo && <img src={logo} alt="" className="pmspref-card-logo" />}
                      <span className="pmspref-card-category">{s.category}</span>
                    </div>
                    <div className="pmspref-card-name">{s.strategyName}</div>
                    <div className="pmspref-card-provider">{s.providerName}</div>
                    <div className="pmspref-card-stats">
                      {s.aumCr != null && <span>AUM ₹{s.aumCr} Cr</span>}
                      {s.qualifyingPeriod && <span className="pmspref-card-badge">{s.qualifyingPeriod} {s.quartile}</span>}
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {strategies.length > 0 && <PmsPreferredTable strategies={strategies} />}

        <div className="pmspref-disclosure">
          {provenance ? `${provenance} ` : 'Data sourced from APMI India (Association of Portfolio Managers in India). '}
          Min PMS investment ₹50L per SEBI. Past performance is not indicative of future results.
          This is not investment advice. Abundance Financial Services — Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered PMS Distributor.
        </div>
      </main>
      <Footer />
    </>
  );
}
