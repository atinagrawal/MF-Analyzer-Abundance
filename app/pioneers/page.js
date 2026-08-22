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
          text: 'The oldest surviving mutual fund scheme in India is UTI Mastershare Unit Scheme (now categorised as UTI Large Cap Fund), which was launched on October 15, 1986 by Unit Trust of India. It has been operating continuously for nearly 40 years.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which mutual fund scheme has given the highest returns since inception in India?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Nippon India Growth Fund (formerly Reliance Growth Fund, launched on October 5, 1995) holds the record for the highest compounded wealth creation among 30+ year veteran schemes, delivering a 21.94% CAGR over 30.9 years. Its NAV grew from ₹10.00 at NFO to over ₹4,575.00 today (a 457x wealth multiplier).',
        },
      },
      {
        '@type': 'Question',
        name: 'What was the first private-sector mutual fund launched in India?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The first private-sector mutual fund in India was Kothari Pioneer Mutual Fund (a joint venture between Chennai’s Kothari Group and Pioneer Group, USA, later acquired by Franklin Templeton in 2002). Its flagship funds—Franklin India Bluechip Fund and Franklin India Prima Fund—were launched on December 1, 1993.',
        },
      },
      {
        '@type': 'Question',
        name: 'What happened to US-64 and the original Unit Trust of India (UTI)?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Unit Scheme 1964 (US-64) was India’s first scheme in 1964 under a statutory government monopoly. Following the 2001–2002 UTI restructuring, US-64 was bifurcated into SUUTI (Special Undertaking of UTI) and UTI Mutual Fund, leaving UTI Mastershare (1986) as the oldest continuous open-ended scheme.',
        },
      },
      {
        '@type': 'Question',
        name: 'If I had invested ₹10,000 in India’s top mutual funds in 1995, what would it be worth in 2026?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '₹10,000 invested at NFO in Nippon India Growth Fund grew to ₹45.75 Lakhs (21.94% CAGR); in HDFC Flexi Cap Fund grew to ₹20.82 Lakhs (18.35% CAGR); in ABSL Equity Hybrid \'95 Fund grew to ₹15.68 Lakhs (17.39% CAGR); compared to ~₹2.1 Lakhs in Gold and ~₹1.0 Lakh in Fixed Deposits.',
        },
      },
      {
        '@type': 'Question',
        name: 'Have any Indian equity mutual funds ever delivered negative returns over a 20-year holding period?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Historically in India, no diversified equity mutual fund held continuously for 20 years has ever delivered a negative return or trailed inflation. Over 20-year horizons, equity mutual fund returns have consistently stayed between 11% and 22% annualised CAGR.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are older mutual funds (30+ years) safer or better to invest in than new NFOs?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Older funds offer the distinct advantage of a proven 30-year track record navigating multiple extreme market cycles (1997 Asian crisis, 2000 tech crash, 2008 GFC, 2020 Covid), whereas NFOs have no verifiable track record.',
        },
      },
      {
        '@type': 'Question',
        name: 'How did mutual funds calculate and publish NAVs before the 2006 electronic system?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Prior to AMFI’s central digital portal launch in April 2006, mutual fund NAVs were published daily in major financial newspapers like The Economic Times and Business Standard. Investors held physical paper unit certificates (similar to share certificates) until the demat and registrar digital revolution simplified electronic tracking.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does a 30-year SIP return compare against a 30-year lumpsum in Indian funds?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'A ₹5,000 monthly SIP over 30 years (₹18 Lakhs total investment) compounded at 16% CAGR grew to ~₹3.8 Crore, proving that systematic disciplined investing delivers generational wealth without needing market timing.',
        },
      },
      {
        '@type': 'Question',
        name: 'Where can I track live portfolio holdings, rolling returns, and stress tests of these 30-year veteran schemes?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'On this platform, click on any fund name in the directory to view its dedicated analytics page, or analyze multi-period rolling return consistency directly on the Rolling Returns Calculator at https://mfcalc.getabundance.in/rolling and filter live portfolios on the Mutual Fund Screener at https://mfcalc.getabundance.in/screener.',
        },
      },
    ],
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Top 10 Oldest Mutual Funds in India',
    itemListElement: (funds || []).slice(0, 10).map((f, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: f.name,
      url: `https://mfcalc.getabundance.in/fund/${f.code}`,
      description: `${f.age_years} years track record since ${f.inception_date}. Inception CAGR: ${f.ret_inception || '—'}%. Current NAV: ₹${f.nav}.`,
    })),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />

      <PioneersClient initialFunds={funds} />
    </>
  );
}
