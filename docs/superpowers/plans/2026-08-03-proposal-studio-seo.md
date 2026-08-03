# Proposal Studio SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/proposal-studio` indexable and competitively positioned: metadata + sitemap registration, `WebApplication`/`BreadcrumbList`/`FAQPage` structured data, an always-visible crawlable explainer + FAQ section outside the Pro gate, and a branded OG image — no changes to gating or analysis behavior.

**Architecture:** Follows `/market-breadth`'s exact existing pattern file-for-file: a `PAGE_META` entry in `lib/metadata.js` (auto-registers the sitemap), a FAQ data file that's the single source of truth for both the JSON-LD and the rendered accordion (matching `lib/pmsFaq.js`'s pattern), three JSON-LD `<script>` blocks in `layout.js`, and a new `@vercel/og`-based OG image route (matching `app/api/og-portfolio/route.js`'s pattern).

**Tech Stack:** Next.js 16 App Router, `@vercel/og`'s `ImageResponse` (already a dependency, used by 8+ existing OG routes).

## Global Constraints

- No user-facing text, FAQ answer, or metadata may name the underlying scheme-detail data source — same standing rule as the rest of this feature.
- No changes to Pro-gating logic, the fund picker, or any analysis/computation code — this plan is metadata/content/structured-data only.
- The FAQ content (questions and answers) is fixed as written in this plan — do not paraphrase or invent different wording.

---

### Task 1: FAQ data file and PAGE_META registration

**Files:**
- Create: `lib/proposalStudioFaq.js`
- Modify: `lib/metadata.js`

**Interfaces:**
- Produces: `PROPOSAL_STUDIO_FAQ` (named export, array of `{q, a}`), imported by Task 2 (JSON-LD) and Task 4 (rendered accordion). `PAGE_META.proposalStudio`, consumed by `getPageMeta('proposalStudio')` in Task 2.

- [ ] **Step 1: Create the FAQ data file**

```js
/**
 * lib/proposalStudioFaq.js
 *
 * Single source of truth for Proposal Studio FAQ content.
 * Imported by:
 *   - app/proposal-studio/layout.js       -> FAQPage JSON-LD schema
 *   - app/proposal-studio/ProposalStudioClient.jsx -> rendered HTML accordion
 *
 * Keeping both in sync ensures Google's rich-snippet eligibility
 * (it requires matching HTML content alongside the JSON-LD).
 */

export const PROPOSAL_STUDIO_FAQ = [
  {
    q: 'What is fund overlap and why does it matter?',
    a: "Fund overlap happens when two or more mutual funds you hold invest heavily in the same stocks. If your funds overlap significantly, you're not as diversified as you think — you're effectively paying multiple expense ratios to hold similar exposure. Checking overlap helps you build a portfolio that's genuinely spread across different holdings, not just different fund names.",
  },
  {
    q: 'How is overlap calculated?',
    a: 'For every pair of funds in your proposal, Proposal Studio looks at each stock held by both funds and takes the smaller of the two funds\' weights in that stock, then sums this across all shared stocks. This "minimum weight" method is the same convention used in professional investment research — it measures how much of your money is genuinely duplicated, not just how many stock names happen to match.',
  },
  {
    q: 'Does overlap include debt and cash holdings?',
    a: 'No. Overlap is calculated on equity stock holdings only, matching how overlap is measured in professional advisory proposals. Debt, cash, and other non-equity holdings are shown separately in Asset Allocation and Stock Exposure but excluded from the overlap grid.',
  },
  {
    q: 'What is M-Cap allocation and how is it categorized?',
    a: "M-Cap (market capitalization) allocation shows what % of your combined equity holdings are in Large-cap, Mid-cap, and Small-cap stocks, using AMFI's own official semi-annual stock categorization — the same list SEBI-regulated mutual funds use to classify their own holdings — so the split you see matches the regulatory definition, not an approximation.",
  },
  {
    q: 'Can I build a proposal with just one fund?',
    a: 'Yes. Every section — asset allocation, sector exposure, stock exposure, scheme details, and M-Cap allocation — works with a single fund. Only Portfolio Overlap needs at least two funds, since overlap is inherently a comparison.',
  },
  {
    q: 'How do I import my existing portfolio from my CAS statement?',
    a: 'If you\'ve already uploaded a CAS (Consolidated Account Statement) on the CAS Tracker page, Proposal Studio\'s "From your CAS holdings" tab lists your actual mutual fund holdings with their real invested value pre-filled automatically. No CAS statement yet? You can still search and add funds manually.',
  },
  {
    q: 'Can I include SIFs (Specialized Investment Funds) in a proposal?',
    a: 'Yes. Use the "SIFs" tab within fund search to find and add any SEBI-registered Specialised Investment Fund alongside your mutual funds, with the same overlap, exposure, and M-Cap analysis.',
  },
  {
    q: "What's the difference between a Lumpsum and SIP proposal?",
    a: 'A Lumpsum proposal models a one-time investment amount split across your chosen funds. A SIP proposal models a recurring investment (daily or monthly) instead. Each proposal is one type or the other — for both a lumpsum and a separate SIP, build two proposals.',
  },
  {
    q: 'How often is the holdings/exposure data updated?',
    a: "Fund holdings are typically refreshed within a few days of each fund's latest disclosed portfolio (mutual funds and SIFs both disclose full holdings monthly). AMFI's Large/Mid/Small-cap categorization list refreshes twice a year, in line with when AMFI itself republishes it.",
  },
  {
    q: 'What does Proposal Studio cost?',
    a: 'Proposal Studio is a Pro feature, included with the ₹499/year Abundance Financial Services Pro plan (plus 18% GST), alongside Market Breadth, MF Screener, and other premium tools.',
  },
];
```

