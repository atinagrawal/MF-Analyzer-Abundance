/**
 * app/pricing/pricingFaq.js — Single source of truth for Pricing FAQs
 * Shared by app/pricing/layout.js (JSON-LD FAQPage schema) and app/pricing/page.js (UI rendering)
 */

export const PRICING_FAQ = [
  {
    q: 'What is included in Abundance Pro?',
    a: 'Abundance Pro unlocks complete portfolio analysis & disclosure tools: Proposal Studio (build multi-fund investment proposals with PDF/link sharing), Pairwise Fund Overlap Analyzer (detect exact stock duplication), Complete 30-100+ Stock Holdings Disclosure (view full security weightages beyond the Top 10 limit), AMFI Market-Cap Breakdown (official Large, Mid & Small cap split), CAS Portfolio Tracker (upload CAMS/KFintech statements for real XIRR & goal tracking), Market Breadth Pro (stocks above 200 DMA & regime signals), and SEBI Stress Test liquidity data.',
  },
  {
    q: 'Why are full portfolio holdings gated for free accounts?',
    a: 'Free accounts can view the top 10 holdings of all 2,500+ mutual funds and SIFs. Accessing full security disclosures beyond the top 10 requires active parsing and updating of monthly portfolio disclosures across 40+ AMCs. Abundance Pro covers data pipeline costs while providing financial advisors, MFDs, and serious investors with institutional-grade portfolio depth.',
  },
  {
    q: 'How does Proposal Studio & Fund Overlap work?',
    a: 'Proposal Studio allows you to combine multiple mutual funds and SIFs into a single unified proposal. It calculates pairwise fund overlap using the minimum-weight method — showing you exact stock duplication so you avoid paying multiple expense ratios for identical underlying holdings.',
  },
  {
    q: 'Is my CAS statement data safe and private when I upload?',
    a: 'Yes. CAS statement PDFs are parsed securely to calculate your portfolio XIRR, gains, and holdings. We never store or share your financial data with third parties. You can clear or delete your CAS holdings from your account at any time.',
  },
  {
    q: 'What is the difference between Annual Pro (₹499) and Lifetime Pro (₹1,999)?',
    a: 'Annual Pro provides 1 full year (365 days) of Pro access for ₹499 + 18% GST (Total ₹588.82). Lifetime Pro is a single one-time payment of ₹1,999 + 18% GST (Total ₹2,358.82) that never expires — giving you permanent access to all current and future Pro features with zero renewal fees.',
  },
  {
    q: 'What payment methods are accepted and is it secure?',
    a: 'Payments are processed securely via Razorpay, a PCI DSS-compliant payment gateway. We accept UPI (Google Pay, PhonePe, Paytm, BHIM), Credit & Debit cards, Net Banking across all Indian banks, and digital wallets. We never store your card numbers or UPI PINs.',
  },
  {
    q: 'Do I need to sign in to use the free tools?',
    a: 'No. Basic tools like the Mutual Fund Screener (top 10 holdings), SIP/SWP Backtester, Rolling Returns Calculator, Index Dashboard, and Live Market Watch are 100% free and accessible without sign-in.',
  },
  {
    q: 'What is your refund policy?',
    a: 'If you are not completely satisfied with Abundance Pro, contact us within 7 days of purchase at support@getabundance.in or via phone/WhatsApp, and we will issue a full 100% refund.',
  },
  {
    q: 'Who operates Abundance Financial Services?',
    a: 'Abundance Financial Services is operated by Atin Kumar Agrawal, an AMFI Registered Mutual Fund & SIF Distributor (ARN-251838) based in Haldwani, Uttarakhand.',
  },
];
