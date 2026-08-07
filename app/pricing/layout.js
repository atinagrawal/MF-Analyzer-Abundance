import { getPageMeta } from '@/lib/metadata';
import { PRICING_FAQ } from './pricingFaq';

export const metadata = getPageMeta('pricing');

export default function PricingLayout({ children }) {
  const returnPolicy = {
    "@type": "MerchantReturnPolicy",
    "applicableCountry": "IN",
    "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
    "merchantReturnDays": 1,
    "returnMethod": "https://schema.org/ReturnByMail",
    "returnFees": "https://schema.org/FreeReturn"
  };

  const digitalShipping = {
    "@type": "OfferShippingDetails",
    "shippingRate": {
      "@type": "MonetaryAmount",
      "value": "0",
      "currency": "INR"
    },
    "shippingDestination": {
      "@type": "DefinedRegion",
      "addressCountry": "IN"
    },
    "deliveryTime": {
      "@type": "ShippingDeliveryTime",
      "handlingTime": {
        "@type": "QuantitativeValue",
        "minValue": 0,
        "maxValue": 0,
        "unitCode": "DAY"
      },
      "transitTime": {
        "@type": "QuantitativeValue",
        "minValue": 0,
        "maxValue": 0,
        "unitCode": "DAY"
      }
    }
  };

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
    "sku": "ABUNDANCE-PRO-SUB",
    "mpn": "ARN-251838-PRO",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "128",
      "bestRating": "5",
      "worstRating": "1"
    },
    "review": [
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Rajesh Kumar (MFD)" },
        "datePublished": "2026-01-15",
        "reviewBody": "Proposal Studio and Fund Overlap analysis saved me hours when creating mutual fund proposals for my clients.",
        "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" }
      },
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Ananya Sharma" },
        "datePublished": "2026-02-01",
        "reviewBody": "Seeing complete portfolio holdings beyond top 10 and CAS statement XIRR in one place is fantastic.",
        "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" }
      }
    ],
    "offers": [
      {
        "@type": "Offer",
        "name": "Pro Annual Plan",
        "price": "588.82",
        "priceCurrency": "INR",
        "validFrom": "2026-01-01",
        "priceValidUntil": "2026-12-31",
        "url": "https://mfcalc.getabundance.in/pricing",
        "availability": "https://schema.org/InStock",
        "hasMerchantReturnPolicy": returnPolicy,
        "shippingDetails": digitalShipping
      },
      {
        "@type": "Offer",
        "name": "Pro Lifetime Plan",
        "price": "2358.82",
        "priceCurrency": "INR",
        "validFrom": "2026-01-01",
        "priceValidUntil": "2026-12-31",
        "url": "https://mfcalc.getabundance.in/pricing",
        "availability": "https://schema.org/InStock",
        "hasMerchantReturnPolicy": returnPolicy,
        "shippingDetails": digitalShipping
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
