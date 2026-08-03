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
    a: 'For every pair of funds in your proposal, Proposal Studio looks at each named holding held by both funds — a stock, a specific bond, a REIT, a gold or other ETF — and takes the smaller of the two funds\' weights in that holding, then sums this across all shared holdings. This "minimum weight" method is the same convention used in professional investment research — it measures how much of your money is genuinely duplicated, not just how many names happen to match.',
  },
  {
    q: 'Does overlap include debt and cash holdings?',
    a: "It includes any holding that's individually named in a fund's disclosed portfolio — specific bonds, REITs, gold or other ETFs held as a fund-of-funds position — the same way it includes stocks. Only generic cash-equivalent positions (like a fund's short-term \"Net Current Assets\" or repo holdings) are excluded, since those aren't a real, comparable security across funds — they're shown separately as a combined cash total in Asset Allocation and Security Exposure instead.",
  },
  {
    q: 'What is M-Cap allocation and how is it categorized?',
    a: "M-Cap (market capitalization) allocation shows what % of your combined equity holdings are in Large-cap, Mid-cap, and Small-cap stocks, using AMFI's own official semi-annual stock categorization — the same list SEBI-regulated mutual funds use to classify their own holdings — so the split you see matches the regulatory definition, not an approximation.",
  },
  {
    q: 'Can I build a proposal with just one fund?',
    a: 'Yes. Every section — asset allocation, sector exposure, security exposure, scheme details, and M-Cap allocation — works with a single fund. Only Portfolio Overlap needs at least two funds, since overlap is inherently a comparison.',
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
