import { notFound, permanentRedirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getAmcDetail } from '@/lib/amcProfiles';
import AmcDetailClient from './AmcDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getAmcDetail(slug);

  if (!data || data.redirect) {
    return {
      title: 'AMC Not Found | Abundance',
      robots: { index: false, follow: false },
    };
  }

  const { amcName, amcSlug, totalAumCr, schemesCount, profile } = data;
  const legalName = profile?.info?.legalName || amcName;
  const canonicalUrl = `https://mfcalc.getabundance.in/amc/${amcSlug}`;

  const title = `${amcName} — Schemes, Total AUM, Fund Managers & Office Details | Abundance`;
  const description =
    `Complete profile of ${amcName} (${legalName}) managing ₹${totalAumCr.toLocaleString('en-IN')} Cr across ${schemesCount} mutual fund schemes. View fund manager bios, NAV, 1Y/3Y/5Y returns, and registered address. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Abundance',
      locale: 'en_IN',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function AmcDetailPage({ params }) {
  const { slug } = await params;
  const data = await getAmcDetail(slug);

  if (!data) {
    notFound();
  }

  if (data.redirect) {
    permanentRedirect(`/amc/${data.redirect}`);
  }

  const { amcName, amcSlug, logoPath, totalAumCr, schemesCount, schemes, profile } = data;
  const canonicalUrl = `https://mfcalc.getabundance.in/amc/${amcSlug}`;
  const info = profile.info || {};
  const managers = profile.managers || [];

  // Schema.org Structured Data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
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
            name: 'Mutual Fund AMCs',
            item: 'https://mfcalc.getabundance.in/amc',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: amcName,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'FinancialService',
        name: amcName,
        legalName: info.legalName || amcName,
        url: canonicalUrl,
        ...(info.phone ? { telephone: info.phone } : {}),
        ...(info.website ? { sameAs: info.website } : {}),
        ...(info.launchDate ? { foundingDate: info.launchDate.split('T')[0] } : {}),
        ...(info.address
          ? {
              address: {
                '@type': 'PostalAddress',
                streetAddress: info.address,
                addressCountry: 'IN',
              },
            }
          : {}),
      },
      ...(schemes.length > 0
        ? [
            {
              '@type': 'ItemList',
              name: `Schemes Managed by ${amcName}`,
              numberOfItems: Math.min(schemes.length, 10),
              itemListElement: schemes.slice(0, 10).map((s, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: s.name,
                url: `https://mfcalc.getabundance.in/fund/${s.code}`,
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main style={{ minHeight: 'calc(100vh - 200px)', paddingBottom: '40px' }}>
        <AmcDetailClient
          amcName={amcName}
          amcSlug={amcSlug}
          logoPath={logoPath}
          totalAumCr={totalAumCr}
          schemesCount={schemesCount}
          schemes={schemes}
          info={info}
          managers={managers}
        />
      </main>
      <Footer />
    </>
  );
}
