import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('mfc-portfolio');

export default function MfcPortfolioLayout({ children }) {
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "FinancialProduct"],
    "name": "Abundance MF Central Portfolio Tracker",
    "url": "https://mfcalc.getabundance.in/mfc-portfolio",
    "description": "Upload your MF Central Detailed CAS PDF for an instant live-NAV portfolio view. No password required — covers all AMCs across CAMS and KFintech.",
    "applicationCategory": "FinanceApplication",
    "applicationSubCategory": "Mutual Fund Portfolio Tracker",
    "operatingSystem": "Web Browser",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR", "availability": "https://schema.org/InStock" },
    "featureList": [
      "MF Central Detailed CAS PDF parsing",
      "No password required",
      "Live AMFI NAV fetching for all holdings",
      "Covers CAMS and KFintech AMCs",
      "Portfolio consolidated by ISIN across folios"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "areaServed": "IN",
      "description": "AMFI Registered Mutual Fund Distributor — ARN-251838, Haldwani, Uttarakhand"
    }
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to view your MF Central portfolio with live NAVs",
    "description": "Upload your MF Central Detailed CAS PDF to see all mutual fund holdings with live AMFI NAVs.",
    "totalTime": "PT2M",
    "step": [
      { "@type": "HowToStep", "position": 1, "name": "Visit MF Central", "text": "Go to app.mfcentral.com and log in with your PAN and registered mobile OTP." },
      { "@type": "HowToStep", "position": 2, "name": "Download your statement", "text": "Navigate to Statements → Consolidated Account Statement, select Detailed type, and download as PDF." },
      { "@type": "HowToStep", "position": 3, "name": "Upload the PDF", "text": "Drop the PDF on this page — no password needed." },
      { "@type": "HowToStep", "position": 4, "name": "View live portfolio", "text": "Your full portfolio appears instantly with live AMFI NAVs for each scheme." }
    ]
  };

  return (
    <>
      <Script id="mfc-software-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <Script id="mfc-howto-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
      {children}
    </>
  );
}
