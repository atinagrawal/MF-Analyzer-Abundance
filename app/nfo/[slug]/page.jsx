import { notFound } from 'next/navigation';
import { getNfoBySlug } from '@/lib/nfoData';
import { getProviderLogo } from '@/lib/providerLogos';
import pool from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const revalidate = 3600;

// Next.js only applies on-demand ISR caching to a dynamic segment when
// generateStaticParams exists (an empty array is enough -- see Fix 2, final
// review) -- without it, `revalidate` above is silently ignored and the
// route renders fully dynamically on every request regardless, defeating
// the whole point of swapping out force-dynamic. No slugs are known at
// build time (they come from a daily-synced R2 document, not a DB this
// build step can query), so every slug is generated + cached on first visit.
export async function generateStaticParams() {
  return [];
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Strips plan/option noise so a scheme name matches however mf_screener/
// sif_screener happen to store it -- same idea as lib/holdingsLookup.js's
// cleanSearchTerm(), kept local here since this task's match is a single,
// narrowly-scoped lookup rather than a shared concern.
function cleanSearchTerm(name) {
  return (name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(Direct|Regular|Growth|Plan|Fund)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Best-effort, read-only cross-link to an existing live fund page -- the
// ONE place this feature touches Postgres, deliberately scoped: a single
// sequential-scan name-match SELECT (a leading-wildcard ILIKE pattern can't
// use a btree index) -- acceptable here because this is a low-traffic
// detail page with LIMIT 1, a bounded connection pool, and a 5s connection
// timeout, not the personalized/high-concurrency pattern that caused past
// incidents.
// Never fabricates a link -- returns null on any miss or error.
async function findLiveFundLink(schemeName, type) {
  const term = cleanSearchTerm(schemeName);
  if (term.length < 3) return null;
  try {
    if (type === 'sif') {
      const { rows } = await pool.query(
        `SELECT scheme_id FROM sif_screener WHERE nav_name ILIKE $1 ORDER BY length(nav_name) ASC LIMIT 1`,
        [`%${term}%`]
      );
      return rows.length ? `/sif/${rows[0].scheme_id}` : null;
    }
    const { rows } = await pool.query(
      `SELECT code FROM mf_screener WHERE name ILIKE $1 ORDER BY length(name) ASC LIMIT 1`,
      [`%${term}%`]
    );
    return rows.length ? `/fund/${rows[0].code}` : null;
  } catch (e) {
    console.warn('[nfo/[slug]] live-fund lookup failed:', e.message);
    return null;
  }
}

// Same shape as buildJsonLd() below produces -- kept here purely to build the
// meta `description` text (also reused, unchanged, in the page body).
function buildDescription(entry) {
  return (
    `${entry.schemeName} is a ${entry.status === 'open' ? 'currently open' : 'recently closed'} ` +
    `New Fund Offer from ${entry.amcName || 'the AMC'}${entry.category ? ` (${entry.category})` : ''}. ` +
    `${entry.openDate ? `Opened ${formatDate(entry.openDate)}. ` : ''}` +
    `${entry.closeDate ? `Closes ${formatDate(entry.closeDate)}. ` : ''}` +
    `${entry.offerPrice != null ? `Offer price ₹${entry.offerPrice} per unit. ` : ''}` +
    `Minimum investment ₹${entry.minInvestment != null ? entry.minInvestment : '—'}.`
  );
}

// Builds the FinancialProduct JSON-LD object shared by generateMetadata()
// (for the description text) and the page body (which renders it as a real
// <script type="application/ld+json"> tag).
function buildJsonLd(entry, canonicalUrl) {
  const offers = {
    '@type': 'Offer',
    price: entry.offerPrice,
    priceCurrency: 'INR',
  };
  if (entry.openDate) offers.validFrom = entry.openDate;
  if (entry.closeDate) offers.validThrough = entry.closeDate;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name: entry.schemeName,
        description: buildDescription(entry),
        provider: { '@type': 'Organization', name: entry.amcName },
        url: canonicalUrl,
        category: entry.category || entry.schemeType,
        identifier: entry.schemeId,
        offers,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://mfcalc.getabundance.in',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'New Fund Offers (NFO)',
            item: 'https://mfcalc.getabundance.in/nfo',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: entry.schemeName,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const entry = await getNfoBySlug(slug);
  if (!entry) {
    return { title: 'NFO Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const title = `${entry.schemeName} NFO — ${entry.amcName} | Open Date, Price & Min Investment`;
  const description = buildDescription(entry);
  const canonicalUrl = `https://mfcalc.getabundance.in/nfo/${entry.slug}`;
  const ogImageUrl = 'https://mfcalc.getabundance.in/api/og-nfo';

  const keywords = [
    `${entry.schemeName} NFO`,
    `${entry.schemeName} open date`,
    `${entry.schemeName} close date`,
    `${entry.amcName} NFO`,
    entry.type === 'sif' ? 'SIF NFO India' : 'mutual fund NFO',
    entry.type === 'sif' ? 'Specialised Investment Fund NFO' : 'new fund offer India',
    `minimum investment ${entry.schemeName}`,
    'AMFI NFO live',
    'Abundance Financial Services',
  ].filter(Boolean).join(', ');

  return {
    title,
    description,
    keywords,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${entry.schemeName} NFO` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
    robots: { index: true, follow: true },
  };
}

export default async function NfoDetailPage({ params }) {
  const { slug } = await params;
  const entry = await getNfoBySlug(slug);
  if (!entry) notFound();

  const logo = getProviderLogo(entry.type, entry.amcName);
  const liveLink = await findLiveFundLink(entry.schemeName, entry.type);
  const canonicalUrl = `https://mfcalc.getabundance.in/nfo/${entry.slug}`;
  const jsonLd = buildJsonLd(entry, canonicalUrl);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar activePage="nfo" />
      <main className="nfo-detail container">
        <nav aria-label="Breadcrumb" className="nfo-breadcrumbs">
          <a href="/">Home</a>
          <span>/</span>
          <a href="/nfo">New Fund Offers</a>
          <span>/</span>
          <span>{entry.schemeName}</span>
        </nav>

        <header className="nfo-detail-header">
          {logo && <img src={logo} alt={entry.amcName || ''} className="nfo-detail-logo" />}
          <div>
            <h1>{entry.schemeName}</h1>
            <p className="nfo-detail-amc">{entry.amcName} · {entry.category || entry.schemeType}</p>
          </div>
        </header>

        {entry.type === 'sif' && (
          <div className="nfo-sif-badge-box">
            <strong>🛡️ Specialised Investment Fund (SIF) — SEBI New Asset Class</strong>
            <p>
              This scheme is regulated under SEBI&apos;s Specialised Investment Fund framework with a minimum ticket size of ₹10,00,000 (₹10 Lakhs) across strategies within the same fund house. SIFs can employ unhedged derivative positions up to 25% and non-directional long-short strategies.
            </p>
          </div>
        )}

        {entry.status === 'closed' ? (
          <div className="nfo-closed-banner">
            This NFO closed on {formatDate(entry.closeDate)} and is no longer accepting subscriptions.
          </div>
        ) : (
          <div className="nfo-open-banner" style={{ background: 'var(--g-xlight)', border: '1px solid var(--g-light)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '.84rem', color: 'var(--g1)', fontWeight: 700 }}>
            🟢 Currently Open for Subscription · Closes on {formatDate(entry.closeDate) || 'announced date'}
          </div>
        )}

        {entry.objective && <p className="nfo-detail-objective">{entry.objective}</p>}

        <table className="nfo-facts-table">
          <tbody>
            <tr><th>Asset Class</th><td>{entry.type === 'sif' ? 'Specialised Investment Fund (SIF)' : 'Mutual Fund'}</td></tr>
            <tr><th>Category</th><td>{entry.category || '—'}</td></tr>
            <tr><th>Scheme type</th><td>{entry.schemeType || '—'}</td></tr>
            <tr><th>Offer price</th><td>{entry.offerPrice != null ? `₹${entry.offerPrice} per unit` : '₹10 per unit'}</td></tr>
            <tr><th>Minimum investment</th><td>{entry.minInvestment != null ? `₹${new Intl.NumberFormat('en-IN').format(entry.minInvestment)}` : '—'}</td></tr>
            <tr><th>Opens</th><td>{formatDate(entry.openDate) || '—'}</td></tr>
            <tr><th>Closes</th><td>{formatDate(entry.closeDate) || '—'}</td></tr>
            <tr><th>Fund house</th><td>{entry.amcName || '—'}</td></tr>
          </tbody>
        </table>

        <div className="nfo-detail-links">
          {entry.infoDocumentUrl && (
            <a href={entry.infoDocumentUrl} target="_blank" rel="noopener noreferrer" className="nfo-external-link">
              📄 Official Scheme Information Document (SID / PDF) ↗
            </a>
          )}
          {entry.amcWebsite && (
            <a href={entry.amcWebsite} target="_blank" rel="noopener noreferrer" className="nfo-external-link">
              🔗 Official {entry.amcName} Website ↗
            </a>
          )}
          {liveLink && (
            <a href={liveLink} className="nfo-external-link">
              📊 View Full Analysis in Screener →
            </a>
          )}
          {entry.type === 'sif' ? (
            <a href="/sifs" className="nfo-external-link">
              🛡️ Compare All Specialised Investment Funds (SIF Screener) →
            </a>
          ) : (
            <a href="/screener" className="nfo-external-link">
              📈 Compare with Existing Funds in MF Screener →
            </a>
          )}
        </div>

        <div style={{ marginTop: 24, marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/book-consultation" className="nfo-cta-button">Talk to an AMFI Registered Advisor</a>
          <a href="/nfo" className="nfo-external-link" style={{ background: 'transparent', display: 'flex', alignItems: 'center' }}>← Back to All NFOs</a>
        </div>
      </main>
      <Footer />
    </>
  );
}
