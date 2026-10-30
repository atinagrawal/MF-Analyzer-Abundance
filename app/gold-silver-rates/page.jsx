/**
 * app/gold-silver-rates/page.jsx
 *
 * Route: /gold-silver-rates
 *
 * Live indicative Gold/Silver/Platinum rates -- an SEO/traffic play
 * (these are extremely high-volume searches) that also ties into the
 * site's wealth-creation positioning (physical bullion vs. funds) and
 * carries Amazon affiliate "buy physical" CTAs for visitors who land
 * here wanting to purchase rather than invest.
 *
 * Data: lib/preciousMetalsCache.js (server-side cache, 3 min TTL) --
 * the server fetches this directly for first paint, and the client
 * component polls /api/precious-metals-rates (same cache) afterward.
 * Source attribution: rates come from a third-party bullion dealer's
 * public rate ticker but are shown only as "Indicative" per product
 * decision -- the source is deliberately not named on this page.
 */

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import GoldSilverRatesClient from './GoldSilverRatesClient';
import { getPageMeta } from '@/lib/metadata';
import { getCachedPreciousMetalsRates } from '@/lib/preciousMetalsCache';
import './gold-silver-rates.css';

export const metadata = getPageMeta('gold-silver-rates');
export const revalidate = 180;

const CANONICAL_URL = 'https://mfcalc.getabundance.in/gold-silver-rates';

function amazonSearchUrl(query) {
  const tag = process.env.AMAZON_ASSOCIATE_TAG;
  const params = new URLSearchParams({ k: query });
  if (tag) params.set('tag', tag);
  return `https://www.amazon.in/s?${params.toString()}`;
}

function buildJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
          { '@type': 'ListItem', position: 2, name: 'Market Data', item: 'https://mfcalc.getabundance.in/' },
          { '@type': 'ListItem', position: 3, name: 'Gold & Silver Rates', item: CANONICAL_URL },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is the difference between 22K and 24K gold rate?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '24K (999 fine) gold is ~99.9% pure and is the rate quoted on bullion/commodity markets. 22K (916) gold is 91.6% pure -- the standard purity for most Indian gold jewellery -- so its rate is calculated as the 24K rate × 0.916. Jewellery purchases also add making charges and GST on top of this metal rate.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is the gold rate shown here the same as my local jeweller’s price?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'No. The rates on this page are indicative bullion-market rates for the metal itself, updated continuously. Your local jeweller’s final price will differ due to making charges, wastage, GST, and local market premiums, which vary by jeweller and design.',
            },
          },
          {
            '@type': 'Question',
            name: 'Should I buy physical gold/silver or invest via a mutual fund / Gold ETF?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Physical gold/silver gives you a tangible asset but carries making charges, storage and purity-verification concerns, and is harder to liquidate in small amounts. Gold ETFs and Gold/Multi Asset mutual funds track the metal price closely, trade in small denominations, have no storage risk, and are more tax-efficient for most investors. Many investors use physical gold for personal/cultural use and funds for the investment portion of their portfolio.',
            },
          },
          {
            '@type': 'Question',
            name: 'How often are these gold and silver rates updated?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The rates refresh roughly every few minutes from a live market feed. A small "Updated" timestamp on the page shows exactly when the figures you’re viewing were last refreshed.',
            },
          },
        ],
      },
    ],
  };
}

