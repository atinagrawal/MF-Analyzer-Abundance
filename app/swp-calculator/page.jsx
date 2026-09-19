/**
 * app/swp-calculator/page.jsx
 *
 * Dedicated Standalone SWP Calculator Route.
 * Route: /swp-calculator
 *
 * Features:
 * - Server-side rendered (SSR) mathematical formulas & worked examples for Google Featured Snippets
 * - Interactive client component (SwpCalculatorClient) with corpus longevity fuel gauge, delay/accumulation phase, and Real AMFI NAV backtesting
 * - Comprehensive JSON-LD structured data (SoftwareApplication, HowTo, FAQPage, BreadcrumbList)
 * - AMFI Registered Mutual Fund Distributor disclosures (ARN-251838)
 * - High-converting CTA funneling retirement planners into CAS Tracker
 */

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SwpCalculatorClient from './SwpCalculatorClient';
import { getPageMeta } from '@/lib/metadata';
import './swp-calculator.css';

export const metadata = getPageMeta('swp-calculator');

const BUILD_DATE = new Date().toISOString().slice(0, 10);
const CANONICAL_URL = 'https://mfcalc.getabundance.in/swp-calculator';

function buildSwpJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
          { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://mfcalc.getabundance.in/' },
          { '@type': 'ListItem', position: 3, name: 'SWP Calculator', item: CANONICAL_URL },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Abundance SWP & Real NAV Backtester',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        url: CANONICAL_URL,
        description:
          'Free Systematic Withdrawal Plan (SWP) calculator with corpus longevity analysis, delay phase compounding, and real AMFI historical NAV backtesting with XIRR. Provided by Abundance Financial Services ARN-251838.',
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
        name: 'How to Plan Retirement Income Using a Systematic Withdrawal Plan',
        description:
          'Step-by-step guide to calculating sustainable monthly withdrawals from a mutual fund corpus using SWP and growing annuity formulas.',
        step: [
          {
            '@type': 'HowToStep',
            position: 1,
            name: 'Assess Total Starting Corpus',
            text: 'Determine your total accumulated investable surplus available for retirement cashflows (e.g. ₹50 Lakhs).',
          },
          {
            '@type': 'HowToStep',
            position: 2,
            name: 'Establish Required Monthly Cashflow',
            text: 'Define your desired monthly living expenses, adjusting for other income sources such as pensions or rental income.',
          },
          {
            '@type': 'HowToStep',
            position: 3,
            name: 'Calculate Safe Withdrawal Rate (SWR)',
            text: 'Verify that your annual withdrawal does not exceed 6% to 8% of starting corpus to prevent capital depletion over a 20+ year horizon.',
          },
          {
            '@type': 'HowToStep',
            position: 4,
            name: 'Simulate Longevity & Real NAV Historical Returns',
            text: 'Run month-by-month cashflow simulations incorporating step-up rates for inflation and test against historical AMFI NAV cycles.',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is a Systematic Withdrawal Plan (SWP) in mutual funds?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'A Systematic Withdrawal Plan (SWP) allows an investor to redeem a specific, predetermined amount from their mutual fund corpus at regular intervals (monthly, quarterly, or annually). The remaining balance continues to stay invested in the market and earn compounding returns.',
            },
          },
          {
            '@type': 'Question',
            name: 'Why is an SWP more tax-efficient than bank Fixed Deposit (FD) interest or dividends?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'In bank FDs, the entire interest payout is taxed every year at your marginal income tax slab rate (up to 30%+ surcharge). In contrast, each SWP redemption consists partly of principal and partly of capital gains; only the capital gain portion is taxed. In equity mutual funds, long-term capital gains are taxed at a preferential rate of 12.5% (with the first ₹1.25 lakh tax-free every year).',
            },
          },
          {
            '@type': 'Question',
            name: 'What is a Safe Withdrawal Rate (SWR) in India?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'In India, where long-term inflation averages 5% to 6%, a safe initial withdrawal rate from a well-diversified equity/hybrid portfolio is typically 6% to 7% of starting corpus per annum. For instance, on a ₹50 Lakh corpus, withdrawing ₹25,000 to ₹30,000 per month (6% to 7.2% p.a.) allows the corpus to easily outlast a 20-30 year retirement while supporting periodic step-ups.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the mathematical formula for SWP corpus longevity?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'For fixed withdrawals without step-up, the present value of required corpus is PV = (W / r) × [1 - (1 + r)^(-n)], where W is periodic withdrawal, r is periodic rate, and n is total periods. For inflation-indexed step-up withdrawals, the growing annuity formula is used: PV = [W / (r - g)] × [1 - ((1 + g)/(1 + r))^n], where g is the step-up rate.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the Abundance SWP Real NAV Backtester?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The Abundance SWP Real NAV Backtester replays actual historical unit redemptions against real daily/monthly NAV records from AMFI. It reveals how an SWP would have actually survived through major market crashes (such as 2008 or 2020) on specific funds, and computes the exact realized XIRR on cashflows.',
            },
          },
        ],
      },
    ],
  };
}

