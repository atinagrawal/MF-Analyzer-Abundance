/**
 * app/api/logo-map/route.js
 *
 * GET /api/logo-map
 *
 * Exposes lib/logoMap.json + lib/providerLogos.js's SIF_OVERRIDES to
 * plain-JS (non-bundled) code — specifically the homepage calculator
 * suite (public/js/mfcalc-main.js), which is loaded via a plain
 * <script> tag and has no access to the app's ES modules. Keeping this
 * as a thin re-export (rather than a duplicated copy) means there is
 * still exactly one source of truth for the logo data.
 */

import logoMapData from '@/lib/logoMap.json';
import { SIF_OVERRIDES } from '@/lib/providerLogos';

export async function GET() {
  return Response.json(
    { mf: logoMapData.mf, pms: logoMapData.pms, sif: SIF_OVERRIDES },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
