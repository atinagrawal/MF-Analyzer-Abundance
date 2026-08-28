/**
 * lib/pmsDetailFaq.js
 *
 * Per-strategy FAQ content for a PMS detail page -- single source of truth
 * feeding both the FAQPage JSON-LD (app/pms/[id]/page.jsx's generateMetadata)
 * and the rendered HTML accordion (PMSDetailClient.jsx), matching
 * lib/pmsFaq.js's existing convention of keeping both in sync for Google's
 * rich-snippet eligibility. Unlike lib/pmsFaq.js (static, screener-wide),
 * these are templated per-strategy from its own free-tier details.
 *
 * @param {object} d - the free-tier `data` object from GET /api/pms-detail/[id]
 * @returns {Array<{q: string, a: string}>}
 */
export function buildPmsDetailFaq(d) {
  const name = d.iaName || d.strategyName || 'this PMS strategy';
  const provider = d.providerName || 'its portfolio manager';
  const minInvFormatted = d.minInvestment
    ? `₹${Number(d.minInvestment).toLocaleString('en-IN')}`
    : '₹50,00,000 (the SEBI-mandated PMS minimum)';

  return [
    {
      q: `What is ${name}?`,
      a: `${name} is a SEBI-regulated Portfolio Management Service (PMS) offered by ${provider}${d.category ? ` in the ${d.category} category` : ''}. It is registered with APMI (Association of Portfolio Managers in India), the official industry body for PMS.`,
    },
    {
      q: `What is the minimum investment for ${name}?`,
      a: `The minimum investment for ${name} is ${minInvFormatted}. This is per-strategy and can be higher than SEBI's ₹50 Lakh regulatory floor.`,
    },
    {
      q: `What are the fees for ${name}?`,
      a: `${name}'s fixed fee structure is: ${d.fixedFees || 'not disclosed'}. Its variable fee structure is: ${d.variableFees || 'not disclosed'}. Exit load: ${d.exitLoad || 'not disclosed'}. All figures are sourced directly from APMI India's public disclosures.`,
    },
    {
      q: `What is the benchmark for ${name}?`,
      a: `${name} is benchmarked against ${d.benchmark || 'an index disclosed by its portfolio manager'}, per its APMI filing.`,
    },
    {
      q: `Can I invest in ${name} through Abundance Financial Services?`,
      a: `Yes. Atin Kumar Agrawal (ARN-251838, APRN04279), owner of Abundance Financial Services® is an APMI Registered PMS Distributor serving investors across India. Call +91 98081 05923 or visit getabundance.in to book a free consultation about ${name}.`,
    },
  ];
}
