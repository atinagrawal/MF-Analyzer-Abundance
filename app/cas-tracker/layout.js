import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('cas-tracker');

export default function CasTrackerLayout({ children }) {
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "FinancialProduct"],
    "name": "Abundance CAS Portfolio Tracker",
    "url": "https://mfcalc.getabundance.in/cas-tracker",
    "description": "Parse CAMS/KFintech Consolidated Account Statements locally. Track multi-PAN mutual fund holdings using FIFO accounting and AMFI live NAVs.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "WebBrowser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR"
    },
    "featureList": [
      "100% Local PDF Parsing",
      "Multi-PAN Family CAS Support",
      "Live AMFI NAV Fetching",
      "FIFO Capital Gains Calculation",
      "ELSS Lock-in Tracking",
      "Advisor & Nominee Extraction"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in"
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Is it safe to upload my CAS PDF with my PAN password?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. The decryption and parsing are done entirely in temporary, isolated serverless functions. We never store your PDF, your password, or your portfolio data."
        }
      },
      {
        "@type": "Question",
        "name": "Does this tool support Family CAS with multiple PANs?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Absolutely. Our engine automatically detects different PANs and builds a segregated dashboard with clickable tabs for each family member."
        }
      }
    ]
  };

  return (
    <>
      <Script
        id="software-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {children}
    </>
  );
}
