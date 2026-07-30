# MF Screener SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category-specific indexable URLs, expanded/grouped FAQs, a glossary, category explainer content, and internal-linking pills to `/screener`, without touching the interactive tool above the fold.

**Architecture:** Split `app/screener/page.js` (currently one `'use client'` file) into a server `page.js` (owns `generateMetadata`, reads `?category=` from the URL) and a new `ScreenerClient.jsx` (today's entire interactive body, unchanged except for a few precise edits). A new neutral data module, `app/screener/screenerContent.js`, holds all shared static content (category data, FAQ, glossary) so the server metadata and the client rendering never drift apart.

**Tech Stack:** Next.js 16 App Router, React client components, plain CSS-in-JS-string (no CSS modules), no test framework configured in this repo (verification is `npm run build` + manual/curl checks, matching this repo's existing convention for `scripts/*.mjs` build scripts).

## Global Constraints

- Curated categories are exactly these 6, with these exact raw category strings (verified against live `data/screener.json`): `Equity Scheme - Large Cap Fund`, `Equity Scheme - Mid Cap Fund`, `Equity Scheme - Small Cap Fund`, `Equity Scheme - Flexi Cap Fund`, `Equity Scheme - ELSS` (NOT the legacy `ELSS` string — verified `Equity Scheme - ELSS` has 40 funds vs. 11 for the legacy one), `Hybrid Scheme - Multi Asset Allocation`.
- URL param is `?category=<slug>`; category changes call `router.replace` (never `push`) with `{ scroll: false }` — a category pick is a filter action, not a navigation.
- The URL/metadata feature covers ONLY the 6 curated categories. Any other category selection behaves exactly as it does today (no URL change, generic metadata) — do not attempt to generalize `slugToCategory`/`categoryToSlug` beyond the curated list.
- All new content (category explainer, glossary, internal-link pills) renders **below** the results table — nothing changes above or inside the existing header/controls/leader-cards/table block.
- FAQ and Glossary text must match the copy in this plan **verbatim** — this is compliance-reviewed financial content for an AMFI-registered distributor (ARN-251838); do not paraphrase or "improve" the wording while implementing.
- No test framework exists in this repo. Every task's test step is `npm run build` plus either a `grep`-based structural check (for pure data) or a `curl` against a running `npm run dev` server (for rendered output) — matching how `scripts/build-sif-screener.mjs` and prior features in this codebase were verified this session.

---

### Task 1: Shared screener content module

**Files:**
- Create: `app/screener/screenerContent.js`

**Interfaces:**
- Produces: `shortCat(category: string): string`, `CURATED_CATEGORIES: Array<{slug, label, category, explainer, subtitleSuffix, metaBlurb}>` (6 entries), `slugToCategory(slug: string): string | null`, `categoryToSlug(category: string): string | null`, `FAQ_ITEMS: Array<{group, q, a}>` (14 entries), `GLOSSARY_ITEMS: Array<{q, a}>` (5 entries) — all consumed by Tasks 2–6.

- [ ] **Step 1: Create the file**

```js
// app/screener/screenerContent.js
// Shared, framework-neutral content for the MF screener page -- imported by
// both the server page.js (metadata) and the client ScreenerClient.jsx
// (rendering), so the two never drift out of sync.

export const shortCat = (c = '') => c.replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented)\s+Scheme\s*-\s*/i, '').replace(/\s+Fund$/i, '').trim() || c;

export const CURATED_CATEGORIES = [
  {
    slug: 'large-cap',
    label: 'Large Cap',
    category: 'Equity Scheme - Large Cap Fund',
    subtitleSuffix: ' Large Cap funds invest in India’s top 100 companies by market capitalisation.',
    metaBlurb: 'Large Cap funds invest in India’s top 100 companies by market cap — the most stable, liquid part of the equity market.',
    explainer: 'Large Cap funds invest at least 80% of assets in India’s top 100 companies by market capitalisation — the most established, liquid names on the exchange. They tend to be the least volatile equity category, making them a common starting point for a core portfolio, though that stability usually comes with more modest upside than mid or small cap funds during strong bull phases.',
  },
  {
    slug: 'mid-cap',
    label: 'Mid Cap',
    category: 'Equity Scheme - Mid Cap Fund',
    subtitleSuffix: ' Mid Cap funds invest in companies ranked 101st–250th by market capitalisation.',
    metaBlurb: 'Mid Cap funds invest in companies ranked 101st–250th by market cap, balancing growth potential with moderate risk.',
    explainer: 'Mid Cap funds invest at least 65% of assets in companies ranked 101st–250th by market capitalisation — businesses past the small-cap stage but not yet market leaders. They sit between large and small cap on the risk-return spectrum, offering more growth potential than large caps with materially less volatility than small caps.',
  },
  {
    slug: 'small-cap',
    label: 'Small Cap',
    category: 'Equity Scheme - Small Cap Fund',
    subtitleSuffix: ' Small Cap funds invest in companies ranked 251st and below by market capitalisation.',
    metaBlurb: 'Small Cap funds invest in companies ranked 251st and below by market cap — the highest-growth, highest-volatility equity category.',
    explainer: 'Small Cap funds invest at least 65% of assets in companies ranked 251st and below by market capitalisation. This is the highest-growth-potential but also highest-volatility equity category — small caps can fall 40–50%+ in a sharp correction, so they suit investors with a long horizon (7+ years) and a high risk tolerance, typically as a smaller slice of a diversified portfolio rather than a core holding.',
  },
  {
    slug: 'flexi-cap',
    label: 'Flexi Cap',
    category: 'Equity Scheme - Flexi Cap Fund',
    subtitleSuffix: ' Flexi Cap funds invest across market caps without a fixed mandate.',
    metaBlurb: 'Flexi Cap funds invest at least 65% in equity with no fixed large/mid/small cap split, giving the fund manager full flexibility.',
    explainer: 'Flexi Cap funds must invest at least 65% in equity but face no mandated split across large, mid and small cap — the fund manager can move freely between them based on where they see opportunity. This flexibility makes Flexi Cap a popular single-fund core holding for investors who’d rather leave the cap-size allocation call to a professional manager.',
  },
  {
    slug: 'elss',
    label: 'ELSS',
    category: 'Equity Scheme - ELSS',
    subtitleSuffix: ' ELSS funds qualify for a Section 80C tax deduction with a 3-year lock-in.',
    metaBlurb: 'ELSS funds offer a Section 80C tax deduction up to ₹1.5 lakh with a mandatory 3-year lock-in.',
    explainer: 'ELSS (Equity Linked Savings Scheme) funds invest predominantly in equity and are the only mutual fund category that qualifies for a tax deduction under Section 80C, up to ₹1.5 lakh per financial year. They come with a mandatory 3-year lock-in — the shortest among all 80C options — but still carry full equity market risk, so the tax benefit shouldn’t be the only reason to invest.',
  },
  {
    slug: 'multi-asset-allocation',
    label: 'Multi Asset Allocation',
    category: 'Hybrid Scheme - Multi Asset Allocation',
    subtitleSuffix: ' Multi Asset Allocation funds diversify across equity, debt and gold.',
    metaBlurb: 'Multi Asset Allocation funds invest across equity, debt and gold/commodities, with a minimum 10% in each asset class.',
    explainer: 'Multi Asset Allocation funds must invest in at least three asset classes — typically equity, debt and gold/commodities — with a minimum 10% allocation to each. That built-in diversification across asset classes (not just across stocks) is designed to smooth returns across market cycles, since equity, debt and gold rarely fall together, at the cost of capping the upside compared to a pure-equity fund in a strong bull run.',
  },
];

export function slugToCategory(slug) {
  const entry = CURATED_CATEGORIES.find((c) => c.slug === slug);
  return entry ? entry.category : null;
}

export function categoryToSlug(category) {
  const entry = CURATED_CATEGORIES.find((c) => c.category === category);
  return entry ? entry.slug : null;
}

export const GLOSSARY_ITEMS = [
  { q: 'CAGR (Compound Annual Growth Rate)', a: 'The annualised rate at which an investment would have grown, assuming steady compounding, to get from its starting value to its ending value. It’s the standard way to compare returns across different time periods on a like-for-like basis — a fund’s 3-year and 5-year CAGR can be directly compared even though the underlying periods differ.' },
  { q: 'Volatility', a: 'The annualised standard deviation of a fund’s monthly returns — a measure of how much the fund’s value swings up and down, not the direction of those swings. A higher volatility number means a bumpier ride, even if the long-term destination (the CAGR) ends up the same.' },
  { q: 'Max Drawdown', a: 'The largest peak-to-trough fall the fund has experienced within the available history — the worst-case loss an investor would have seen if they’d bought at the top and sold at the bottom. It’s a real, lived-through number, not a projection, and is one of the best gut-checks for whether you can actually stomach holding a fund through its worst period.' },
  { q: 'Return-per-Risk', a: 'CAGR divided by volatility — a rough measure of how much return a fund delivered for each unit of bumpiness it put investors through. Two funds with similar CAGR can have very different return-per-risk if one got there smoothly and the other got there through wild swings.' },
  { q: 'Expense Ratio', a: 'The annual fee, as a percentage of assets, that a fund charges to cover management and operating costs. It’s deducted daily before the NAV is calculated, so every return figure you see anywhere — including on this page — is already net of this fee.' },
];

export const FAQ_ITEMS = [
  // Using the Screener
  { group: 'Using the Screener', q: 'How are the returns calculated?', a: 'Point-to-point CAGR from real AMFI NAVs — the latest NAV versus the NAV one, three and five years earlier. For periods shorter than a fund’s age, the figure is left blank rather than estimated. Since-inception return is the CAGR from the fund’s launch NAV (₹10) to today, using the oldest available NAV record from mfapi.in.' },
  { group: 'Using the Screener', q: 'How current is the data?', a: 'The dataset is rebuilt every day from AMFI’s official NAV files, so the figures reflect the most recent published NAVs.' },
  { group: 'Using the Screener', q: 'What do volatility and max drawdown mean?', a: 'Volatility is the annualised standard deviation of monthly returns — how bumpy the ride was. Max drawdown is the largest peak-to-trough fall. Both are on a month-end basis over the available history.' },
  { group: 'Using the Screener', q: 'Why do some funds show a dash instead of a return figure?', a: 'A dash means the fund doesn’t have enough NAV history for that period — for example, a fund launched 2 years ago won’t have a 3-year or 5-year return yet. We deliberately leave the cell blank rather than estimating or extrapolating a number, since a fabricated figure would be misleading.' },

  // Choosing a Category
  { group: 'Choosing a Category', q: 'What’s the difference between Large, Mid and Small Cap funds?', a: 'It comes down to which companies, by size, the fund is required to hold. Large Cap funds invest at least 80% in India’s top 100 companies by market cap — the most stable, liquid names. Mid Cap funds invest at least 65% in companies ranked 101st–250th, offering more growth potential with more volatility. Small Cap funds invest at least 65% in companies ranked 251st and below — the highest growth potential, but also the sharpest drawdowns in a correction.' },
  { group: 'Choosing a Category', q: 'What does the 3-year lock-in on ELSS funds mean?', a: 'Every ELSS investment — including each individual SIP instalment — is locked in for 3 years from its purchase date and can’t be redeemed before that, regardless of market conditions. In exchange, ELSS is the only mutual fund category eligible for a Section 80C tax deduction. The lock-in doesn’t remove market risk — your investment can still be worth less than you put in if equity markets are down when the lock-in ends.' },
  { group: 'Choosing a Category', q: 'Who should invest in thematic or sectoral funds?', a: 'Thematic and sectoral funds (banking, pharma, infrastructure, technology, PSU, and similar) concentrate in a single sector or theme instead of diversifying across the market, which makes them SEBI’s ‘Very High’ risk category. They’re best suited as a small satellite allocation — typically no more than 5–10% of an equity portfolio — for investors who already hold a diversified core (Flexi Cap, Large Cap, or similar), understand the specific sector’s business cycle, and can tolerate that sector underperforming or falling for several years at a stretch. They’re generally a poor choice as a first or only equity fund, and buying into a theme after it has already rallied hard is one of the most common ways investors lose money in this category — the sector calls that work are rarely the obvious, already-popular ones.' },
  { group: 'Choosing a Category', q: 'Are index funds always a better choice than actively managed funds?', a: 'Not necessarily — it depends heavily on the category. In India’s large-cap segment, which is closely tracked by analysts and institutions, index funds have a genuinely strong case: SPIVA India scorecards have repeatedly shown that a majority of actively managed large-cap funds struggle to beat their benchmark after fees over long periods, because the segment is efficiently priced with little room for a manager’s stock-picking to add value beyond the index. Mid and small cap tell a different story — these segments are less researched and less efficiently priced, and the same SPIVA data has historically shown active funds outperforming their benchmarks more often here, because skilled managers have more genuine mispricing to exploit. A reasonable, non-dogmatic approach: lean towards low-cost index funds for your large-cap allocation, and evaluate active funds on their actual net track record — not just their pedigree — for mid cap, small cap, and other less-efficient categories. Past outperformance is never a guarantee of future outperformance in either camp.' },
  { group: 'Choosing a Category', q: 'Does a higher expense ratio always mean lower returns?', a: 'No — and this is one of the most common misunderstandings about mutual funds. Every return figure you see for a fund, on this page or anywhere else, is calculated from its NAV, and the expense ratio is deducted daily before that NAV is struck. In other words, the fee is already baked into the number you’re looking at — it isn’t added on top afterward. So a fund with a 1.5% expense ratio and a 14% displayed return actually outperformed a fund with a 0.5% expense ratio and a 12% displayed return, fee and all. What actually matters is the net return relative to comparable funds and the benchmark, not the expense ratio in isolation. Where expense ratio does deserve real weight is as a tie-breaker between two funds with genuinely similar net returns and consistency, or in categories like large-cap/index-hugging funds where sustained fee-beating outperformance is rare to begin with — there, a lower cost has less to make up for.' },

  // SIFs & Mutual Funds
  { group: 'SIFs & Mutual Funds', q: 'What is a Specialised Investment Fund (SIF) and how is it different from a mutual fund?', a: 'A Specialised Investment Fund (SIF) is a newer SEBI-regulated investment vehicle that sits between mutual funds and Portfolio Management Services (PMS). SIFs can use strategies mutual funds generally can’t — such as long-short equity positions — and require a minimum investment of ₹10 lakh, compared to as little as ₹500 for a mutual fund SIP. They’re aimed at investors who want more flexible, higher-conviction strategies than a traditional mutual fund but don’t yet have the scale for a dedicated PMS.' },
  { group: 'SIFs & Mutual Funds', q: 'Why isn’t there a SIP option for SIFs?', a: 'SIFs require a minimum lumpsum investment of ₹10 lakh under SEBI rules — there’s no SIP (systematic investment) mode for them the way there is for mutual funds, so we don’t show a hypothetical SIP figure. All wealth-simulation numbers for SIFs on this site assume a ₹10 lakh lumpsum, matching the actual minimum ticket size.' },

  // Stress Test & Liquidity
  { group: 'Stress Test & Liquidity', q: 'What is the Mutual Fund Stress Test & Liquidity Analysis?', a: 'As mandated by SEBI and AMFI, all Mid Cap and Small Cap mutual funds must disclose monthly stress test results. This liquidity analysis indicates the number of days a fund manager would take to liquidate 25% and 50% of the portfolio under stress conditions. It also details liability-side concentration (top 10 investors’ share), asset allocation breakdown (large, mid, small cap and cash %), and portfolio valuation (PE ratio) vs. benchmark to help investors evaluate portfolio risk in bloated or concentrated funds.' },
  { group: 'Stress Test & Liquidity', q: 'How do I interpret ‘Days to Liquidate’ in the stress test data?', a: 'The ‘Days to Liquidate 50%’ discloses how long the fund manager would need to sell half of the fund’s assets in a market panic without causing severe price impact. Fewer days indicate high liquidity and lower redemption risk. As a rule of thumb: 1–5 days is excellent/highly liquid, 6–15 days is moderate, and more than 15 days suggests higher potential liquidity risk under market pressure.' },

  // Compliance
  { group: 'Compliance', q: 'Is this investment advice?', a: 'No. This is an educational data tool. Past performance is not indicative of future results, and nothing here is a recommendation. Please consult your financial advisor before investing.' },
];
```

- [ ] **Step 2: Verify structure with grep (no test runner in this repo, and the file uses ESM `export` syntax in a plain `.js` file — only consumable by Next.js's bundler, not directly by `node`, matching `lib/metadata.js`'s existing pattern)**

Run:
```bash
grep -c "slug: '" app/screener/screenerContent.js
grep -c "group: '" app/screener/screenerContent.js
grep -c "^  { q:" app/screener/screenerContent.js
```
Expected: `6` (curated categories), `14` (FAQ items), `5` (glossary items — the glossary array's items also start with `  { q:` but so do none of the others since FAQ items start with `  { group:`; if this undercounts, count glossary items directly with `grep -c "^  { q:" app/screener/screenerContent.js | head -1` scoped between the `GLOSSARY_ITEMS` and `FAQ_ITEMS` markers, or simply eyeball the array while reviewing the file).

- [ ] **Step 3: Run the build to confirm the file is syntactically valid**

Run: `npm run build`
Expected: build succeeds (this file has no importers yet, so it only proves syntax validity, not wiring — functional verification happens in Tasks 2 and 5).

- [ ] **Step 4: Commit**

```bash
git add app/screener/screenerContent.js
git commit -m "feat(screener): add shared content module for curated categories, FAQ and glossary"
```

---

### Task 2: Server/client split with category-aware metadata

**Files:**
- Modify: `lib/metadata.js` (extend `getPageMeta`)
- Create: `app/screener/ScreenerClient.jsx` (moved from `app/screener/page.js`, minimally rewired)
- Rewrite: `app/screener/page.js` (becomes a server component)

**Interfaces:**
- Consumes: `CURATED_CATEGORIES`, `slugToCategory`, `shortCat`, `FAQ_ITEMS` from `./screenerContent` (Task 1)
- Produces: `getPageMeta(pageKey: string, overrides?: {title?, description?, canonicalPath?}): Metadata` — consumed by this task's own `page.js` and unchanged for every other page's existing `getPageMeta('key')` call. `ScreenerClient({ initialCategory: string | null })` — consumed by this task's `page.js` and further modified by Tasks 3–4.

- [ ] **Step 1: Extend `getPageMeta` in `lib/metadata.js`**

Current (lines 182–187):
```js
export function getPageMeta(pageKey) {
  const p = PAGE_META[pageKey];
  if (!p) {
    console.warn(`[SEO] No metadata config for page: "${pageKey}"`);
    return { title: SITE_NAME };
  }

  const fullUrl = `${SITE}${p.path}`;
  const ogImageUrl = `${SITE}${p.ogImage}`;
```

Replace with:
```js
export function getPageMeta(pageKey, overrides = {}) {
  const base = PAGE_META[pageKey];
  if (!base) {
    console.warn(`[SEO] No metadata config for page: "${pageKey}"`);
    return { title: SITE_NAME };
  }
  const p = {
    ...base,
    title: overrides.title || base.title,
    description: overrides.description || base.description,
    path: overrides.canonicalPath || base.path,
  };

  const fullUrl = `${SITE}${p.path}`;
  const ogImageUrl = `${SITE}${base.ogImage}`;
```

The rest of the function (everything using `p.title`/`p.description`/`fullUrl`/`ogImageUrl` in the returned object) is unchanged — it already reads from these same names, which now resolve to the overridden values when provided and the original config when not. Every existing call site (`getPageMeta('rolling')`, `getPageMeta('screener')`, etc.) is unaffected since `overrides` defaults to `{}`.

- [ ] **Step 2: Move `page.js` to `ScreenerClient.jsx`**

```bash
git mv app/screener/page.js app/screener/ScreenerClient.jsx
```

- [ ] **Step 3: Apply these edits to the newly-moved `app/screener/ScreenerClient.jsx`**

Edit the import block (currently lines 3–8):
```js
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo, getSIFLogo } from '@/lib/providerLogos';
import { MFCompareBar, MFCompareModal } from './MFCompare';
```
becomes:
```js
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo, getSIFLogo } from '@/lib/providerLogos';
import { MFCompareBar, MFCompareModal } from './MFCompare';
import { shortCat, FAQ_ITEMS } from './screenerContent';
```

Remove the local `shortCat` definition (currently its own line: `const shortCat = (c = '') => c.replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented)\s+Scheme\s*-\s*/i, '').replace(/\s+Fund$/i, '').trim() || c;`) — it's now imported.

Remove the local `FAQ_ITEMS` array (the whole `const FAQ_ITEMS = [ ... ];` block, 6 entries, immediately before `export default function ScreenerPage()`) — it's now imported (and will render the new 14-item grouped version from Task 1 without any further change needed here).

Change the component signature:
```js
export default function ScreenerPage() {
```
to:
```js
export default function ScreenerClient({ initialCategory }) {
```

Change the `cat` state seed:
```js
const [cat, setCat] = useState('Equity Scheme - Flexi Cap Fund');
```
to:
```js
const [cat, setCat] = useState(initialCategory || 'Equity Scheme - Flexi Cap Fund');
```

In the `FEATURED` array, replace the Aggressive Hybrid entry:
```js
  { label: 'Aggressive Hybrid', m: (c) => /aggressive hybrid/i.test(c) },
```
with:
```js
  { label: 'Multi Asset Allocation', m: (c) => /multi asset allocation/i.test(c) },
```

Everything else in the file (all other state, derived values, handlers, the entire JSX return, the `Detail`/`SifDetail` drawer components, and the `CSS` template string) moves unchanged — no other edits in this task.

- [ ] **Step 4: Create the new `app/screener/page.js` server component**

```js
import { getPageMeta } from '@/lib/metadata';
import { CURATED_CATEGORIES, slugToCategory } from './screenerContent';
import ScreenerClient from './ScreenerClient';

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const curated = slug ? CURATED_CATEGORIES.find((c) => c.slug === slug) : null;
  if (!curated) return getPageMeta('screener');
  return getPageMeta('screener', {
    title: `Best ${curated.label} Mutual Funds in India — Compare Returns & Risk | Abundance`,
    description: `Compare ${curated.label} mutual funds in India by 1/3/5-year returns, volatility and drawdown on real AMFI NAVs. ${curated.metaBlurb} Free tool by Abundance Financial Services.`,
    canonicalPath: `/screener?category=${curated.slug}`,
  });
}

export default async function ScreenerPage({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const initialCategory = slug ? slugToCategory(slug) : null;
  return <ScreenerClient initialCategory={initialCategory} />;
}
```

- [ ] **Step 5: Build, then verify server-rendered metadata for three URLs**

Run: `npm run build`
Expected: build succeeds with no type/import errors.

Run:
```bash
npm run dev &
sleep 5
curl -s http://localhost:3000/screener | grep -o '<title>[^<]*</title>'
curl -s "http://localhost:3000/screener?category=flexi-cap" | grep -o '<title>[^<]*</title>'
curl -s "http://localhost:3000/screener?category=elss" | grep -o '<title>[^<]*</title>'
curl -s "http://localhost:3000/screener?category=not-a-real-slug" | grep -o '<title>[^<]*</title>'
```
Expected: the first and last `<title>` are identical (both the generic "Mutual Fund Screener — Filter 2,500+ Funds..." title, confirming graceful fallback for unknown slugs); the `flexi-cap` and `elss` titles differ from the generic one and from each other, each starting with `Best Flexi Cap Mutual Funds...` / `Best ELSS Mutual Funds...` respectively. Stop the dev server afterward (`kill %1` or equivalent).

- [ ] **Step 6: Commit**

```bash
git add lib/metadata.js app/screener/page.js app/screener/ScreenerClient.jsx
git commit -m "feat(screener): split into server/client components with category-aware metadata"
```

---

### Task 3: URL sync on category change

**Files:**
- Modify: `app/screener/ScreenerClient.jsx`

**Interfaces:**
- Consumes: `categoryToSlug` from `./screenerContent` (Task 1); `useRouter` from `next/navigation`
- Produces: `changeCat(newCat: string): void` — consumed by Task 4's new "Best funds by category" pills.

- [ ] **Step 1: Add the `useRouter` import and `categoryToSlug` import**

Change:
```js
import { shortCat, FAQ_ITEMS } from './screenerContent';
```
to:
```js
import { useRouter } from 'next/navigation';
import { shortCat, FAQ_ITEMS, categoryToSlug } from './screenerContent';
```

- [ ] **Step 2: Add `router` and `changeCat` inside the component**

Immediately before the existing `const jumpTo = (f) => { setCat(f.category); setSort({ key: 'ret_3y', dir: -1 }); };` line, add:
```js
  const router = useRouter();
  const changeCat = useCallback((newCat) => {
    setCat(newCat);
    const slug = categoryToSlug(newCat);
    router.replace(slug ? `/screener?category=${slug}` : '/screener', { scroll: false });
  }, [router]);
```

- [ ] **Step 3: Route every category-changing call site through `changeCat`**

`jumpTo`:
```js
const jumpTo = (f) => { setCat(f.category); setSort({ key: 'ret_3y', dir: -1 }); };
```
becomes:
```js
const jumpTo = (f) => { changeCat(f.category); setSort({ key: 'ret_3y', dir: -1 }); };
```

`pickGroup`:
```js
const pickGroup = (g) => { setGroup(g); if (g !== 'SIF') setCat(defaultCatFor(g)); setQ(''); setSifQ(''); };
```
becomes:
```js
const pickGroup = (g) => { setGroup(g); if (g !== 'SIF') changeCat(defaultCatFor(g)); setQ(''); setSifQ(''); };
```

The category `<select>`:
```jsx
<select className="scr-select" value={cat} onChange={(e) => setCat(e.target.value)}>
```
becomes:
```jsx
<select className="scr-select" value={cat} onChange={(e) => changeCat(e.target.value)}>
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification (browser automation isn't available in this environment)**

Since this task's effect (URL updating on click) can't be verified by curl alone, note for the user to manually check after deploy: on `/screener`, click the "ELSS" option in the category dropdown and confirm the browser URL bar updates to `/screener?category=elss` without a full page reload or scroll jump, and the browser tab title updates to the ELSS-specific title.

- [ ] **Step 6: Commit**

```bash
git add app/screener/ScreenerClient.jsx
git commit -m "feat(screener): sync category selection to the URL via router.replace"
```

---

### Task 4: New content blocks below the table

**Files:**
- Modify: `app/screener/ScreenerClient.jsx`

**Interfaces:**
- Consumes: `CURATED_CATEGORIES`, `GLOSSARY_ITEMS`, `FAQ_ITEMS` from `./screenerContent` (Task 1); `changeCat` (Task 3); `assetClass` (already defined in this file)

- [ ] **Step 1: Import `Fragment`, `CURATED_CATEGORIES`, and `GLOSSARY_ITEMS`**

Change:
```js
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
```
to:
```js
import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react';
```

Change:
```js
import { useRouter } from 'next/navigation';
import { shortCat, FAQ_ITEMS, categoryToSlug } from './screenerContent';
```
to:
```js
import { useRouter } from 'next/navigation';
import { shortCat, FAQ_ITEMS, GLOSSARY_ITEMS, CURATED_CATEGORIES, categoryToSlug } from './screenerContent';
```

- [ ] **Step 2: Add `glossaryOpen` state and the `curatedCat` lookup**

Immediately after the existing `const [faq, setFaq] = useState(0);` line, add:
```js
  const [glossaryOpen, setGlossaryOpen] = useState(-1);
```

Immediately before the `return (` that starts the component's JSX, add:
```js
  const curatedCat = !isSIF ? CURATED_CATEGORIES.find((c) => c.category === cat) : null;
```

- [ ] **Step 3: Insert the new render blocks between the table/pager block and the existing FAQ section**

Find this exact boundary (the MF/SIF table's closing `)}` immediately followed by the FAQ section comment):
```jsx
          </>
        )}

        {/* FAQ */}
        <section className="scr-faq" aria-label="FAQ">
          <h2>Frequently asked questions</h2>
          {FAQ_ITEMS.map((f, i) => (
            <div className={`scr-faq-item ${faq === i ? 'open' : ''}`} key={i}>
              <button className="scr-faq-q" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}><span>{f.q}</span><span className="scr-faq-ic">{faq === i ? '−' : '+'}</span></button>
              <div className="scr-faq-a" style={{ maxHeight: faq === i ? 320 : 0 }}><p>{f.a}</p></div>
            </div>
          ))}
        </section>
