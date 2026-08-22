import WidgetsClient from './WidgetsClient';
import { getPageMeta } from '@/lib/metadata';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Link from 'next/link';

export async function generateMetadata() {
  const baseMeta = getPageMeta('widgets', {
    title: 'Free Windows 10 & 11 Desktop Widgets — Live Market Watch, Portfolio & Top Funds | Abundance',
    description: 'Install free desktop widgets for Windows 10 & 11: Live Nifty 50, Sensex, Sector Heatmap, real-time CAS portfolio tracker, and top mutual funds in a dockable mini-window. AMFI Registered Distributor ARN-251838.',
    canonicalPath: '/widgets',
  });

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Abundance Desktop Widgets',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Windows 10, Windows 11, macOS, Linux, ChromeOS, Android, iOS',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR',
      },
      featureList: [
        'Live Nifty 50, Sensex, BSE 500 & Bank Nifty Tickers',
        'Nifty 50 Advance/Decline Ratio Meter & Sector Heatmap',
        'Real-time CAS Mutual Fund & SIF Portfolio Tracker with Day\'s Gain',
        'Top 5 Performing Mutual Funds Across 9 Horizons (1M to Since Inception)',
        'Floating Pop-out Mini Companion Window for Windows 10 & 11 Desktops',
        'Seamless Passwordless Email OTP & Google 1-Tap Login',
      ],
      author: {
        '@type': 'Organization',
        name: 'Abundance Financial Services',
        url: 'https://mfcalc.getabundance.in',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to Install Abundance Market & Portfolio Widgets on Windows 10 and 11',
      description: 'Step-by-step guide to installing the PWA desktop widget suite and pinning it to your Windows taskbar.',
      step: [
        {
          '@type': 'HowToStep',
          name: 'Open in Microsoft Edge or Google Chrome',
          text: 'Navigate to mfcalc.getabundance.in/widgets in your desktop browser.',
        },
        {
          '@type': 'HowToStep',
          name: 'Click the Install App Icon',
          text: 'Click the App Available / Install icon located in the right corner of the address bar.',
        },
        {
          '@type': 'HowToStep',
          name: 'Pin to Windows Taskbar',
          text: 'Check "Pin to Taskbar" and "Create Desktop Shortcut" for instant 1-click access anytime.',
        },
        {
          '@type': 'HowToStep',
          name: 'Launch Floating Mini Window',
          text: 'Click the "❐ Mini Window" button to pop out a clean 380x640px floating borderless widget companion.',
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do I keep the live market widget floating on my Windows desktop?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Click the "❐ Mini Window" button in the top right of the widget header. It pops out as an ultra-compact 380x640px window without browser tabs or address bars that you can dock to any corner of your monitor.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I track my personal mutual fund portfolio on the desktop widget?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Sign in securely using your registered email OTP or Google account to automatically load your CAMS/KFintech CAS statement holdings, day\'s gain in rupees and percentages, and live AMFI NAV valuations.',
          },
        },
        {
          '@type': 'Question',
          name: 'How often does the live market and portfolio data refresh?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'You can configure the auto-refresh interval between 15 seconds, 30 seconds, 1 minute, 5 minutes, or manual refresh using the selector in the widget header.',
          },
        },
        {
          '@type': 'Question',
          name: 'Are Specialised Investment Funds (SIFs) supported?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, both standard SEBI mutual funds and Specialised Investment Funds (SIFs) are tracked with live valuations and daily updated NAVs.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is the Abundance Desktop Widget free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, Abundance Desktop Widgets are 100% free with no subscription fees or paywalls, provided by Abundance Financial Services (AMFI Registered Distributor ARN-251838).',
          },
        },
      ],
    },
    {
      '@context': 'https://schema.org',
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
          name: 'Tools',
          item: 'https://mfcalc.getabundance.in/screener',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Desktop Widgets',
          item: 'https://mfcalc.getabundance.in/widgets',
        },
      ],
    },
  ];

  return {
    ...baseMeta,
    other: {
      ...(baseMeta.other || {}),
      'script:ld+json': JSON.stringify(structuredData),
    },
  };
}

