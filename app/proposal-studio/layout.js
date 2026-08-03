import { getPageMeta } from '@/lib/metadata';
import { PROPOSAL_STUDIO_FAQ } from '@/lib/proposalStudioFaq';

export const metadata = getPageMeta('proposalStudio');

export default function ProposalStudioLayout({ children }) {
  const webApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Proposal Studio — Mutual Fund & SIF Investment Proposal Builder",
    "url": "https://mfcalc.getabundance.in/proposal-studio",
    "description": "Build a mutual fund or SIF investment proposal with combined sector/stock exposure, fund overlap detection, and Large/Mid/Small-cap allocation using AMFI's official categorization.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "499", "priceCurrency": "INR" },
    "featureList": [
      "Combined asset allocation across multiple funds",
      "Combined sector exposure",
      "Combined stock exposure with full-holdings view",
      "Pairwise fund overlap detection (equity-only)",
      "Scheme details: category, risk rating, equity holdings count",
      "M-Cap allocation via AMFI's official Large/Mid/Small-cap categorization",
      "Import your real holdings from your CAS statement",
      "Search and add mutual funds and SIFs",
      "Lumpsum or SIP proposal modelling"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "telephone": "+919808105923",
      "description": "AMFI Registered Mutual Fund & SIF Distributor (ARN-251838)"
    }
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MFCalc", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "Proposal Studio", "item": "https://mfcalc.getabundance.in/proposal-studio" }
    ]
  };
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": PROPOSAL_STUDIO_FAQ.map((f) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApp) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      {children}
    </>
  );
}
