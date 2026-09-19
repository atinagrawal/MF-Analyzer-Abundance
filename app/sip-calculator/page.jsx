/**
 * app/sip-calculator/page.jsx
 *
 * Dedicated Standalone SIP Calculator Route.
 * Route: /sip-calculator
 *
 * Features:
 * - Server-side rendered (SSR) mathematical formulas & worked examples for Google Featured Snippets
 * - Interactive client component (SipCalculatorClient) for monthly SIP, Step-Up SIP %, lumpsum, and Real AMFI NAV backtesting
 * - Comprehensive JSON-LD structured data (SoftwareApplication, HowTo, FAQPage, BreadcrumbList)
 * - AMFI Registered Mutual Fund Distributor disclosures (ARN-251838)
 * - High-converting CTA funneling existing portfolio holders into CAS Tracker
 */

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SipCalculatorClient from './SipCalculatorClient';
import { getPageMeta } from '@/lib/metadata';
import './sip-calculator.css';

export const metadata = getPageMeta('sip-calculator');

const BUILD_DATE = new Date().toISOString().slice(0, 10);
const CANONICAL_URL = 'https://mfcalc.getabundance.in/sip-calculator';

function buildSipJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
          { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://mfcalc.getabundance.in/' },
          { '@type': 'ListItem', position: 3, name: 'SIP Calculator', item: CANONICAL_URL },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Abundance SIP & Step-Up Calculator',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        url: CANONICAL_URL,
        description:
          'Free mutual fund SIP calculator with annual step-up %, lumpsum comparison, and real AMFI historical NAV backtesting with XIRR. Provided by Abundance Financial Services ARN-251838.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'INR',
        },
        author: {
          '@type': 'Organization',
          name: 'Abundance Financial Services',
          url: 'https://www.getabundance.in',
        },
        dateModified: BUILD_DATE,
      },
      {
        '@type': 'HowTo',
        name: 'How to Calculate Mutual Fund SIP Returns',
        description:
          'Step-by-step method to calculate maturity wealth from a Systematic Investment Plan (SIP) in Indian mutual funds using compound interest formulas.',
        step: [
          {
            '@type': 'HowToStep',
            position: 1,
            name: 'Determine Periodic Investment (P)',
            text: 'Choose the fixed amount you intend to invest every month (e.g., ₹10,000).',
          },
          {
            '@type': 'HowToStep',
            position: 2,
            name: 'Define Investment Duration (n)',
            text: 'Calculate total monthly installments by multiplying tenure in years by 12 (e.g., 10 years × 12 = 120 installments).',
          },
          {
            '@type': 'HowToStep',
            position: 3,
            name: 'Calculate Periodic Rate (i)',
            text: 'Convert expected annual return rate (r) into periodic rate: i = (1 + r/100)^(1/12) - 1 for effective annual compounding, or r / (12 × 100) for nominal compounding.',
          },
          {
            '@type': 'HowToStep',
            position: 4,
            name: 'Apply Future Value Annuity Formula',
            text: 'Compute maturity corpus A = P × [((1 + i)^n - 1) / i] × (1 + i).',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is a Systematic Investment Plan (SIP) in mutual funds?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'A Systematic Investment Plan (SIP) is an investment vehicle offered by mutual funds that allows individuals to invest a fixed amount of money at regular intervals (usually monthly or weekly) into a selected scheme. It instills financial discipline and leverages rupee cost averaging.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the formula used to calculate SIP returns?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The standard formula for calculating the future value of a regular SIP is: A = P × [((1 + i)^n - 1) / i] × (1 + i), where A is the maturity amount, P is the monthly installment, i is the periodic interest rate, and n is the total number of monthly payments.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is a Step-Up SIP and how does it help beat inflation?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'A Step-Up SIP (or top-up SIP) automatically increases your monthly investment by a predetermined percentage or rupee amount every year (e.g., a 10% annual hike coinciding with annual salary increments). Step-Up SIP significantly accelerates wealth compounding and prevents inflation from eroding real purchasing power.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the difference between CAGR and XIRR in mutual funds?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'CAGR (Compound Annual Growth Rate) measures the annualized return between a single starting point and an ending point, suitable only for one-time lumpsum investments. XIRR (Extended Internal Rate of Return) accounts for multiple cashflows occurring at different dates, making it the mathematically accurate metric for periodic SIP investments and withdrawals.',
            },
          },
          {
            '@type': 'Question',
            name: 'How does the Abundance Real NAV Backtester differ from standard SIP calculators?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Standard SIP calculators assume a hypothetical flat annual rate of return (e.g., 12% every year). The Abundance Real NAV Backtester simulates actual monthly unit purchases against real historical AMFI NAV data for any selected Indian mutual fund, factoring in actual market crashes, bull runs, and calculating the exact realized XIRR.',
            },
          },
        ],
      },
    ],
  };
}

