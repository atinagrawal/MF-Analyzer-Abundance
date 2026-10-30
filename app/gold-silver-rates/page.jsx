/**
 * app/gold-silver-rates/page.jsx
 *
 * Route: /gold-silver-rates
 *
 * Comprehensive Live Precious Metals Hub & Investment Analytics:
 *  - Indicative Live Rates for Gold (24K, 22K, 18K), Silver, Platinum & USD/INR
 *  - Interactive Jewellery Cost & 3% GST Calculator with BIS Hallmarking fees
 *  - Investment comparison: Physical Gold vs. Gold ETFs vs. Sovereign Gold Bonds (SGB) vs. Digital Gold
 *  - BIS HUID Hallmarking verification guide & consumer protection
 *  - Gold-to-Silver Ratio tracker and historical valuation context
 *  - Schema.org Structured Data (Breadcrumbs, FAQPage, FinancialProduct, ItemPage, Speakable)
 *  - Amazon Associate hallmarked physical bullion CTAs & Mutual Fund screener cross-links
 */

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import GoldSilverRatesClient from './GoldSilverRatesClient';
import { getPageMeta } from '@/lib/metadata';
import { getCachedPreciousMetalsRates } from '@/lib/preciousMetalsCache';
import './gold-silver-rates.css';

export const metadata = getPageMeta('gold-silver-rates');
export const revalidate = 180; // 3 minutes ISR cache

const CANONICAL_URL = 'https://mfcalc.getabundance.in/gold-silver-rates';

function amazonSearchUrl(query) {
  const tag = process.env.AMAZON_ASSOCIATE_TAG;
  const params = new URLSearchParams({ k: query });
  if (tag) params.set('tag', tag);
  return `https://www.amazon.in/s?${params.toString()}`;
}

const FAQS = [
  {
    q: 'What is the difference between 24K, 22K, and 18K gold rates?',
    a: '24K (999 fineness) is 99.9% pure gold, traded as bullion bars and investment coins. Because pure gold is soft, jewellery is typically crafted in 22K (91.6% purity or 916 hallmarked) or 18K (75.0% purity or 750 hallmarked). The 22K rate is calculated as 24K × (22/24) = 24K × 0.9167, while 18K is calculated as 24K × (18/24) = 24K × 0.75. 18K is the industry standard for diamond and gemstone jewellery because it offers greater tensile strength to securely hold prongs and stones.',
  },
  {
    q: 'Why do gold and silver rates differ between Indian cities like Mumbai, Delhi, and Chennai?',
    a: 'While national wholesale bullion prices are anchored to MCX spot rates and international LBMA parity, retail prices differ slightly across cities due to three factors: (1) freight and security transport costs from major import ports (Mumbai, Ahmedabad) or refineries; (2) state-level transportation logistics; and (3) regional jeweller associations (such as IBJA in Mumbai, Madras Jewellers Association in Chennai, or Delhi Bullion Association) setting daily local benchmark opening prices based on regional demand and supply.',
  },
  {
    q: 'How are making charges and GST calculated on gold jewellery in India?',
    a: 'When purchasing jewellery in India, the total price is calculated as: Net Price = (Weight in grams × Prevailing Gold Rate) + Making Charges + 3% GST on (Metal + Making Charges) + BIS Hallmarking Fee (₹45 + 18% GST = ₹53.10 per piece). Making charges typically range between 8% and 25% depending on whether the design is machine-made, handmade, antique, or temple jewellery. Note that making charges are generally unrecoverable upon resale.',
  },
  {
    q: 'What is BIS HUID hallmarking and how can I verify purity?',
    a: 'Since April 1, 2023, the Bureau of Indian Standards (BIS) mandates that all gold jewellery sold in India must carry a 6-digit alphanumeric Hallmark Unique Identification (HUID) code. A genuine hallmarked piece has three laser-etched stamps: (1) the BIS triangle logo; (2) purity and fineness mark (e.g., 22K916, 18K750, 14K585); and (3) the 6-character HUID. Consumers can download the official "BIS Care" mobile app, enter the HUID, and instantly verify the jeweller’s registration, hallmarking centre, and stamping date.',
  },
  {
    q: 'Physical Gold vs. Gold ETF vs. Sovereign Gold Bond (SGB): Which is better?',
    a: 'Physical gold provides a tangible asset for cultural use, but carries making charges (8%–25%), storage/theft risk, and resale deductions. For wealth creation, Gold ETFs and Gold Mutual Funds track gold spot prices with zero making charges, minimal expense ratios (0.1%–0.5%), instant T+1 market liquidity, and demat safety. Sovereign Gold Bonds (SGBs) issued by the RBI offer an additional 2.50% annual interest payout and complete capital gains tax exemption if held until 8-year maturity, though secondary market liquidity is lower.',
  },
  {
    q: 'How is gold taxed in India following Budget 2024?',
    a: 'Under the Finance (No. 2) Act 2024: (1) The holding period for Long-Term Capital Gains (LTCG) on physical gold and Gold ETFs/Funds was reduced from 36 months to 24 months. (2) LTCG (held > 24 months) is taxed at 12.5% without indexation benefits. (3) Short-Term Capital Gains (STCG, held ≤ 24 months) are added to your taxable income and taxed at your applicable slab rate. (4) SGB redemptions at 8-year maturity remain 100% tax-free for individual investors.',
  },
  {
    q: 'What is the Gold-to-Silver ratio and what does it tell investors?',
    a: 'The Gold-to-Silver ratio represents how many ounces (or grams) of silver it takes to purchase one ounce (or gram) of gold (calculated as Gold Price ÷ Silver Price). Historically, the ratio fluctuates between 60:1 and 85:1. When the ratio is above 80–85, silver is historically considered undervalued relative to gold. When it drops below 60, gold is considered undervalued relative to silver. Quantitative commodity investors use this ratio to rebalance between gold and silver exposures.',
  },
  {
    q: 'How often are these gold and silver rates refreshed on Abundance?',
    a: 'Rates refresh automatically from a live bullion market feed every few minutes. The page displays an active status indicator and timestamp showing the exact IST time when the figures you are viewing were updated.',
  },
];

