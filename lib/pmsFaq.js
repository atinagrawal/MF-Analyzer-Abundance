/**
 * lib/pmsFaq.js
 *
 * Single source of truth for PMS Screener FAQ content.
 * Imported by:
 *   - app/pms-screener/layout.jsx  → FAQPage JSON-LD schema
 *   - app/pms-screener/page.jsx    → rendered HTML accordion
 *
 * Keeping both in sync ensures Google's rich-snippet eligibility
 * (it requires matching HTML content alongside the JSON-LD).
 */

export const PMS_FAQ = [
  {
    q: 'What is a PMS (Portfolio Management Service) in India?',
    a: "A Portfolio Management Service (PMS) is a SEBI-regulated investment vehicle where a professional portfolio manager invests on behalf of high-net-worth individuals (HNIs). The minimum investment is ₹50 Lakhs as per SEBI regulations. Unlike mutual funds, PMS strategies are customised and hold securities directly in the investor's demat account.",
  },
  {
    q: 'How is PMS performance data sourced on this screener?',
    a: 'All performance data is sourced directly from APMI India (Association of Portfolio Managers in India) — the official SEBI-recognised industry body for PMS. Returns are calculated using Time-Weighted Rate of Return (TWRR), net of all management fees and expenses, as mandated by SEBI. Atin Kumar Agrawal (APRN04279) is an APMI Registered PMS Distributor.',
  },
  {
    q: 'What is the minimum investment for a PMS in India?',
    a: 'As per SEBI regulations, the minimum investment for a PMS in India is ₹50 Lakhs (₹50,00,000). This threshold was revised upward from ₹25 Lakhs in 2019 to ensure PMS products remain accessible primarily to sophisticated high-net-worth investors.',
  },
  {
    q: 'What is the difference between PMS and Mutual Funds in India?',
    a: "Key differences: (1) Minimum investment — PMS requires ₹50L vs no minimum for MFs. (2) Customisation — PMS portfolios are tailored to individual clients; MFs are pooled. (3) Ownership — In PMS, securities are held in the investor's own demat account; in MFs, investors hold units. (4) Fees — PMS charges management fees (typically 1–2.5% p.a.) plus performance fees; MFs charge an expense ratio. (5) Transparency — PMS provides complete portfolio visibility.",
  },
  {
    q: 'How can I compare PMS strategies on this screener?',
    a: 'Use the compare checkboxes (⚖) on each row. Select up to 3 strategies — a floating green bar appears at the bottom. Click "Compare Now" to open a side-by-side dossier showing returns across all time horizons (1M to Inception), alpha vs Nifty 50, AUM, and a ₹50L wealth simulation. Completely free, no login required.',
  },
  {
    q: 'Can I invest in PMS through Abundance Financial Services?',
    a: 'Yes. Atin Kumar Agrawal (ARN-251838, APRN04279), owner of Abundance Financial Services® is an APMI Registered PMS Distributor serving investors across India. Call +91 98081 05923 or visit getabundance.in to book a free consultation.',
  },
];
