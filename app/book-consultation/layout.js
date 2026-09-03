import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';
import { BOOK_CONSULTATION_FAQ } from './faqData';

export const metadata = getPageMeta('book-consultation');

export default function BookConsultationLayout({ children }) {

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Mutual Fund & Investment Advisory Consultation",
    "name": "Free Mutual Fund Consultation",
    "description": "A free 30-minute, no-obligation call covering mutual funds, SIP, SWP, tax-efficient investing, goal planning, SIF, and PMS — for investors across India.",
    "url": "https://mfcalc.getabundance.in/book-consultation",
    "areaServed": "IN",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR", "availability": "https://schema.org/InStock" },
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "areaServed": "IN",
      "description": "AMFI Registered Mutual Fund Distributor — ARN-251838, APMI Registered PMS Distributor — APRN04279, Haldwani, Uttarakhand",
      "telephone": "+91-98081-05923",
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MF Calculator", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "Book a Consultation", "item": "https://mfcalc.getabundance.in/book-consultation" }
    ]
  };

  // Sourced from faqData.js -- the exact same list rendered as visible
  // <details> on the page itself, so this can never drift out of sync
  // with what a crawler (or a user) actually sees.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": BOOK_CONSULTATION_FAQ.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a },
    })),
  };

  return (
    <>
      <Script id="bc-service-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <Script id="bc-breadcrumb-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Script id="bc-faq-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      {children}
    </>
  );
}