function buildJsonLd(initialData) {
  const conversions = initialData?.conversions;
  const g24k = conversions?.gold?.['24k']?.perGram?.ask ?? 8050;
  const g22k = conversions?.gold?.['22k']?.perGram?.ask ?? 7380;
  const g18k = conversions?.gold?.['18k']?.perGram?.ask ?? 6038;
  const silverKg = (conversions?.silver?.perGram?.ask ?? 100) * 1000;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
          { '@type': 'ListItem', position: 2, name: 'Market Data', item: 'https://mfcalc.getabundance.in/' },
          { '@type': 'ListItem', position: 3, name: 'Gold & Silver Rates Today', item: CANONICAL_URL },
        ],
      },
      {
        '@type': 'ItemPage',
        name: "Today's Gold Rate & Silver Rate in India",
        description: 'Live indicative 24K, 22K, 18K gold rates per gram and 10g, silver price per kg, and jewellery GST calculator for India.',
        url: CANONICAL_URL,
        mainEntity: {
          '@type': 'FinancialProduct',
          name: 'Indicative Gold & Silver Rates India',
          provider: {
            '@type': 'FinancialService',
            name: 'Abundance Financial Services',
            url: 'https://mfcalc.getabundance.in',
            identifier: 'ARN-251838',
          },
          offers: [
            {
              '@type': 'Offer',
              name: '24 Karat Gold (999 Fine)',
              price: g24k * 10,
              priceCurrency: 'INR',
              eligibleQuantity: { '@type': 'QuantitativeValue', value: 10, unitCode: 'GRM' },
              priceValidUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              availability: 'https://schema.org/InStock',
            },
            {
              '@type': 'Offer',
              name: '22 Karat Gold (916 Hallmarked)',
              price: g22k * 10,
              priceCurrency: 'INR',
              eligibleQuantity: { '@type': 'QuantitativeValue', value: 10, unitCode: 'GRM' },
              priceValidUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              availability: 'https://schema.org/InStock',
            },
            {
              '@type': 'Offer',
              name: '18 Karat Gold (750 Fine)',
              price: g18k * 10,
              priceCurrency: 'INR',
              eligibleQuantity: { '@type': 'QuantitativeValue', value: 10, unitCode: 'GRM' },
              priceValidUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              availability: 'https://schema.org/InStock',
            },
            {
              '@type': 'Offer',
              name: 'Silver 999 Fine (1 kg)',
              price: silverKg,
              priceCurrency: 'INR',
              eligibleQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'KGM' },
              priceValidUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              availability: 'https://schema.org/InStock',
            },
          ],
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.a,
          },
        })),
      },
      {
        '@type': 'WebPage',
        url: CANONICAL_URL,
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.gsr-page-title', '.gsr-page-subtitle'],
        },
      },
    ],
  };
}

