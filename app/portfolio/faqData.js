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
];