export default async function WidgetsPage({ searchParams }) {
  const sp = await searchParams;
  const isMini = sp?.mini === '1';

  return (
    <>
      <WidgetsClient />

      {/* ── SSR Crawlable SEO & Educational Guide Section (hidden in floating mini companion mode) ── */}
      {!isMini && (
        <section className="wdg-seo-section">
        <div className="wdg-seo-container">
          {/* Main Title & Intro */}
          <div className="wdg-seo-hero">
            <h1 className="wdg-seo-h1">
              Free Stock Market &amp; Mutual Fund Desktop Widgets for Windows 10 &amp; 11
            </h1>
            <p className="wdg-seo-sub">
              Monitor real-time Indian stock market indices (Nifty 50, Sensex, BSE 500), live sector heatmaps, 
              your personal CAMS &amp; KFintech CAS mutual fund portfolio valuation, and top-performing schemes in a lightweight, dockable desktop widget.
            </p>
          </div>

          {/* Features Deep Dive Grid */}
          <div className="wdg-seo-grid">
            <div className="wdg-seo-card">
              <div className="wdg-card-icon">📈</div>
              <h2 className="wdg-card-h2">Live Market Watch &amp; Sector Heatmap</h2>
              <p>
                Get live streaming updates for key benchmark indices including <strong>Nifty 50, S&amp;P BSE Sensex, BSE 500, Nifty Bank, Nifty Midcap 150, Nifty Smallcap 250</strong>, and <strong>India VIX</strong>. 
                Features a real-time Nifty 50 Advance/Decline ratio bar and interactive sector heatmap tiles for Banking, IT, Auto, Pharma, FMCG, Metal, Realty, and Energy.
              </p>
            </div>

            <div className="wdg-seo-card">
              <div className="wdg-card-icon">💼</div>
              <h2 className="wdg-card-h2">Real-Time CAS Portfolio Valuation</h2>
              <p>
                Securely connect your portfolio using passwordless email OTP. Tracks your consolidated account statement (CAS) 
                across all folios with <strong>daily live AMFI NAVs</strong>, today's gain/loss in rupees, total profit percentages, asset allocation breakdowns (Equity, Debt, Hybrid, SIFs), and top holdings.
              </p>
            </div>

            <div className="wdg-seo-card">
              <div className="wdg-card-icon">🏆</div>
              <h2 className="wdg-card-h2">Top Performing Funds across 9 Horizons</h2>
              <p>
                Screen leading mutual funds and Specialised Investment Funds (SIFs) filtered by category 
                (Flexi Cap, Large Cap, Mid Cap, Small Cap, Multi Cap, Hybrid, Arbitrage, Liquid) across <strong>9 distinct time horizons</strong>: 
                1M, 3M, 6M (point-to-point absolute) and 1Y, 3Y, 5Y, 7Y, 10Y, and Since Inception (annualized CAGR).
              </p>
            </div>

            <div className="wdg-seo-card">
              <div className="wdg-card-icon">❐</div>
              <h2 className="wdg-card-h2">Floating Pop-out Companion Window</h2>
              <p>
                With one click on <strong>❐ Mini Window</strong>, spawn a distraction-free <code>380×640px</code> companion window that stays anchored 
                in the corner of your screen. Perfect for multi-tasking alongside Excel spreadsheets, trading software, or daily work without cluttering browser tabs.
              </p>
            </div>
          </div>

          {/* Windows 10/11 Installation Guide */}
          <div className="wdg-guide-box">
            <h2 className="wdg-guide-title">How to Install as a Native Windows 10 &amp; 11 Desktop App</h2>
            <div className="wdg-steps-row">
              <div className="wdg-step-col">
                <div className="wdg-step-badge">1</div>
                <h3>Install via Microsoft Edge</h3>
                <p>Click the <strong>Install App</strong> icon (monitor with down arrow) in Edge's address bar $\rightarrow$ select <strong>Install</strong>.</p>
              </div>
              <div className="wdg-step-col">
                <div className="wdg-step-badge">2</div>
                <h3>Pin to Taskbar</h3>
                <p>Check <strong>Pin to Taskbar</strong> and <strong>Create Desktop Shortcut</strong> to launch live market data in 1 click anytime.</p>
              </div>
              <div className="wdg-step-col">
                <div className="wdg-step-badge">3</div>
                <h3>Pop-out Mini Window</h3>
                <p>Click the <strong>Mini Window</strong> button to dock a floating borderless companion gadget to your screen corner.</p>
              </div>
            </div>
          </div>

          {/* SEO FAQs Accordion */}
          <div className="wdg-faq-section">
            <h2 className="wdg-faq-main-title">Frequently Asked Questions</h2>
            <div className="wdg-faq-list">
              <details className="wdg-faq-item">
                <summary className="wdg-faq-q">Can I keep the live market widget floating on my desktop while I work?</summary>
                <div className="wdg-faq-a">
                  Yes! Simply click the <strong>❐ Mini Window</strong> button in the widget header. It launches a dedicated 380×640px window without browser address bars that you can position in any corner of your desktop.
                </div>
              </details>

              <details className="wdg-faq-item">
                <summary className="wdg-faq-q">How does the widget access my mutual fund portfolio?</summary>
                <div className="wdg-faq-a">
                  The widget shares your secure NextAuth authentication session from <code>mfcalc.getabundance.in</code>. If you are already logged in, it automatically loads your portfolio. If logged out, an inline email OTP verification card lets you sign in in seconds without leaving the window.
                </div>
              </details>

              <details className="wdg-faq-item">
                <summary className="wdg-faq-q">How frequently is market and NAV data updated?</summary>
                <div className="wdg-faq-a">
                  Market indices (Nifty, Sensex, Sectors) update during NSE trading hours (9:15 AM – 3:30 PM IST). Mutual fund NAVs update daily based on AMFI publication. You can adjust the widget refresh cycle from 15s to 5 minutes or trigger instant manual refresh anytime.
                </div>
              </details>

              <details className="wdg-faq-item">
                <summary className="wdg-faq-q">Is the desktop widget free to use?</summary>
                <div className="wdg-faq-a">
                  Yes. Abundance Desktop Widgets are 100% free with no subscription fees or hidden costs, provided by Abundance Financial Services (AMFI Registered Mutual Funds Distributor ARN-251838).
                </div>
              </details>
            </div>
          </div>

          {/* Related Tools Internal Links */}
          <div className="wdg-related-tools">
            <h3 className="wdg-related-title">Explore Related Financial Tools</h3>
            <div className="wdg-related-chips">
              <Link href="/market-watch" className="wdg-chip-link">📈 Live Market Watch</Link>
              <Link href="/portfolio" className="wdg-chip-link">💼 My Portfolio Dashboard</Link>
              <Link href="/cas-tracker" className="wdg-chip-link">📄 CAS Portfolio Tracker</Link>
              <Link href="/screener" className="wdg-chip-link">🔍 Mutual Fund Screener</Link>
              <Link href="/pioneers" className="wdg-chip-link">⏳ 30-Year Fund Pioneers</Link>
              <Link href="/rolling" className="wdg-chip-link">📊 Rolling Returns Analyser</Link>
              <Link href="/sifs" className="wdg-chip-link">💡 Specialised Investment Funds</Link>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* SEO Section Styles */}
      <style>{`
        .wdg-seo-section {
          background: var(--surface, #ffffff);
          border-top: 1px solid var(--border, #e2e8f0);
          padding: 48px 16px 64px;
          color: var(--text, #1e293b);
        }
        .wdg-seo-container {
          max-width: 960px;
          margin: 0 auto;
        }
        .wdg-seo-hero {
          text-align: center;
          margin-bottom: 36px;
        }
        .wdg-seo-h1 {
          font-size: clamp(1.4rem, 3.5vw, 2.2rem);
          font-weight: 900;
          color: var(--g1, #1a7a4a);
          line-height: 1.25;
          margin-bottom: 12px;
          letter-spacing: -0.5px;
        }
        .wdg-seo-sub {
          font-size: clamp(0.9rem, 2vw, 1.05rem);
          color: var(--muted, #64748b);
          max-width: 780px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .wdg-seo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        .wdg-seo-card {
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          padding: 22px 20px;
        }
        .wdg-card-icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
        .wdg-card-h2 {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text, #1e293b);
          margin-bottom: 8px;
        }
        .wdg-seo-card p {
          font-size: 0.88rem;
          color: var(--muted, #64748b);
          line-height: 1.55;
          margin: 0;
        }
        .wdg-guide-box {
          background: var(--g-xlight, #f0fdf4);
          border: 1.5px solid var(--g-light, #bbf7d0);
          border-radius: 14px;
          padding: 28px 24px;
          margin-bottom: 40px;
        }
        .wdg-guide-title {
          font-size: 1.2rem;
          font-weight: 800;
          color: var(--g1, #1a7a4a);
          margin-bottom: 20px;
          text-align: center;
        }
        .wdg-steps-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
        }
        .wdg-step-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .wdg-step-badge {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--g1, #1a7a4a);
          color: #fff;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
          font-family: JetBrains Mono, monospace;
        }
        .wdg-step-col h3 {
          font-size: 0.95rem;
          font-weight: 800;
          margin-bottom: 6px;
          color: var(--text, #1e293b);
        }
        .wdg-step-col p {
          font-size: 0.84rem;
          color: var(--muted, #64748b);
          line-height: 1.5;
          margin: 0;
        }
        .wdg-faq-section {
          margin-bottom: 40px;
        }
        .wdg-faq-main-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text, #1e293b);
          margin-bottom: 18px;
          text-align: center;
        }
        .wdg-faq-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .wdg-faq-item {
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 10px;
          padding: 14px 18px;
          transition: all .15s ease;
        }
        .wdg-faq-item[open] {
          background: var(--surface, #ffffff);
          border-color: var(--g3, #86efac);
        }
        .wdg-faq-q {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text, #1e293b);
          cursor: pointer;
          user-select: none;
        }
        .wdg-faq-a {
          font-size: 0.88rem;
          color: var(--muted, #64748b);
          line-height: 1.6;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border, #e2e8f0);
        }
        .wdg-related-tools {
          text-align: center;
          padding-top: 20px;
          border-top: 1px solid var(--border, #e2e8f0);
        }
        .wdg-related-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--muted, #64748b);
          margin-bottom: 14px;
        }
        .wdg-related-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }
        .wdg-chip-link {
          padding: 7px 14px;
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 20px;
          font-size: 0.84rem;
          font-weight: 700;
          color: var(--text, #1e293b);
          text-decoration: none;
          transition: all .15s ease;
        }
        .wdg-chip-link:hover {
          border-color: var(--g1, #1a7a4a);
          color: var(--g1, #1a7a4a);
          background: var(--g-xlight, #f0fdf4);
        }
        @media (max-width: 600px) {
          .wdg-seo-section { padding: 32px 12px 48px; }
          .wdg-seo-grid { grid-template-columns: 1fr; }
          .wdg-steps-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
