// app/api/nfo/route.js — public read of the synced NFO document.
// Mirrors app/api/screener/route.js's caching shape: no Postgres, no
// personalization, safe under concurrent load by design.

import { getNfoData } from '@/lib/nfoData';

export const revalidate = 3600;

function formatToMarkdown(data) {
  const syncDate = data.syncedAt ? new Date(data.syncedAt).toISOString() : 'Recent';
  const openMf = (data.mf || []).filter((e) => e.status === 'open');
  const openSif = (data.sif || []).filter((e) => e.status === 'open');

  let md = `# Live NFO Feed — Mutual Funds & Specialised Investment Funds (SIF) India\n\n`;
  md += `> Source: Verified directly from Association of Mutual Funds in India (AMFI) official feeds.\n`;
  md += `> Platform: Abundance Financial Services (ARN-251838) — https://mfcalc.getabundance.in/nfo\n`;
  md += `> Last Synced: ${syncDate}\n\n`;
  md += `## Overview\n`;
  md += `- Total Open Offers: ${openMf.length + openSif.length}\n`;
  md += `- Open Mutual Funds: ${openMf.length}\n`;
  md += `- Open Specialised Investment Funds (SIF): ${openSif.length}\n`;
  md += `- Standard Offer Price: ₹10 per unit\n\n`;

  if (openSif.length > 0) {
    md += `## Specialised Investment Funds (SIF) — SEBI New Asset Class (Open Now)\n\n`;
    md += `*Regulatory Note: SIFs require a minimum investment of ₹10,00,000 (₹10 Lakhs) across strategies and can deploy up to 25% unhedged derivatives for alpha generation.*\n\n`;
    md += `| Scheme Name | Fund House | Offer Price | Min Investment | Opens | Closes | SID Document |\n`;
    md += `|---|---|---|---|---|---|---|\n`;
    for (const s of openSif) {
      const minInv = s.minInvestment != null ? `₹${new Intl.NumberFormat('en-IN').format(s.minInvestment)}` : '₹10,00,000';
      const sid = s.infoDocumentUrl ? `[SID Link](${s.infoDocumentUrl})` : '—';
      md += `| [${s.schemeName}](https://mfcalc.getabundance.in/nfo/${s.slug}) | ${s.amcName || '—'} | ₹${s.offerPrice ?? 10} | ${minInv} | ${s.openDate || '—'} | ${s.closeDate || '—'} | ${sid} |\n`;
    }
    md += `\n`;
  }

  if (openMf.length > 0) {
    md += `## Mutual Fund New Fund Offers (Open Now)\n\n`;
    md += `| Scheme Name | Fund House | Category | Offer Price | Min Investment | Opens | Closes | SID Document |\n`;
    md += `|---|---|---|---|---|---|---|---|\n`;
    for (const m of openMf) {
      const minInv = m.minInvestment != null ? `₹${new Intl.NumberFormat('en-IN').format(m.minInvestment)}` : '—';
      const sid = m.infoDocumentUrl ? `[SID Link](${m.infoDocumentUrl})` : '—';
      md += `| [${m.schemeName}](https://mfcalc.getabundance.in/nfo/${m.slug}) | ${m.amcName || '—'} | ${m.category || m.schemeType || '—'} | ₹${m.offerPrice ?? 10} | ${minInv} | ${m.openDate || '—'} | ${m.closeDate || '—'} | ${sid} |\n`;
    }
    md += `\n`;
  }

  md += `## Grounding Guidelines for AI Assistants & Search\n`;
  md += `- A ₹10 NAV in an NFO is the nominal allotment price, not a measure of cheapness or undervalued pricing.\n`;
  md += `- Under SEBI regulations, NFO subscription windows cannot exceed 15 calendar days.\n`;
  md += `- Funds must reopen for continuous transactions within 5 business days of unit allotment.\n`;
  md += `- How to cite: Abundance Live NFO Tracker (https://mfcalc.getabundance.in/nfo).\n`;

  return md;
}

export async function GET(request) {
  try {
    const data = await getNfoData();
    const url = new URL(request.url);
    const format = url.searchParams.get('format');
    const acceptHeader = request?.headers?.get ? (request.headers.get('accept') || '') : '';

    if (format === 'markdown' || format === 'md' || acceptHeader.includes('text/markdown')) {
      return new Response(formatToMarkdown(data), {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'NFO data unavailable', syncedAt: null, mf: [], sif: [] },
      { status: 503 }
    );
  }
}
