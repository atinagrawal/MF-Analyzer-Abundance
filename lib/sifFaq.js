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
      a: 'A Specialised Investment Fund (SIF) is a new SEBI-regulated investment category launched in 2024, designed for sophisticated investors. SIFs can use long-short strategies, derivatives, and alternative approaches unavailable in standard mutual funds. The minimum investment is ₹10 lakh.',
    },
    {
      q: 'What is the minimum investment for a SIF?',
      a: 'The minimum investment in a Specialised Investment Fund (SIF) is ₹10,00,000 (Ten Lakh Rupees), making it suitable for High Net Worth Individuals (HNIs) and accredited investors.',
    },
    {
      q: 'What are the different types of SIF strategies?',
      a: 'SIFs currently offer four SEBI-approved strategies: Equity Long-Short Fund, Equity Ex-Top 100 Long-Short Fund, Hybrid Long-Short Fund, and Active Asset Allocator Long-Short Fund. Each strategy has different risk-return profiles and can use long and short positions.',
    },
    {
      q: 'How are SIF NAVs different from mutual fund NAVs?',
      a: "SIF NAVs are published daily by AMFI, the same as mutual funds. However, SIF NAVs are not listed in the standard AMFI NAV file (NAVAll.txt) — they are published through a dedicated SIF NAV endpoint. Starting NAVs are typically ₹10 per unit.",
    },
    {
      q: 'Which AMCs offer Specialised Investment Funds?',
      a: `As of ${navDate || 'the latest data'}, the following fund houses offer SIFs in India: ${amcList}. New SIF launches are expected as SEBI has approved the framework for all registered mutual fund houses.`,
    },
    {
      q: 'Is SIF better than a PMS or AIF?',
      a: 'SIFs occupy a middle ground between mutual funds and Portfolio Management Services (PMS). Like mutual funds, SIFs have daily NAVs, SEBI regulation, and AMFI listing. Unlike PMS (minimum ₹50 lakh), SIFs start at ₹10 lakh. Unlike Category III AIFs, SIFs are regulated by the mutual fund framework, offering more investor protection.',
    },
  ];
}
