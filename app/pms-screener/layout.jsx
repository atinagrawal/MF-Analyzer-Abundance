/**
 * app/pms-screener/layout.jsx
 *
 * Changes:
 *  1. Dynamic data month via getLatestPmsDataDate() — no hardcoded "Feb 2026"
 *  2. OG image overridden to use /api/og-pms (dynamic branded card)
 *  3. robots: index/follow added to metadata
 *  4. FAQ data imported from lib/pmsFaq.js (single source of truth for HTML + JSON-LD)
 *  5. DataCatalog, SearchAction, datePublished all fully dynamic
 */

import { getPageMeta } from '@/lib/metadata';
import { getLatestPmsDataDate } from '@/lib/pmsDate';
import { PMS_FAQ } from '@/lib/pmsFaq';

const SITE = 'https://mfcalc.getabundance.in';
const pmsDate = getLatestPmsDataDate();
const OG_IMAGE_URL = `${SITE}/api/og-pms?month=${encodeURIComponent(pmsDate.label)}`;

// ── Next.js Metadata ─────────────────────────────────────────────────────────
// Start from shared config and override the OG image to use the dynamic card.
const _baseMeta = getPageMeta('pms-screener');
export const metadata = {
    ..._baseMeta,
    robots: { index: true, follow: true },
    openGraph: {
        ..._baseMeta.openGraph,
        images: [{
            url: OG_IMAGE_URL,
            width: 1200,
            height: 630,
            alt: 'PMS Screener India — Abundance Financial Services, APRN04279',
        }],
    },
    twitter: {
        ..._baseMeta.twitter,
        images: [OG_IMAGE_URL],
    },
};

// ── Derive current data month at server render time ─────────────────────────
const ORG_URL = 'https://www.getabundance.in';
const PAGE_URL = `${SITE}/pms-screener`;
const TODAY = new Date().toISOString().split('T')[0];

// ── JSON-LD Structured Data ──────────────────────────────────────────────────
const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [

        // ── 1. WebPage ────────────────────────────────────────────────────────
        {
            '@type': 'WebPage',
            '@id': PAGE_URL,
            name: 'PMS Screener — Compare Portfolio Management Services in India',
            description:
                `Live APMI data for 1,000+ PMS strategies in India. Compare Equity, Debt, Hybrid & Multi Asset portfolios by 1M–Inception returns, AUM, and alpha vs Nifty 50. Free HNI screener by Abundance Financial Services, APMI Registered, APRN04279. Data: ${pmsDate.label}.`,
            url: PAGE_URL,
            inLanguage: 'en-IN',
            datePublished: `${pmsDate.year}-${String(pmsDate.month).padStart(2, '0')}-01`,
            dateModified: TODAY,
            isPartOf: {
                '@type': 'WebSite',
                '@id': SITE,
                name: 'MF Analyzer — Abundance Financial Services',
                url: SITE,
                potentialAction: {
                    '@type': 'SearchAction',
                    // target uses ?q= which now syncs to URL state in page.jsx
                    target: `${SITE}/pms-screener?q={search_term_string}`,
                    'query-input': 'required name=search_term_string',
                },
            },
            publisher: { '@id': `${ORG_URL}/#organization` },
            primaryImageOfPage: {
                '@type': 'ImageObject',
                url: OG_IMAGE_URL,
                width: 1200,
                height: 630,
                caption: `PMS Screener India — ${pmsDate.label} — Abundance Financial Services, APRN04279`,
            },
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
                    { '@type': 'ListItem', position: 2, name: 'PMS Screener', item: PAGE_URL },
                ],
            },
            speakable: {
                '@type': 'SpeakableSpecification',
                cssSelector: ['h1', '.page-subtitle', '.pms-stat-strip'],
            },
            about: [
                { '@type': 'Thing', name: 'Portfolio Management Services', sameAs: 'https://en.wikipedia.org/wiki/Portfolio_management' },
                { '@type': 'Thing', name: 'APMI India', sameAs: 'https://www.apmiindia.org' },
            ],
            mentions: [
                { '@type': 'Organization', name: 'APMI India', url: 'https://www.apmiindia.org' },
                { '@type': 'Organization', name: 'SEBI', url: 'https://www.sebi.gov.in' },
            ],
        },

        // ── 2. Organization (publisher) ─────────────────────────────────────
        {
            '@type': 'Organization',
            '@id': `${ORG_URL}/#organization`,
            name: 'Abundance Financial Services',
            alternateName: ['Abundance', 'Abundance Financial'],
            url: ORG_URL,
            logo: {
                '@type': 'ImageObject',
                url: `${SITE}/logo-512.png`,
                width: 512,
                height: 512,
            },
            description:
                'SEBI-registered MF & SIF Distributor and APMI Registered Portfolio Management Services Distributor (APRN04279) based in Haldwani, Uttarakhand, India. ARN-251838.',
            contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                availableLanguage: ['English', 'Hindi'],
                areaServed: 'IN',
            },
            foundingLocation: {
                '@type': 'Place',
                name: 'Haldwani, Uttarakhand, India',
            },
            sameAs: [ORG_URL, SITE],
            identifier: [
                { '@type': 'PropertyValue', name: 'ARN', value: 'ARN-251838' },
                { '@type': 'PropertyValue', name: 'APRN', value: 'APRN04279' },
            ],
        },

        // ── 3. DataCatalog — fully dynamic ──────────────────────────────────
        {
            '@type': 'DataCatalog',
            '@id': `${PAGE_URL}#datacatalog`,
            name: `APMI India PMS Performance Data — ${pmsDate.label}`,
            description:
                `Monthly performance data for 1,000+ Discretionary Portfolio Management Services (PMS) in India. Source: Association of Portfolio Managers in India (APMI). Returns calculated using TWRR methodology, net of all fees. Data period: ${pmsDate.label}.`,
            url: PAGE_URL,
            publisher: { '@id': `${ORG_URL}/#organization` },
            license: 'https://creativecommons.org/licenses/by/4.0/',
            temporalCoverage: pmsDate.isoYearMonth,
            measurementTechnique: 'Time-Weighted Rate of Return (TWRR)',
            variableMeasured: [
                'PMS 1-Month Return',
                'PMS 3-Month Return',
                'PMS 6-Month Return',
                'PMS 1-Year Return',
                'PMS 2-Year Return',
                'PMS 3-Year Return',
                'PMS 5-Year Return',
                'PMS Since Inception Return',
                'Assets Under Management (AUM)',
            ],
            spatialCoverage: {
                '@type': 'Place',
                name: 'India',
                geo: { '@type': 'GeoCoordinates', latitude: 20.5937, longitude: 78.9629 },
            },
            creator: {
                '@type': 'Organization',
                name: 'APMI India — Association of Portfolio Managers in India',
                url: 'https://www.apmiindia.org',
            },
        },

        // ── 4. FAQPage — sourced from lib/pmsFaq.js (same data as HTML accordion) ─
        {
            '@type': 'FAQPage',
            '@id': `${PAGE_URL}#faq`,
            mainEntity: PMS_FAQ.map(item => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: item.a,
                },
            })),
        },

    ],
};

export default function PMSScreenerLayout({ children }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {children}
        </>
    );
}
