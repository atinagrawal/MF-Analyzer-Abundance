import { NextResponse } from 'next/server';
import { getAllPmsDirectoryProviders } from '@/lib/pmsCompliance';

export const revalidate = 21600;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
  const includeInactive = searchParams.get('include_inactive') === 'true';

  const providers = await getAllPmsDirectoryProviders({ includeInactive });

  if (format === 'md') {
    let md = `# Indian SEBI Registered PMS Providers Directory\n\n`;
    md += `*Published by Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)*\n`;
    md += `*Data source: SEBI Monthly PMS Compliance Filings via APMI VISTA (Latest Filing: ${providers[0]?.monthLabel || 'August 2026'})*\n\n`;
    md += `Note: Core PMS AUM excludes institutional retirement mandates (such as government EPFO funds) to present an unbiased view of genuine commercial and HNI portfolios.\n\n`;
    md += `| Rank | PMS Provider | Registration No | Core PMS AUM (₹ Cr) | Raw AUM (₹ Cr) | Clients | Net Flow (Month) | Listed Equity % | Est. Turnover |\n`;
    md += `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    providers.forEach((p, idx) => {
      const netFlowStr = p.discNetMonthCr > 0 ? `+₹${p.discNetMonthCr} Cr` : p.discNetMonthCr < 0 ? `-₹${Math.abs(p.discNetMonthCr)} Cr` : `₹0`;
      md += `| ${idx + 1} | [${p.name}](https://mfcalc.getabundance.in/pms-directory/${p.slug}) | ${p.registrationNo} | ₹${p.coreAumCr.toLocaleString('en-IN')} | ₹${p.grandTotalAumCr.toLocaleString('en-IN')} | ${p.coreClients.toLocaleString('en-IN')} | ${netFlowStr} | ${p.equityListedPct}% | ${p.turnoverDisplay || '—'} |\n`;
    });

    md += `\n\n---\n*Disclaimer: Minimum investment in PMS in India is ₹50 Lakh per SEBI regulations. This data is strictly factual and does not constitute investment advice.*`;

    return new Response(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=21600, s-maxage=21600',
      },
    });
  }

  return NextResponse.json(
    {
      asOf: providers[0]?.monthLabel || 'August 2026',
      totalActiveProviders: providers.filter(p => p.isActive).length,
      providersCount: providers.length,
      providers,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=21600, s-maxage=21600',
      },
    }
  );
}
