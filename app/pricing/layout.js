import { getPageMeta } from '@/lib/metadata';
import { PRICING_FAQ } from './pricingFaq';

export const metadata = getPageMeta('pricing');

export default function PricingLayout({ children }) {
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Abundance Pro Subscription",
    "image": "https://mfcalc.getabundance.in/og-pricing.png",
    "description": "Unlock Proposal Studio, Pairwise Fund Overlap, Complete 30-100+ Stock Holdings Disclosure, AMFI Market Cap Allocation, CAS Tracker & Market Breadth.",
    "brand": {
      "@type": "Brand",
      "name": "Abundance Financial Services"
    },
    "offers": [
      {
        "@type": "Offer",
        "name": "Pro Annual Plan",
        "price": "588.82",
        "priceCurrency": "INR",
        "priceValidUntil": "2026-12-31",
        "url": "https://mfcalc.getabundance.in/pricing",
        "availability": "https://schema.org/InStock"
      },
      {
        "@type": "Offer",
        "name": "Pro Lifetime Plan",
        "price": "2358.82",
        "priceCurrency": "INR",
        "priceValidUntil": "2026-12-31",
        "url": "https://mfcalc.getabundance.in/pricing",
        "availability": "https://schema.org/InStock"
      }
    ]
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MFCalc", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "Plans & Pricing", "item": "https://mfcalc.getabundance.in/pricing" }
    ]
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": PRICING_FAQ.map((f) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      {children}
    </>
  );
}
