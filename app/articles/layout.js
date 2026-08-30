import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('articles');

export default function ArticlesLayout({ children }) {
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Articles | Abundance Financial Services",
    "url": "https://mfcalc.getabundance.in/articles",
    "description": "Honest, practical mutual fund and investing articles from an AMFI Registered Mutual Funds & SIF Distributor — ARN-251838.",
    "isPartOf": {
      "@type": "WebSite",
      "name": "Abundance MF Calculator",
      "url": "https://mfcalc.getabundance.in"
    },
    "publisher": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "identifier": "ARN-251838"
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      {children}
    </>
  );
}
