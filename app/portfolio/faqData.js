/**
 * app/portfolio/faqData.js
 *
 * Single source of truth for the Portfolio dashboard's FAQ -- imported by
 * both page.js (the visible, crawlable list on the logged-out gate) and
 * layout.js (the FAQPage JSON-LD), so they can never drift apart. Google's
 * structured-data guidelines require FAQPage schema to match what's
 * actually visible on the page.
 *
 * Deliberately distinct from app/cas-tracker/faqData.js's questions: that
 * page's FAQ is about the CAS upload/parsing mechanics, this one is about
 * the ongoing dashboard experience -- family view, freshness, privacy,
 * manual holdings.
 */

export const PORTFOLIO_FAQ = [
  {
    q: "What's the difference between My Portfolio and the CAS Tracker?",
    a: 'CAS Tracker is where you upload and parse a Consolidated Account Statement. My Portfolio is your ongoing dashboard — the destination you land on afterwards, showing your saved holdings, live wealth number, and top positions at a glance. You only need to upload once; after that, My Portfolio always reflects your latest saved data.',
  },
  {
    q: 'How often is my portfolio value updated?',
    a: 'Every time you open My Portfolio, holding values are recalculated against the latest AMFI end-of-day NAV (and live SIF NAVs where available) — not a cached number from when you uploaded your CAS.',
  },
  {
    q: "Can I see my whole family's investments in one place?",
    a: 'Yes. If your CAS covers multiple PAN holders (a family statement), My Portfolio detects each one automatically and lets you switch between individual views or a combined family total — all from the same upload.',
  },
  {
    q: "Can I add investments that aren't in my CAS yet, like a new SIF?",
    a: "Yes. Newly launched SIF (Specialised Investment Fund) allocations or other holdings not yet reflected in your CAS statement can be added manually with live NAV tracking, and they'll show up alongside your CAS-derived holdings in the same dashboard.",
  },
  {
    q: 'Is my portfolio data private?',
    a: 'Yes. Only you and your AMFI-registered distributor at Abundance Financial Services (ARN-251838) can see your saved portfolio. It is never shown to other clients or made public.',
  },
  {
    q: 'Do I need to re-upload my CAS every time I visit?',
    a: 'No. Once uploaded via CAS Tracker, your statement is saved securely to your account. My Portfolio loads it automatically on every visit — no re-upload needed unless you want to add a newer statement.',
  },
  {
    q: 'What is Portfolio XIRR, and why does it sometimes say "based on N of M holdings"?',
    a: "XIRR (Extended Internal Rate of Return) is your true money-weighted annual return, accounting for every purchase, SIP instalment, and switch on the exact date it happened — not just a simple gain percentage. It's only shown when at least one holding has a complete, verifiable transaction history from your CAS. If some of your holdings have a partial history (e.g. an older folio, or a transfer where the very first transaction predates your uploaded statement), the figure is still shown using the holdings that do have full history, with a note on how many were included, rather than hiding it entirely.",
  },
  {
    q: 'Can I plan a redemption or see my past transactions from My Portfolio?',
    a: "Yes. Every CAS-derived holding card has a Redemption button that opens a FIFO lot-level planner — it shows exactly which purchase lots a redemption would consume, the STCG/LTCG split with Jan 31 2018 grandfathering, and estimated tax, the same planner CAS Tracker uses. Any holding with recorded transactions also has a Transactions button showing your full buy/sell history, a rate-journey comparison against today's NAV, and an optional chart overlaying the fund's full NAV history.",
  },
];
