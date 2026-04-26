/**
 * app/api/sif-history/route.js
 *
 * CORS proxy for AMFI's undocumented SIF NAV history APIs.
 * Browser-to-amfiindia.com calls are blocked by CORS; this route runs server-side.
 *
 * GET /api/sif-history?sif_id=47
 *   → Fetches available strategies for a given SIF.
 *     Returns Regular plans only (Direct plans are not shown in the screener).
 *     Response: { strategies: [{ nav_id, nav_name }] }
 *
 * GET /api/sif-history?sd_id=SIF-34&from=2025-10-28&to=2026-04-26
 *   → Fetches historical NAV records for a specific strategy.
 *     Response: { mf_name, scheme_name, date_range, records: [{ date, nav }] }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMFI_BASE = 'https://www.amfiindia.com/api';
const HEADERS   = { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' };

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sifId = searchParams.get('sif_id');
  const sdId  = searchParams.get('sd_id');

  // ── Strategy lookup ──────────────────────────────────────────────────────
  if (sifId) {
    try {
      const res = await fetch(
        `${AMFI_BASE}/sif-nav-history/navs?sif_id=${sifId}`,
        { headers: HEADERS, signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) throw new Error(`AMFI returned ${res.status}`);
      const data = await res.json();

      // Filter to Regular plans only — Direct plans match the screener's exclusion rule
      const all = data?.data ?? [];
      const strategies = all
        .filter(s => !/direct/i.test(s.nav_name))
        .map(s => ({ nav_id: s.nav_id, nav_name: s.nav_name }));

      return Response.json({ strategies }, {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    } catch (err) {
      console.error('[sif-history strategies]', err.message);
      return Response.json({ error: err.message }, { status: 502 });
    }
  }

  // ── Historical NAV ────────────────────────────────────────────────────────
  if (sdId) {
    const from = searchParams.get('from');
    const to   = searchParams.get('to');
    if (!from || !to) {
      return Response.json({ error: 'from and to dates required' }, { status: 400 });
    }
    try {
      const url = `${AMFI_BASE}/sif-nav-history?query_type=historical_period&from_date=${from}&to_date=${to}&sd_id=${sdId}`;
      const res = await fetch(url, {
        headers: HEADERS, signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`AMFI returned ${res.status}`);
      const json = await res.json();

      // Handle "No records to display" case
      if (json.message) {
        return Response.json({ records: [], date_range: `${from} to ${to}` });
      }

      const d = json.data ?? {};
      // Flatten nav_groups → take first group's historical_records
      // (each sd_id maps to one strategy; multiple nav_groups rare)
      const records = (d.nav_groups?.[0]?.historical_records ?? [])
        .map(r => ({ date: r.date, nav: parseFloat(r.nav) }))
        .sort((a, b) => a.date.localeCompare(b.date)); // oldest → newest

      return Response.json({
        mf_name:    d.mf_name    ?? '',
        scheme_name: d.scheme_name ?? '',
        date_range:  d.date_range  ?? '',
        records,
      }, {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    } catch (err) {
      console.error('[sif-history nav]', err.message);
      return Response.json({ error: err.message }, { status: 502 });
    }
  }

  return Response.json({ error: 'sif_id or sd_id required' }, { status: 400 });
}
