import { notFound } from 'next/navigation';
import { getNfoBySlug } from '@/lib/nfoData';
import { getProviderLogo } from '@/lib/providerLogos';
import pool from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const dynamic = 'force-dynamic';

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
// indexed name-match SELECT on a low-traffic detail page, same risk class
// as the lookups lib/holdingsLookup.js already does today (not the
// personalized/high-concurrency pattern that caused past incidents).
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

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const entry = await getNfoBySlug(slug);
  if (!entry) {
    return { title: 'NFO Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const title = `${entry.schemeName} NFO — Open Date, Price & Minimum Investment | Abundance`;
  const description =
    `${entry.schemeName} is a ${entry.status === 'open' ? 'currently open' : 'recently closed'} ` +
    `New Fund Offer from ${entry.amcName || 'the AMC'}${entry.category ? ` (${entry.category})` : ''}. ` +
    `${entry.openDate ? `Opened ${formatDate(entry.openDate)}. ` : ''}` +
    `${entry.closeDate ? `Closes ${formatDate(entry.closeDate)}. ` : ''}` +
    `Offer price ₹${entry.offerPrice ?? 10} per unit, minimum investment ₹${entry.minInvestment ?? '—'}.`;

  const canonicalUrl = `https://mfcalc.getabundance.in/nfo/${entry.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name: entry.schemeName,
        description,
        provider: { '@type': 'Organization', name: entry.amcName },
        url: canonicalUrl,
        category: entry.category || entry.schemeType,
        identifier: entry.schemeId,
        offers: {
          '@type': 'Offer',
          price: entry.offerPrice,
          priceCurrency: 'INR',
          validFrom: entry.openDate,
          validThrough: entry.closeDate,
        },
      },
    ],
  };

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, type: 'website', url: canonicalUrl },
    twitter: { card: 'summary', title, description },
    robots: { index: true, follow: true },
    other: { 'script:ld+json': JSON.stringify(jsonLd) },
  };
}

export default async function NfoDetailPage({ params }) {
  const { slug } = await params;
  const entry = await getNfoBySlug(slug);
  if (!entry) notFound();

  const logo = getProviderLogo(entry.type, entry.amcName);
  const liveLink = await findLiveFundLink(entry.schemeName, entry.type);

  return (
    <>
      <Navbar />
      <main className="nfo-detail container">
        <a href="/nfo" className="nfo-back-link">← All NFOs</a>

        <header className="nfo-detail-header">
          {logo && <img src={logo} alt={entry.amcName || ''} className="nfo-detail-logo" />}
          <div>
            <h1>{entry.schemeName}</h1>
            <p className="nfo-detail-amc">{entry.amcName} · {entry.category || entry.schemeType}</p>
          </div>
        </header>

        {entry.status === 'closed' && (
          <div className="nfo-closed-banner">
            This NFO closed on {formatDate(entry.closeDate)} and is no longer accepting subscriptions.
          </div>
        )}

        {entry.objective && <p className="nfo-detail-objective">{entry.objective}</p>}

        <table className="nfo-facts-table">
          <tbody>
            <tr><th>Category</th><td>{entry.category || '—'}</td></tr>
            <tr><th>Scheme type</th><td>{entry.schemeType || '—'}</td></tr>
            <tr><th>Offer price</th><td>{entry.offerPrice != null ? `₹${entry.offerPrice}` : '—'}</td></tr>
            <tr><th>Minimum investment</th><td>{entry.minInvestment != null ? `₹${new Intl.NumberFormat('en-IN').format(entry.minInvestment)}` : '—'}</td></tr>
            <tr><th>Opens</th><td>{formatDate(entry.openDate) || '—'}</td></tr>
            <tr><th>Closes</th><td>{formatDate(entry.closeDate) || '—'}</td></tr>
            <tr><th>Fund house</th><td>{entry.amcName || '—'}</td></tr>
          </tbody>
        </table>

        <div className="nfo-detail-links">
          {entry.infoDocumentUrl && (
            <a href={entry.infoDocumentUrl} target="_blank" rel="noopener noreferrer" className="nfo-external-link">
              📄 Official Offer Document (PDF) ↗
            </a>
          )}
          {entry.amcWebsite && (
            <a href={entry.amcWebsite} target="_blank" rel="noopener noreferrer" className="nfo-external-link">
              🔗 {entry.amcName} Website ↗
            </a>
          )}
          {liveLink && (
            <a href={liveLink} className="nfo-external-link">
              📊 View Full Analysis →
            </a>
          )}
        </div>

        <a href="/book-consultation" className="nfo-cta-button">Talk to an Advisor</a>
      </main>
      <Footer />
    </>
  );
}
