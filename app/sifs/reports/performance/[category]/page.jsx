/**
 * app/sifs/reports/performance/[category]/page.jsx
 *
 * Category-wise SIF performance comparison -- real HTML rendering of this
 * page's data. app/api/og-sif-performance/route.js still serves the same
 * data as a branded PNG for link-preview thumbnails (openGraph/twitter
 * meta below), but the user-facing save/share action is print-to-PDF
 * (PrintButton.jsx) -- zero server compute, always reflects live data,
 * no generated-image fragility. Data layer: lib/sifReports.js.
 *
 * ?month=YYYY-MM shows the report as of that calendar month's last
 * available NAV instead of today -- getSifCategoryPerformanceAsOf()
 * recomputes returns from persisted NAV history (sif_nav_history), not a
 * separately maintained snapshot archive (there isn't one -- see that
 * function's header comment in lib/sifReports.js for why none is needed).
 */

import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  getSifCategoryPerformance,
  getSifCategoryPerformanceAsOf,
  listSifCategories,
  listAvailableReportMonths,
  availableReturnPeriods,
  getSifMonthlyReturnsHeatmap,
} from '@/lib/sifReports';
import PerformanceTable from './PerformanceTable';
import PeriodSelect from './PeriodSelect';
import MonthlyHeatmap from './MonthlyHeatmap';
import PrintButton from '../../PrintButton';
import PrintBranding, { PrintFooterBrand } from '../../PrintBranding';
import '../../sif-reports.css';

export const revalidate = 21600;

const SITE = 'https://mfcalc.getabundance.in';
const MONTH_RE = /^\d{4}-\d{2}$/;

