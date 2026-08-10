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

/**
 * Generates scheme-tailored FAQs for individual SIF detail pages (/sif/[id]).
 * Synchronized across app/sif/[id]/page.js (JSON-LD) and SifDetailClient.jsx (HTML).
 */
export function getSchemeFaq(sif = {}, holdingsCount = 0) {
  if (!sif || !sif.nav_name) return [];

  const cleanName = (sif.nav_name || '').replace(/\s*-\s*(Regular Plan|Regular|Direct Plan|Direct).*/i, '').trim();
  const cat = (sif.category || '').toLowerCase();
  const amc = sif.sif_name || 'the Asset Management Company';
  const navVal = sif.nav ? `₹${Number(sif.nav).toFixed(4)}` : 'N/A';
  const navDateStr = sif.nav_date || sif.asof || 'latest AMFI feed';
  const schemeId = sif.scheme_id || '';

  // Determine category-specific explanation
  let strategyExplanation = '';
  let benchmarkText = '';

  if (cat.includes('ex-top 100') || cat.includes('ex top 100')) {
    strategyExplanation = `${cleanName} follows SEBI's Equity Ex-Top 100 Long-Short SIF strategy. It invests a minimum of 65% in mid-cap and small-cap companies outside India's top 100 by market capitalization, with up to 25% short derivative exposure to generate alpha and manage downside risk.`;
    benchmarkText = 'The official SEBI benchmark for Equity Ex-Top 100 Long-Short SIFs is the NIFTY 500 Total Return Index (TRI), mapped to BSE 500 for daily series tracking.';
  } else if (cat.includes('equity long-short') || cat.includes('equity long short')) {
    strategyExplanation = `${cleanName} follows SEBI's Equity Long-Short SIF mandate, maintaining a minimum 80% allocation in equities and equity derivatives. The fund manager can take up to 25% unhedged short positions via equity derivatives to capture opportunities in both rising and falling markets.`;
    benchmarkText = 'This scheme is benchmarked against broad equity indices like BSE 500 TRI or SENSEX TRI to evaluate risk-adjusted equity alpha.';
  } else if (cat.includes('sector rotation')) {
    strategyExplanation = `${cleanName} follows SEBI's Sector Rotation Long-Short SIF mandate, allocating a minimum of 80% across a maximum of 4 focus sectors. The manager dynamically rotates allocations and uses sector derivatives (up to 25% shorting) to capitalize on changing macroeconomic cycles.`;
    benchmarkText = 'Performance is benchmarked against sector and broad-market indices relevant to the focused sector choices.';
  } else if (cat.includes('active asset allocator') || cat.includes('hybrid')) {
    strategyExplanation = `${cleanName} is an Active Asset Allocator / Hybrid Long-Short SIF. It dynamically shifts allocation across Equities, Debt securities (G-Secs, T-Bills, NCDs), Commodities (Gold & Silver Futures), REITs & InvITs, and Cash/Reverse Repo based on valuation models.`;
    benchmarkText = 'This multi-asset scheme is benchmarked against hybrid indices matching its target multi-asset risk profile.';
  } else {
    strategyExplanation = `${cleanName} is a SEBI-regulated Specialised Investment Fund (${sif.category}) managed by ${amc}. SIFs provide sophisticated long-short and multi-asset capabilities unavailable in standard mutual funds.`;
    benchmarkText = 'Benchmarked against SEBI-approved index series corresponding to its category mandate.';
  }

  const holdingsText = holdingsCount > 0
    ? ` As per the latest portfolio disclosure, ${cleanName} holds ${holdingsCount} active instruments across asset classes.`
    : '';

  return [
    {
      q: `What is the investment strategy of ${cleanName}?`,
      a: `${strategyExplanation}${holdingsText}`,
    },
    {
      q: `What is the current NAV and launch date of ${cleanName}?`,
      a: `As of ${navDateStr}, the NAV of ${cleanName} is ${navVal}. SIF NAVs are published daily by AMFI through a dedicated SIF NAV feed. Inception date: ${sif.inception_date || '2024-2025 launch'}.`,
    },
    {
      q: `What is the minimum investment for ${cleanName}?`,
      a: `The minimum investment in ${cleanName} (Scheme ID: ${schemeId}) is ₹10,00,000 (Ten Lakhs) across SIF strategies of ${amc} at the investor's PAN level. Accredited investors recognized by SEBI are exempt from the ₹10 lakh minimum requirement.`,
    },
    {
      q: `What benchmark does ${cleanName} track?`,
      a: `${benchmarkText}`,
    },
    {
      q: `What happens if my investment in ${cleanName} falls below ₹10 Lakhs?`,
      a: `If your total SIF portfolio drops below ₹10 lakh due to market NAV fall (Passive Breach), it is allowed, but partial redemptions are paused until you top up or redeem 100%. Investor-initiated redemptions that actively reduce your balance below ₹10 lakh (Active Breach) are prohibited.`,
    },
    {
      q: `What is the redemption notice period for ${cleanName}?`,
      a: `Under SEBI SIF guidelines, ${amc} may specify a redemption notice period of up to 15 working days for ${cleanName}. Redemptions are settled at the NAV applicable at the end of the notice period.`,
    },
    {
      q: `How is ${cleanName} taxed?`,
      a: `SIFs operate under SEBI Mutual Fund regulations. If ${cleanName} maintains ≥65% average domestic equity allocation, capital gains are taxed at equity rates (STCG @ 20%, LTCG above ₹1.25 Lakh @ 12.5%). Non-equity or hybrid strategies follow applicable debt/slab tax rules.`,
    },
  ];
}
