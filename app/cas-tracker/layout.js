import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';
import { CAS_FAQ } from './faqData';

export const metadata = getPageMeta('cas-tracker');

export default function CasTrackerLayout({ children }) {

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "FinancialProduct"],
    "name": "Abundance CAS Portfolio Tracker",
    "alternateName": "CAS Portfolio Tracker",
    "url": "https://mfcalc.getabundance.in/cas-tracker",
    "description": "Parse CAMS or KFintech Consolidated Account Statements. Track all mutual fund holdings with live AMFI NAVs, FIFO capital gains, ELSS lock-in status, SIF holdings, per-transaction NAV rate history, and multi-PAN family support.",
    "applicationCategory": "FinanceApplication",
    "applicationSubCategory": "Mutual Fund Portfolio Tracker",
    "operatingSystem": "Web Browser",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR", "availability": "https://schema.org/InStock" },
    "featureList": [
      "CAMS and KFintech CAS PDF parsing",
      "Live AMFI NAV fetching",
      "Multi-PAN family CAS support with combined family portfolio view",
      "FIFO capital gains calculation",
      "ELSS 3-year lock-in tracking",
      "Automatic SIF (Specialised Investment Fund) detection from your CAS, with live NAVs",
      "Per-transaction NAV rate chart for every holding",
      "Transmitted / inherited unit detection in transaction history",
      "PDF and Excel export of holdings",
      "Cloud-saved portfolio for registered clients",
      "Advisor and nominee extraction"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "areaServed": "IN",
      "description": "AMFI Registered Mutual Fund Distributor — ARN-251838, Haldwani, Uttarakhand"
    },
    "screenshot": "https://mfcalc.getabundance.in/og-cas.png",
    "dateModified": "2026-08-15"
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MF Calculator", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "CAS Portfolio Tracker", "item": "https://mfcalc.getabundance.in/cas-tracker" }
    ]
  };

  // Sourced from faqData.js -- the exact same list rendered as visible
  // <details> on the page itself, so this can never drift out of sync
  // with what a crawler (or a user) actually sees again.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": CAS_FAQ.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a },
    })),
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to track your mutual fund portfolio using a CAS PDF",
    "description": "Upload your CAMS or KFintech CAS to view live NAVs, FIFO gains, and ELSS lock-in status for every holding.",
    "totalTime": "PT2M",
    "step": [
      { "@type": "HowToStep", "position": 1, "name": "Download your CAS PDF", "text": "Visit camsonline.com/Investors/Statements/Consolidated-Account-Statement (or kfintech.com), choose Detailed statement type, and enter your registered email to receive a password-protected CAS PDF." },
      { "@type": "HowToStep", "position": 2, "name": "Sign in to Abundance", "text": "Sign in via Google or email magic link. Your portfolio will be saved so you never re-upload." },
      { "@type": "HowToStep", "position": 3, "name": "Upload your CAS PDF", "text": "Select the PDF and enter your PAN in ALL CAPS as the password. Click Parse & Track." },
      { "@type": "HowToStep", "position": 4, "name": "View your live portfolio", "text": "Your full mutual fund portfolio appears with live NAVs, FIFO gains, ELSS lock-in status, and per-fund performance. Click Transactions on any holding to see a rate chart of every purchase, SIP, switch, or redemption." }
    ]
  };

  return (
    <>
      <Script id="cas-software-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <Script id="cas-breadcrumb-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Script id="cas-faq-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Script id="cas-howto-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
      {children}
    </>
  );
}
