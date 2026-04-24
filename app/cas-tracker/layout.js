import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('cas-tracker');

export default function CasTrackerLayout({ children }) {

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "FinancialProduct"],
    "name": "Abundance CAS Portfolio Tracker",
    "alternateName": "CAS Portfolio Tracker",
    "url": "https://mfcalc.getabundance.in/cas-tracker",
    "description": "Parse CAMS or KFintech Consolidated Account Statements. Track all mutual fund holdings with live AMFI NAVs, FIFO capital gains, ELSS lock-in status, SIF holdings, and multi-PAN family support.",
    "applicationCategory": "FinanceApplication",
    "applicationSubCategory": "Mutual Fund Portfolio Tracker",
    "operatingSystem": "Web Browser",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR", "availability": "https://schema.org/InStock" },
    "featureList": [
      "CAMS and KFintech CAS PDF parsing",
      "Live AMFI NAV fetching",
      "Multi-PAN family CAS support",
      "FIFO capital gains calculation",
      "ELSS 3-year lock-in tracking",
      "SIF (Specialised Investment Fund) holdings with live NAVs",
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
    "screenshot": "https://mfcalc.getabundance.in/og-cas.png"
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Is it safe to upload my CAS PDF with my PAN password?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. The PDF is parsed inside an isolated serverless function and deleted immediately after. Your password is never stored. For signed-in users, only the parsed portfolio data (not the PDF) is saved privately — only you and your AMFI-registered distributor (ARN-251838) can view it." }
      },
      {
        "@type": "Question",
        "name": "What is a Consolidated Account Statement (CAS)?",
        "acceptedAnswer": { "@type": "Answer", "text": "A CAS consolidates all your mutual fund holdings across every AMC linked to your PAN. Download it from camsonline.com or kfintech.com using your PAN and registered email. Use your PAN in ALL CAPS as the PDF password." }
      },
      {
        "@type": "Question",
        "name": "Does this tool support Family CAS with multiple PANs?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. The parser detects multiple PANs in a single CAS and builds a separate dashboard tab for each family member. Switch between PANs with one click." }
      },
      {
        "@type": "Question",
        "name": "How is current mutual fund portfolio value calculated?",
        "acceptedAnswer": { "@type": "Answer", "text": "Current Value = Units x Live NAV fetched from AMFI's official NAV data, updated end-of-day and fetched fresh on each page load." }
      },
      {
        "@type": "Question",
        "name": "What is FIFO cost calculation and why does it matter for mutual funds?",
        "acceptedAnswer": { "@type": "Answer", "text": "FIFO (First In, First Out) is the SEBI-mandated method for computing capital gains on mutual fund redemptions. The tracker uses purchase history from your CAS to compute unrealised gain/loss correctly under FIFO, helping you plan redemptions tax-efficiently." }
      },
      {
        "@type": "Question",
        "name": "How does ELSS lock-in tracking work?",
        "acceptedAnswer": { "@type": "Answer", "text": "ELSS investments are locked for 3 years from each purchase date. The tracker computes the locked rupee value (still within the 3-year window) and the unlocked portion for each ELSS fund separately." }
      },
      {
        "@type": "Question",
        "name": "Which CAS formats are supported — CAMS or KFintech?",
        "acceptedAnswer": { "@type": "Answer", "text": "Both CAMS (camsonline.com) and KFintech (kfintech.com) password-protected CAS PDFs are supported. If parsing fails, ensure you are using your PAN in ALL CAPS as the password." }
      },
      {
        "@type": "Question",
        "name": "Does this support SIF (Specialised Investment Funds)?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. SIF holdings added by your distributor appear alongside mutual funds with live NAVs from AMFI's SIF endpoint. Standard CAS PDFs do not yet include SIF, so your distributor adds them manually." }
      }
    ]
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to track your mutual fund portfolio using a CAS PDF",
    "description": "Upload your CAMS or KFintech CAS to view live NAVs, FIFO gains, and ELSS lock-in status for every holding.",
    "totalTime": "PT2M",
    "step": [
      { "@type": "HowToStep", "position": 1, "name": "Download your CAS PDF", "text": "Visit camsonline.com or kfintech.com. Enter your PAN and registered email to receive a password-protected CAS PDF." },
      { "@type": "HowToStep", "position": 2, "name": "Sign in to Abundance", "text": "Sign in via Google or email magic link. Your portfolio will be saved so you never re-upload." },
      { "@type": "HowToStep", "position": 3, "name": "Upload your CAS PDF", "text": "Select the PDF and enter your PAN in ALL CAPS as the password. Click Parse & Track." },
      { "@type": "HowToStep", "position": 4, "name": "View your live portfolio", "text": "Your full mutual fund portfolio appears with live NAVs, FIFO gains, ELSS lock-in status, and per-fund performance." }
    ]
  };

  return (
    <>
      <Script id="cas-software-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <Script id="cas-faq-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Script id="cas-howto-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
      {children}
    </>
  );
}