- [ ] **Step 2: Add the `PAGE_META.proposalStudio` entry**

In `lib/metadata.js`, find the `PAGE_META` object (it contains entries like `breadth: {...}`, `screener: {...}`) and add this new entry (placement within the object doesn't matter, but keep it near other tool entries like `breadth`):

```js
  proposalStudio: {
    title: 'Proposal Studio — Fund Overlap, Exposure & M-Cap Analysis | Abundance',
    description: "Build a mutual fund or SIF investment proposal — see combined sector/stock exposure, fund overlap, and Large/Mid/Small-cap allocation using AMFI's official categorization. Premium tool by Abundance Financial Services (ARN-251838).",
    keywords: 'mutual fund overlap checker, portfolio overlap calculator India, multi fund analysis tool, mutual fund sector exposure, AMFI large mid small cap categorization, SIF portfolio analysis, investment proposal builder India, fund overlap detector',
    path: '/proposal-studio',
    ogImage: '/api/og-proposal-studio',
    changefreq: 'weekly',
    priority: 0.75,
  },
```

- [ ] **Step 3: Verify the FAQ data file loads correctly**

Run: `node -e "const { PROPOSAL_STUDIO_FAQ } = require('./lib/proposalStudioFaq.js'); console.log(PROPOSAL_STUDIO_FAQ.length, 'questions'); console.log(PROPOSAL_STUDIO_FAQ[0].q);"`

Expected: this will fail with a `require() of ES Module` error, because `lib/proposalStudioFaq.js` uses `export const` (ESM syntax) inside a CommonJS-default project — this is expected and fine, since this file is only ever imported by Next.js's own bundler (via `import`) in `layout.js`/`ProposalStudioClient.jsx`, both of which use ESM `import` already. Confirm instead via: `npm run build` (Step in the next task) succeeding, which proves the module resolves correctly in the actual Next.js build pipeline.

Run: `npm run build`
Expected: build succeeds (this file isn't imported by anything yet in this task, so it just needs to not have a syntax error — Next.js's build will still process the file as part of its module graph scan even though nothing imports it until Task 2).

- [ ] **Step 4: Commit**

```bash
git add lib/proposalStudioFaq.js lib/metadata.js
git commit -m "feat(proposal-studio): add FAQ content and PAGE_META registration"
```

---

### Task 2: Structured data and metadata in layout.js

**Files:**
- Modify: `app/proposal-studio/layout.js`

**Interfaces:**
- Consumes: `getPageMeta` from `lib/metadata.js` (existing, already used by `app/market-breadth/layout.js`), `PROPOSAL_STUDIO_FAQ` from `lib/proposalStudioFaq.js` (Task 1).

- [ ] **Step 1: Replace the whole file**

```js
import { getPageMeta } from '@/lib/metadata';
import { PROPOSAL_STUDIO_FAQ } from '@/lib/proposalStudioFaq';

export const metadata = getPageMeta('proposalStudio');

export default function ProposalStudioLayout({ children }) {
  const webApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Proposal Studio — Mutual Fund & SIF Investment Proposal Builder",
    "url": "https://mfcalc.getabundance.in/proposal-studio",
    "description": "Build a mutual fund or SIF investment proposal with combined sector/stock exposure, fund overlap detection, and Large/Mid/Small-cap allocation using AMFI's official categorization.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "499", "priceCurrency": "INR" },
    "featureList": [
      "Combined asset allocation across multiple funds",
      "Combined sector exposure",
      "Combined stock exposure with full-holdings view",
      "Pairwise fund overlap detection (equity-only)",
      "Scheme details: category, risk rating, equity holdings count",
      "M-Cap allocation via AMFI's official Large/Mid/Small-cap categorization",
      "Import your real holdings from your CAS statement",
      "Search and add mutual funds and SIFs",
      "Lumpsum or SIP proposal modelling"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "telephone": "+919808105923",
      "description": "AMFI Registered Mutual Fund & SIF Distributor (ARN-251838)"
    }
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MFCalc", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "Proposal Studio", "item": "https://mfcalc.getabundance.in/proposal-studio" }
    ]
  };
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": PROPOSAL_STUDIO_FAQ.map((f) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApp) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      {children}
    </>
  );
}
```

- [ ] **Step 2: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check (no browser automation available — check via `curl` or Read on the built HTML): `curl -s http://localhost:3000/proposal-studio | grep -o '"@type":"FAQPage"'` after starting `npm run dev` should find a match, confirming the JSON-LD is actually rendered into the page HTML.

- [ ] **Step 3: Commit**

```bash
git add app/proposal-studio/layout.js
git commit -m "feat(proposal-studio): add structured data and switch to shared metadata helper"
```

---

### Task 3: OG image route

**Files:**
- Create: `app/api/og-proposal-studio/route.js`

**Interfaces:**
- No interfaces — a standalone edge route, referenced by `PAGE_META.proposalStudio.ogImage` (Task 1) via `getPageMeta`'s existing `openGraph.images` construction (no wiring needed here beyond the route existing at that path).

- [ ] **Step 1: Create the route**

```jsx
/**
 * app/api/og-proposal-studio/route.js
 *
 * OG image for /proposal-studio — returned as PNG via @vercel/og
 * Size: 1200×630 (standard OG)
 *
 * Design: dark green hero with logo, tagline, and feature pills,
 * matching app/api/og-portfolio/route.js's existing visual pattern.
 * No dynamic data — this is a static branded image for social sharing.
 */

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '80px 100px',
          background: 'linear-gradient(135deg, #0a2e0a 0%, #1b5e20 50%, #2e7d32 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 400, height: 400,
          borderRadius: '50%',
          background: 'rgba(100,187,106,.08)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -120, right: 120,
          width: 320, height: 320,
          borderRadius: '50%',
          background: 'rgba(46,125,50,.12)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px)',
          display: 'flex',
        }} />

        <div style={{
          position: 'absolute', top: 48, right: 100,
          padding: '6px 14px', borderRadius: 20,
          border: '1px solid rgba(255,255,255,.2)',
          background: 'rgba(255,255,255,.08)',
          color: 'rgba(255,255,255,.7)',
          fontSize: 13, fontWeight: 700,
          letterSpacing: 1,
          display: 'flex',
        }}>
          ARN-251838
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: 14,
            background: 'rgba(255,255,255,.12)',
            border: '2px solid rgba(255,255,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#fff',
          }}>A</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>
              Abundance Financial Services
            </div>
            <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>
              AMFI Registered Mutual Fund Distributor
            </div>
          </div>
        </div>

        <div style={{
          color: '#fff',
          fontSize: 58,
          fontWeight: 900,
          letterSpacing: -2,
          lineHeight: 1.05,
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <span>Proposal</span>
          <span style={{ color: '#a5d6a7' }}>Studio</span>
        </div>

        <div style={{
          color: 'rgba(255,255,255,.65)',
          fontSize: 20,
          fontWeight: 500,
          lineHeight: 1.5,
          marginBottom: 36,
          maxWidth: 640,
          display: 'flex',
        }}>
          Build a mutual fund or SIF proposal — combined exposure, fund overlap,
          and M-Cap allocation in one view.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['Fund Overlap', 'Sector Exposure', 'M-Cap Allocation', 'CAS Import', 'SIF Support'].map(f => (
            <div key={f} style={{
              padding: '8px 16px', borderRadius: 100,
              background: 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.2)',
              color: 'rgba(255,255,255,.85)',
              fontSize: 14, fontWeight: 700,
              display: 'flex',
            }}>
              ✓ {f}
            </div>
          ))}
        </div>

        <div style={{
          position: 'absolute', bottom: 48, right: 100,
          color: 'rgba(255,255,255,.4)',
          fontSize: 16, fontWeight: 600,
          fontFamily: 'monospace',
          display: 'flex',
        }}>
          mfcalc.getabundance.in/proposal-studio
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
```

- [ ] **Step 2: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: start `npm run dev`, then `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/api/og-proposal-studio` — expect `200 image/png`.

- [ ] **Step 3: Commit**

```bash
git add app/api/og-proposal-studio/route.js
git commit -m "feat(proposal-studio): add branded OG image route"
```

---

### Task 4: Always-visible explainer and FAQ accordion

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Consumes: `PROPOSAL_STUDIO_FAQ` from `lib/proposalStudioFaq.js` (Task 1); `CollapsibleSection` (already defined in this same file, unchanged signature `{title, children, defaultOpen}`).

- [ ] **Step 1: Import the FAQ data**

At the top of `ProposalStudioClient.jsx`, add:
```jsx
import { PROPOSAL_STUDIO_FAQ } from '@/lib/proposalStudioFaq';
```

- [ ] **Step 2: Add the explainer and FAQ section, rendered for every visitor**

Find the top-level `ProposalStudioClient` component:
```jsx
export default function ProposalStudioClient() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isPro = session?.user?.plan === 'pro';

  return (
    <>
      <Navbar activePage="proposal-studio" />
      <main className="pfc-page">
        <h1 className="pfc-title">Proposal Studio</h1>
        <p className="pfc-subtitle">Combine funds to see overlap, exposure, and scheme details in one view.</p>

        {status !== 'loading' && !isAuthed && <PfcSignInGate />}
        {status !== 'loading' && isAuthed && !isPro && <PfcProGate session={session} />}
        {isAuthed && isPro && <ProposalStudioTool />}
      </main>
      <Footer />
    </>
  );
}
```
Replace with:
```jsx
export default function ProposalStudioClient() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isPro = session?.user?.plan === 'pro';

  return (
    <>
      <Navbar activePage="proposal-studio" />
      <main className="pfc-page">
        <h1 className="pfc-title">Proposal Studio</h1>
        <p className="pfc-subtitle">Combine funds to see overlap, exposure, and scheme details in one view.</p>

        <PfcExplainer />

        {status !== 'loading' && !isAuthed && <PfcSignInGate />}
        {status !== 'loading' && isAuthed && !isPro && <PfcProGate session={session} />}
        {isAuthed && isPro && <ProposalStudioTool />}

        <PfcFaq />
      </main>
      <Footer />
    </>
  );
}

function PfcExplainer() {
  return (
    <section className="pfc-explainer">
      <p>
        Proposal Studio combines the mutual funds and SIFs you choose — either your real
        holdings imported from a CAS statement, or a new investment plan you're building —
        into a single combined view: how your money is spread across asset classes and
        sectors, which stocks show up in more than one fund (overlap), and how much sits in
        Large, Mid, and Small-cap companies.
      </p>
      <ul className="pfc-explainer-list">
        <li>Combined asset allocation and sector exposure across every fund you add</li>
        <li>Stock-level exposure, with a full-holdings view beyond just the top 10</li>
        <li>Pairwise fund overlap — how much of your equity holdings are duplicated between funds</li>
        <li>M-Cap allocation using AMFI's official Large/Mid/Small-cap categorization</li>
        <li>Works for a Lumpsum or a SIP proposal, with mutual funds and SIFs both supported</li>
      </ul>
    </section>
  );
}

function PfcFaq() {
  return (
    <section className="pfc-faq">
      <h2 className="pfc-faq-title">Frequently Asked Questions</h2>
      {PROPOSAL_STUDIO_FAQ.map((f) => (
        <CollapsibleSection key={f.q} title={f.q} defaultOpen={false}>
          <p>{f.a}</p>
        </CollapsibleSection>
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Add CSS for the explainer and FAQ heading**

Append to `app/proposal-studio/proposal-studio.css`:
```css
.pfc-explainer { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px; font: 400 14px Raleway, sans-serif; line-height: 1.6; color: var(--text2, #333); }
.pfc-explainer-list { margin-top: 12px; padding-left: 20px; }
.pfc-explainer-list li { margin-bottom: 6px; }

.pfc-faq { margin-top: 32px; }
.pfc-faq-title { font: 700 22px Raleway, sans-serif; color: var(--g1); margin-bottom: 16px; }
```

- [ ] **Step 4: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: `curl -s http://localhost:3000/proposal-studio | grep -o 'Frequently Asked Questions'` (after `npm run dev`) should find a match, confirming the FAQ renders in the server-rendered HTML regardless of auth state (the explainer/FAQ sit outside all three gate branches). Sign out (or use an incognito-equivalent request) and confirm the same — the FAQ must be visible to a logged-out visitor, not just Pro users.

- [ ] **Step 5: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add always-visible explainer and FAQ accordion"
```
