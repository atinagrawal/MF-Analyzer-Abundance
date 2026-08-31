import { notFound } from 'next/navigation';
import Markdown from 'react-markdown';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ARTICLES, PILLARS, getArticleBySlug } from '@/lib/articles';
import { getArticleBody } from '@/lib/articlesContent';
import '../articles.css';

export const dynamic = 'force-static';

const SITE = 'https://mfcalc.getabundance.in';

function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) {
    return { title: 'Article Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const url = `${SITE}/articles/${article.slug}`;
  const ogImage = article.image ? `${SITE}${article.image}` : `${SITE}/api/og-article?title=${encodeURIComponent(article.title)}&pillar=${encodeURIComponent(PILLARS[article.pillar])}`;
  const title = `${article.title} | Abundance`;

  return {
    title,
    description: article.description,
    authors: [{ name: 'Atin Kumar Agrawal' }],
    creator: 'Abundance Financial Services',
    publisher: 'Abundance Financial Services',
    robots: { index: true, follow: true },
    metadataBase: new URL(SITE),
    alternates: {
      canonical: url,
      languages: { 'en-IN': url, 'x-default': url },
    },
    openGraph: {
      type: 'article',
      siteName: 'Abundance Financial Services',
      title,
      description: article.description,
      url,
      locale: 'en_IN',
      images: [{ url: ogImage, width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@abundancefinsvs',
      title,
      description: article.description,
      images: [ogImage],
    },
  };
}

export default async function ArticlePage({ params }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const body = getArticleBody(article);
  const publishedDate = article.publishedDate;
  const url = `${SITE}/articles/${article.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    url,
    datePublished: publishedDate,
    dateModified: publishedDate,
    author: {
      "@type": "Person",
      name: "Atin Kumar Agrawal",
      jobTitle: "AMFI Registered Mutual Funds & SIF Distributor (ARN-251838)",
    },
    publisher: {
      "@type": "FinancialService",
      name: "Abundance Financial Services",
      url: "https://www.getabundance.in",
      identifier: "ARN-251838",
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "Articles", item: `${SITE}/articles` },
      { "@type": "ListItem", position: 3, name: article.title, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <Navbar />

      <div className="container art-detail-hero">
        <a href="/articles" className="art-back">← All articles</a>
        <div className="art-detail-pillar">{PILLARS[article.pillar]}</div>
        <h1 className="art-detail-title">{article.title}</h1>
        <div className="art-byline">
          <b>Atin Kumar Agrawal</b>
          <span className="art-byline-dot">·</span>
          <span>Abundance Financial Services</span>
          <span className="art-byline-dot">·</span>
          <span>ARN-251838</span>
          <span className="art-byline-dot">·</span>
          <time dateTime={publishedDate}>{formatDate(publishedDate)}</time>
        </div>
        <img
          className="art-hero-image"
          src={article.image || `/api/og-article?title=${encodeURIComponent(article.title)}&pillar=${encodeURIComponent(PILLARS[article.pillar])}`}
          width={1200}
          height={630}
          alt={article.title}
        />
      </div>

      <div className="container">
        <div className="art-body">
          <Markdown>{body}</Markdown>
        </div>

        <div className="art-cta">
          <span className="art-cta-text">Want this looked at for your own portfolio?</span>
          <a href="/book-consultation" className="art-cta-btn">Book a free consultation →</a>
        </div>
      </div>

      <Footer />
    </>
  );
}
