/**
 * lib/sifFaq.js
 *
 * Single source of truth for SIF Screener FAQ content.
 * Imported by:
 *   - app/sifs/page.js       → FAQPage JSON-LD schema (server, buildJsonLd)
 *   - app/sifs/SifScreener.jsx → rendered HTML accordion (client)
 *
 * Keeping both in sync ensures Google's rich-snippet eligibility (it
 * requires matching HTML content alongside the JSON-LD) — mirrors the
 * lib/pmsFaq.js pattern already used by the PMS Screener.
 *
 * The AMC-list question is dynamic (depends on which fund houses currently
 * have live schemes), so this exports a function rather than a static
 * array — call it with the same `schemes`/`navDate` already available in
 * both the server component and the client component's own state.
 */

export function getSifFaq(schemes = [], navDate = '') {
  const amcList = schemes.length
    ? [...new Set(schemes.map(s => s.sif_name))].join(', ')
    : 'Multiple AMFI-registered AMCs';

  return [
    {
      q: 'What is a Specialised Investment Fund (SIF)?',
      a: 'A Specialised Investment Fund (SIF) is a SEBI-regulated investment category introduced under the February 2025 regulatory framework (effective 1 April 2025). SIFs bridge the gap between traditional mutual funds and Portfolio Management Services (PMS), offering advanced strategies like long-short equity, sector rotation, and dynamic asset allocation under a mutual fund trust structure.',
    },
    {
      q: 'What is the minimum investment requirement for a SIF in India?',
      a: 'The minimum investment in a Specialised Investment Fund (SIF) is ₹10,00,000 (Ten Lakh Rupees) across SIF strategies offered by the same AMC at the investor\'s PAN level. This threshold is exclusive of regular mutual fund investments. Accredited investors recognized by SEBI are exempt from the ₹10 lakh minimum investment requirement.',
    },
    {
      q: 'What happens if a SIF portfolio drops below ₹10 Lakhs (Active vs Passive Breach)?',
      a: 'If a SIF balance drops below ₹10 lakh due to market movements or NAV decline (Passive Breach), it is not a regulatory violation. However, partial redemptions are paused, and the investor can only perform a full redemption of the remaining balance or top up back to ₹10 lakh. Investor-initiated redemptions that actively reduce holdings below ₹10 lakh (Active Breach) are prohibited and blocked by RTAs and AMCs.',
    },
    {
      q: 'What is the redemption notice period for Specialised Investment Funds?',
      a: 'Under SEBI SIF regulations, AMCs may specify a redemption notice period of up to a maximum of 15 working days for specific strategies. Redemptions are processed based on the NAV at the end of the notice period, allowing fund managers to optimize portfolio liquidity for complex long-short and derivative positions.',
    },
    {
      q: 'What are the main strategy categories permitted under SIF regulations?',
      a: 'SEBI allows three primary strategy umbrellas for SIFs: (1) Equity-Oriented Strategies (Equity Long-Short with min 80% equity & up to 25% unhedged short exposure; Equity Ex-Top 100 focusing on mid/small caps; Sector Rotation across max 4 sectors), (2) Debt-Oriented Strategies (Debt Long-Short using exchange-traded debt derivatives), and (3) Hybrid / Active Asset Allocation Strategies (dynamic multi-asset positioning across equity, debt, gold, REITs, and InvITs).',
    },
    {
      q: 'Which Asset Management Companies (AMCs) can launch a SIF?',
      a: `To offer SIFs, an AMC must be SEBI-registered with at least 3 years of operations and a 3-year average AUM of ₹10,000 crore, OR employ a CIO with 10+ years experience managing ₹5,000 crore AUM alongside a dedicated SIF fund manager with 3+ years experience managing ₹500 crore AUM. As of ${navDate || 'the latest data'}, live SIF schemes are offered by: ${amcList}.`,
    },
    {
      q: 'How are SIFs taxed compared to Mutual Funds and PMS?',
      a: 'SIFs are structured under SEBI Mutual Fund regulations and follow standard mutual fund tax treatment. Equity-oriented SIF strategies maintaining ≥65% average domestic equity allocation qualify for equity capital gains tax rates (Short-Term Capital Gains at 20% and Long-Term Capital Gains above ₹1.25 Lakh at 12.5%). Non-equity/hybrid SIFs are taxed according to applicable slab or debt mutual fund tax rules.',
    },
    {
      q: 'How does SIF compare with Mutual Funds, PMS, and Category III AIFs?',
      a: 'SIFs occupy a unique sweet spot: unlike standard Mutual Funds, SIFs can take short positions via unhedged derivatives and pursue sector rotation. Unlike PMS (minimum ₹50 lakh) and AIFs (minimum ₹1 crore), SIFs require only ₹10 lakh minimum investment. Furthermore, SIFs publish daily AMFI NAVs and operate under mutual fund trust protections.',
    },
  ];
}
