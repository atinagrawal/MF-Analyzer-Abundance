import { notFound, permanentRedirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getPmsProviderDetail } from '@/lib/pmsProviders';
import PmsProviderDetailClient from './PmsProviderDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getPmsProviderDetail(slug);

  if (!data || data.redirect) {
    return {
      title: 'PMS Provider Not Found | Abundance',
      robots: { index: false, follow: false },
    };
  }

  const { displayName, providerSlug, strategyCount } = data;
  const canonicalUrl = `https://mfcalc.getabundance.in/pms-provider/${providerSlug}`;

  const title = `${displayName} PMS Strategies, Factsheets & Performance Analytics | Abundance`;
  const description =
    `Explore Portfolio Management Services by ${displayName}. View ${strategyCount} active PMS strategies, download official monthly factsheets, and deep-link to APMI performance analytics. Atin Kumar Agrawal, APMI Registered PMS Distributor (APRN04279).`;

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

export default async function PmsProviderDetailPage({ params }) {
  const { slug } = await params;
  const data = await getPmsProviderDetail(slug);

  if (!data) {
    notFound();
  }

  if (data.redirect) {
    permanentRedirect(`/pms-provider/${data.redirect}`);
  }

  const { providerSlug, displayName, logoPath, strategyCount, strategies, syncedAt } = data;
  const canonicalUrl = `https://mfcalc.getabundance.in/pms-provider/${providerSlug}`;

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
            name: 'PMS Providers',
            item: 'https://mfcalc.getabundance.in/pms-provider',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: displayName,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'FinancialService',
        name: displayName,
        url: canonicalUrl,
      },
      ...(strategies.length > 0
        ? [
            {
              '@type': 'ItemList',
              name: `PMS Strategies by ${displayName}`,
              numberOfItems: strategies.length,
              itemListElement: strategies.map((s, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: s.strategyName,
                url: s.iaid ? `https://mfcalc.getabundance.in/pms/${s.iaid}` : canonicalUrl,
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
        <PmsProviderDetailClient
          providerSlug={providerSlug}
          displayName={displayName}
          logoPath={logoPath}
          strategyCount={strategyCount}
          strategies={strategies}
          syncedAt={syncedAt}
        />
      </main>
      <Footer />
    </>
  );
}
