import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getAllPmsProvidersSummary } from '@/lib/pmsProviders';
import PmsProviderDirectoryClient from './PmsProviderDirectoryClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Portfolio Management Services (PMS) Providers in India — Directory & Factsheets | Abundance',
  description:
    'Explore all 18 tracked PMS providers in India including Carnelian, Abakkus, Alchemy, Motilal Oswal, ICICI Prudential, and more. View active strategies, monthly factsheets, and deep-link to APMI performance analytics. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).',
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/pms-provider',
  },
  openGraph: {
    title: 'Tracked PMS Providers in India — Strategies & Factsheets Directory',
    description:
      'Compare 18 major PMS providers in India by strategy counts, latest monthly factsheet documents, and performance analytics. Abundance Financial Services.',
    url: 'https://mfcalc.getabundance.in/pms-provider',
    siteName: 'Abundance',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tracked PMS Providers in India — Strategies & Factsheets Directory',
    description:
      'Compare 18 major PMS providers in India by strategy counts, latest monthly factsheet documents, and performance analytics. Abundance Financial Services.',
  },
};

export default async function PmsProviderDirectoryPage() {
  const providers = await getAllPmsProvidersSummary();

  const totalStrategies = providers.reduce((sum, p) => sum + (p.strategyCount || 0), 0);

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
        ],
      },
      {
        '@type': 'CollectionPage',
        name: 'Tracked Portfolio Management Services (PMS) Providers in India',
        description: `Directory of ${providers.length} PMS asset managers in India with ${totalStrategies} tracked strategy documents and monthly factsheets.`,
        url: 'https://mfcalc.getabundance.in/pms-provider',
        mainEntity: {
          '@type': 'ItemList',
          name: 'Tracked Indian PMS Providers',
          numberOfItems: providers.length,
          itemListElement: providers.map((p, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: p.displayName,
            url: `https://mfcalc.getabundance.in/pms-provider/${p.providerSlug}`,
          })),
        },
      },
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
        <PmsProviderDirectoryClient providers={providers} totalStrategies={totalStrategies} />
      </main>
      <Footer />
    </>
  );
}