export default function SipCalculatorPage() {
  const jsonLd = buildSipJsonLd();

  return (
    <div className="sip-page-wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      <main className="container sip-main-content">
        {/* Breadcrumb Navigation */}
        <nav className="sip-breadcrumbs" aria-label="Breadcrumbs">
          <Link href="https://www.getabundance.in">Home</Link>
          <span className="sep">/</span>
          <Link href="/">Calculators</Link>
          <span className="sep">/</span>
          <span className="cur">SIP Calculator</span>
        </nav>

        {/* Page Hero */}
        <header className="sip-hero-header">
          <span className="sip-eyebrow">
            <span className="live-dot" /> Wealth Compounding Suite
          </span>
          <h1 className="sip-page-title">
            SIP Calculator — Systematic Investment Plan &amp; Step-Up Returns
          </h1>
          <p className="sip-page-subtitle">
            Model monthly SIPs, annual Step-Up SIP %, lumpsum growth, or test your strategy against real historical AMFI mutual fund NAVs with verified XIRR.
          </p>
        </header>

        {/* Interactive Calculator Client Component */}
        <SipCalculatorClient />

        {/* ── Mathematical Formulas for Google Featured Snippets ── */}
        <section className="sip-guide-section" id="formula">
          <h2 className="sip-section-heading">Mathematical Formula for SIP Return Calculation</h2>
          <p className="sip-guide-p">
            In Indian mutual funds, a Systematic Investment Plan (SIP) operates as an annuity due, where each monthly installment compounds until the end of the investment horizon.
          </p>

          <div className="sip-formula-card">
            <div className="formula-badge">Standard Monthly SIP Formula</div>
            <div className="formula-math mono">
              A = P × [ ((1 + i)^n - 1) / i ] × (1 + i)
            </div>
            <div className="formula-vars">
              <ul>
                <li><strong>A</strong> = Expected Maturity Amount (Future Value)</li>
                <li><strong>P</strong> = Periodic Monthly Investment Amount</li>
                <li><strong>i</strong> = Periodic Monthly Rate = <code>(1 + r/100)^(1/12) - 1</code> (Effective Annual Compounding) or <code>r / (12 × 100)</code> (Nominal Monthly Rate)</li>
                <li><strong>n</strong> = Total Number of Monthly Installments (Tenure in Years × 12)</li>
                <li><strong>r</strong> = Expected Annualized Return Rate (% p.a.)</li>
              </ul>
            </div>
          </div>

          <div className="sip-formula-card">
            <div className="formula-badge">Lumpsum Compound Interest Formula</div>
            <div className="formula-math mono">
              A = P × (1 + r/100)^t
            </div>
            <div className="formula-vars">
              <ul>
                <li><strong>A</strong> = Maturity Corpus</li>
                <li><strong>P</strong> = Initial Principal Lumpsum Investment</li>
                <li><strong>r</strong> = Annual Compounded Growth Rate (%)</li>
                <li><strong>t</strong> = Investment Tenure in Years</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Step-by-Step Worked Example ── */}
        <section className="sip-guide-section" id="worked-example">
          <h2 className="sip-section-heading">Worked Example: ₹10,000 Monthly SIP for 10 Years at 12% p.a.</h2>
          <p className="sip-guide-p">
            Let us walk through an exact calculation for an investor committing ₹10,000 per month for a duration of 10 years (120 months) at an expected annualized return of 12% p.a.
          </p>

          <div className="sip-example-box">
            <div className="example-grid">
              <div className="ex-item">
                <span className="ex-label">Monthly Installment (P)</span>
                <span className="ex-val mono">₹10,000</span>
              </div>
              <div className="ex-item">
                <span className="ex-label">Total Installments (n)</span>
                <span className="ex-val mono">120 Months (10 Years)</span>
              </div>
              <div className="ex-item">
                <span className="ex-label">Total Amount Invested</span>
                <span className="ex-val mono">₹12,00,000</span>
              </div>
              <div className="ex-item">
                <span className="ex-label">Nominal Monthly Rate (i)</span>
                <span className="ex-val mono">1.00% per month (12% / 12)</span>
              </div>
              <div className="ex-item highlight">
                <span className="ex-label">Estimated Maturity Corpus (A)</span>
                <span className="ex-val mono bold">₹23,23,391 (Nominal) / ₹22,40,359 (Effective)</span>
              </div>
              <div className="ex-item highlight">
                <span className="ex-label">Net Compounded Wealth Gain</span>
                <span className="ex-val mono gain">▲ ₹11,23,391 (+93.6% gain)</span>
              </div>
            </div>
            <p className="ex-note">
              <strong>Key Insight:</strong> Over a 10-year period, compounded gains exceed the original principal invested, illustrating the power of compounding where returns begin generating their own returns.
            </p>
          </div>
        </section>

        {/* ── Scenario Comparison Table: SIP vs Step-Up vs Lumpsum ── */}
        <section className="sip-guide-section" id="comparison-table">
          <h2 className="sip-section-heading">SIP vs 10% Step-Up SIP vs Lumpsum Comparison (12% p.a.)</h2>
          <p className="sip-guide-p">
            See how a starting monthly SIP of ₹10,000 compares against a 10% annual Step-Up SIP and a single ₹5,00,000 lumpsum investment over different horizons:
          </p>

          <div className="sip-table-responsive">
            <table className="sip-comparison-table">
              <thead>
                <tr>
                  <th>Tenure</th>
                  <th>Regular SIP (₹10k/mo)</th>
                  <th>Step-Up SIP (+10%/yr)</th>
                  <th>Lumpsum (₹5 Lakhs)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bold">5 Years</td>
                  <td>
                    Invested: ₹6.00 L<br />
                    Corpus: <strong className="mono">₹8.17 L</strong>
                  </td>
                  <td>
                    Invested: ₹7.33 L<br />
                    Corpus: <strong className="mono">₹9.65 L</strong>
                  </td>
                  <td>
                    Invested: ₹5.00 L<br />
                    Corpus: <strong className="mono">₹8.81 L</strong>
                  </td>
                </tr>
                <tr>
                  <td className="bold">10 Years</td>
                  <td>
                    Invested: ₹12.00 L<br />
                    Corpus: <strong className="mono">₹22.40 L</strong>
                  </td>
                  <td>
                    Invested: ₹19.12 L<br />
                    Corpus: <strong className="mono">₹32.69 L</strong>
                  </td>
                  <td>
                    Invested: ₹5.00 L<br />
                    Corpus: <strong className="mono">₹15.53 L</strong>
                  </td>
                </tr>
                <tr>
                  <td className="bold">15 Years</td>
                  <td>
                    Invested: ₹18.00 L<br />
                    Corpus: <strong className="mono">₹47.50 L</strong>
                  </td>
                  <td>
                    Invested: ₹38.13 L<br />
                    Corpus: <strong className="mono">₹88.58 L</strong>
                  </td>
                  <td>
                    Invested: ₹5.00 L<br />
                    Corpus: <strong className="mono">₹27.37 L</strong>
                  </td>
                </tr>
                <tr>
                  <td className="bold">20 Years</td>
                  <td>
                    Invested: ₹24.00 L<br />
                    Corpus: <strong className="mono">₹91.99 L</strong>
                  </td>
                  <td>
                    Invested: ₹68.75 L<br />
                    Corpus: <strong className="mono">₹2.17 Cr</strong>
                  </td>
                  <td>
                    Invested: ₹5.00 L<br />
                    Corpus: <strong className="mono">₹48.23 L</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── High-Converting CAS Tracker Funnel ── */}
        <section className="sip-cas-funnel">
          <div className="funnel-content">
            <span className="funnel-tag">Portfolio Diagnostic</span>
            <h2 className="funnel-title">Already Have Existing Mutual Fund Investments?</h2>
            <p className="funnel-desc">
              Don’t let hidden duplicate holdings, category overlap, and high expense ratios erode your SIP returns. Upload your Consolidated Account Statement (CAS) into Abundance CAS Tracker for an instant, confidential portfolio diagnostic across all your folios.
            </p>
            <div className="funnel-actions">
              <Link href="/cas-tracker" className="funnel-btn primary">
                Import Portfolio via CAS ↗
              </Link>
              <Link href="/compare" className="funnel-btn secondary">
                Compare Your Funds Side-by-Side
              </Link>
            </div>
          </div>
        </section>

        {/* ── Comprehensive FAQ Section ── */}
        <section className="sip-guide-section" id="faq">
          <h2 className="sip-section-heading">Frequently Asked Questions on Mutual Fund SIPs</h2>
          <div className="sip-faq-list">
            <details className="sip-faq-item" open>
              <summary className="faq-q">What is the ideal frequency for a mutual fund SIP?</summary>
              <div className="faq-a">
                <p>
                  For most salaried individuals in India, a <strong>Monthly SIP</strong> scheduled a few days after salary credit is ideal. Empirical market studies spanning 25 years of AMFI NAV data show that daily or weekly SIPs do not produce statistically superior returns compared to monthly SIPs, while adding unnecessary transaction clutter to bank statements.
                </p>
              </div>
            </details>

            <details className="sip-faq-item">
              <summary className="faq-q">Can I pause, stop, or modify my SIP anytime without penalty?</summary>
              <div className="faq-a">
                <p>
                  Yes. Mutual fund SIPs in open-ended schemes carry zero lock-in (except ELSS funds which have a statutory 3-year lock-in for Section 80C tax deduction). You can pause your SIP, increase or decrease your installment amount, or cancel it anytime without penalty.
                </p>
              </div>
            </details>

            <details className="sip-faq-item">
              <summary className="faq-q">How are mutual fund SIP gains taxed in India?</summary>
              <div className="faq-a">
                <p>
                  Under Indian income tax law, each SIP installment is treated as an independent investment with its own purchase date:
                </p>
                <ul>
                  <li><strong>Equity Mutual Funds:</strong> Units held for more than 12 months qualify as Long-Term Capital Gains (LTCG) and are taxed at 12.5% on gains exceeding ₹1.25 lakh in a financial year. Units held for 12 months or less attract Short-Term Capital Gains (STCG) tax at 20%.</li>
                  <li><strong>Debt Mutual Funds:</strong> Capital gains on debt funds acquired after April 1, 2023, are added to the investor’s taxable income and taxed at applicable income tax slab rates.</li>
                </ul>
              </div>
            </details>

            <details className="sip-faq-item">
              <summary className="faq-q">What happens if a SIP installment bounces due to insufficient funds?</summary>
              <div className="faq-a">
                <p>
                  Mutual fund houses (AMCs) do not levy any penalty if a SIP installment fails. However, your bank may charge an ECS/NACH mandate dishonor fee. If three consecutive installments fail, the AMC automatically terminates the SIP registration, but your existing invested units remain safe and continue compounding.
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* ── Statutory AMFI Distributor Citation & Disclaimer ── */}
        <section className="sip-disclosure-box">
          <p className="disc-title">Regulatory Disclosures &amp; Disclaimer</p>
          <p className="disc-text">
            This SIP Calculator is provided as a free educational and illustrative tool by <strong>Abundance Financial Services</strong> (AMFI Registered Mutual Funds Distributor, ARN-251838). Calculations and projections shown are based on mathematical compounding models and do not guarantee future returns. Mutual fund investments are subject to market risks; read all scheme-related documents carefully before investing.
          </p>
        </section>
      </main>

      <Footer activePage="calculators" />
    </div>
  );
}
