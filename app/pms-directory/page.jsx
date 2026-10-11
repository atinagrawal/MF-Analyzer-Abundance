import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getAllPmsDirectoryProviders } from '@/lib/pmsCompliance';
import PmsDirectoryClient from './PmsDirectoryClient';
import './pms-directory.css';

// ISR: revalidate every 6 hours
export const revalidate = 21600;

export const metadata = {
  title: 'SEBI Registered PMS Providers Directory — Core AUM & Compliance Screener | Abundance',
  description:
    'Comprehensive directory of all 510 active SEBI-registered Portfolio Management Services (PMS) providers in India. Compare by Core PMS AUM (ex-EPFO mandates), investor counts, monthly flows, and asset allocation. Sourced from official APMI VISTA monthly disclosures. By Atin Kumar Agrawal (APRN04279), APMI Registered PMS Distributor.',
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/pms-directory',
  },
  openGraph: {
    title: 'SEBI Registered PMS Providers Directory — Industry AUM & Compliance | Abundance',
    description:
      'Compare 510+ active SEBI-registered PMS providers in India by Core PMS AUM, investor counts, net capital flows, and asset class allocation. Verified APMI compliance data.',
    url: 'https://mfcalc.getabundance.in/pms-directory',
    siteName: 'Abundance',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SEBI Registered PMS Providers Directory | Abundance',
    description:
      'Explore all active SEBI-registered PMS asset managers in India with Core PMS AUM, investor counts, and monthly capital flows.',
  },
};

export default async function PmsDirectoryPage() {
  const providers = await getAllPmsDirectoryProviders({ includeInactive: true });
  const activeProviders = providers.filter((p) => p.isActive);

  // Industry Aggregates
  const totalCoreAumCr = Math.round(activeProviders.reduce((sum, p) => sum + p.coreAumCr, 0));
  const totalEpfoAumCr = Math.round(activeProviders.reduce((sum, p) => sum + p.aumPfEpfoCr, 0));
  const totalRegulatoryAumCr = Math.round(activeProviders.reduce((sum, p) => sum + p.grandTotalAumCr, 0));
  const totalClients = activeProviders.reduce((sum, p) => sum + p.totalClients, 0);
  const totalCoreClients = activeProviders.reduce((sum, p) => sum + p.coreClients, 0);
  const latestMonth = activeProviders[0]?.monthLabel || activeProviders[0]?.latestMonth || 'Aug 2026';

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
            name: 'PMS Screener',
            item: 'https://mfcalc.getabundance.in/pms-screener',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'SEBI PMS Directory',
            item: 'https://mfcalc.getabundance.in/pms-directory',
          },
        ],
      },
      {
        '@type': 'CollectionPage',
        name: 'SEBI Registered Portfolio Management Services (PMS) Directory',
        description: `Official regulatory compliance directory of ${activeProviders.length} active SEBI-registered PMS providers in India managing ₹${(totalCoreAumCr / 100000).toFixed(2)} Lakh Crore Core PMS AUM across ${totalClients.toLocaleString('en-IN')} investors.`,
        url: 'https://mfcalc.getabundance.in/pms-directory',
        publisher: {
          '@type': 'Organization',
          name: 'Abundance Financial Services',
          url: 'https://mfcalc.getabundance.in',
        },
        mainEntity: {
          '@type': 'ItemList',
          name: 'Indian SEBI Registered PMS Providers',
          numberOfItems: activeProviders.length,
          itemListElement: activeProviders.slice(0, 50).map((p, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: p.name,
            url: `https://mfcalc.getabundance.in/pms-directory/${p.slug}`,
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
      <main className="pmsd-main">
        {/* ── Breadcrumbs ── */}
        <nav aria-label="Breadcrumb" className="pmsd-crumbs">
          <a href="/">Home</a>
          <span aria-hidden="true">/</span>
          <a href="/pms-screener">PMS Screener</a>
          <span aria-hidden="true">/</span>
          <span>SEBI PMS Directory</span>
        </nav>

        {/* ── Header ── */}
        <header className="pmsd-header">
          <div className="pmsd-eyebrow">
            <span className="pmsd-dot" aria-hidden="true" />
            SEBI REGULATORY DISCLOSURES · APMI VISTA · AS ON {latestMonth.toUpperCase()}
          </div>
          <h1 className="pmsd-title">
            SEBI Registered <span>PMS Directory</span>
          </h1>
          <p className="pmsd-intro">
            Comprehensive directory of all {activeProviders.length} active SEBI-registered Portfolio Management Services (PMS) providers in India. Sourced from statutory monthly compliance filings submitted to APMI and SEBI.
          </p>
        </header>

        {/* ── Industry Stat Bar ── */}
        <div className="pmsd-statbar">
          <div className="pmsd-stat">
            <span className="pmsd-stat-lbl">Active Providers</span>
            <span className="pmsd-stat-val">{activeProviders.length}</span>
            <span className="pmsd-stat-sub">SEBI Registered</span>
          </div>
          <div className="pmsd-stat">
            <span className="pmsd-stat-lbl">Core PMS AUM (Ex-EPFO)</span>
            <span className="pmsd-stat-val">₹{totalCoreAumCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmsd-stat-sub">Commercial &amp; HNI book</span>
          </div>
          <div className="pmsd-stat">
            <span className="pmsd-stat-lbl">EPFO Mandate AUM</span>
            <span className="pmsd-stat-val">₹{totalEpfoAumCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmsd-stat-sub">Institutional retirement funds</span>
          </div>
          <div className="pmsd-stat">
            <span className="pmsd-stat-lbl">Total Registered Investors</span>
            <span className="pmsd-stat-val">{totalClients.toLocaleString('en-IN')}</span>
            <span className="pmsd-stat-sub">{totalCoreClients.toLocaleString('en-IN')} commercial clients</span>
          </div>
        </div>

        {/* ── EPFO Mandate Separation Notice ── */}
        <div className="pmsd-epfo-notice">
          <strong>Institutional EPFO Mandate Carve-Out:</strong> The headline <strong>Core PMS AUM</strong> displayed and sorted on this page excludes institutional retirement mandates (such as EPFO provident fund management books). Four major AMCs (SBI, UTI, HDFC, and Aditya Birla Sun Life) hold ₹33.08 Lakh Crore in government EPFO assets (~74.6% of all regulatory reported PMS AUM across just 206 accounts). Isolating these institutional mandates provides an accurate, unbiased view of each provider's genuine commercial and HNI portfolio management business.
        </div>

        {/* ── Interactive Client Screener ── */}
        <PmsDirectoryClient providers={providers} />

        {/* ── Regulatory Disclosure Footer ── */}
        <div className="pmsd-disclosure">
          <strong>Regulatory Compliance &amp; Attribution:</strong> Data sourced directly from monthly statutory compliance filings published under APMI VISTA (Association of Portfolio Managers in India) in accordance with SEBI (Portfolio Managers) Regulations. Portfolio turnover ratios are estimated computed proxies based on monthly purchases and sales relative to discretionary baseline assets. Minimum investment in PMS in India is ₹50,00,000 (₹50 Lakh) per SEBI guidelines. This directory is strictly factual and does not constitute personalized investment advice.
          <br /><br />
          <strong>Abundance Financial Services</strong> (ARN-251838, AMFI Registered Mutual Fund Distributor) · <strong>Atin Kumar Agrawal</strong> (APRN04279, APMI Registered Portfolio Management Services Distributor).
        </div>
      </main>
      <Footer />
    </>
  );
}
