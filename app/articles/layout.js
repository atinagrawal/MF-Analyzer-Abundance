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
      "@type": "Organization",
      "name": "Abundance Financial Services",
      "url": "https://mfcalc.getabundance.in",
      "identifier": "ARN-251838",
      "sameAs": [
        "https://twitter.com/abundancefinsvs",
        "https://www.linkedin.com/company/abundance-financial-services"
      ]
    },
    "about": [
      {
        "@type": "Thing",
        "name": "Mutual funds in India",
        "sameAs": "https://en.wikipedia.org/wiki/Mutual_funds_in_India"
      },
      {
        "@type": "Thing",
        "name": "Securities and Exchange Board of India",
        "sameAs": "https://en.wikipedia.org/wiki/Securities_and_Exchange_Board_of_India"
      }
    ],
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": [".art-hero"]
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