export default async function GoldSilverRatesPage() {
  let initialData = null;
  try {
    initialData = await getCachedPreciousMetalsRates();
  } catch {
    initialData = null;
  }

  const jsonLd = buildJsonLd(initialData);

  return (
    <div className="gsr-page-wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      <main className="container gsr-main-content">
        {/* Breadcrumbs */}
        <nav className="gsr-breadcrumbs" aria-label="Breadcrumbs">
          <Link href="https://www.getabundance.in">Home</Link>
          <span className="sep">/</span>
          <Link href="/">Market Data</Link>
          <span className="sep">/</span>
          <span className="cur">Gold &amp; Silver Rates</span>
        </nav>

        {/* Hero */}
        <header className="gsr-hero-header">
          <span className="gsr-eyebrow">
            <span className="live-dot" /> Live Bullion Benchmark · India
          </span>
          <h1 className="gsr-page-title">
            Gold Rate Today, Silver Rate &amp; Platinum Price in India
          </h1>
          <p className="gsr-page-subtitle">
            Live indicative bullion rates for 24K (999), 22K (916) &amp; 18K (750) gold per gram, 8g Pavan, 10g, 1 Tola &amp; 100g, Silver per kg, and USD/INR. Features an interactive jewellery GST calculator and investment comparison.
          </p>

          {/* Quick-Jump Section Navigation */}
          <div className="gsr-jump-nav" aria-label="Page navigation">
            <a href="#live-ticker" className="jump-chip">📊 Live Ticker</a>
            <a href="#jewellery-calculator" className="jump-chip">🧮 Jewellery Calculator</a>
            <a href="#gold-vs-funds" className="jump-chip">⚖️ Gold vs ETFs vs SGB</a>
            <a href="#hallmarking-guide" className="jump-chip">🔍 BIS HUID Guide</a>
            <a href="#gold-silver-ratio" className="jump-chip">📈 Gold/Silver Ratio</a>
            <a href="#faq" className="jump-chip">❓ FAQs</a>
          </div>
        </header>

        {/* ── Client Component: Live Tables, Calculator ── */}
        <section id="live-ticker">
          <GoldSilverRatesClient initialData={initialData} />
        </section>

        {/* ── Comparison Matrix: Physical vs Gold ETF vs SGB vs Digital Gold ── */}
        <section className="gsr-guide-section" id="gold-vs-funds">
          <div className="gsr-section-badge-wrap">
            <span className="gsr-badge-pill">⚖️ Investment Decision Matrix</span>
          </div>
          <h2 className="gsr-section-heading">
            Physical Gold vs. Gold ETF / Mutual Funds vs. SGB vs. Digital Gold
          </h2>
          <p className="gsr-guide-p">
            Buying physical jewellery carries substantial making charges and storage overhead. If your objective is wealth preservation and long-term portfolio returns, see how modern bullion investment options compare side-by-side:
          </p>

          <div className="gsr-table-wrap">
            <table className="gsr-table gsr-matrix-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Physical Gold (Jewellery / Coins)</th>
                  <th>Gold ETFs &amp; Mutual Funds</th>
                  <th>Sovereign Gold Bonds (SGB)</th>
                  <th>Digital Gold (Apps)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="matrix-feature">Purity Guarantee</td>
                  <td>BIS Hallmarked (916 / 999)</td>
                  <td><span className="matrix-badge best">99.5%+ Audited</span></td>
                  <td><span className="matrix-badge best">RBI Sovereign Backed</span></td>
                  <td>99.5%+ Vault Certified</td>
                </tr>
                <tr>
                  <td className="matrix-feature">Making Charges</td>
                  <td><span className="matrix-badge warn">8% to 25% (Lost on resale)</span></td>
                  <td><span className="matrix-badge best">0% (Nil)</span></td>
                  <td><span className="matrix-badge best">0% (Nil)</span></td>
                  <td>2% to 3% buy/sell spread</td>
                </tr>
                <tr>
                  <td className="matrix-feature">Additional Interest / Yield</td>
                  <td>Nil (0%)</td>
                  <td>Nil (NAV mirrors spot price)</td>
                  <td><span className="matrix-badge best">2.50% p.a. Guaranteed</span></td>
                  <td>Nil (0%)</td>
                </tr>
                <tr>
                  <td className="matrix-feature">Storage &amp; Theft Risk</td>
                  <td>Bank locker fee (₹2k–₹8k/yr) + theft risk</td>
                  <td><span className="matrix-badge best">Zero (Held in Demat / Folio)</span></td>
                  <td><span className="matrix-badge best">Zero (RBI / Demat)</span></td>
                  <td>Free for 1–5 yrs, then custodial fee</td>
                </tr>
                <tr>
                  <td className="matrix-feature">Capital Gains Tax (Finance Act 2024)</td>
                  <td>12.5% LTCG after 24 months; slab rate if ≤ 24m</td>
                  <td>12.5% LTCG after 24 months; slab rate if ≤ 24m</td>
                  <td><span className="matrix-badge best">100% TAX-FREE at 8y Maturity</span></td>
                  <td>Taxed at slab rate regardless of holding</td>
                </tr>
                <tr>
                  <td className="matrix-feature">Liquidity &amp; Redemption</td>
                  <td>Requires jeweller visit; melting loss test</td>
                  <td><span className="matrix-badge best">High (T+1 market trade / AMC redeem)</span></td>
                  <td>8-yr tenure (exit window from yr 5; secondary discount)</td>
                  <td>Online resale at prevailing dealer bid</td>
                </tr>
                <tr>
                  <td className="matrix-feature">Minimum Investment</td>
                  <td>~₹8,000+ (1 gram coin)</td>
                  <td><span className="matrix-badge best">₹100 (SIP) / ~₹65 (1 ETF unit)</span></td>
                  <td>1 gram (~₹8,000)</td>
                  <td>₹1 to ₹10</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="gsr-matrix-cta-banner">
            <div className="banner-text">
              <h4>Allocate to Gold via Regulated Mutual Funds</h4>
              <p>Explore Multi-Asset Allocation funds and Gold/Silver ETF FoFs that give you systematic, hassle-free precious metals exposure with zero locker fees.</p>
            </div>
            <div className="banner-btns">
              <Link href="/screener?category=multi-asset-allocation" className="gsr-funnel-btn primary">
                Explore Multi Asset Funds ↗
              </Link>
              <Link href="/compare" className="gsr-funnel-btn secondary">
                Compare Funds Side-by-Side
              </Link>
            </div>
          </div>
        </section>

        {/* ── Gold to Silver Ratio Section ── */}
        <section className="gsr-guide-section" id="gold-silver-ratio">
          <div className="gsr-section-badge-wrap">
            <span className="gsr-badge-pill">📈 Macro Valuation Indicator</span>
          </div>
          <h2 className="gsr-section-heading">Understanding the Gold-to-Silver Ratio</h2>
          <p className="gsr-guide-p">
            The <strong>Gold-to-Silver Ratio</strong> represents the number of silver grams (or ounces) required to purchase a single gram (or ounce) of gold at current market spot rates. It is one of the oldest macro valuation indicators tracked by bullion traders and asset allocators.
          </p>

          <div className="gsr-ratio-grid">
            <div className="gsr-ratio-box">
              <div className="ratio-level high">&gt; 80 : 1</div>
              <div className="ratio-name">Silver Undervalued</div>
              <p className="ratio-desc">
                Historically signals that silver is relatively cheap compared to gold. In past cycles, this ratio has compressed as silver outperformed gold during industrial growth and economic expansion.
              </p>
            </div>

            <div className="gsr-ratio-box">
              <div className="ratio-level norm">65 – 80 : 1</div>
              <div className="ratio-name">Historical Fair Range</div>
              <p className="ratio-desc">
                The modern 30-year equilibrium range. Both metals trade in broad parity with historical monetary and industrial supply-demand dynamics.
              </p>
            </div>

            <div className="gsr-ratio-box">
              <div className="ratio-level low">&lt; 65 : 1</div>
              <div className="ratio-name">Gold Undervalued</div>
              <p className="ratio-desc">
                Signals that gold is priced attractively relative to silver. Often observed during strong industrial commodity rallies or supply shortages in physical silver.
              </p>
            </div>
          </div>
        </section>

        {/* ── BIS Hallmarking & HUID Guide ── */}
        <section className="gsr-guide-section" id="hallmarking-guide">
          <div className="gsr-section-badge-wrap">
            <span className="gsr-badge-pill">🛡️ Consumer Protection &amp; Purity</span>
          </div>
          <h2 className="gsr-section-heading">
            BIS Hallmarking &amp; 6-Digit HUID: How to Verify Gold Purity in India
          </h2>
          <p className="gsr-guide-p">
            Under the Bureau of Indian Standards (BIS) regulations, selling non-hallmarked gold jewellery is illegal in India. Every genuine hallmarked jewellery piece must carry three distinct laser-etched marks:
          </p>

          <div className="gsr-huid-grid">
            <div className="gsr-huid-card">
              <div className="huid-step-badge">Mark 1</div>
              <div className="huid-title">BIS Logo</div>
              <div className="huid-icon">▲</div>
              <p className="huid-desc">
                The triangular BIS mark certifying that the gold has been tested and verified at an authorized Assaying and Hallmarking Centre (AHC).
              </p>
            </div>

            <div className="gsr-huid-card">
              <div className="huid-step-badge">Mark 2</div>
              <div className="huid-title">Purity &amp; Fineness</div>
              <div className="huid-icon">22K916</div>
              <p className="huid-desc">
                Specifies exact karatage and purity: <strong>24K999</strong> (99.9%), <strong>22K916</strong> (91.6%), <strong>18K750</strong> (75.0%), or <strong>14K585</strong> (58.5%).
              </p>
            </div>

            <div className="gsr-huid-card">
              <div className="huid-step-badge">Mark 3</div>
              <div className="huid-title">6-Digit HUID Code</div>
              <div className="huid-icon">#A1B2C3</div>
              <p className="huid-desc">
                A unique 6-character alphanumeric code giving complete traceability to the hallmarking centre, assay test, and registered jeweller.
              </p>
            </div>
          </div>

          <div className="gsr-huid-tip">
            <strong>How to verify on your phone:</strong> Download the official <em>BIS Care App</em> (Android/iOS) published by the Government of India, navigate to &quot;Verify HUID&quot;, and enter the 6-character code. The app will immediately show the jeweller&apos;s registration number, AHC centre, and the exact date of hallmarking.
          </div>
        </section>

        {/* ── Buy Physical: Amazon CTA ── */}
        <section className="gsr-buy-section" id="buy-physical">
          <h2 className="gsr-section-heading">Looking to Buy Physical Gold, Silver, or Platinum?</h2>
          <p className="gsr-guide-p">
            If you need physical bullion, wedding coins, or gifting bars delivered to your doorstep, explore certified hallmarked options:
          </p>
          <div className="gsr-cta-grid">
            <a className="gsr-cta-card" href={amazonSearchUrl('24k hallmarked gold coin')} target="_blank" rel="noopener noreferrer sponsored">
              <span className="gsr-cta-icon">🥇</span>
              <span className="gsr-cta-title">Gold Coins &amp; Bars</span>
              <span className="gsr-cta-desc">BIS Hallmarked 24K (999) &amp; 22K (916) options</span>
              <span className="gsr-cta-link">Shop on Amazon ↗</span>
            </a>
            <a className="gsr-cta-card" href={amazonSearchUrl('999 silver coin bar hallmarked')} target="_blank" rel="noopener noreferrer sponsored">
              <span className="gsr-cta-icon">🥈</span>
              <span className="gsr-cta-title">Silver Coins &amp; Bars</span>
              <span className="gsr-cta-desc">999 fine silver coins, bars &amp; gifting sets</span>
              <span className="gsr-cta-link">Shop on Amazon ↗</span>
            </a>
            <a className="gsr-cta-card" href={amazonSearchUrl('platinum coin bar 999')} target="_blank" rel="noopener noreferrer sponsored">
              <span className="gsr-cta-icon">⬜</span>
              <span className="gsr-cta-title">Platinum Bullion</span>
              <span className="gsr-cta-desc">999 pure platinum coins &amp; jewellery</span>
              <span className="gsr-cta-link">Shop on Amazon ↗</span>
            </a>
          </div>
          <p className="gsr-affiliate-disclosure">
            As an Amazon Associate, Abundance Financial Services earns from qualifying purchases made through the links above, at no extra cost to you.
          </p>
        </section>

        {/* ── FAQ ── */}
        <section className="gsr-guide-section" id="faq">
          <div className="gsr-section-badge-wrap">
            <span className="gsr-badge-pill">❓ Clarifications &amp; Rules</span>
          </div>
          <h2 className="gsr-section-heading">Frequently Asked Questions on Gold &amp; Silver Rates in India</h2>
          <div className="gsr-faq-list">
            {FAQS.map((item, idx) => (
              <details className="gsr-faq-item" key={item.q} open={idx === 0}>
                <summary className="faq-q">{item.q}</summary>
                <div className="faq-a">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ── Disclosure ── */}
        <section className="gsr-disclosure-box">
          <p className="disc-title">Regulatory Disclaimer &amp; Notice</p>
          <p className="disc-text">
            Rates displayed on this page are <strong>indicative bullion benchmarks only</strong>, calculated from an authorized wholesale market feed. Actual transaction prices at local jewellers or retail outlets will vary due to design-specific making charges, stone weights, hallmarking fees, and local taxes. Abundance Financial Services (AMFI-registered Mutual Fund &amp; SIF Distributor, ARN-251838) does not trade physical commodities or bullion directly; this page is published as a free public analytical service. For portfolio investments, consider SEBI-regulated Mutual Funds, Gold ETFs, or RBI Sovereign Gold Bonds. As an Amazon Associate, we earn from qualifying purchases made through the Amazon links on this page.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
