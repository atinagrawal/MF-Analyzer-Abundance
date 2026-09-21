/**
 * app/api/amc/[slug]/route.js
 *
 * Dedicated Route Handler returning pure text/markdown AMC directory factsheets.
 * Used for GEO (Generative Engine Optimization) and AI crawler content negotiation:
 * - ChatGPT Search, Claude, Perplexity
 * - curl / HTTP clients requesting `Accept: text/markdown` or `?format=md`
 *
 * Returns Content-Type: text/markdown; charset=utf-8
 * Follows AMFI ARN-251838 / APMI APRN04279 distributor compliance.
 */

import { getAmcDetail } from '@/lib/amcProfiles';

export const dynamic = 'force-dynamic';

function fmtCr(val) {
  const num = parseFloat(val) || 0;
  if (num <= 0) return '—';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

function fmtPct(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '—';
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
}

export async function GET(request, { params }) {
  const { slug } = await params;
  const rawParam = decodeURIComponent(slug || '').trim();

  if (!rawParam) {
    return new Response('# 400 Bad Request\n\nAMC slug parameter is required.', {
      status: 400,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  const amcData = await getAmcDetail(rawParam);

  if (!amcData) {
    return new Response('# 404 Asset Management Company Not Found\n\nThe requested AMC was not found.', {
      status: 404,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  if (amcData.redirect) {
    const canonicalUrl = new URL(`/amc/${amcData.redirect}?format=md`, request.url);
    return Response.redirect(canonicalUrl, 308);
  }

  const { amcName, amcSlug, totalAumCr, schemesCount, schemes, profile } = amcData;
  const canonicalUrl = `https://mfcalc.getabundance.in/amc/${amcSlug}`;
  const info = profile.info || {};
  const managers = profile.managers || [];

  const lines = [];

  // Header & Canonical Link
  lines.push(`# ${amcName} — Profile, AUM, Fund Managers & Scheme Directory`);
  lines.push('');
  lines.push(`**Canonical URL:** ${canonicalUrl}`);
  lines.push(`**Official Legal Entity:** ${info.legalName || amcName}`);
  if (totalAumCr > 0) {
    lines.push(`**Total Official AUM:** ${fmtCr(totalAumCr)}`);
  }
  lines.push(`**Total Schemes Managed:** ${schemesCount}`);
  if (info.launchDate) {
    lines.push(`**Inception / Launch Date:** ${info.launchDate.split('T')[0]}`);
  }
  if (info.rank) {
    lines.push(`**Industry AUM Rank:** #${info.rank}`);
  }
  if (info.address) {
    lines.push(`**Registered Office:** ${info.address}`);
  }
  if (info.phone) {
    lines.push(`**Contact Telephone:** ${info.phone}`);
  }
  if (info.website) {
    lines.push(`**Official Website:** ${info.website}`);
  }
  lines.push('');

  // Fund Managers Section
  if (managers.length > 0) {
    lines.push(`## Key Investment Personnel & Fund Managers (${managers.length})`);
    lines.push('');
    for (const m of managers) {
      lines.push(`### ${m.name}`);
      if (m.education) lines.push(`- **Education:** ${m.education}`);
      if (m.experience) lines.push(`- **Experience:** ${m.experience}`);
      if (Array.isArray(m.fundsManaged) && m.fundsManaged.length > 0) {
        const fundsList = m.fundsManaged.slice(0, 5).map((f) => f.schemeName).join(', ');
        lines.push(`- **Key Schemes Managed:** ${fundsList}${m.fundsManaged.length > 5 ? ` (+${m.fundsManaged.length - 5} more)` : ''}`);
      }
      lines.push('');
    }
  }

  // Scheme Directory Table
  lines.push(`## Mutual Fund Schemes Directory (${schemes.length})`);
  lines.push('');
  lines.push('| Scheme Name | Category | AUM (₹ Cr) | NAV (₹) | 1Y Return | 3Y Return | 5Y Return | Scheme Link |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const s of schemes) {
    const schemeUrl = `https://mfcalc.getabundance.in/fund/${s.code}`;
    lines.push(
      `| [${s.name}](${schemeUrl}) | ${s.category || '—'} | ${fmtCr(s.aumCr)} | ${s.nav ? `₹${s.nav.toFixed(2)}` : '—'} | ${fmtPct(s.ret1y)} | ${fmtPct(s.ret3y)} | ${fmtPct(s.ret5y)} | [View Factsheet](${schemeUrl}) |`
    );
  }
  lines.push('');

  // Regulatory Dual Attribution Block
  lines.push('---');
  lines.push('### Regulatory Disclosures & Distributor Attribution');
  lines.push('');
  lines.push(
    'Mutual fund investments are subject to market risks. Read all scheme related documents carefully before investing. Historical returns are not indicative of future results.'
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
