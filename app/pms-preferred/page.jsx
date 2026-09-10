/**
 * app/pms-preferred/page.jsx
 *
 * Server component: renders the free showcase (grounding brief, cross-strategy
 * insights, strategy grid, sortable table, FAQ) as real, crawlable HTML.
 * Visual identity mirrors /pms-screener's editorial treatment (warm paper
 * surface, serif display, mono numerals) via the page-scoped --pms-* tokens
 * redefined in pms-preferred.css.
 *
 * Data provenance: AUM, 1-year return / alpha and quartile ranking are live
 * APMI data as on `doc.asOnMonth`. Holdings, sector & market-cap allocation
 * and portfolio ratios (Sharpe) come from each strategy's most recently
 * published factsheet -- `doc.factsheetAsOfRange` shows the span, which can
 * lag the APMI month. Where a metric is in both sources the APMI value is used.
 *
 * SEO/GEO: a full @graph (CollectionPage + Dataset + BreadcrumbList +
 * ItemList + FAQPage) is emitted as a real <script type="application/ld+json">;
 * the machine-readable distribution is GET /api/pms-preferred (JSON, or
 * ?format=md for a Markdown table).
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
const ORG = { '@type': 'Organization', name: 'Abundance Financial Services', url: SITE };

const FAQS = [
  {
    q: 'What does "Abundance Preferred" mean for a PMS strategy?',
    a: 'It is an editorial selection made by one disclosed, automatically-recomputed rule — not personalised investment advice. A strategy appears here only if it is Top Quartile against its APMI peer group over 3 years (or, when it is too new for 3 years of peer data, Top Quartile in at least half the periods that do have real peer data). The list is regenerated every month from official APMI data and provider factsheets, with no manual picking.',
  },
  {
    q: 'What does "Top Quartile" mean for a PMS strategy?',
    a: "Top Quartile means the strategy's trailing return for a given period ranks in the best 25% of all APMI-registered peer strategies for that same period. APMI (the Association of Portfolio Managers in India) publishes these peer rankings monthly; a strategy that is Top Quartile over 3 years has out-returned three-quarters of comparable Indian PMS strategies over that window.",
  },
  {
    q: 'How is a strategy chosen for this list?',
    a: 'The rule is applied in this order: (1) if the strategy has real 3-year peer data, it must be Top Quartile over 3 years; (2) if it is too young for 3-year data, it must be Top Quartile in a majority of the trailing periods for which real peer data exists. Strategies that fail, or that have no real peer data yet, are excluded — never guessed in. Eligibility is computed automatically after each monthly factsheet sync.',
  },
  {
    q: 'What is the minimum investment for a PMS in India?',
    a: 'SEBI mandates a minimum investment of ₹50,00,000 (₹50 lakh) for any Portfolio Management Service in India. This applies to every strategy on this page. Specialised Investment Funds (SIFs) sit lower at ₹10 lakh, and mutual funds lower still — see the SIF Screener and MF Screener for those.',
  },
  {
    q: 'How often is this list updated?',
    a: 'It is recomputed once a month, immediately after the automated factsheet sync that refreshes each provider\'s extracted holdings. AUM, returns and quartile ranking are pulled live from APMI for that run. The "list recomputed" date near the top of the page shows when the current version was generated.',
  },
  {
    q: 'Is this page investment advice?',
    a: 'No. It is a factual, criteria-driven showcase published by Abundance Financial Services (ARN-251838, APRN04279), an APMI-registered PMS distributor. It does not account for your goals, risk tolerance or tax position, and past performance does not predict future results. Speak to a registered adviser before investing in any PMS.',
  },
];

// Shared so generateMetadata() and the JSON-LD in the body stay in sync.
function pageCopy(count, providerCount) {
  const acrossProviders = providerCount > 1 ? ` across ${providerCount} providers` : '';
  return {
    title: `${count} Abundance Preferred PMS Strategies — Top Quartile Portfolios | Abundance`,
    description: count > 0
      ? `${count} PMS strategies${acrossProviders} currently Top Quartile vs APMI peers, with extracted holdings, sector allocation and portfolio ratios, plus cross-strategy insights. A disclosed, factual selection rule — not investment advice. By Abundance Financial Services (ARN-251838, APRN04279).`
      : `PMS strategies that are Top Quartile vs APMI peers, with extracted holdings, sector allocation and portfolio ratios. By Abundance Financial Services (ARN-251838, APRN04279).`,
  };
}

function buildJsonLd(doc, description) {
  const strategies = doc.strategies || [];
  const year = String(new Date().getFullYear());
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${PAGE_URL}#webpage`,
        name: 'Abundance Preferred PMS Strategies',
        description,
        url: PAGE_URL,
        isAccessibleForFree: true,
        publisher: ORG,
        about: [
          { '@type': 'Thing', name: 'Portfolio management service', sameAs: 'https://en.wikipedia.org/wiki/Portfolio_manager' },
          { '@type': 'GovernmentOrganization', name: 'Securities and Exchange Board of India', sameAs: 'https://www.sebi.gov.in' },
          { '@type': 'Organization', name: 'Association of Portfolio Managers in India', sameAs: 'https://www.apmiindia.org' },
        ],
        mentions: [
          { '@type': 'Organization', name: 'Association of Portfolio Managers in India', sameAs: 'https://www.apmiindia.org' },
          { '@type': 'GovernmentOrganization', name: 'Securities and Exchange Board of India', sameAs: 'https://www.sebi.gov.in' },
        ],
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.pmspref-brief', '.pmspref-header'],
        },
      },
      {
        '@type': 'Dataset',
        '@id': `${PAGE_URL}#dataset`,
        name: 'Abundance Preferred PMS Strategies Dataset',
        description:
          'Indian Portfolio Management Service (PMS) strategies that are currently Top Quartile against their APMI peer group, with AUM, quartile ranking, extracted holdings, sector allocation and portfolio ratios, plus cross-strategy aggregates. Recomputed monthly from official APMI data and provider factsheets.',
        url: PAGE_URL,
        identifier: PAGE_URL,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
        creator: ORG,
        publisher: ORG,
        sourceOrganization: {
          '@type': 'Organization',
          name: 'Association of Portfolio Managers in India (APMI)',
          url: 'https://www.apmiindia.org',
        },
        spatialCoverage: 'India',
        temporalCoverage: year,
        dateModified: doc.computedAt || undefined,
        keywords: [
          'best PMS India',
          'top quartile PMS',
          'PMS strategies comparison',
          'APMI top rated PMS',
          'portfolio management services India',
          'PMS holdings sector allocation',
        ],
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'quartile', description: 'APMI peer-group quartile for the qualifying trailing period' },
          { '@type': 'PropertyValue', name: 'aumCr', description: 'Assets under management, ₹ crore, live APMI figure' },
          { '@type': 'PropertyValue', name: 'qualifyingPeriod', description: 'Trailing period on which Top-Quartile eligibility was judged' },
          { '@type': 'PropertyValue', name: 'topHoldings', description: 'Largest disclosed portfolio holdings, from the latest factsheet' },
          { '@type': 'PropertyValue', name: 'sectorAllocation', description: 'Sector weights, from the latest factsheet' },
        ],
        distribution: [
          { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/api/pms-preferred` },
          { '@type': 'DataDownload', encodingFormat: 'text/markdown', contentUrl: `${SITE}/api/pms-preferred?format=md` },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${PAGE_URL}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'PMS Screener', item: `${SITE}/pms-screener` },
          { '@type': 'ListItem', position: 3, name: 'Abundance Preferred PMS', item: PAGE_URL },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${PAGE_URL}#itemlist`,
        name: 'Abundance Preferred PMS Strategies',
        description,
        url: PAGE_URL,
        numberOfItems: strategies.length,
        itemListElement: strategies.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${s.strategyName} by ${s.providerName}`,
          url: `${SITE}/pms/${s.iaid}`,
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': `${PAGE_URL}#faq`,
        mainEntity: FAQS.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
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

function fmtCr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(v))} Cr`;
}

// A single-strategy insight tile. Renders as a link to /pms/<iaid> when the
// iaid is known, otherwise as a plain card (no hrefless anchor).
function InsightTile({ iaid, label, value, sub, src }) {
  const inner = (
    <>
      <div className="pmspref-insight-label">{label}</div>
      <div className="pmspref-insight-value">{value}</div>
      <div className="pmspref-insight-sub">
        {sub}
        {src && <span className="pmspref-insight-src"> · {src}</span>}
      </div>
      {iaid && <span className="pmspref-insight-arrow" aria-hidden="true">→</span>}
    </>
  );
  return iaid
    ? <a className="pmspref-insight-card pmspref-insight-link" href={`/pms/${iaid}`}>{inner}</a>
    : <div className="pmspref-insight-card">{inner}</div>;
}

export async function generateMetadata() {
  const doc = await getPreferredStrategies().catch(() => null);
  const strategies = doc?.strategies || [];
  const providerCount = new Set(strategies.map((s) => s.providerKey)).size;
  const { title, description } = pageCopy(strategies.length, providerCount);
  return getPageMeta('pms-preferred', { title, description });
}

export default async function PmsPreferredPage() {
  const doc = await getPreferredStrategies().catch(() => null);
  const strategies = doc?.strategies || [];
  const insights = doc?.insights || null;

  const providerCount = new Set(strategies.map((s) => s.providerKey)).size;
  const combinedAum = fmtCr(strategies.reduce((sum, s) => sum + (Number(s.aumCr) || 0), 0));
  const { description } = pageCopy(strategies.length, providerCount);

  // Real <script type="application/ld+json"> in the body -- the repo-majority
  // pattern (e.g. app/articles/[slug]/page.jsx). `<`-escape guards against a
  // stray "</script>" in a scraped strategy name.
  const jsonLdHtml = strategies.length > 0
    ? JSON.stringify(buildJsonLd(doc, description)).replace(/</g, '\\u003c')
    : null;

  const asOn = doc?.asOnMonth || null;
  const fsRange = doc?.factsheetAsOfRange || null;
  const computedOn = doc?.computedAt ? fmtDate(doc.computedAt.slice(0, 10)) : null;
  const provenance = doc?.criteria?.dataSources || null;

  return (
    <>
      {jsonLdHtml && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />
      )}
      <Navbar />
      <main className="pmspref-main">
        <nav aria-label="Breadcrumb" className="pmspref-crumbs">
          <a href="/">Home</a>
          <span aria-hidden="true">/</span>
          <a href="/pms-screener">PMS Screener</a>
          <span aria-hidden="true">/</span>
          <span>Abundance Preferred</span>
        </nav>

        <header className="pmspref-header">
          <div className="pmspref-eyebrow">
            <span className="pmspref-dot" aria-hidden="true" />
            APMI DATA{asOn ? ` · AS ON ${asOn.toUpperCase()}` : ''}
            {strategies.length > 0 ? ` · ${strategies.length} STRATEGIES` : ''}
          </div>
          <h1 className="pmspref-title">Abundance <span>Preferred PMS</span></h1>
          <p className="pmspref-intro">
            Strategies here are Top Quartile against their APMI peer group over 3 years — or,
            for strategies too new for 3 years of peer data, Top Quartile in at least half the
            periods that do have real peer data. A disclosed, factual, automatically-recomputed
            rule — not a personal recommendation.
          </p>
        </header>

        {!doc && (
          <p className="pmspref-empty">This list is being computed — check back soon.</p>
        )}

        {doc && strategies.length === 0 && (
          <p className="pmspref-empty">No strategies currently meet this bar. Check back next month.</p>
        )}

        {strategies.length > 0 && (
          <>
            <div className="pmspref-statbar">
              <div className="pmspref-stat">
                <span className="pmspref-stat-lbl">Preferred Strategies</span>
                <span className="pmspref-stat-val">{strategies.length}</span>
              </div>
              <div className="pmspref-stat">
                <span className="pmspref-stat-lbl">Providers</span>
                <span className="pmspref-stat-val">{providerCount}</span>
              </div>
              {combinedAum && (
                <div className="pmspref-stat">
                  <span className="pmspref-stat-lbl">Combined AUM</span>
                  <span className="pmspref-stat-val">{combinedAum}</span>
                </div>
              )}
              {asOn && (
                <div className="pmspref-stat">
                  <span className="pmspref-stat-lbl">APMI Data As On</span>
                  <span className="pmspref-stat-val">{asOn}</span>
                </div>
              )}
            </div>

            {(asOn || computedOn || fsRange) && (
              <p className="pmspref-asof">
                {asOn && <>AUM, returns &amp; quartile ranking are live APMI data as on <strong>{asOn}</strong>. </>}
                {fsRange && fsRange.earliest === fsRange.latest && <>Factsheet holdings as on <strong>{fmtDate(fsRange.latest)}</strong>. </>}
                {fsRange && fsRange.earliest !== fsRange.latest && <>Factsheet holdings as on <strong>{fmtDate(fsRange.earliest)}–{fmtDate(fsRange.latest)}</strong> (varies by provider). </>}
                {computedOn && <>List recomputed {computedOn}.</>}
              </p>
            )}

            {/* ── Grounding brief for readers and AI assistants ── */}
            <section className="pmspref-brief" aria-label="Executive summary and grounding">
              <div className="pmspref-brief-head">
                <span>Executive summary &amp; grounding</span>
                <span className="pmspref-brief-tag">APMI-sourced · recomputed monthly</span>
              </div>
              <p>
                <strong>{strategies.length} Indian PMS strategies</strong> across{' '}
                <strong>{providerCount} providers</strong>
                {combinedAum && <> (<strong>{combinedAum}</strong> combined AUM)</>} are currently
                Top Quartile against their APMI peer group. This is a factual selection by one
                disclosed rule, not a recommendation.
              </p>
              <ul className="pmspref-brief-list">
                <li><strong>Top Quartile</strong> means the strategy&apos;s trailing return ranks in the best 25% of all APMI-registered peer strategies for that period.</li>
                <li><strong>Selection rule:</strong> Top Quartile over 3 years, or — for strategies too new for 3-year peer data — Top Quartile in a majority of the periods that do have real peer data.</li>
                <li><strong>Minimum investment:</strong> PMS in India carry a SEBI-mandated floor of ₹50,00,000 (₹50 lakh).</li>
                <li><strong>Data provenance:</strong> AUM, returns and quartile ranking are live APMI figures{asOn ? <> as on {asOn}</> : null}; holdings, sector allocation and portfolio ratios are from each strategy&apos;s latest published factsheet and can lag that month.</li>
                <li><strong>Not advice:</strong> past performance does not predict future results; consult a registered adviser for suitability.</li>
              </ul>
              <div className="pmspref-brief-foot">
                <span className="pmspref-cite">
                  Cite as: <code>Abundance Preferred PMS Strategies, Abundance Financial Services (ARN-251838), {SITE}/pms-preferred. Quartile data from APMI India.</code>
                </span>
                <span className="pmspref-brief-actions">
                  <a href="/api/pms-preferred" target="_blank" rel="noopener noreferrer" className="pmspref-chip">{'{ }'} JSON</a>
                  <a href="/api/pms-preferred?format=md" target="_blank" rel="noopener noreferrer" className="pmspref-chip">Markdown for AI</a>
                  <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="pmspref-chip">/llms.txt</a>
                </span>
              </div>
            </section>

            {insights && (
              <section className="pmspref-insights" aria-label="Cross-strategy insights">
                <h2 className="pmspref-h2">This Month&apos;s Insights</h2>
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
                    <InsightTile
                      iaid={insights.bestAlpha.iaid}
                      label="Best 1-Year Alpha"
                      value={`+${insights.bestAlpha.alphaPct}pp`}
                      sub={`${insights.bestAlpha.strategyName} (${insights.bestAlpha.providerName})`}
                      src={asOn ? `APMI, as on ${asOn}` : 'APMI'}
                    />
                  )}
                  {insights.bestSharpe && (
                    <InsightTile
                      iaid={insights.bestSharpe.iaid}
                      label="Best Sharpe Ratio"
                      value={insights.bestSharpe.sharpeRatio}
                      sub={`${insights.bestSharpe.strategyName} (${insights.bestSharpe.providerName})`}
                      src="from latest factsheet"
                    />
                  )}
                </div>
              </section>
            )}

            <section className="pmspref-grid-section" aria-label="Preferred strategies">
              <h2 className="pmspref-h2">{strategies.length} Preferred Strategies</h2>
              <div className="pmspref-grid">
                {strategies.map((s) => {
                  const logo = getPMSLogo(s.providerName);
                  return (
                    <a key={s.iaid} href={`/pms/${s.iaid}`} className="pmspref-card">
                      <div className="pmspref-card-head">
                        {logo
                          ? <img src={logo} alt="" className="pmspref-card-logo" />
                          : <span className="pmspref-card-logo pmspref-card-logo-fallback">{s.providerName.charAt(0)}</span>}
                        <span className="pmspref-card-category">{s.category}</span>
                      </div>
                      <div className="pmspref-card-name">{s.strategyName}</div>
                      <div className="pmspref-card-provider">{s.providerName}</div>
                      <div className="pmspref-card-foot">
                        <span className="pmspref-card-aum">
                          <span className="pmspref-card-aum-lbl">AUM</span>
                          {s.aumCr != null ? ` ₹${new Intl.NumberFormat('en-IN').format(s.aumCr)} Cr` : ' —'}
                        </span>
                        {s.qualifyingPeriod && (
                          <span className="pmspref-card-badge">{s.qualifyingPeriod} · {s.quartile}</span>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>

            <PmsPreferredTable strategies={strategies} />

            <section className="pmspref-faq" aria-label="Frequently asked questions">
              <h2 className="pmspref-h2">Frequently Asked Questions</h2>
              {FAQS.map((f, i) => (
                <details key={i} className="pmspref-faq-item">
                  <summary>{f.q}</summary>
                  <div className="pmspref-faq-body">{f.a}</div>
                </details>
              ))}
            </section>

            <section className="pmspref-explore" aria-label="Related tools">
              <h2 className="pmspref-h2">Explore More</h2>
              <div className="pmspref-explore-grid">
                <a href="/pms-screener" className="pmspref-explore-card">
                  <span>PMS Screener</span>
                  <small>Every APMI-tracked PMS strategy, filterable by returns, AUM and alpha</small>
                </a>
                <a href="/sifs" className="pmspref-explore-card">
                  <span>SIF Screener</span>
                  <small>SEBI Specialised Investment Funds — the ₹10 lakh asset class</small>
                </a>
                <a href="/screener" className="pmspref-explore-card">
                  <span>Mutual Fund Screener</span>
                  <small>2,500+ funds by CAGR, risk, drawdown and holdings overlap</small>
                </a>
                <a href="/book-consultation" className="pmspref-explore-card">
                  <span>Talk to an Adviser</span>
                  <small>Discuss PMS suitability with an APMI-registered distributor</small>
                </a>
              </div>
            </section>
          </>
        )}

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
