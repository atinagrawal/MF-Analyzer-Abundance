import { notFound } from 'next/navigation';
import { getPmsDetailsCached } from '@/lib/pmsDetailsCache';
import { buildPmsDetailFaq } from '@/lib/pmsDetailFaq';
import PMSDetailClient from './PMSDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return { title: 'Strategy Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const d = await getPmsDetailsCached(id);
  if (!d) {
    return { title: 'Strategy Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const canonicalUrl = `https://mfcalc.getabundance.in/pms/${id}`;
  const name = d.iaName || d.strategyName || 'PMS Strategy';
  const title = `${name} PMS by ${d.providerName} — Fees, Returns & Quartile Ranking | Abundance`;
  const description =
    `${name} is a ${d.strategyName || 'PMS'} Portfolio Management Service by ${d.providerName}.` +
    (d.aumCr ? ` AUM ₹${d.aumCr} Cr.` : '') +
    (d.minInvestment ? ` Min. investment ₹${Number(d.minInvestment).toLocaleString('en-IN')}.` : '') +
    ` View fee structure, exit load, historical performance and quartile ranking on Abundance — ARN-251838.`;

  const faq = buildPmsDetailFaq(d);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name,
        description,
        provider: { '@type': 'Organization', name: d.providerName },
        url: canonicalUrl,
        category: d.strategyName,
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, type: 'website', url: canonicalUrl },
    twitter: { card: 'summary_large_image', title, description },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    other: { 'script:ld+json': JSON.stringify(jsonLd) },
  };
}

export default async function PMSDetailPage({ params }) {
  const { id } = await params;
  if (!id || isNaN(Number(id))) notFound();

  const d = await getPmsDetailsCached(id);
  if (!d) notFound();

  return <PMSDetailClient iaid={id} />;
}
