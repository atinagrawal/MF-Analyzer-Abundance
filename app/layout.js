import './globals.css';
import { SITE, SITE_NAME, THEME_COLOR } from '@/lib/metadata';
import { SpeedInsights } from '@vercel/speed-insights/next';

/**
 * app/layout.js — Root layout for the entire application
 *
 * Provides:
 * - Raleway + JetBrains Mono fonts via Google Fonts
 * - Global metadata (site name, theme color, PWA manifest, favicons)
 * - Vercel Speed Insights
 * - Google Analytics (gtag)
 *
 * Individual pages export their own metadata via getPageMeta() which
 * merges with these defaults.
 */

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: `MF Analyzer — ${SITE_NAME}`,
    template: `%s`,
  },
  description: 'Free mutual fund analysis tools — fund comparison, SIP/SWP backtester, rolling returns, industry data, and CAS portfolio tracker. By Abundance Financial Services ARN-251838.',
  applicationName: 'MF Analyzer',
  authors: [{ name: SITE_NAME, url: 'https://www.getabundance.in' }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/logo-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/logo-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/logo-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/logo-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/logo-apple.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/logo-favicon.png',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@abundancefinsvs',
  },
  other: {
    'geo.region': 'IN-UT',
    'geo.placename': 'Haldwani, Uttarakhand, India',
    'theme-color': THEME_COLOR,
  },
};

export const viewport = {
  themeColor: THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
};

// Google Analytics ID
const GA_ID = 'G-9KMZ8MS3M7';

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN" prefix="og: https://ogp.me/ns#">
      <head>
        {/* Google Fonts — Raleway (body) + JetBrains Mono (data) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

        {/* Favicon fallback for older browsers */}
        <link rel="icon" type="image/x-icon" href="https://www.getabundance.in/favicon.ico" />

        {/* Google Analytics */}
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer=window.dataLayer||[];
              function gtag(){dataLayer.push(arguments);}
              gtag('js',new Date());
              gtag('config','${GA_ID}');
            `,
          }}
        />
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
