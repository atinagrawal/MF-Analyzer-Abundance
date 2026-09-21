import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getAllAmcsSummary } from '@/lib/amcProfiles';
import AmcDirectoryClient from './AmcDirectoryClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'All Mutual Fund AMCs in India — List, Total AUM & Schemes Directory | Abundance',
  description:
    'Explore all 52 mutual fund asset management companies (AMCs) in India. Compare total official AMFI AUM, active equity & hybrid scheme counts, 3Y returns, and fund managers. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).',
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/amc',
  },
  openGraph: {
    title: 'All 52 Mutual Fund AMCs in India — List, Total AUM & Schemes Directory',
    description:
      'Compare all 52 AMCs in India by official AUM, scheme counts, category allocations, and average performance. Free directory by Abundance.',
    url: 'https://mfcalc.getabundance.in/amc',
    siteName: 'Abundance',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'All 52 Mutual Fund AMCs in India — List, Total AUM & Schemes Directory',
    description:
      'Compare all 52 AMCs in India by official AUM, scheme counts, category allocations, and average performance. Free directory by Abundance.',
  },
};

export default async function AmcDirectoryPage() {
  const amcSummaries = await getAllAmcsSummary();

  const totalAumAllAmcs = amcSummaries.reduce((sum, a) => sum + (a.totalAumCr || 0), 0);
  const totalSchemesAllAmcs = amcSummaries.reduce((sum, a) => sum + (a.totalSchemes || 0), 0);

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
        ],
      },
      {
        '@type': 'CollectionPage',
        name: 'All Mutual Fund Asset Management Companies (AMCs) in India',
        description: `Complete directory of all ${amcSummaries.length} SEBI-registered mutual fund houses in India managing ₹${(totalAumAllAmcs / 100000).toFixed(2)} Lakh Crore across ${totalSchemesAllAmcs} schemes.`,
        url: 'https://mfcalc.getabundance.in/amc',
        mainEntity: {
          '@type': 'ItemList',
          name: 'Indian Mutual Fund Asset Management Companies Ranked by AUM',
          numberOfItems: amcSummaries.length,
          itemListElement: amcSummaries.map((a, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: a.amcName,
            url: `https://mfcalc.getabundance.in/amc/${a.amcSlug}`,
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
        <AmcDirectoryClient amcs={amcSummaries} totalAum={totalAumAllAmcs} totalSchemes={totalSchemesAllAmcs} />
      </main>
      <Footer />
    </>
  );
}
