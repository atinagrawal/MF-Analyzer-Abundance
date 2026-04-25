/**
 * app/portfolio/layout.js
 *
 * SEO: This page IS crawlable — logged-out users see a rich landing/gate
 * section (features, benefits, distributor info) which Google can index.
 * Personal portfolio data is never exposed to logged-out users.
 *
 * OG image: /api/og-portfolio (edge-rendered branded card)
 */

export const metadata = {
  title: 'My Portfolio — Track Your Mutual Funds | Abundance Financial Services',
  description: 'Your personal mutual fund portfolio dashboard. Track holdings across all AMCs with live AMFI NAVs, FIFO capital gains, ELSS 3-year lock-in status, SIF holdings, family CAS support, and a FIFO redemption planner. Free for clients of Abundance Financial Services (ARN-251838).',
  keywords: 'mutual fund portfolio tracker India, live NAV portfolio, FIFO capital gains calculator, ELSS lock-in tracker, family CAS multi PAN, SIF holdings tracker, Abundance Financial Services, ARN-251838, CAMS KFintech portfolio',
  robots: {
    index:     true,    // allow indexing — logged-out users see the gate, not personal data
    follow:    true,
    noarchive: true,    // don't cache the page (personal auth state changes)
  },
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/portfolio',
  },
  openGraph: {
    title: 'My Portfolio — Track Your Mutual Funds | Abundance',
    description: 'Free mutual fund portfolio tracker. Live AMFI NAVs, FIFO gains, ELSS lock-in, SIF holdings, and family CAS with multi-PAN support. By Abundance Financial Services, ARN-251838.',
    url: 'https://mfcalc.getabundance.in/portfolio',
    images: [{
      url:    'https://mfcalc.getabundance.in/api/og-portfolio',
      width:  1200,
      height: 630,
      alt:    'Abundance Portfolio Dashboard — Your Wealth, Beautifully Organised',
    }],
    siteName: 'Abundance MF Analyzer',
    type:     'website',
    locale:   'en_IN',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'My Portfolio — Abundance MF Analyzer',
    description: 'Track your mutual fund portfolio with live NAVs, FIFO gains, ELSS lock-in, SIF holdings and family CAS multi-PAN support.',
    images:      ['https://mfcalc.getabundance.in/api/og-portfolio'],
  },
};

export default function PortfolioLayout({ children }) {
  return children;
}
