import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { notFound } from 'next/navigation';
import { getPmsProviderBySlug, getAllPmsDirectoryProviders } from '@/lib/pmsCompliance';
import PmsProviderComplianceClient from './PmsProviderComplianceClient';
import './pms-provider-compliance.css';

// ISR: revalidate every 6 hours
export const revalidate = 21600;

export async function generateStaticParams() {
  const providers = await getAllPmsDirectoryProviders({ includeInactive: true });
  // Prerender top 60 providers by Core AUM
  return providers.slice(0, 60).map((p) => ({
    slug: p.slug,
  }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getPmsProviderBySlug(slug);
  if (!data?.provider) return { title: 'PMS Provider Not Found | Abundance' };

  const p = data.provider;
  return {
    title: `${p.name} — SEBI PMS Compliance Profile & AUM | Abundance`,
    description: `${p.name} (${p.registrationNo}) SEBI Registered Portfolio Management Services. Core PMS AUM: ₹${p.coreAumCr.toLocaleString('en-IN')} Cr across ${p.coreClients.toLocaleString('en-IN')} investors. 18-month compliance history, monthly flows, and asset allocation disclosures.`,
    alternates: {
      canonical: `https://mfcalc.getabundance.in/pms-directory/${p.slug}`,
    },
    openGraph: {
      title: `${p.name} — SEBI PMS Profile & AUM Disclosures | Abundance`,
      description: `Official SEBI compliance disclosures for ${p.name}. Core PMS AUM: ₹${p.coreAumCr.toLocaleString('en-IN')} Cr. Verified APMI VISTA filing history.`,
      url: `https://mfcalc.getabundance.in/pms-directory/${p.slug}`,
      siteName: 'Abundance',
      locale: 'en_IN',
      type: 'website',
    },
  };
}

export default async function PmsProviderCompliancePage({ params }) {
  const { slug } = await params;
  const data = await getPmsProviderBySlug(slug);

  if (!data || !data.provider) {
    notFound();
  }

  const { provider: p, history } = data;

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
            name: 'PMS Directory',
            item: 'https://mfcalc.getabundance.in/pms-directory',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: p.name,
            item: `https://mfcalc.getabundance.in/pms-directory/${p.slug}`,
          },
        ],
      },
      {
        '@type': 'FinancialService',
        name: p.name,
        identifier: p.registrationNo,
        description: `SEBI-registered Portfolio Management Services (PMS) provider in India managing ₹${p.coreAumCr.toLocaleString('en-IN')} Cr Core PMS AUM.`,
        url: `https://mfcalc.getabundance.in/pms-directory/${p.slug}`,
        providerMobility: 'dynamic',
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
      <main className="pmspc-main">
        {/* ── Breadcrumbs ── */}
        <nav aria-label="Breadcrumb" className="pmsd-crumbs">
          <a href="/">Home</a>
          <span aria-hidden="true">/</span>
          <a href="/pms-directory">PMS Directory</a>
          <span aria-hidden="true">/</span>
          <span>{p.name}</span>
        </nav>

        {/* ── Hero Card ── */}
        <section className="pmspc-hero">
          <div className="pmspc-logo-wrap">
            {p.logoPath ? (
              <img src={p.logoPath} alt="" className="pmspc-logo" />
            ) : (
              <span className="pmspc-logo-fallback">{p.name.charAt(0)}</span>
            )}
          </div>

          <div className="pmspc-hero-info">
            <div className="pmspc-hero-eyebrow">
              🛡️ SEBI Registered PMS · {p.status}
            </div>
            <h1 className="pmspc-hero-title">{p.name}</h1>
            <div className="pmspc-hero-meta">
              SEBI Reg: <strong>{p.registrationNo}</strong> · Reporting Period: {p.firstSeenMonth} to {p.monthLabel || p.latestMonth}
            </div>
          </div>

          <div className="pmspc-hero-stats">
            <div className="pmspc-stat-box">
              <span className="pmspc-stat-box-lbl">Core PMS AUM</span>
              <span className="pmspc-stat-box-val">₹{p.coreAumCr.toLocaleString('en-IN')} Cr</span>
              {p.isEpfoDominant ? (
                <span className="pmspc-stat-box-sub">
                  🏛️ Excl. EPFO mandate (Raw ₹{p.grandTotalAumCr.toLocaleString('en-IN')} Cr)
                </span>
              ) : (
                p.aumPfEpfoCr > 0 && (
                  <span className="pmspc-stat-box-sub">
                    Raw Total: ₹{p.grandTotalAumCr.toLocaleString('en-IN')} Cr
                  </span>
                )
              )}
            </div>

            <div className="pmspc-stat-box">
              <span className="pmspc-stat-box-lbl">Active Investors</span>
              <span className="pmspc-stat-box-val">{p.coreClients.toLocaleString('en-IN')}</span>
              {p.avgTicketLakh != null && (
                <span className="pmspc-stat-box-sub">
                  Avg Ticket: ₹{p.avgTicketLakh >= 100
                    ? `${(p.avgTicketLakh / 100).toFixed(1)} Cr`
                    : `${p.avgTicketLakh.toFixed(1)}L`}
                </span>
              )}
            </div>

            <div className="pmspc-stat-box">
              <span className="pmspc-stat-box-lbl">Portfolio Turnover</span>
              <span className="pmspc-stat-box-val">{p.turnoverDisplay || '—'}</span>
              <span className="pmspc-stat-box-sub">Computed trading proxy</span>
            </div>
          </div>
        </section>

        {/* ── Client Visuals & Interactive Trajectory ── */}
        <PmsProviderComplianceClient provider={p} history={history} />

        {/* ── Regulatory Attribution Footer ── */}
        <div className="pmsd-disclosure">
          <strong>Regulatory Compliance &amp; Attribution:</strong> Data sourced from monthly statutory compliance filings published under APMI VISTA (Association of Portfolio Managers in India) in accordance with SEBI (Portfolio Managers) Regulations. Portfolio turnover ratios are estimated computed proxies based on monthly purchases and sales relative to discretionary baseline assets. Minimum investment in PMS in India is ₹50,00,000 (₹50 Lakh) per SEBI guidelines. This directory is strictly factual and does not constitute personalized investment advice.
          <br /><br />
          <strong>Abundance Financial Services</strong> (ARN-251838, AMFI Registered Mutual Fund Distributor) · <strong>Atin Kumar Agrawal</strong> (APRN04279, APMI Registered Portfolio Management Services Distributor).
        </div>
      </main>
      <Footer />
    </>
  );
}
