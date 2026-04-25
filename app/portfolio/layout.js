/**
 * app/portfolio/layout.js
 *
 * Portfolio page is authenticated-only.
 * No indexing — private user data.
 * OG image: /api/og-portfolio (edge-rendered branded card)
 */

export const metadata = {
  title: 'My Portfolio — Abundance Financial Services',
  description: 'Your personal mutual fund portfolio. Live AMFI NAVs, FIFO capital gains, ELSS lock-in status, SIF holdings, and redemption planning — all in one secure dashboard by Abundance Financial Services (ARN-251838).',
  keywords: 'mutual fund portfolio tracker, live NAV, FIFO gains, ELSS lock-in, SIF holdings, Abundance Financial Services, ARN-251838',
  robots: { index: false, follow: false, noarchive: true },
  openGraph: {
    title: 'My Portfolio — Abundance Financial Services',
    description: 'Track your mutual fund portfolio with live NAVs, FIFO gains, ELSS lock-in, and SIF holdings. Managed by Abundance Financial Services, ARN-251838.',
    images: [{
      url: 'https://mfcalc.getabundance.in/api/og-portfolio',
      width: 1200,
      height: 630,
      alt: 'Abundance Portfolio Dashboard',
    }],
    siteName: 'Abundance MF Analyzer',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'My Portfolio — Abundance Financial Services',
    description: 'Mutual fund portfolio tracker with live NAVs, FIFO gains, ELSS lock-in, and SIF holdings.',
    images: ['https://mfcalc.getabundance.in/api/og-portfolio'],
  },
};

export default function PortfolioLayout({ children }) {
  return children;
}
