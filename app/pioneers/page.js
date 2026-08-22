import { getPageMeta } from '@/lib/metadata';
import PioneersClient from './PioneersClient';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

export const metadata = getPageMeta('pioneers');

export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

async function getVeteranFunds() {
  const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (POSTGRES_URL) {
    try {
      const client = new pg.Client({
        connectionString: POSTGRES_URL,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();

      const sql = `
        SELECT 
          code, name, amc, category, structure, nav, nav_date,
          inception_date, age_years, ret_inception,
          ret_1y, ret_3y, ret_5y, ret_7y, ret_10y, vol, max_dd
        FROM mf_screener
        WHERE inception_date <= '2006-04-01'
          AND (name NOT ILIKE '%Direct%')
          AND (name NOT ILIKE '%Dividend%' AND name NOT ILIKE '%IDCW%' OR structure = 'Growth')
        ORDER BY inception_date ASC
      `;
      const res = await client.query(sql);
      await client.end();

      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r) => ({
          ...r,
          code: String(r.code),
          inception_date: r.inception_date ? String(r.inception_date).slice(0, 10) : null,
          nav: r.nav ? parseFloat(r.nav) : null,
          age_years: r.age_years ? parseFloat(r.age_years) : null,
          ret_inception: r.ret_inception ? parseFloat(r.ret_inception) : null,
          ret_1y: r.ret_1y ? parseFloat(r.ret_1y) : null,
          ret_3y: r.ret_3y ? parseFloat(r.ret_3y) : null,
          ret_5y: r.ret_5y ? parseFloat(r.ret_5y) : null,
          ret_7y: r.ret_7y ? parseFloat(r.ret_7y) : null,
          ret_10y: r.ret_10y ? parseFloat(r.ret_10y) : null,
        }));
      }
    } catch (e) {
      console.warn('Could not load veteran funds from Postgres, falling back to data/screener.json:', e.message);
    }
  }

  // Fallback to local screener.json
  try {
    const filePath = path.join(process.cwd(), 'data', 'screener.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return (data || [])
        .filter(
          (f) =>
            f.inception_date &&
            f.inception_date <= '2006-04-01' &&
            !f.name?.includes('Direct') &&
            (!f.name?.includes('Dividend') && !f.name?.includes('IDCW') || f.structure === 'Growth')
        )
        .sort((a, b) => (a.inception_date || '').localeCompare(b.inception_date || ''));
    }
  } catch (e) {
    console.error('Error loading fallback screener data:', e.message);
  }

  return [];
}

export default async function PioneersPage() {
  const funds = await getVeteranFunds();

  // JSON-LD Schemas for Search Engines
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://mfcalc.getabundance.in',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'The 30-Year Club',
        item: 'https://mfcalc.getabundance.in/pioneers',
      },
    ],
  };

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: "The 30-Year Club: India's Oldest Mutual Funds & Decades of Wealth Creation",
    description:
      'Historical analysis and compounding track record of mutual funds in India operating for over 20 to 39 years.',
    author: {
      '@type': 'Organization',
      name: 'Abundance Financial Services',
      url: 'https://www.getabundance.in',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Abundance Financial Services',
      logo: {
        '@type': 'ImageObject',
        url: 'https://mfcalc.getabundance.in/og-mfcalc.png',
      },
    },
    mainEntityOfPage: 'https://mfcalc.getabundance.in/pioneers',
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the oldest mutual fund in India that is still active today?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The oldest surviving mutual fund scheme in India is UTI Mastershare Unit Scheme (now categorised as UTI Large Cap Fund), launched on October 15, 1986 by Unit Trust of India, running for nearly 40 continuous years.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which mutual fund scheme has given the highest returns since inception in India?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Nippon India Growth Fund (formerly Reliance Growth Fund, launched October 5, 1995) has delivered a 21.94% CAGR over 30.9 years, growing ₹10.00 at NFO into over ₹4,575.00 today (a 457x wealth multiplier).',
        },
      },
      {
        '@type': 'Question',
        name: 'What was the first private-sector mutual fund launched in India?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The first private-sector mutual fund in India was Kothari Pioneer Mutual Fund (later acquired by Franklin Templeton), launching Franklin India Bluechip and Franklin India Prima on December 1, 1993.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <PioneersClient initialFunds={funds} />
    </>
  );
}
