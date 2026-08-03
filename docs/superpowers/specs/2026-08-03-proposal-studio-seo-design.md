# Proposal Studio SEO Design

## Goal

Make `/proposal-studio` a genuinely indexable, competitively-positioned page — matching the site's existing pattern (used by `/market-breadth`, `/pms-screener`, `/rolling`, etc.): rich structured data, an always-visible crawlable explainer + FAQ section outside the Pro paywall, and a branded OG image — while the actual interactive tool stays gated exactly as it is today.

## Metadata & sitemap registration

Add a new `PAGE_META.proposalStudio` entry to `lib/metadata.js`, matching every existing entry's shape:

```js
proposalStudio: {
  title: 'Proposal Studio — Fund Overlap, Exposure & M-Cap Analysis | Abundance',
  description: 'Build a mutual fund or SIF investment proposal — see combined sector/stock exposure, fund overlap, and Large/Mid/Small-cap allocation using AMFI\'s official categorization. Premium tool by Abundance Financial Services (ARN-251838).',
  keywords: 'mutual fund overlap checker, portfolio overlap calculator India, multi fund analysis tool, mutual fund sector exposure, AMFI large mid small cap categorization, SIF portfolio analysis, investment proposal builder India, fund overlap detector',
  path: '/proposal-studio',
  ogImage: '/api/og-proposal-studio',
  changefreq: 'weekly',
  priority: 0.75,
}
```

`app/proposal-studio/layout.js` switches from its current `export const metadata = {...}` object to the standard pattern every other indexed page uses:

```js
import { getPageMeta } from '@/lib/metadata';
export const metadata = getPageMeta('proposalStudio');
```

