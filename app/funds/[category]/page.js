import { notFound } from 'next/navigation';
import Link from 'next/link';
import pool from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { CURATED_CATEGORIES } from '@/app/screener/screenerContent';

export const revalidate = 86400; // 24 hours

export async function generateMetadata({ params }) {
  const { category } = await params;
  const entry = CURATED_CATEGORIES.find((c) => c.slug === category);

  if (!entry) {
    return { title: 'Category Funds | Abundance' };
  }

  const title = `Best ${entry.label} Mutual Funds in India — List & Analytics | Abundance`;
  const description = `Compare all ${entry.label} mutual funds in India. ${entry.metaBlurb} View fund facts, minimum investment, exit load, holdings & stress test data on Abundance.`;
  const url = `https://mfcalc.getabundance.in/funds/${category}`;

  return {
    title,
    description,
    keywords: `${entry.label} mutual funds, best ${entry.label} funds India, SEBI ${entry.label} category, compare ${entry.label} funds`,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CategoryIndexPage({ params }) {
  const { category } = await params;
  const entry = CURATED_CATEGORIES.find((c) => c.slug === category);

  if (!entry) {
    notFound();
  }

  const { rows } = await pool.query(
    `SELECT code, name, amc, nav, nav_date, inception_date, structure
     FROM mf_screener WHERE category = $1 ORDER BY name ASC`,
    [entry.category]
  ).catch(() => ({ rows: [] }));

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 72px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--g1)', marginBottom: 6 }}>
            SEBI Category Directory
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.3 }}>
            {entry.label} Mutual Funds in India
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.86rem', lineHeight: 1.6, margin: 0 }}>
            {entry.explainer}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((f) => (
            <Link
              key={f.code}
              href={`/fund/${f.code}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                background: 'var(--s2)',
                border: '1.5px solid var(--border)',
                borderRadius: 12,
                textDecoration: 'none',
                color: 'var(--text)',
                transition: 'border-color .15s ease',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--text)', marginBottom: 4 }}>{f.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: '.74rem', display: 'flex', gap: 10 }}>
                  <span>{f.amc}</span>
                  {f.nav != null && <span>• NAV ₹{Number(f.nav).toFixed(4)}</span>}
                  {f.inception_date && <span>• Since {new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>}
                </div>
              </div>
              <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--g1)', flexShrink: 0, marginLeft: 12 }}>
                View report →
              </span>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 28, padding: '16px 20px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          Showing <strong>{rows.length}</strong> {entry.label} schemes registered with SEBI &amp; AMFI. Click any fund to view its minimum investment, exit load, RTA, portfolio holdings, stress test, and complete analytics on Abundance Pro.
        </div>
      </main>
      <Footer />
    </>
  );
}
