import { getPageMeta } from '@/lib/metadata';
import { getNfoData } from '@/lib/nfoData';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import NfoFilterTabs from './NfoFilterTabs';

export const metadata = getPageMeta('nfo');
export const revalidate = 3600;

export default async function NfoPage() {
  const data = await getNfoData();

  // Computed once, server-side, and threaded down as a plain prop so both
  // server-render and client-hydration read the exact same value -- avoids
  // a hydration mismatch on the "Closes in Nd" chips (see Fix 5, final
  // review) that would otherwise recur around the UTC/IST date-rollover
  // window whenever this 1h-cached HTML is served across midnight.
  const today = new Date().toISOString().split('T')[0];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'New Fund Offers (NFO) — Live Tracker',
    description: 'Every mutual fund and SIF New Fund Offer currently open for subscription in India, sourced from AMFI.',
    url: 'https://mfcalc.getabundance.in/nfo',
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar activePage="nfo" />
      <main className="nfo-page container">
        <header className="nfo-hero">
          <h1>New Fund Offers (NFO)</h1>
          <p className="nfo-hero-sub">
            Every mutual fund and SIF currently open for subscription in India — sourced directly from AMFI.
            {data.syncedAt && (
              <> Last updated {new Date(data.syncedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.</>
            )}
          </p>
        </header>
        <NfoFilterTabs
          mf={(data.mf || []).filter((e) => e.status === 'open')}
          sif={(data.sif || []).filter((e) => e.status === 'open')}
          today={today}
        />
      </main>
      <Footer />
    </>
  );
}