This automatically flips `robots` to `{index: true, follow: true, noarchive: true}` (via `getPageMeta`'s shared defaults, same as `/market-breadth`/`/portfolio`) and registers the page in `app/sitemap.js` with no separate edit needed there, per that file's own "adding a new page only requires adding it to PAGE_META" convention.

## Structured data (JSON-LD)

`app/proposal-studio/layout.js` gains the same three `<script type="application/ld+json">` blocks `app/market-breadth/layout.js` already has, adapted for this page:
- **`WebApplication`** schema describing Proposal Studio (name, description, the ₹499/yr Pro pricing, applicationCategory `FinanceApplication`).
- **`BreadcrumbList`** (Home → Proposal Studio).
- **`FAQPage`** schema built from the same FAQ data the visible page renders (see below) — one `Question`/`acceptedAnswer` pair per FAQ item, kept in sync with the rendered accordion by sharing one data source rather than duplicating the text.

## FAQ content — single source of truth

New file `lib/proposalStudioFaq.js`, matching `lib/pmsFaq.js`'s exact shape (`export const PROPOSAL_STUDIO_FAQ = [{q, a}, ...]`), imported by both the layout's JSON-LD and the page's visible accordion — the same "kept in sync automatically" pattern `lib/pmsFaq.js`'s own header comment describes.

Ten questions, full answers (none reference the underlying data source by name, per the standing rule):

1. **What is fund overlap and why does it matter?** — Fund overlap happens when two or more mutual funds you hold invest heavily in the same stocks. If your funds overlap significantly, you're not as diversified as you think — you're effectively paying multiple expense ratios to hold similar exposure. Checking overlap helps you build a portfolio that's genuinely spread across different holdings, not just different fund names.
2. **How is overlap calculated?** — For every pair of funds in your proposal, Proposal Studio looks at each stock held by both funds and takes the smaller of the two funds' weights in that stock, then sums this across all shared stocks. This "minimum weight" method is the same convention used in professional investment research — it measures how much of your money is genuinely duplicated, not just how many stock names happen to match.
3. **Does overlap include debt and cash holdings?** — No. Overlap is calculated on equity stock holdings only, matching how overlap is measured in professional advisory proposals. Debt, cash, and other non-equity holdings are shown separately in Asset Allocation and Stock Exposure but excluded from the overlap grid.
4. **What is M-Cap allocation and how is it categorized?** — M-Cap (market capitalization) allocation shows what % of your combined equity holdings are in Large-cap, Mid-cap, and Small-cap stocks, using AMFI's own official semi-annual stock categorization — the same list SEBI-regulated mutual funds use to classify their own holdings — so the split you see matches the regulatory definition, not an approximation.
5. **Can I build a proposal with just one fund?** — Yes. Every section — asset allocation, sector exposure, stock exposure, scheme details, and M-Cap allocation — works with a single fund. Only Portfolio Overlap needs at least two funds, since overlap is inherently a comparison.
6. **How do I import my existing portfolio from my CAS statement?** — If you've already uploaded a CAS (Consolidated Account Statement) on the CAS Tracker page, Proposal Studio's "From your CAS holdings" tab lists your actual mutual fund holdings with their real invested value pre-filled automatically. No CAS statement yet? You can still search and add funds manually.
7. **Can I include SIFs (Specialized Investment Funds) in a proposal?** — Yes. Use the "SIFs" tab within fund search to find and add any SEBI-registered Specialised Investment Fund alongside your mutual funds, with the same overlap, exposure, and M-Cap analysis.
8. **What's the difference between a Lumpsum and SIP proposal?** — A Lumpsum proposal models a one-time investment amount split across your chosen funds. A SIP proposal models a recurring investment (daily or monthly) instead. Each proposal is one type or the other — for both a lumpsum and a separate SIP, build two proposals.
9. **How often is the holdings/exposure data updated?** — Fund holdings are typically refreshed within a few days of each fund's latest disclosed portfolio (mutual funds and SIFs both disclose full holdings monthly). AMFI's Large/Mid/Small-cap categorization list refreshes twice a year, in line with when AMFI itself republishes it.
10. **What does Proposal Studio cost?** — Proposal Studio is a Pro feature, included with the ₹499/year Abundance Financial Services Pro plan (plus 18% GST), alongside Market Breadth, MF Screener, and other premium tools.

## Always-visible page content (the crawlable part)

Matching `/market-breadth`'s structure exactly: content that renders for **every** visitor regardless of auth/plan state, placed in `ProposalStudioClient.jsx` outside all three gate branches (sign-in gate / Pro gate / actual tool) — this is what search engines and logged-out visitors actually see.

- A short explainer section (2-3 sentences + a bullet list of what the tool shows: combined exposure, fund overlap, M-Cap allocation, scheme details) — genuinely descriptive content, not a teaser.
- An "FAQ" heading followed by the FAQ accordion: `PROPOSAL_STUDIO_FAQ.map(...)` rendering one `CollapsibleSection` per question (reusing the component already in `ProposalStudioClient.jsx`, `title={faq.q}`, `defaultOpen={false}` so the page doesn't open with 10 expanded blocks, `{faq.a}` as its children) — no new UI component needed.

The gates (sign-in prompt / Pro upgrade prompt / the interactive tool itself) render below this, exactly as they do today — this spec doesn't change any gating behavior.

## OG image

New route `app/api/og-proposal-studio/route.js`, matching the existing `/api/og-breadth`, `/api/og-portfolio`, etc. pattern (`@vercel/og`'s `ImageResponse`, edge runtime, 1200×630): a branded card with the Abundance forest-green palette, the Proposal Studio title, and a short tagline ("Fund Overlap · Exposure · M-Cap Analysis").

## Explicitly out of scope

- No change to the Pro-gating logic, the picker, or any analysis behavior — this spec is metadata/content/structured-data only.
- No change to `PROPOSAL_STUDIO_FAQ`'s content once written here — future edits are a separate, later task if the tool's capabilities change again.

## Testing

- `npm run build`.
- Manual verification: view page source (or use a structured-data testing approach) to confirm the three JSON-LD blocks are present and valid; confirm the FAQ accordion and explainer render for a signed-out visitor; confirm `/api/og-proposal-studio` returns a 1200×630 image; confirm `/sitemap.xml` includes `/proposal-studio` after the `PAGE_META` addition.
