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
    a: 'No. It is a factual, criteria-driven showcase published by Atin Kumar Agrawal (APRN04279), an APMI Registered Portfolio Management Services Distributor, under Abundance Financial Services. It does not account for your goals, risk tolerance or tax position, and past performance does not predict future results. Speak to a registered adviser before investing in any PMS.',
  },
];

// Shared so generateMetadata() and the JSON-LD in the body stay in sync.
function pageCopy(count, providerCount) {
  const acrossProviders = providerCount > 1 ? ` across ${providerCount} providers` : '';
  return {
    title: `${count} Abundance Preferred PMS Strategies — Top Quartile Portfolios | Abundance`,
    description: count > 0
      ? `${count} PMS strategies${acrossProviders} currently Top Quartile vs APMI peers, with extracted holdings, sector allocation and portfolio ratios, plus cross-strategy insights. A disclosed, factual selection rule — not investment advice. By Atin Kumar Agrawal, APMI Registered PMS Distributor (APRN04279), Abundance Financial Services.`
      : `PMS strategies that are Top Quartile vs APMI peers, with extracted holdings, sector allocation and portfolio ratios. By Atin Kumar Agrawal, APMI Registered PMS Distributor (APRN04279), Abundance Financial Services.`,
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

// Display-only rounding for ratios (Sharpe, Beta, P/E, alpha) -- some
// factsheets' own figures carry 3-4 decimal places (e.g. a raw "1.1419"),
// which reads as noise next to every other card's clean 2-decimal values.
// Never mutates the stored data, only what's shown.
function fmtRatio(n) {
  if (n == null || !Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

// Turns a factsheet's real sectorAllocation into a fixed "top 5 + Other"
// series that always sums to ~100% -- so a sector-DNA bar's width is
// always the whole portfolio, honestly, even when the factsheet itself
// only discloses partial sector coverage. `swatch` is a 0-4 palette index
// (darkest = biggest sector, a deliberate readability cue) or 'other'.
// Returns null when there's nothing real to show (never a fabricated bar).
function buildSectorDna(sectorAllocation) {
  if (!Array.isArray(sectorAllocation) || sectorAllocation.length === 0) return null;
  const sorted = [...sectorAllocation]
    .filter((s) => s?.sector && Number.isFinite(s.weightPct) && s.weightPct > 0)
    .sort((a, b) => b.weightPct - a.weightPct);
  if (sorted.length === 0) return null;
  const top = sorted.slice(0, 5);
  const segments = top.map((s, i) => ({ sector: s.sector, weightPct: s.weightPct, swatch: i }));
  const shown = top.reduce((sum, s) => sum + s.weightPct, 0);
  const other = Math.round((100 - shown) * 10) / 10;
  if (other > 0.5) segments.push({ sector: 'Other', weightPct: other, swatch: 'other' });
  return segments;
}

function SectorDnaBar({ segments, size = 'sm' }) {
  if (!segments) return null;
  return (
    <div className={`pmspref-dna-bar pmspref-dna-bar--${size}`}>
      {segments.map((seg, i) => (
        <span
          // Index, not seg.sector: several real factsheets (ICICI Prudential's)
          // already disclose a sector literally named "Other", which would
          // otherwise collide with this array's own synthetic "Other" remainder.
          key={i}
          className={`pmspref-dna-seg pmspref-dna-seg--${seg.swatch}`}
          style={{ width: `${seg.weightPct}%` }}
          title={`${seg.sector} ${seg.weightPct}%`}
        />
      ))}
    </div>
  );
}

// Resolves the single strategy to feature as this month's spotlight:
// highest Sharpe ratio among all preferred strategies (falling back to
// best 1-year alpha when no strategy has a disclosed Sharpe yet). Both
// `insights.bestSharpe`/`bestAlpha` are only ever set from a real,
// present number (see findBestSharpe/findBestAlpha in
// compute_preferred_pms.js), so this never spotlights a fabricated pick.
function resolveSpotlight(strategies, insights) {
  const bySharpe = insights?.bestSharpe;
  const byAlpha = insights?.bestAlpha;
  const pick = bySharpe || byAlpha;
  if (!pick?.iaid) return null;
  const strategy = strategies.find((s) => s.iaid === pick.iaid);
  if (!strategy) return null;
  return { strategy, metric: bySharpe ? 'sharpe' : 'alpha' };
}

function SpotlightCard({ strategy, metric, totalCount }) {
  const e = strategy.extracted || {};
  const pa = e.portfolioAttributes || {};
  const sharpe = fmtRatio(pa.sharpeRatio?.strategy);
  const sharpeBench = fmtRatio(pa.sharpeRatio?.benchmark);
  const stdDev = fmtRatio(pa.standardDeviation?.strategy);
  const pe = fmtRatio(pa.portfolioPe?.strategy);
  const peBench = fmtRatio(pa.portfolioPe?.benchmark);
  const beta = fmtRatio(pa.beta?.strategy);
  const alphaPct = fmtRatio(pa.alpha?.strategy);
  const holdings = (e.topHoldings || []).filter((h) => h?.name).slice(0, 5);
  const dna = buildSectorDna(e.sectorAllocation);
  const logo = getPMSLogo(strategy.providerName);
  const tagLabel = metric === 'sharpe'
    ? `Best Sharpe Ratio of all ${totalCount} Preferred Strategies`
    : `Best 1-Year Alpha of all ${totalCount} Preferred Strategies`;

  return (
    <section className="pmspref-spotlight" aria-label="This month's spotlight strategy">
      <span className="pmspref-spotlight-tag">★ This Month&apos;s Spotlight · {tagLabel}</span>
      <div className="pmspref-spotlight-body">
        <div className="pmspref-spotlight-main">
          <div className="pmspref-spotlight-head">
            {logo
              ? <img src={logo} alt="" className="pmspref-spotlight-logo" />
              : <span className="pmspref-spotlight-logo pmspref-spotlight-logo-fallback">{strategy.providerName.charAt(0)}</span>}
            <span className="pmspref-spotlight-provider">{strategy.providerName}</span>
          </div>
          <a href={`/pms/${strategy.iaid}`} className="pmspref-spotlight-name">{strategy.strategyName}</a>
          {e.objective && <blockquote className="pmspref-spotlight-quote">&ldquo;{e.objective}&rdquo;</blockquote>}
          {holdings.length > 0 && (
            <>
              <div className="pmspref-spotlight-holdings-lbl">Disclosed Top Holdings</div>
              <div className="pmspref-spotlight-holdings">
                {holdings.map((h) => <span key={h.name} className="pmspref-holding-chip">{h.name}</span>)}
              </div>
            </>
          )}
        </div>
        <div className="pmspref-spotlight-stats">
          {metric === 'sharpe' && sharpe != null ? (
            <div className="pmspref-spotlight-hero-stat">
              <span className="pmspref-stat-lbl">Sharpe Ratio</span>
              <div className="pmspref-spotlight-hero-num">{sharpe}</div>
              <div className="pmspref-spotlight-hero-vs">
                {sharpeBench != null && <>vs benchmark <b>{sharpeBench}</b></>}
                {stdDev != null && <> · Std. Deviation <b>{stdDev}%</b></>}
              </div>
            </div>
          ) : alphaPct != null ? (
            <div className="pmspref-spotlight-hero-stat">
              <span className="pmspref-stat-lbl">1-Year Alpha</span>
              <div className="pmspref-spotlight-hero-num">+{alphaPct}pp</div>
            </div>
          ) : null}
          <div className="pmspref-mini-stats">
            <div><span className="pmspref-mini-lbl">AUM</span><div className="pmspref-mini-val">{strategy.aumCr != null ? fmtCr(strategy.aumCr) : '—'}</div></div>
            <div><span className="pmspref-mini-lbl">Top Quartile</span><div className="pmspref-mini-val">{strategy.qualifyingPeriod || '—'}</div></div>
            {pe != null && (
              <div>
                <span className="pmspref-mini-lbl">Portfolio P/E</span>
                <div className="pmspref-mini-val">{pe}{peBench != null && <span className="pmspref-mini-val-muted"> / {peBench}</span>}</div>
              </div>
            )}
            {beta != null && (
              <div><span className="pmspref-mini-lbl">Beta</span><div className="pmspref-mini-val">{beta}</div></div>
            )}
          </div>
          {dna && (
            <div className="pmspref-dna-block">
              <div className="pmspref-dna-lbl">Sector DNA</div>
              <SectorDnaBar segments={dna} size="lg" />
              <div className="pmspref-dna-legend">
                {dna.slice(0, 4).map((seg, i) => (
                  <span key={i} className="pmspref-dna-legend-item">
                    <span className={`pmspref-dna-swatch pmspref-dna-swatch--${seg.swatch}`} />
                    {seg.sector} {seg.weightPct}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
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
  const spotlight = insights ? resolveSpotlight(strategies, insights) : null;

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
                  Cite as: <code>Abundance Preferred PMS Strategies, Atin Kumar Agrawal (APRN04279), APMI Registered PMS Distributor, {SITE}/pms-preferred. Quartile data from APMI India.</code>
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
                  {/* Best Sharpe already gets the full Spotlight feature below when
                      it's the metric behind that pick -- shown here only when the
                      Spotlight is instead running on Best Alpha (no strategy has a
                      disclosed Sharpe yet), so the two sections never repeat the
                      same strategy. */}
                  {insights.bestSharpe && spotlight?.metric !== 'sharpe' && (
                    <InsightTile
                      iaid={insights.bestSharpe.iaid}
                      label="Best Sharpe Ratio"
                      value={fmtRatio(insights.bestSharpe.sharpeRatio)}
                      sub={`${insights.bestSharpe.strategyName} (${insights.bestSharpe.providerName})`}
                      src="from latest factsheet"
                    />
                  )}
                </div>
              </section>
            )}

            {spotlight && (
              <SpotlightCard strategy={spotlight.strategy} metric={spotlight.metric} totalCount={strategies.length} />
            )}

            <section className="pmspref-grid-section" aria-label="Preferred strategies">
              <h2 className="pmspref-h2">{strategies.length} Preferred Strategies</h2>
              <p className="pmspref-h2-sub">Every card&apos;s Sharpe ratio and sector bar come straight from that strategy&apos;s latest factsheet — no two look alike because no two portfolios are alike.</p>
              <div className="pmspref-grid">
                {strategies.map((s) => {
                  const logo = getPMSLogo(s.providerName);
                  const e = s.extracted || {};
                  const sharpe = fmtRatio(e.portfolioAttributes?.sharpeRatio?.strategy);
                  const holdings = (e.topHoldings || []).filter((h) => h?.name);
                  const dna = buildSectorDna(e.sectorAllocation);
                  return (
                    <a key={s.iaid} href={`/pms/${s.iaid}`} className="pmspref-card">
                      {s.quartile && <span className="pmspref-card-ribbon">{s.quartile}</span>}
                      <div className="pmspref-card-head">
                        {logo
                          ? <img src={logo} alt="" className="pmspref-card-logo" />
                          : <span className="pmspref-card-logo pmspref-card-logo-fallback">{s.providerName.charAt(0)}</span>}
                        <span className="pmspref-card-provider">{s.providerName}</span>
                      </div>
                      <div className="pmspref-card-name">{s.strategyName}</div>
                      {e.objective
                        ? <div className="pmspref-card-obj">&ldquo;{e.objective}&rdquo;</div>
                        : <div className="pmspref-card-obj-spacer" aria-hidden="true" />}
                      <div className="pmspref-card-stats">
                        {sharpe != null && (
                          <div>
                            <span className="pmspref-card-stat-lbl">Sharpe</span>
                            <span className="pmspref-card-stat-val pmspref-card-stat-val--hero">{sharpe}</span>
                          </div>
                        )}
                        <div>
                          <span className="pmspref-card-stat-lbl">AUM</span>
                          <span className="pmspref-card-stat-val">{s.aumCr != null ? fmtCr(s.aumCr) : '—'}</span>
                        </div>
                      </div>
                      {holdings.length > 0 ? (
                        <div className="pmspref-card-holdings">
                          {holdings.slice(0, 2).map((h) => (
                            <span key={h.name} className="pmspref-holding-chip pmspref-holding-chip--sm">{h.name}</span>
                          ))}
                          {holdings.length > 2 && (
                            <span className="pmspref-holding-chip pmspref-holding-chip--sm">+{holdings.length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <div className="pmspref-card-holdings-none">Holdings not disclosed this month</div>
                      )}
                      {dna ? (
                        <div className="pmspref-card-dna-wrap">
                          <div className="pmspref-card-dna-top">
                            <span className="pmspref-card-dna-lbl">Top Sector</span>
                            <span className="pmspref-card-dna-sector">{dna[0].sector} {dna[0].weightPct}%</span>
                          </div>
                          <SectorDnaBar segments={dna} size="sm" />
                        </div>
                      ) : (
                        <div className="pmspref-card-dna-wrap pmspref-card-dna-wrap--empty" aria-hidden="true" />
                      )}
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
          This is not investment advice. Atin Kumar Agrawal · APRN04279 · APMI Registered Portfolio Management Services Distributor · Abundance Financial Services.
        </div>
      </main>
      <Footer />
    </>
  );
}
