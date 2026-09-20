'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { SpeedInsights } from '@vercel/speed-insights/next';
import ClosingBell from '@/components/ClosingBell';

const GA_ID = 'G-9KMZ8MS3M7';

/**
 * SiteChrome
 *
 * Renders global site-wide client scripts and chrome:
 * - Vercel Speed Insights
 * - ClosingBell bar and market-hours poller
 * - Razorpay checkout script
 * - Google Analytics (gtag.js)
 *
 * Suppressed entirely on /embed/* routes to ensure lightweight,
 * privacy-respecting embeds without leaking scripts or third-party trackers.
 */
export default function SiteChrome() {
  const pathname = usePathname();

  // Strip all site chrome on iframe embed routes
  if (pathname?.startsWith('/embed/')) {
    return null;
  }

  return (
    <>
      <SpeedInsights />
      <ClosingBell />

      {/* Razorpay checkout — used on pricing + market-breadth's upgrade gate */}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      {/* Google Analytics — execute on the client */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());
            gtag('config','${GA_ID}');
          `,
        }}
      />
    </>
  );
}
