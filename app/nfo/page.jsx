import { getPageMeta } from '@/lib/metadata';
import { getNfoData } from '@/lib/nfoData';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import NfoFilterTabs from './NfoFilterTabs';

export const metadata = getPageMeta('nfo');
export const revalidate = 3600;

export default async function NfoPage() {
  const data = await getNfoData();

  // Computed once, server-side, and threaded down as a plain prop so both
  // server-render and client-hydration read the exact same value -- avoids
  // a hydration mismatch on the "Closes in Nd" chips that would otherwise
  // recur around the UTC/IST date-rollover window.
  const today = new Date().toISOString().split('T')[0];

  const openMf = (data.mf || []).filter((e) => e.status === 'open');
  const openSif = (data.sif || []).filter((e) => e.status === 'open');
  const allOpen = [...openMf, ...openSif];

  const faqs = [
    {
      q: 'What is a New Fund Offer (NFO) in India?',
      a: 'A New Fund Offer (NFO) is the initial subscription period during which an Asset Management Company (AMC) launches a new mutual fund or Specialised Investment Fund (SIF) scheme to raise capital from investors. Units during an NFO are typically allotted at a face value of ₹10 per unit. The offer window is open for up to 15 days, following which units are allotted and the fund reopens for regular purchase and redemption within 5 business days.',
    },
    {
      q: 'What is a SIF NFO and how is it different from a Mutual Fund NFO?',
      a: "A SIF (Specialised Investment Fund) is a SEBI-regulated New Asset Class situated between traditional mutual funds and Portfolio Management Services (PMS). While regular mutual funds require a minimum investment of ₹100 to ₹5,000, SEBI mandates a minimum ticket size of ₹10,00,000 (₹10 Lakhs) for SIFs across one or more strategies within the same fund house. SIFs can employ sophisticated strategies such as Equity Long-Short, Active Asset Allocation, and inverse/unhedged derivative positions up to 25%, offering non-directional alpha that regular mutual funds cannot legally execute.",
    },
    {
      q: 'Is an NFO cheaper than an existing mutual fund because its NAV is ₹10?',
      a: "No. The belief that an NFO is 'cheap' at ₹10 is a widespread psychological myth. Unlike stock IPOs where share price relates to valuation, mutual fund NAV simply reflects the per-unit market value of the fund's underlying assets. If you invest ₹1,00,000 in an NFO at ₹10 NAV (10,000 units) or an established fund at ₹100 NAV (1,000 units), a 15% portfolio market gain will yield exactly the same ₹15,000 return in both cases. An existing fund often has the advantage of a verifiable multi-year track record and established portfolio holdings.",
    },
    {
      q: 'How soon can I redeem or purchase units after an NFO closes?',
      a: 'Under SEBI regulations, open-ended mutual funds and SIFs must allot units within 5 business days from the NFO closure date and reopen for continuous sale and repurchase within 5 business days of allotment. Once reopened, you can purchase additional units or redeem existing units at the prevailing daily NAV.',
    },
    {
      q: 'Can I start a Systematic Investment Plan (SIP) in an NFO?',
      a: 'During the initial NFO subscription window, investments are primarily accepted via lumpsum. However, most fund houses allow investors to register a SIP mandate concurrently with their NFO application. In such cases, the first installment is processed at the NFO offer price of ₹10 per unit, and subsequent installments execute at prevailing NAVs once the fund reopens for continuous transactions.',
    },
    {
      q: 'Where can I find and verify the official Scheme Information Document (SID) of an NFO?',
      a: 'The Scheme Information Document (SID) and Key Information Memorandum (KIM) are officially filed with SEBI and AMFI prior to launch. On the Abundance NFO Tracker, every scheme includes a direct link to the official SID PDF hosted by the AMC, outlining investment objectives, asset allocation mandatories, fund manager details, and the scheme risk-o-meter.',
    },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': 'https://mfcalc.getabundance.in/nfo#webpage',
        name: 'Live NFO Tracker India 2026 — Mutual Fund & SIF New Fund Offers',
        description:
          'Track every mutual fund and SIF New Fund Offer (NFO) currently open for subscription in India — launch dates, closing dates, offer price ₹10 and minimum investment, sourced directly from AMFI.',
        url: 'https://mfcalc.getabundance.in/nfo',
        publisher: {
          '@type': 'FinancialService',
          name: 'Abundance Financial Services',
          url: 'https://mfcalc.getabundance.in',
          sameAs: [
            'https://twitter.com/abundancefinsvs',
            'https://www.linkedin.com/company/abundance-financial-services',
          ],
        },
        about: [
          {
            '@type': 'Thing',
            name: 'Mutual funds in India',
            sameAs: 'https://en.wikipedia.org/wiki/Mutual_funds_in_India',
          },
          {
            '@type': 'Thing',
            name: 'Securities and Exchange Board of India',
            sameAs: 'https://en.wikipedia.org/wiki/Securities_and_Exchange_Board_of_India',
          },
          {
            '@type': 'Thing',
            name: 'Specialised Investment Fund',
            sameAs: 'https://www.amfiindia.com/sif/new-fund-offer',
          },
        ],
        mentions: [
          {
            '@type': 'Organization',
            name: 'Association of Mutual Funds in India',
            sameAs: 'https://www.amfiindia.com',
          },
          {
            '@type': 'GovernmentOrganization',
            name: 'Securities and Exchange Board of India',
            sameAs: 'https://www.sebi.gov.in',
          },
        ],
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.nfo-ai-brief', '.nfo-hero'],
        },
      },
      {
        '@type': 'Dataset',
        '@id': 'https://mfcalc.getabundance.in/nfo#dataset',
        name: 'Live Indian Mutual Fund and SIF New Fund Offers (NFO) Dataset',
        description:
          'Comprehensive dataset tracking active, upcoming, and recently closed New Fund Offers (NFOs) across Indian AMCs and Specialised Investment Funds (SIFs), synchronized directly from AMFI.',
        url: 'https://mfcalc.getabundance.in/nfo',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
        creator: {
          '@type': 'FinancialService',
          name: 'Abundance Financial Services',
          url: 'https://mfcalc.getabundance.in',
        },
        sourceOrganization: {
          '@type': 'Organization',
          name: 'Association of Mutual Funds in India (AMFI)',
          url: 'https://www.amfiindia.com',
        },
        spatialCoverage: 'IN',
        temporalCoverage: '2026',
        distribution: [
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: 'https://mfcalc.getabundance.in/api/nfo',
          },
          {
            '@type': 'DataDownload',
            encodingFormat: 'text/markdown',
            contentUrl: 'https://mfcalc.getabundance.in/api/nfo?format=markdown',
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://mfcalc.getabundance.in/nfo#breadcrumb',
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
            name: 'NFO Tracker',
            item: 'https://mfcalc.getabundance.in/nfo',
          },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': 'https://mfcalc.getabundance.in/nfo#itemlist',
        name: 'Current Open New Fund Offers in India',
        numberOfItems: allOpen.length,
        itemListElement: allOpen.map((entry, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: `${entry.schemeName} (${entry.amcName})`,
          url: `https://mfcalc.getabundance.in/nfo/${entry.slug}`,
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://mfcalc.getabundance.in/nfo#faq',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.a,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar activePage="nfo" />
      <main className="nfo-page container">
        <nav aria-label="Breadcrumb" className="nfo-breadcrumbs">
          <a href="/">Home</a>
          <span>/</span>
          <span>New Fund Offers (NFO)</span>
        </nav>

        <header className="nfo-hero">
          <h1>Live NFO Tracker — Mutual Fund &amp; SIF New Fund Offers</h1>
          <p className="nfo-hero-sub">
            Track all active New Fund Offers (NFOs) across Indian Mutual Funds and SEBI-regulated Specialised Investment Funds (SIFs). Sourced in real time from AMFI with official Offer Documents, closing dates, and minimum subscriptions.
            {data.syncedAt && (
              <> Last updated {new Date(data.syncedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.</>
            )}
          </p>
        </header>

        {/* ── Live Quick Stats Bar ── */}
        <section className="nfo-stats-bar" aria-label="NFO Summary Metrics">
          <div className="nfo-stat-card">
            <span className="nfo-stat-val">{allOpen.length}</span>
            <span className="nfo-stat-lbl">Open NFOs Today</span>
          </div>
          <div className="nfo-stat-card">
            <span className="nfo-stat-val">{openMf.length}</span>
            <span className="nfo-stat-lbl">Mutual Funds</span>
          </div>
          <div className="nfo-stat-card">
            <span className="nfo-stat-val">{openSif.length}</span>
            <span className="nfo-stat-lbl">SIF (New Asset Class)</span>
          </div>
          <div className="nfo-stat-card">
            <span className="nfo-stat-val">₹10</span>
            <span className="nfo-stat-lbl">Offer Price (Par)</span>
          </div>
        </section>

        {/* ── Executive Briefing & GEO Grounding for AI & Investors ── */}
        <section className="nfo-ai-brief" aria-label="Executive Briefing & Key Facts for Investors and AI Assistants">
          <div className="nfo-ai-brief-badge">
            <span>⚡ Executive Summary &amp; Grounding</span>
            <span className="nfo-verified-tag">AMFI Verified Feed · Daily Sync</span>
          </div>
          <div className="nfo-ai-brief-content">
            <p>
              <strong>Current Status Snapshot:</strong> There are <strong>{allOpen.length} New Fund Offers</strong> currently open for public subscription in India, comprising <strong>{openMf.length} Mutual Funds</strong> and <strong>{openSif.length} Specialised Investment Funds (SIF)</strong>.
            </p>
            <ul className="nfo-ai-brief-list">
              {openSif.length > 0 && (
                <li>
                  <strong>Specialised Investment Fund (SIF) Highlight:</strong> {openSif.map((s) => `${s.schemeName} (${s.amcName})`).join(', ')} is actively accepting subscriptions under SEBI&apos;s New Asset Class. Minimum investment is <strong>₹10,00,000 (₹10 Lakhs)</strong>.
                </li>
              )}
              <li>
                <strong>Allotment Par Value:</strong> All NFO units are issued at <strong>₹10 per unit</strong> face value. (Important: ₹10 NAV does not mean the fund is cheap or undervalued; returns are determined strictly by post-allotment portfolio growth).
              </li>
              <li>
                <strong>Offer Window &amp; Reopening:</strong> SEBI regulations mandate that open-ended NFOs remain open for up to <strong>15 calendar days</strong>, allot units within 5 business days, and reopen for daily continuous purchase and redemption within 5 business days post-allotment.
              </li>
              <li>
                <strong>Official Data Feed:</strong> Directly synchronized and verified from <em>Association of Mutual Funds in India (AMFI)</em> official records.
              </li>
            </ul>

            <div className="nfo-ai-footer">
              <div className="nfo-ai-cite">
                <strong>How to cite this page:</strong>
                <code>Abundance (2026). Live NFO Tracker: Mutual Fund &amp; SIF Offers in India. https://mfcalc.getabundance.in/nfo</code>
              </div>
              <div className="nfo-api-actions">
                <a href="/api/nfo" target="_blank" rel="noopener noreferrer" className="nfo-api-btn">
                  <span>{'{ }'}</span> JSON Feed
                </a>
                <a href="/api/nfo?format=markdown" target="_blank" rel="noopener noreferrer" className="nfo-api-btn">
                  <span>📄</span> Markdown for AI
                </a>
                <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="nfo-api-btn">
                  <span>🤖</span> /llms.txt
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive Tabs & NFO Cards Grid ── */}
        <NfoFilterTabs mf={openMf} sif={openSif} today={today} />

        {/* ── SEO Section 1: Understanding NFOs & SIFs ── */}
        <section className="nfo-content-section">
          <h2>Understanding New Fund Offers (NFOs) in India</h2>
          <p>
            A <strong>New Fund Offer (NFO)</strong> is the initial launch window when an Asset Management Company (AMC) invites subscriptions from the public to create a new portfolio. For open-ended schemes, NFO units are issued at a nominal par value of <strong>₹10 per unit</strong> during an offer period that typically lasts 10 to 15 calendar days.
          </p>
          <p>
            Under SEBI guidelines, once an NFO closes, all received application funds are pooled and invested according to the scheme&apos;s investment objective. Open-ended funds then reopen for continuous daily purchase and redemption at the newly prevailing Net Asset Value (NAV) within 5 business days of allotment.
          </p>

          <h2>Mutual Fund NFO vs SIF NFO: Key Differences</h2>
          <p>
            With the introduction of <strong>Specialised Investment Funds (SIFs)</strong> under SEBI&apos;s New Asset Class framework, Indian investors now have access to strategies that bridge the gap between mutual funds and Portfolio Management Services (PMS). SIFs can deploy sophisticated long-short and derivative-based risk management strategies that traditional mutual funds cannot execute.
          </p>

          <div className="nfo-compare-table-wrap">
            <table className="nfo-compare-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Mutual Fund NFO</th>
                  <th>SIF NFO (New Asset Class)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Minimum Ticket Size</strong></td>
                  <td>₹100 to ₹5,000</td>
                  <td>₹10,00,000 (₹10 Lakhs) across strategies</td>
                </tr>
                <tr>
                  <td><strong>Strategy Flexibility</strong></td>
                  <td>Long-only equity, hybrid, debt, passive indices</td>
                  <td>Equity Long-Short, Hybrid Long-Short, Active Allocator</td>
                </tr>
                <tr>
                  <td><strong>Derivative Mandate</strong></td>
                  <td>Hedging &amp; portfolio rebalancing only</td>
                  <td>Unhedged derivative positions up to 25% for alpha</td>
                </tr>
                <tr>
                  <td><strong>Target Audience</strong></td>
                  <td>Retail and Mass-Affluent Investors</td>
                  <td>Accredited High Net Worth Individuals (HNIs)</td>
                </tr>
                <tr>
                  <td><strong>Offer Price</strong></td>
                  <td>₹10 per unit</td>
                  <td>₹10 per unit</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>The Smart Investor&apos;s NFO Evaluation Checklist</h2>
          <div className="nfo-guide-grid">
            <div className="nfo-guide-card">
              <h3>1. Novelty &amp; Category Necessity</h3>
              <p>
                Does the fund offer exposure to a unique sector, thematic index, or long-short mandate not already well-covered by existing funds in your portfolio? Avoid duplicating categories you already own.
              </p>
            </div>
            <div className="nfo-guide-card">
              <h3>2. The &ldquo;₹10 NAV&rdquo; Fallacy</h3>
              <p>
                Never invest in an NFO simply because its NAV is ₹10. NAV is a reflection of book value per unit, not valuation. A ₹10 NAV fund has zero statistical or return advantage over an established fund with a ₹150 NAV.
              </p>
            </div>
            <div className="nfo-guide-card">
              <h3>3. Fund Manager Pedigree</h3>
              <p>
                Because an NFO has no historical track record of its own, scrutinize the lead fund manager&apos;s historical alpha, risk management track record, and style consistency across existing mandates.
              </p>
            </div>
            <div className="nfo-guide-card">
              <h3>4. Liquidity &amp; Exit Loads</h3>
              <p>
                Review the lock-in period and exit load schedule specified in the official Scheme Information Document (SID). Ensure the fund&apos;s redemption terms match your planned investment horizon.
              </p>
            </div>
          </div>

          <h2>Frequently Asked Questions (FAQs)</h2>
          <div className="nfo-faqs">
            {faqs.map((f, i) => (
              <details key={i} className="nfo-faq-item">
                <summary>{f.q}</summary>
                <div className="nfo-faq-body">{f.a}</div>
              </details>
            ))}
          </div>

          <h2>Explore Advanced Investment Tools</h2>
          <div className="nfo-tools-grid">
            <a href="/sifs" className="nfo-tool-card">
              <span>SIF Screener</span>
              <small>Explore all SEBI-regulated Specialised Investment Funds &amp; live NAVs</small>
            </a>
            <a href="/screener" className="nfo-tool-card">
              <span>MF Screener</span>
              <small>Filter 2,500+ Indian mutual funds by 1Y–5Y CAGR, risk &amp; holdings</small>
            </a>
            <a href="/proposal-studio" className="nfo-tool-card">
              <span>Proposal Studio</span>
              <small>Check portfolio overlap, sector exposure &amp; combined M-Cap allocation</small>
            </a>
            <a href="/pioneers" className="nfo-tool-card">
              <span>The 30-Year Club</span>
              <small>See how India&apos;s oldest equity funds compounded wealth across decades</small>
            </a>
            <a href="/book-consultation" className="nfo-tool-card">
              <span>Book a Consultation</span>
              <small>Speak with an AMFI-registered mutual funds &amp; SIF advisor (ARN-251838)</small>
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
