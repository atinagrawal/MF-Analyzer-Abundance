import { notFound } from 'next/navigation';
import pool from '@/lib/db';
import SifDetailClient from './SifDetailClient';
import { getSchemeFaq } from '@/lib/sifFaq';

// ISR, not force-dynamic -- see app/fund/[code]/page.js's matching change
// and lib/caching-pattern.md. SIF NAV/category data doesn't need a fresh
// Postgres hit on every single page view; 6h matches the fund page and
// the screener route's own revalidate window.
export const revalidate = 21600;

export async function generateMetadata({ params }) {
  const { id } = await params;
  if (!id) return { title: 'SIF Not Found | Abundance', robots: { index: false, follow: false } };

  const rawId = String(id).trim();
  const normalizedId = rawId.startsWith('SIF-') ? rawId : !isNaN(Number(rawId)) ? `SIF-${String(rawId).padStart(2, '0')}` : rawId;

  // No .catch() swallowing the error into an empty result: a genuine DB
  // outage must NOT look identical to "this scheme ID was never real" --
  // see the matching fix + comment on the default export below.
  const { rows } = await pool.query(
    `SELECT scheme_id, nav_name, sif_name, category, nav, nav_date, ret_1m, ret_3m, ret_6m, inception_date, asof
     FROM sif_screener
     WHERE UPPER(scheme_id) = UPPER($1) OR UPPER(scheme_id) = UPPER($2) LIMIT 1`,
    [rawId, normalizedId]
  );

  if (!rows.length) {
    return {
      title: 'Specialised Investment Fund Not Found | Abundance',
      robots: { index: false, follow: false },
    };
  }

  const s = rows[0];
  const cleanName = (s.nav_name || '').replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim();
  const title = `${cleanName} (${s.scheme_id}) — SIF Performance, Strategy & Analytics | Abundance`;
  const description =
    `${cleanName} is a SEBI-regulated Specialised Investment Fund (${s.category}) managed by ${s.sif_name}. ` +
    `Scheme ID: ${s.scheme_id}. Latest NAV: ₹${Number(s.nav).toFixed(4)} as of ${s.nav_date || s.asof}. ` +
    `View complete portfolio holdings, strategy facts, risk metrics & backtest on Abundance — ARN-251838.`;

  const canonicalUrl = `https://mfcalc.getabundance.in/sif/${s.scheme_id}`;
  const ogImageUrl = `https://mfcalc.getabundance.in/api/og-sif?id=${encodeURIComponent(s.scheme_id)}&name=${encodeURIComponent(cleanName)}&house=${encodeURIComponent(s.sif_name)}&cat=${encodeURIComponent(s.category)}&nav=${s.nav}`;

  const schemeFaqs = getSchemeFaq(s, 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name: cleanName,
        description,
        provider: { '@type': 'Organization', name: s.sif_name },
        url: canonicalUrl,
        category: `Specialised Investment Fund - ${s.category}`,
        identifier: s.scheme_id,
      },
      {
        '@type': 'FAQPage',
        mainEntity: schemeFaqs.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.a,
          },
        })),
      },
    ],
  };

  return {
    title,
    description,
    keywords: `${cleanName}, ${s.sif_name}, ${s.category}, SIF India, Specialised Investment Fund, Scheme ID ${s.scheme_id}, SIF NAV, SIF holdings, SIF backtest`,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: cleanName }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    other: {
      'script:ld+json': JSON.stringify(jsonLd),
    },
  };
}

export default async function SifPage({ params }) {
  const { id } = await params;
  if (!id) notFound();

  const rawId = String(id).trim();
  const normalizedId = rawId.startsWith('SIF-') ? rawId : !isNaN(Number(rawId)) ? `SIF-${String(rawId).padStart(2, '0')}` : rawId;

  // Same reasoning as generateMetadata above: a thrown DB error must
  // propagate (letting a first-visit render error out, or letting ISR
  // keep serving the last good cached render on revalidation) rather
  // than being caught and re-presented as a confident "not found" --
  // that's how a transient DB outage turned into every /sif/[id] page
  // 404ing as if every scheme had simply stopped existing.
  const { rows } = await pool.query(
    'SELECT scheme_id FROM sif_screener WHERE UPPER(scheme_id) = UPPER($1) OR UPPER(scheme_id) = UPPER($2) LIMIT 1',
    [rawId, normalizedId]
  );

  if (!rows.length) {
    notFound();
  }

  return <SifDetailClient id={rows[0].scheme_id} />;
}