```

Replace it with:
```jsx
          </>
        )}

        {curatedCat && (
          <div className="scr-explainer">
            <b>{curatedCat.label} funds.</b> {curatedCat.explainer}
          </div>
        )}

        {/* Glossary */}
        <section className="scr-faq" aria-label="Glossary">
          <h2>Glossary</h2>
          {GLOSSARY_ITEMS.map((g, i) => (
            <div className={`scr-faq-item ${glossaryOpen === i ? 'open' : ''}`} key={i}>
              <button className="scr-faq-q" onClick={() => setGlossaryOpen(glossaryOpen === i ? -1 : i)} aria-expanded={glossaryOpen === i}><span>{g.q}</span><span className="scr-faq-ic">{glossaryOpen === i ? '−' : '+'}</span></button>
              <div className="scr-faq-a" style={{ maxHeight: glossaryOpen === i ? 800 : 0 }}><p>{g.a}</p></div>
            </div>
          ))}
        </section>

        {!isSIF && (
          <section className="scr-cat-links" aria-label="Browse by category">
            <div className="scr-cat-links-h">Best funds by category</div>
            <div className="scr-cat-links-row">
              {CURATED_CATEGORIES.map((c) => (
                <a
                  key={c.slug}
                  href={`/screener?category=${c.slug}`}
                  className={`scr-cat-link ${cat === c.category ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setGroup(assetClass(c.category)); changeCat(c.category); }}
                >
                  {c.label}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="scr-faq" aria-label="FAQ">
          <h2>Frequently asked questions</h2>
          {FAQ_ITEMS.map((f, i) => (
            <Fragment key={i}>
              {(i === 0 || FAQ_ITEMS[i - 1].group !== f.group) && <div className="scr-faq-group-h">{f.group}</div>}
              <div className={`scr-faq-item ${faq === i ? 'open' : ''}`}>
                <button className="scr-faq-q" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}><span>{f.q}</span><span className="scr-faq-ic">{faq === i ? '−' : '+'}</span></button>
                <div className="scr-faq-a" style={{ maxHeight: faq === i ? 800 : 0 }}><p>{f.a}</p></div>
              </div>
            </Fragment>
          ))}
        </section>
```

Note the `maxHeight` cap changed from `320` to `800` in both the (moved) FAQ block and the new Glossary block — the new FAQ answers run considerably longer than the original 6, and at narrow mobile viewports (where each line wraps to far fewer characters), `320` would visibly clip the longest answers when expanded. `800` comfortably fits the longest answer (the index-vs-active FAQ, ~900 characters) even at a 320px-wide viewport.

- [ ] **Step 4: Append the appended subtitle sentence**

Find:
```jsx
          <p className="page-subtitle">
            {isSIF
              ? <>Discover all SEBI-regulated <b>Specialised Investment Funds</b> — {sifData ? sifSchemes.length : '…'} schemes across Equity Long-Short, Hybrid Long-Short and Active Asset Allocator strategies.</>
              : <>Filter and rank {data ? data.count.toLocaleString('en-IN') : '1,800+'} mutual funds by category, returns and risk — on real historical NAVs.</>
            }
          </p>
```

Replace with:
```jsx
          <p className="page-subtitle">
            {isSIF
              ? <>Discover all SEBI-regulated <b>Specialised Investment Funds</b> — {sifData ? sifSchemes.length : '…'} schemes across Equity Long-Short, Hybrid Long-Short and Active Asset Allocator strategies.</>
              : <>Filter and rank {data ? data.count.toLocaleString('en-IN') : '1,800+'} mutual funds by category, returns and risk — on real historical NAVs.{curatedCat?.subtitleSuffix}</>
            }
          </p>
```

- [ ] **Step 5: Add the new CSS**

Find (near the end of the `CSS` template string):
```
.scr-disc{margin-top:20px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.scr-disc b{color:var(--text2)}

/* drawer */
```

Replace with:
```
.scr-disc{margin-top:20px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.scr-disc b{color:var(--text2)}

/* category explainer + internal links + FAQ group headings */
.scr-explainer{background:var(--g-xlight);border:1px solid var(--g-light);border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:var(--text2);margin-bottom:16px}
.scr-explainer b{color:var(--g1)}
.scr-cat-links{margin-bottom:18px}
.scr-cat-links-h{font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
.scr-cat-links-row{display:flex;flex-wrap:wrap;gap:8px}
.scr-cat-link{padding:7px 13px;border:1px solid var(--border);border-radius:9px;font:700 12px Raleway,sans-serif;color:var(--g1);text-decoration:none;background:var(--surface);cursor:pointer;transition:all .14s;display:inline-block}
.scr-cat-link:hover{border-color:var(--g3);background:var(--g-xlight)}
.scr-cat-link.active{background:var(--g1);color:#fff;border-color:var(--g1)}
.scr-faq-group-h{font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:18px 0 8px}
.scr-faq-group-h:first-child{margin-top:0}

/* drawer */
```

- [ ] **Step 6: Build, then verify rendered content**

Run: `npm run build`
Expected: build succeeds.

Run:
```bash
npm run dev &
sleep 5
curl -s "http://localhost:3000/screener?category=small-cap" | grep -o "Small Cap funds invest at least 65%"
curl -s "http://localhost:3000/screener?category=small-cap" | grep -o "highest-growth, highest-volatility"
curl -s http://localhost:3000/screener | grep -o "Flexi Cap funds must invest at least 65%"
curl -s http://localhost:3000/screener | grep -o "Glossary"
curl -s http://localhost:3000/screener | grep -o "Best funds by category"
curl -s http://localhost:3000/screener | grep -o "Choosing a Category"
```
Expected: the `small-cap` page's response contains its explainer text (proving the explainer switches per curated category); the bare `/screener` page contains the Flexi Cap explainer text (since the default `cat` state — set in Task 2 Step 3 — is Flexi Cap, the explainer renders there too, not just on explicit `?category=` URLs); `Glossary`, `Best funds by category`, and `Choosing a Category` (a FAQ group heading) all appear on the page. Stop the dev server afterward.

- [ ] **Step 7: Commit**

```bash
git add app/screener/ScreenerClient.jsx
git commit -m "feat(screener): add category explainer, glossary, category links and grouped FAQ"
```

---

### Task 5: Fix FAQPage structured data drift

**Files:**
- Modify: `app/screener/layout.js`

**Interfaces:**
- Consumes: `FAQ_ITEMS`, `GLOSSARY_ITEMS` from `./screenerContent` (Task 1)

- [ ] **Step 1: Replace the hand-written FAQ array and schema construction**

Current (lines 1, 41–51):
```js
import { getPageMeta } from '@/lib/metadata';
```
...
```js
  const faqs = [
    ["How are the returns calculated?", "Returns are point-to-point CAGR computed from real AMFI NAVs: the latest NAV versus the NAV one, three and five years earlier. For periods shorter than a fund's age, the figure is left blank rather than estimated."],
    ["How current is the data?", "The dataset is rebuilt every day from AMFI's official NAV files, so returns and risk metrics reflect the most recent published NAVs."],
    ["What do volatility and max drawdown mean?", "Volatility is the annualised standard deviation of monthly returns — how bumpy the ride was. Max drawdown is the largest peak-to-trough fall. Both are computed on a month-end basis over the available history."],
    ["Is this investment advice?", "No. The screener is an educational data tool. Past performance is not indicative of future results, and nothing here is a recommendation to buy or sell any scheme. Please consult your financial advisor before investing."]
  ];
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
  };
```

Replace the import line with:
```js
import { getPageMeta } from '@/lib/metadata';
import { FAQ_ITEMS, GLOSSARY_ITEMS } from './screenerContent';
```

Replace the `faqs`/`faqSchema` block with:
```js
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [...FAQ_ITEMS, ...GLOSSARY_ITEMS].map(({ q, a }) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
  };
```

Everything else in the file (the `webAppSchema`, `breadcrumbSchema`, and the returned JSX) is unchanged.

- [ ] **Step 2: Build, then verify the JSON-LD contains all 19 questions**

Run: `npm run build`
Expected: build succeeds.

Run:
```bash
npm run dev &
sleep 5
curl -s http://localhost:3000/screener | grep -o '"@type":"Question"' | wc -l
```
Expected: `19` (14 FAQ + 5 glossary). Stop the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add app/screener/layout.js
git commit -m "fix(screener): source FAQPage structured data from the single FAQ/glossary content module"
```

---

### Task 6: Sitemap entries for curated category URLs

**Files:**
- Modify: `lib/metadata.js` (add `getScreenerCategorySitemapEntries`)
- Modify: `app/sitemap.js`

**Interfaces:**
- Consumes: `CURATED_CATEGORIES` from `app/screener/screenerContent.js` (Task 1)

- [ ] **Step 1: Add `getScreenerCategorySitemapEntries` to `lib/metadata.js`**

Immediately after the existing `getHomeSitemapEntries` function (which ends with its closing `}` right before `export { PAGE_META, SITE, SITE_NAME, ARN, TWITTER, THEME_COLOR };`), add:
```js
// Add entries for the 6 curated screener category URLs
export function getScreenerCategorySitemapEntries(curatedCategories) {
  return curatedCategories.map((c) => ({
    url: `${SITE}/screener?category=${c.slug}`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'daily',
    priority: 0.75,
  }));
}
```

- [ ] **Step 2: Wire it into `app/sitemap.js`**

Current:
```js
import { getSitemapEntries, getHomeSitemapEntries } from '@/lib/metadata';

/**
 * app/sitemap.js — Dynamic sitemap generation
 *
 * Next.js automatically serves this at /sitemap.xml
 * All page entries come from lib/metadata.js, so adding a new page
 * only requires adding it to PAGE_META — the sitemap updates automatically.
 */
export default function sitemap() {
  return [
    ...getSitemapEntries(),
    ...getHomeSitemapEntries(),
  ];
}
```

Replace with:
```js
import { getSitemapEntries, getHomeSitemapEntries, getScreenerCategorySitemapEntries } from '@/lib/metadata';
import { CURATED_CATEGORIES } from './screener/screenerContent';

/**
 * app/sitemap.js — Dynamic sitemap generation
 *
 * Next.js automatically serves this at /sitemap.xml
 * All page entries come from lib/metadata.js, so adding a new page
 * only requires adding it to PAGE_META — the sitemap updates automatically.
 */
export default function sitemap() {
  return [
    ...getSitemapEntries(),
    ...getHomeSitemapEntries(),
    ...getScreenerCategorySitemapEntries(CURATED_CATEGORIES),
  ];
}
```

- [ ] **Step 3: Build, then verify the sitemap**

Run: `npm run build`
Expected: build succeeds.

Run:
```bash
npm run dev &
sleep 5
curl -s http://localhost:3000/sitemap.xml | grep -c "screener?category="
```
Expected: `6`. Stop the dev server afterward.

- [ ] **Step 4: Commit**

```bash
git add lib/metadata.js app/sitemap.js
git commit -m "feat(sitemap): add the 6 curated screener category URLs"
```