export default async function GoldSilverRatesPage() {
  let initialData = null;
  try {
    initialData = await getCachedPreciousMetalsRates();
  } catch {
    initialData = null; // client component shows its own "temporarily unavailable" state and keeps polling
  }

  const jsonLd = buildJsonLd();

  return (
    <div className="gsr-page-wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      <main className="container gsr-main-content">
        <nav className="gsr-breadcrumbs" aria-label="Breadcrumbs">
          <Link href="https://www.getabundance.in">Home</Link>
          <span className="sep">/</span>
          <Link href="/">Market Data</Link>
          <span className="sep">/</span>
          <span className="cur">Gold &amp; Silver Rates</span>
        </nav>

        <header className="gsr-hero-header">
          <span className="gsr-eyebrow">
            <span className="live-dot" /> Live Market Rates
          </span>
          <h1 className="gsr-page-title">Gold Rate Today, Silver Rate &amp; Platinum Price in India</h1>
          <p className="gsr-page-subtitle">
            Live indicative rates for gold, silver and platinum — per gram, 8 gram, 10 gram and 1 tola, in 22K &amp; 24K, plus the live USD/INR rate. Refreshes automatically.
          </p>
        </header>

        <GoldSilverRatesClient initialData={initialData} />

        {/* ── Buy Physical: Amazon CTA ── */}
        <section className="gsr-buy-section" id="buy-physical">
          <h2 className="gsr-section-heading">Want to Buy Physical Gold, Silver or Platinum?</h2>
          <p className="gsr-guide-p">
            If you&apos;re looking to purchase physical bullion or coins rather than invest via a fund, here are hallmarked options available for home delivery:
          </p>
          <div className="gsr-cta-grid">
            <a className="gsr-cta-card" href={amazonSearchUrl('24k hallmarked gold coin')} target="_blank" rel="noopener noreferrer sponsored">
              <span className="gsr-cta-icon">🥇</span>
              <span className="gsr-cta-title">Gold Coins &amp; Bars</span>
              <span className="gsr-cta-desc">BIS Hallmarked, 24K &amp; 22K options</span>
              <span className="gsr-cta-link">Shop on Amazon ↗</span>
            </a>
            <a className="gsr-cta-card" href={amazonSearchUrl('999 silver coin bar hallmarked')} target="_blank" rel="noopener noreferrer sponsored">
              <span className="gsr-cta-icon">🥈</span>
              <span className="gsr-cta-title">Silver Coins &amp; Bars</span>
              <span className="gsr-cta-desc">999 fine silver, BIS Hallmarked</span>
              <span className="gsr-cta-link">Shop on Amazon ↗</span>
            </a>
            <a className="gsr-cta-card" href={amazonSearchUrl('platinum coin bar 999')} target="_blank" rel="noopener noreferrer sponsored">
              <span className="gsr-cta-icon">⬜</span>
              <span className="gsr-cta-title">Platinum</span>
              <span className="gsr-cta-desc">999 fine platinum coins &amp; jewellery</span>
              <span className="gsr-cta-link">Shop on Amazon ↗</span>
            </a>
          </div>
          <p className="gsr-affiliate-disclosure">
            As an Amazon Associate, Abundance Financial Services earns from qualifying purchases made through the links above, at no extra cost to you.
          </p>
        </section>

        {/* ── Physical vs Funds: wealth-creation cross-link ── */}
        <section className="gsr-guide-section" id="physical-vs-funds">
          <h2 className="gsr-section-heading">Physical Gold/Silver vs. Investing Through Funds</h2>
          <p className="gsr-guide-p">
            Buying physical gold or silver gives you a tangible asset, but it comes with making charges, purity-verification concerns, and storage/insurance to think about. If your goal is wealth creation rather than personal or cultural use, Gold ETFs and Multi Asset Allocation mutual funds track the metal price closely, trade in small denominations with no storage risk, and are generally more tax-efficient and liquid.
          </p>
          <div className="gsr-funnel">
            <div className="gsr-funnel-content">
              <span className="gsr-funnel-tag">Wealth Creation</span>
              <h3 className="gsr-funnel-title">Compare Gold-Exposed Mutual Funds</h3>
              <p className="gsr-funnel-desc">
                See how Multi Asset Allocation funds — which hold a mix of equity, debt and gold/commodities — have actually performed, side-by-side with real historical data.
              </p>
              <div className="gsr-funnel-actions">
                <Link href="/screener?category=multi-asset-allocation" className="gsr-funnel-btn primary">
                  Explore Multi Asset Funds ↗
                </Link>
                <Link href="/compare" className="gsr-funnel-btn secondary">
                  Compare Funds Side-by-Side
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="gsr-guide-section" id="faq">
          <h2 className="gsr-section-heading">Frequently Asked Questions</h2>
          <div className="gsr-faq-list">
            <details className="gsr-faq-item" open>
              <summary className="faq-q">What is the difference between 22K and 24K gold rate?</summary>
              <div className="faq-a">
                <p>
                  24K (999 fine) gold is ~99.9% pure and is the rate quoted on bullion/commodity markets. 22K (916) gold is 91.6% pure — the standard purity for most Indian gold jewellery — so its rate is calculated as the 24K rate × 0.916. Jewellery purchases also add making charges and GST on top of this metal rate.
                </p>
              </div>
            </details>
            <details className="gsr-faq-item">
              <summary className="faq-q">Is the gold rate shown here the same as my local jeweller&apos;s price?</summary>
              <div className="faq-a">
                <p>
                  No. The rates on this page are indicative bullion-market rates for the metal itself, updated continuously. Your local jeweller&apos;s final price will differ due to making charges, wastage, GST, and local market premiums, which vary by jeweller and design.
                </p>
              </div>
            </details>
            <details className="gsr-faq-item">
              <summary className="faq-q">Should I buy physical gold/silver or invest via a mutual fund / Gold ETF?</summary>
              <div className="faq-a">
                <p>
                  Physical gold/silver gives you a tangible asset but carries making charges, storage and purity-verification concerns, and is harder to liquidate in small amounts. Gold ETFs and Gold/Multi Asset mutual funds track the metal price closely, trade in small denominations, have no storage risk, and are more tax-efficient for most investors. Many investors use physical gold for personal/cultural use and funds for the investment portion of their portfolio.
                </p>
              </div>
            </details>
            <details className="gsr-faq-item">
              <summary className="faq-q">How often are these gold and silver rates updated?</summary>
              <div className="faq-a">
                <p>
                  The rates refresh roughly every few minutes from a live market feed. A small &quot;Updated&quot; timestamp on the page shows exactly when the figures you&apos;re viewing were last refreshed.
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* ── Disclosure ── */}
        <section className="gsr-disclosure-box">
          <p className="disc-title">Disclaimer</p>
          <p className="disc-text">
            Rates shown on this page are <strong>indicative only</strong>, sourced from a third-party market feed, and may differ from actual transaction prices at any dealer or jeweller due to making charges, taxes, and local premiums. Abundance Financial Services (AMFI Registered Mutual Funds Distributor, ARN-251838) does not buy, sell, or facilitate trading in physical gold, silver or platinum, and this page is provided for informational purposes only, not as investment advice for commodities. As an Amazon Associate, we earn from qualifying purchases made through the Amazon links on this page.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