function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function fmtPct(n) {
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

// No generateStaticParams -- on-demand ISR instead, matching every other
// dynamic-segment page in this app except /indices/[slug]. Pre-rendering
// all 5 categories at build time would mean a single transient DB hiccup
// during the build fails the entire deploy, not just one page view.
export async function generateMetadata({ params, searchParams }) {
  const { category } = await params;
  const { month } = await searchParams;
  const validMonth = MONTH_RE.test(month || '') ? month : null;
  const report = await (validMonth
    ? getSifCategoryPerformanceAsOf(category, validMonth)
    : getSifCategoryPerformance(category)
  ).catch(() => null);
  if (!report) {
    return { title: 'SIF Category Not Found | Abundance', robots: { index: false, follow: false } };
  }
  const periodLabel = validMonth ? ` — ${new Date(`${validMonth}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}` : '';
  const title = `${report.label} SIFs — Performance Comparison${periodLabel} | Abundance`;
  const description = `Returns and volatility comparison across ${report.schemes.length} ${report.label} Specialized Investment Funds in India, as of ${report.asOf || 'latest NAV'}. Free report, downloadable and shareable. Abundance Financial Services (ARN-251838).`;
  const pageUrl = `${SITE}/sifs/reports/performance/${report.slug}`;
  const ogImage = `${SITE}/api/og-sif-performance?category=${report.slug}`;
  return {
    title,
    description,
    // A past-month view is a real, citable snapshot but not the canonical
    // URL for this category -- canonical always points at the live
    // "till date" page so search engines consolidate signal there.
    alternates: { canonical: pageUrl },
    robots: validMonth ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: pageUrl, siteName: 'Abundance', locale: 'en_IN', type: 'website', images: [{ url: ogImage, width: 1600, height: 900 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function SifCategoryPerformancePage({ params, searchParams }) {
  const { category } = await params;
  const { month } = await searchParams;
  const validMonth = MONTH_RE.test(month || '') ? month : null;

  const [allCategories, availableMonths] = await Promise.all([
    listSifCategories(),
    listAvailableReportMonths(),
  ]);
  if (!allCategories.some((c) => c.slug === category)) {
    notFound();
  }

  // No try/catch: a genuine DB error should surface as a real error, not
  // get cached as a false "category not found" under ISR -- same
  // reasoning as app/fund/[code]/page.js's fix this session.
  const report = validMonth
    ? await getSifCategoryPerformanceAsOf(category, validMonth)
    : await getSifCategoryPerformance(category);
  if (!report) {
    notFound();
  }

  // Independent of the ?month= selector above -- always the last 7
  // complete months regardless of which "as of" view is showing.
  const heatmap = await getSifMonthlyReturnsHeatmap(category);

  const periods = availableReturnPeriods(report.schemes);
  // Longest-available period is the most meaningful "who's leading" signal
  // -- falls back toward shorter periods for a brand-new category where
  // nothing has a year of history yet.
  const leaderPeriod = periods[periods.length - 1] || null;
  const leaders = leaderPeriod
    ? [...report.schemes]
        .filter((s) => s[leaderPeriod.key] != null)
        .sort((a, b) => b[leaderPeriod.key] - a[leaderPeriod.key])
        .slice(0, 3)
    : [];

  const pageUrl = `${SITE}/sifs/reports/performance/${report.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${report.label} SIFs — Performance Comparison`,
    description: `Returns and volatility across ${report.schemes.length} ${report.label} Specialized Investment Funds in India.`,
    url: pageUrl,
    license: 'https://www.amfiindia.com',
    creator: { '@type': 'FinancialService', name: 'Abundance Financial Services', identifier: 'ARN-251838' },
    variableMeasured: [...periods.map((p) => `${p.label} Return`), 'Volatility'],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Navbar />
      <main className="sifr-wrap">
        <PrintBranding asOf={report.asOf} />
        <div className="sifr-eyebrow"><a href="/sifs/reports">SIF Reports</a> &middot; Performance Comparison</div>
        <h1 className="sifr-title">{report.label} SIFs</h1>
        <p className="sifr-sub">
          {report.schemes.length} tracked strategies in this category &middot; as of {report.asOf || 'latest NAV'}
          {validMonth && <> &middot; viewing a past calendar-month snapshot</>}
        </p>

        <div className="sifr-cat-tabs">
          {allCategories.map((c) => (
            <a key={c.slug} href={`/sifs/reports/performance/${c.slug}`} className={`sifr-cat-tab${c.slug === report.slug ? ' active' : ''}`}>
              {c.label}
            </a>
          ))}
        </div>

        {availableMonths.length > 0 && (
          <div className="sifr-period-row">
            <span className="sifr-period-label">Report period</span>
            <PeriodSelect slug={report.slug} current={validMonth} months={availableMonths} />
          </div>
        )}

        {leaders.length > 0 && (
          <div className="sifr-leaders">
            {leaders.map((s, i) => (
              <div key={s.schemeId} className={`sifr-leader-card${i === 0 ? ' top' : ''}`}>
                <div className="sifr-leader-rank">{i === 0 ? '🏆' : `#${i + 1}`}</div>
                <div className="sifr-leader-body">
                  <div className="sifr-leader-name">{s.name}</div>
                  <div className="sifr-leader-metric">{fmtPct(s[leaderPeriod.key])} <span>{leaderPeriod.label}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sifr-download-row">
          <PrintButton />
          <span className="sifr-asof">Table updates every 6 hours from AMFI NAV history</span>
        </div>

        {report.schemes.length === 0 ? (
          <p>No live SIFs are currently tracked in this category.</p>
        ) : (
          <PerformanceTable schemes={report.schemes} periods={periods} />
        )}

        {heatmap && <MonthlyHeatmap months={heatmap.months} schemes={heatmap.schemes} />}

        <PrintFooterBrand />
        <p className="sifr-disclaimer">
          Source: AMFI NAV history. Periods up to 1Y are absolute trailing returns; 3Y and longer are
          annualized (CAGR). A period only appears once real data exists for it &mdash; it will show
          automatically as these funds age. Past performance may or may not be sustained in the future.
          Investments in Specialized Investment Funds involve relatively higher risk including potential
          loss of capital, liquidity risk and market volatility. This report is for informational purposes
          only and does not constitute investment advice. Abundance Financial Services (ARN-251838, AMFI
          Registered Mutual Fund Distributor) &middot; Atin Kumar Agrawal (APRN04279, APMI Registered PMS
          Distributor).
        </p>
      </main>
      <Footer />
    </>
  );
}