export default function SwpCalculatorPage() {
  const jsonLd = buildSwpJsonLd();

  return (
    <div className="swp-page-wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      <main className="container swp-main-content">
        {/* Breadcrumb Navigation */}
        <nav className="swp-breadcrumbs" aria-label="Breadcrumbs">
          <Link href="https://www.getabundance.in">Home</Link>
          <span className="sep">/</span>
          <Link href="/">Calculators</Link>
          <span className="sep">/</span>
          <span className="cur">SWP Calculator</span>
        </nav>

        {/* Hero Header */}
        <header className="swp-hero-header">
          <span className="swp-eyebrow">
            <span className="live-dot" /> Retirement Cashflow Engine
          </span>
          <h1 className="swp-page-title">
            SWP Calculator — Systematic Withdrawal Plan &amp; Real NAV Backtester
          </h1>
          <p className="swp-page-subtitle">
            Plan tax-efficient retirement cashflows, analyze corpus longevity runways, model pre-retirement accumulation phases, or replay actual historical AMFI mutual fund NAVs with verified XIRR.
          </p>
        </header>

        {/* Interactive Client Component */}
        <SwpCalculatorClient />

        {/* ── Mathematical Formulas for Google Featured Snippets ── */}
        <section className="swp-guide-section" id="formula">
          <h2 className="swp-section-heading">Mathematical Formulas for SWP &amp; Longevity Analysis</h2>
          <p className="swp-guide-p">
            A Systematic Withdrawal Plan functions mathematically as a reverse annuity. While an investor redeems fixed or growing cashflows, the remaining capital earns compound returns.
          </p>

          <div className="swp-formula-card">
            <div className="formula-badge">Growing Annuity Present Value (Step-Up SWP)</div>
            <div className="formula-math mono">
              PV = [ W / (r - g) ] × [ 1 - ((1 + g) / (1 + r))^n ]
            </div>
            <div className="formula-vars">
              <ul>
                <li><strong>PV</strong> = Required Starting Corpus to fund withdrawals</li>
                <li><strong>W</strong> = Initial Annual / Periodic Withdrawal Amount</li>
                <li><strong>r</strong> = Expected Periodic Return Rate = <code>(1 + Annual Rate/100)^(1/freq) - 1</code></li>
                <li><strong>g</strong> = Annual Step-Up / Growth Rate to offset inflation</li>
                <li><strong>n</strong> = Total Number of Withdrawal Periods (Years × Frequency)</li>
              </ul>
            </div>
          </div>

          <div className="swp-formula-card">
            <div className="formula-badge">Perpetual Sustainable Withdrawal Formula</div>
            <div className="formula-math mono">
              W_perpetual = (Corpus × r) / 12
            </div>
            <div className="formula-vars">
              <ul>
                <li><strong>W_perpetual</strong> = Maximum monthly payout that leaves original principal 100% intact indefinitely</li>
                <li><strong>Corpus</strong> = Total initial investment value</li>
                <li><strong>r</strong> = Annualized portfolio return rate (% p.a. / 100)</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Step-by-Step Worked Example ── */}
        <section className="swp-guide-section" id="worked-example">
          <h2 className="swp-section-heading">Worked Example: ₹50 Lakh Corpus with ₹30,000 Monthly Withdrawal (10% Return, 20 Years)</h2>
          <p className="swp-guide-p">
            Here is an exact simulation of a retiree investing ₹50,00,000 in a balanced hybrid or flexi-cap mutual fund portfolio delivering an assumed 10% p.a. return, withdrawing ₹30,000 per month for 20 years:
          </p>

          <div className="swp-example-box">
            <div className="example-grid">
              <div className="ex-item">
                <span className="ex-label">Initial Corpus</span>
                <span className="ex-val mono">₹50,00,000</span>
              </div>
              <div className="ex-item">
                <span className="ex-label">Monthly Withdrawal</span>
                <span className="ex-val mono">₹30,000 / month</span>
              </div>
              <div className="ex-item">
                <span className="ex-label">Total Withdrawn (20Y)</span>
                <span className="ex-val mono">₹72,00,000 (240 payouts)</span>
              </div>
              <div className="ex-item">
                <span className="ex-label">Annual Withdrawal Yield</span>
                <span className="ex-val mono">7.20% p.a. (₹3.60 L / ₹50 L)</span>
              </div>
              <div className="ex-item highlight">
                <span className="ex-label">Surplus Remaining Corpus</span>
                <span className="ex-val mono bold">₹1,20,89,723 (₹1.21 Cr)</span>
              </div>
              <div className="ex-item highlight">
                <span className="ex-label">Total Wealth Created</span>
                <span className="ex-val mono gain">₹1,92,89,723 (3.86x Multiple)</span>
              </div>
            </div>
            <p className="ex-note">
              <strong>Key Insight:</strong> Because the withdrawal rate (7.20%) was lower than the portfolio return rate (10.0%), the investor withdrew ₹72 Lakhs in tax-advantaged income <em>and</em> still left an estate of ₹1.21 Crores for their heirs.
            </p>
          </div>
        </section>

        {/* ── SWP vs Traditional Annuity / Fixed Deposit Table ── */}
        <section className="swp-guide-section" id="comparison-table">
          <h2 className="swp-section-heading">SWP vs Bank Fixed Deposit vs Life Insurance Annuity</h2>
          <p className="swp-guide-p">
            How a mutual fund Systematic Withdrawal Plan compares against traditional Indian retirement income instruments:
          </p>

          <div className="swp-table-responsive">
            <table className="swp-comparison-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Mutual Fund SWP</th>
                  <th>Bank Fixed Deposit (FD)</th>
                  <th>LIC / Insurance Annuity</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bold">Tax Efficiency</td>
                  <td>
                    <strong className="text-good">Highly Tax-Advantaged:</strong> Only capital gains component is taxed. LTCG in equity at 12.5% (first ₹1.25L tax-free/yr).
                  </td>
                  <td>
                    <strong className="text-bad">High Tax Drag:</strong> 100% of interest payout added to income and taxed at slab rates (up to 30%+).
                  </td>
                  <td>
                    <strong className="text-bad">Fully Taxable:</strong> Annuity pension received is treated as ordinary income and taxed at slab rates.
                  </td>
                </tr>
                <tr>
                  <td className="bold">Capital Appreciation</td>
                  <td>
                    <strong className="text-good">Yes:</strong> Portfolio continues to compound; surplus corpus can grow significantly above initial investment.
                  </td>
                  <td>
                    <strong className="text-bad">None:</strong> Principal remains flat while real purchasing power decays due to inflation.
                  </td>
                  <td>
                    <strong className="text-bad">None:</strong> In standard annuity without return of purchase price, capital is surrendered permanently.
                  </td>
                </tr>
                <tr>
                  <td className="bold">Inflation Protection</td>
                  <td>
                    <strong className="text-good">High:</strong> Equity exposure outpaces inflation; supports annual step-up withdrawal increases.
                  </td>
                  <td>
                    <strong className="text-bad">Zero:</strong> Fixed monthly interest loses 5-6% real purchasing value every year.
                  </td>
                  <td>
                    <strong className="text-bad">Zero to Low:</strong> Fixed monthly annuity payout offers no relief against escalating healthcare and living costs.
                  </td>
                </tr>
                <tr>
                  <td className="bold">Liquidity &amp; Access</td>
                  <td>
                    <strong className="text-good">100% Liquid:</strong> Withdraw lumpsum amounts anytime, pause or cancel without lock-in penalties.
                  </td>
                  <td>
                    <strong>Moderate:</strong> Premature withdrawal penalties apply (typically 0.5% - 1.0% interest cut).
                  </td>
                  <td>
                    <strong className="text-bad">Zero:</strong> Irrevocable contract; funds cannot be withdrawn once annuity commences.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── High-Converting CAS Tracker Funnel ── */}
        <section className="swp-cas-funnel">
          <div className="funnel-content">
            <span className="funnel-tag">Retirement Portfolio Health Check</span>
            <h2 className="funnel-title">Structuring Your Portfolio for Sustainable SWP Withdrawals?</h2>
            <p className="funnel-desc">
              A successful SWP requires a resilient asset allocation split between equity compounding engines and liquid debt reserves to mitigate sequence-of-returns risk. Upload your CAS statement into Abundance CAS Tracker to verify asset allocation and portfolio overlap across all your folios.
            </p>
            <div className="funnel-actions">
              <Link href="/cas-tracker" className="funnel-btn primary">
                Import Portfolio via CAS ↗
              </Link>
              <Link href="/sip-calculator" className="funnel-btn secondary">
                Open SIP Calculator
              </Link>
            </div>
          </div>
        </section>

        {/* ── Comprehensive FAQ Section ── */}
        <section className="swp-guide-section" id="faq">
          <h2 className="swp-section-heading">Frequently Asked Questions on Systematic Withdrawal Plans</h2>
          <div className="swp-faq-list">
            <details className="swp-faq-item" open>
              <summary className="faq-q">What is sequence-of-returns risk in SWP and how can I protect against it?</summary>
              <div className="faq-a">
                <p>
                  Sequence-of-returns risk refers to the danger of market crashes occurring in the first few years of retirement. If an investor withdraws money while fund NAVs are deeply depressed, they are forced to redeem more units, permanently impairing the portfolio&apos;s compounding base. To protect against this, advisors recommend a <strong>bucket strategy</strong>: keep 2–3 years of living expenses in liquid or low-duration debt funds for SWP payouts, while the rest remains invested in equity funds to ride out market corrections.
                </p>
              </div>
            </details>

            <details className="swp-faq-item">
              <summary className="faq-q">Can an SWP last forever without depleting the initial corpus?</summary>
              <div className="faq-a">
                <p>
                  Yes. If your annual withdrawal rate is strictly lower than the long-term compound return rate of the fund, the corpus will not only last indefinitely but will also grow over time. For example, withdrawing 6% per annum from a fund compounding at 10% leaves a 4% surplus every year that continuously expands your capital base.
                </p>
              </div>
            </details>

            <details className="swp-faq-item">
              <summary className="faq-q">How does taxation work on each monthly SWP redemption?</summary>
              <div className="faq-a">
                <p>
                  Each monthly SWP installment operates under the <strong>FIFO (First-In, First-Out)</strong> tax principle. Only the capital gains on the specific units redeemed are taxable. For equity funds held for more than 12 months, long-term capital gains (LTCG) are taxed at 12.5%, with the first ₹1.25 lakh of total gains across all equity redemptions exempt each financial year.
                </p>
              </div>
            </details>

            <details className="swp-faq-item">
              <summary className="faq-q">Can I increase my monthly SWP amount to keep pace with inflation?</summary>
              <div className="faq-a">
                <p>
                  Yes. Many AMCs provide an annual Step-Up SWP feature where withdrawals automatically increase by a chosen percentage (e.g. 5% or 7% per year) on each anniversary, ensuring your retirement purchasing power remains intact throughout your retirement.
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* ── Regulatory Disclosures & Disclaimer ── */}
        <section className="swp-disclosure-box">
          <p className="disc-title">Regulatory Disclosures &amp; Disclaimer</p>
          <p className="disc-text">
            This SWP Calculator is provided as an informational and educational tool by <strong>Abundance Financial Services</strong> (AMFI Registered Mutual Funds Distributor, ARN-251838). Projections and backtests are simulated based on historical AMFI NAV data and mathematical annuity formulas and do not constitute investment advice or guaranteed future returns. Mutual fund investments are subject to market risks; consult your financial advisor before initiating withdrawals.
          </p>
        </section>
      </main>

      <Footer activePage="calculators" />
    </div>
  );
}
