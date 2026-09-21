/**
 * app/api/pms-provider/[slug]/route.js
 *
 * Dedicated Route Handler returning pure text/markdown PMS provider factsheets.
 * Used for GEO (Generative Engine Optimization) and AI crawler content negotiation:
 * - ChatGPT Search, Claude, Perplexity
 * - curl / HTTP clients requesting `Accept: text/markdown` or `?format=md`
 *
 * Returns Content-Type: text/markdown; charset=utf-8
 * Follows AMFI ARN-251838 / APMI APRN04279 distributor compliance.
 */

import { getPmsProviderDetail } from '@/lib/pmsProviders';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { slug } = await params;
  const rawParam = decodeURIComponent(slug || '').trim();

  if (!rawParam) {
    return new Response('# 400 Bad Request\n\nPMS provider slug parameter is required.', {
      status: 400,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  const pmsData = await getPmsProviderDetail(rawParam);

  if (!pmsData) {
    return new Response('# 404 PMS Provider Not Found\n\nThe requested Portfolio Management Service provider was not found.', {
      status: 404,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  if (pmsData.redirect) {
    const canonicalUrl = new URL(`/pms-provider/${pmsData.redirect}?format=md`, request.url);
    return Response.redirect(canonicalUrl, 308);
  }

  const { providerSlug, displayName, strategyCount, strategies, syncedAt } = pmsData;
  const canonicalUrl = `https://mfcalc.getabundance.in/pms-provider/${providerSlug}`;

  const lines = [];

  // Header
  lines.push(`# ${displayName} — PMS Strategies & Factsheets Directory`);
  lines.push('');
  lines.push(`**Canonical URL:** ${canonicalUrl}`);
  lines.push(`**Provider Name:** ${displayName}`);
  lines.push(`**Active Strategies Tracked:** ${strategyCount}`);
  if (syncedAt) {
    lines.push(`**Last Synchronized:** ${syncedAt.split('T')[0]}`);
  }
  lines.push('');

  // Strategies Table
  lines.push(`## Investment Strategies & Monthly Factsheets (${strategies.length})`);
  lines.push('');
  lines.push('| Strategy Name | Document Type | Period | Strategy Analytics | Factsheet PDF |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');

  for (const s of strategies) {
    const pmsLink = s.iaid ? `[View Strategy Analytics](https://mfcalc.getabundance.in/pms/${s.iaid})` : '—';
    const pdfLink = s.url ? `[Download PDF](${s.url})` : '—';
    lines.push(`| ${s.strategyName} | ${s.docType} | ${s.period || 'Latest'} | ${pmsLink} | ${pdfLink} |`);
  }
  lines.push('');

  // Portfolio Insights (if extracted)
  const extractedStrategies = strategies.filter((s) => s.extracted && s.extracted.topHoldings?.length > 0);
  if (extractedStrategies.length > 0) {
    lines.push('## Strategy Portfolio Holdings Snapshot');
    lines.push('');
    for (const s of extractedStrategies) {
      lines.push(`### ${s.strategyName}`);
      if (s.extracted.asOfDate) {
        lines.push(`*As of: ${s.extracted.asOfDate}*`);
      }
      lines.push('Top Portfolio Holdings:');
      for (const h of s.extracted.topHoldings) {
        lines.push(`- **${h.company || h.name}**: ${h.weight ? `${parseFloat(h.weight).toFixed(2)}%` : '—'}`);
      }
      lines.push('');
    }
  }

  // Statutory Dual Attribution Block
  lines.push('---');
  lines.push('### Regulatory Disclosures & Distributor Attribution');
  lines.push('');
  lines.push(
    'Portfolio Management Services (PMS) are subject to market risks. Discretionary and non-discretionary investments are not guaranteed. Read the Disclosure Document and strategy factsheets carefully before investing.'
  );
  lines.push('');
  lines.push(
    '**Abundance Financial Services** (ARN-251838, AMFI Registered Mutual Fund Distributor) · **Atin Kumar Agrawal** (APRN04279, APMI Registered PMS Distributor).'
  );

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
