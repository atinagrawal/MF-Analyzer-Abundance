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
  // --- Portfolio Overlap ---
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
    q: 'What percentage of overlap should I be concerned about?',
    a: 'As a rule of thumb: overlap above 30% between two equity funds in the same broad category (e.g. two Flexi Cap funds) means they have meaningful duplication and you should question whether holding both adds genuine diversification. Overlap of 50%+ effectively means the two funds are moving together — you\'re running a more expensive, less-flexible version of one fund. Overlap between different categories (e.g. a Large Cap and a Small Cap fund) is naturally lower and less concerning. There\'s no universal cut-off — it depends on your goal for holding each fund.',
  },
  {
    q: 'Can two top-rated funds still have high overlap?',
    a: 'Yes — and this is one of the most common portfolio construction mistakes. Two highly-rated funds in the same category often share similar conviction calls at the top of their portfolios. For example, HDFC Bank, Reliance, and Infosys appear in the top 5 holdings of many Large Cap and Flexi Cap funds simultaneously. A 5-star rating on each fund individually doesn\'t mean holding both produces a meaningfully diversified portfolio — Proposal Studio\'s overlap calculation shows you exactly how much duplication exists.',
  },

  // --- M-Cap Allocation ---
  {
    q: 'What is M-Cap allocation and how is it categorized?',
    a: "M-Cap (market capitalization) allocation shows what % of your combined equity holdings are in Large-cap, Mid-cap, and Small-cap stocks, using AMFI's own official semi-annual stock categorization — the same list SEBI-regulated mutual funds use to classify their own holdings — so the split you see matches the regulatory definition, not an approximation.",
  },
  {
    q: 'Why does M-Cap allocation matter for portfolio construction?',
    a: 'Your M-Cap split fundamentally determines your portfolio\'s risk-return profile. A portfolio concentrated in large caps tends to be more stable with lower drawdowns but also lower long-term growth potential. A portfolio skewed towards small and mid caps can deliver significantly higher returns over long periods but with much larger short-term swings. Understanding your actual combined M-Cap split — across all funds, not just looking at individual fund mandates — helps you ensure the overall portfolio aligns with your risk tolerance and investment horizon.',
  },
  {
    q: 'How often is the AMFI M-Cap categorization updated?',
    a: "AMFI publishes its official Large/Mid/Small-cap stock categorization twice a year — typically in January and July — in line with SEBI's mandate. Proposal Studio's M-Cap allocation is updated after each AMFI refresh. Between refreshes, a stock's market cap may shift substantially due to price movements, but the categorization used for calculations remains the last published AMFI list.",
  },

  // --- Building a Proposal ---
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
    q: 'How do I split investment amounts across multiple funds in a proposal?',
    a: 'After adding funds to your proposal, you can set either a percentage allocation or a fixed rupee amount for each fund. Proposal Studio automatically computes the weighted combined exposure across all funds based on these allocations — so the sector exposure, security exposure, and M-Cap breakdown you see reflect your actual intended portfolio proportions, not just an equal split.',
  },
  {
    q: 'Can I share or print my proposal?',
    a: 'Yes. Every proposal has a unique sharable link that you can send to a client, colleague, or financial advisor. The shared view is read-only — the recipient can view all sections without needing to log in. You can also print directly from the browser for a physical or PDF copy.',
  },

  // --- Data & Accuracy ---
  {
    q: 'How often is the holdings/exposure data updated?',
    a: "Fund holdings are typically refreshed within a few days of each fund's latest disclosed portfolio (mutual funds and SIFs both disclose full holdings monthly). AMFI's Large/Mid/Small-cap categorization list refreshes twice a year, in line with when AMFI itself republishes it.",
  },
  {
    q: 'What if a fund I add has no holdings data available?',
    a: "If a fund's portfolio hasn't been disclosed yet (common for recently launched funds) or hasn't been ingested by our system, the holdings-dependent sections — Security Exposure, Sector Exposure, Portfolio Overlap, and M-Cap Allocation — will show a \"no data\" indicator for that fund. Other sections like Scheme Details will still populate from AMFI's NAV and scheme registry data.",
  },
  {
    q: 'Does Proposal Studio show the holdings of debt instruments within hybrid funds?',
    a: 'Yes. For hybrid or balanced funds, all individually named holdings — both equity stocks and named bonds/debentures — appear in the Security Exposure section. The Asset Allocation section shows the equity vs. debt vs. cash breakdown for each fund. Cash and repo positions (not individually named instruments) are aggregated as a "Cash & Equivalents" line rather than listed individually.',
  },

  // --- Taxation ---
  {
    q: 'How are mutual fund gains taxed in India?',
    a: 'Tax treatment depends on the fund type and holding period. For equity-oriented funds (65%+ in equity): Short-Term Capital Gains (STCG, held < 1 year) are taxed at 20%; Long-Term Capital Gains (LTCG, held ≥ 1 year) above ₹1.25 lakh per year are taxed at 12.5% without indexation. For debt-oriented funds: STCG (held < 24 months) is added to income and taxed at your slab rate; LTCG (held ≥ 24 months) is taxed at 12.5% without indexation. International Fund of Funds follow debt taxation regardless of the underlying holdings.',
  },
  {
    q: 'Is ELSS the best tax-saving mutual fund option under Section 80C?',
    a: 'ELSS offers the shortest lock-in (3 years) among all Section 80C instruments and the only one with equity market upside potential, making it a strong option for long-term investors comfortable with equity risk. However, 80C itself has a ₹1.5 lakh annual limit and may already be fully consumed by EPF, PPF, home loan principal, or life insurance premiums. If your 80C is already exhausted, investing in ELSS provides no additional tax deduction — evaluate it as a pure equity investment instead. For investors in the new tax regime, 80C deductions no longer apply at all.',
  },
  {
    q: 'Are SIF gains taxed the same as mutual fund gains?',
    a: 'SIFs follow the same tax treatment as mutual funds based on their portfolio composition. An equity-oriented SIF (65%+ in equity) would attract the same 20% STCG / 12.5% LTCG treatment as an equity mutual fund. The regulatory novelty of SIFs (e.g. long-short strategies) doesn\'t change the tax classification — only the portfolio composition matters for determining the applicable capital gains tax rate.',
  },

  // --- Compliance ---
  {
    q: "What does Proposal Studio cost?",
    a: "Proposal Studio is a Pro feature, included with the ₹499/year Abundance Financial Services Pro plan (plus 18% GST), alongside Market Breadth, MF Screener, and other premium tools.",
  },
  {
    q: 'Is the proposal generated here considered investment advice?',
    a: 'No. Proposal Studio is an analytical and presentation tool — it generates data-driven portfolio illustrations based on the funds you choose and the allocations you define. It does not recommend which funds to buy, assess your individual suitability, or constitute a personalised investment recommendation. All investment decisions remain the responsibility of the investor or their qualified financial advisor. Abundance Financial Services is an AMFI-registered distributor (ARN-251838), not a SEBI-registered investment adviser.',
  },
  {
    q: 'Who should use Proposal Studio?',
    a: 'Proposal Studio is useful for two main audiences. For self-directed investors: it helps you analyse your own portfolio construction decisions — checking overlap, visualising combined sector exposure, and verifying M-Cap distribution before committing. For AMFI-registered mutual fund distributors (MFDs) and financial advisors: it helps build client-facing investment proposals with professional-grade portfolio analysis, including sector exposure, overlap, and M-Cap breakdown, shareable via link or printable as a PDF.',
  },
];

