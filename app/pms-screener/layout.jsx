import { getPageMeta } from '@/lib/metadata';

// ── Next.js Metadata (title, OG, Twitter, canonical, hreflang) ──────────────
export const metadata = getPageMeta('pms-screener');

// ── JSON-LD Structured Data ──────────────────────────────────────────────────
// Schema.org @graph with:
//   WebPage + BreadcrumbList
//   Organization (publisher)
//   DataCatalog (data tool signal for Google)
//   FAQPage (rich snippet target — 6 common HNI questions)
//   SpeakableSpecification (Google Assistant / voice search)
const SITE = 'https://mfcalc.getabundance.in';
const ORG_URL = 'https://www.getabundance.in';
const PAGE_URL = `${SITE}/pms-screener`;
const TODAY = new Date().toISOString().split('T')[0];

const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
        // ── 1. WebPage ────────────────────────────────────────────────────────
        {
            '@type': 'WebPage',
            '@id': PAGE_URL,
            name: 'PMS Screener — Compare Portfolio Management Services in India',
            description:
                'Live APMI data for 1,176+ PMS strategies in India. Compare Equity, Debt, Hybrid & Multi Asset portfolios by 1M–Inception returns, AUM, and alpha vs Nifty 50. Free HNI screener by Abundance Financial Services, APMI Registered, APRN04279.',
            url: PAGE_URL,
            inLanguage: 'en-IN',
            datePublished: '2026-02-01',
            dateModified: TODAY,
            isPartOf: {
                '@type': 'WebSite',
                '@id': SITE,
                name: 'MF Analyzer — Abundance Financial Services',
                url: SITE,
                potentialAction: {
                    '@type': 'SearchAction',
                    target: `${SITE}/pms-screener?q={search_term_string}`,
                    'query-input': 'required name=search_term_string',
                },
            },
            publisher: { '@id': `${ORG_URL}/#organization` },
            primaryImageOfPage: {
                '@type': 'ImageObject',
                url: `${SITE}/og-pms-screener.png`,
                width: 1200,
                height: 630,
                caption:
                    'PMS Screener India — Abundance Financial Services, APMI Registered, APRN04279',
            },
            breadcrumb: {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    {
                        '@type': 'ListItem',
                        position: 1,
                        name: 'Home',
                        item: SITE,
                    },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        name: 'PMS Screener',
                        item: PAGE_URL,
                    },
                ],
            },
            speakable: {
                '@type': 'SpeakableSpecification',
                cssSelector: ['h1', '.page-subtitle', '.pms-stat-strip'],
            },
            about: [
                {
                    '@type': 'Thing',
                    name: 'Portfolio Management Services',
                    sameAs: 'https://en.wikipedia.org/wiki/Portfolio_management',
                },
                {
                    '@type': 'Thing',
                    name: 'APMI India',
                    sameAs: 'https://www.apmiindia.org',
                },
            ],
            mentions: [
                { '@type': 'Organization', name: 'APMI India', url: 'https://www.apmiindia.org' },
                { '@type': 'Organization', name: 'SEBI', url: 'https://www.sebi.gov.in' },
            ],
        },

        // ── 2. Organization (publisher) ───────────────────────────────────────
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
                'SEBI-registered MF & SIF Distributor and APMI Registered Portfolio Manager Distributor (APRN04279) based in Haldwani, Uttarakhand, India. ARN-251838.',
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
            sameAs: [
                ORG_URL,
                SITE,
            ],
            identifier: [
                { '@type': 'PropertyValue', name: 'ARN', value: 'ARN-251838' },
                { '@type': 'PropertyValue', name: 'APRN', value: 'APRN04279' },
            ],
        },

        // ── 3. DataCatalog ────────────────────────────────────────────────────
        {
            '@type': 'DataCatalog',
            '@id': `${PAGE_URL}#datacatalog`,
            name: 'APMI India PMS Performance Data — February 2026',
            description:
                'Monthly performance data for 1,176+ Discretionary Portfolio Management Services (PMS) in India. Source: Association of Portfolio Managers in India (APMI). Returns calculated using TWRR methodology, net of all fees.',
            url: PAGE_URL,
            publisher: { '@id': `${ORG_URL}/#organization` },
            license: 'https://creativecommons.org/licenses/by/4.0/',
            temporalCoverage: '2026-02',
            measurementTechnique: 'Time-Weighted Rate of Return (TWRR)',
            variableMeasured: [
                'PMS 1-Month Return',
                'PMS 3-Month Return',
                'PMS 6-Month Return',
                'PMS 1-Year Return',
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

        // ── 4. FAQPage ────────────────────────────────────────────────────────
        {
            '@type': 'FAQPage',
            '@id': `${PAGE_URL}#faq`,
            mainEntity: [
                {
                    '@type': 'Question',
                    name: 'What is a PMS (Portfolio Management Service) in India?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'A Portfolio Management Service (PMS) is a SEBI-regulated investment vehicle where a professional portfolio manager invests on behalf of high-net-worth individuals (HNIs). Minimum investment in a PMS is ₹50 Lakhs (₹50,00,000) as per SEBI regulations. Unlike mutual funds, PMS strategies are customized and hold securities directly in the investor\'s demat account.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'How is PMS performance data sourced on this screener?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'All performance data is sourced directly from APMI India (Association of Portfolio Managers in India), the official SEBI-recognised industry body for PMS. Returns are calculated using Time-Weighted Rate of Return (TWRR), net of all management fees and expenses, as mandated by SEBI. Abundance Financial Services (APRN04279) is an APMI Registered Portfolio Manager Distributor.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'How many PMS strategies are tracked on this screener?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'This screener tracks 1,176+ Discretionary PMS strategies across Equity, Debt, Hybrid, and Multi Asset categories as of February 2026. By default, strategies from providers where all strategies have AUM below ₹50 Crores (Equity) or ₹10 Crores (Debt/Hybrid/Multi Asset) are hidden to focus on established, liquid strategies. Users can toggle "All Funds" to view all strategies.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'What is the minimum investment for a PMS in India?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'As per SEBI (Securities and Exchange Board of India) regulations, the minimum investment amount for a Portfolio Management Service (PMS) in India is ₹50 Lakhs (₹50,00,000). This threshold was revised upward from ₹25 Lakhs in 2019 to ensure PMS products remain accessible primarily to sophisticated high-net-worth investors.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'What is the difference between PMS and Mutual Funds in India?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Key differences: (1) Minimum investment — PMS requires ₹50L vs no minimum for mutual funds. (2) Customization — PMS portfolios are tailored to individual clients whereas mutual funds are pooled. (3) Ownership — In PMS, securities are held in the investor\'s own demat account; in mutual funds, investors hold units. (4) Fees — PMS charges management fees (typically 1–2.5% pa) plus performance fees; mutual funds charge expense ratios. (5) Transparency — PMS provides complete portfolio visibility.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'How can I compare PMS strategies on Abundance?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Use the compare checkboxes (⚖) on each row in the PMS Screener table. Select up to 3 strategies — a floating green bar will appear at the bottom. Click "Compare Now" to open a side-by-side comparison showing returns across all time horizons (1M to Inception), alpha vs Nifty 50, AUM, and a ₹50L wealth simulation for each strategy. This feature is completely free and requires no login.',
                    },
                },
            ],
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
