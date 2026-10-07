/**
 * app/api/og-sif-aum/route.js
 *
 * Downloadable branded PNG for the SIF AUM Leaderboard
 * (app/sifs/reports/aum-leaderboard/page.jsx) -- the shareable artifact
 * itself, not a link-preview card, so sized larger (1600x900) than this
 * app's other @vercel/og routes (1200x630, e.g. pages/api/og-screener.js).
 *
 * Node.js runtime, not Edge -- App Router Route Handlers return a
 * Web-standard Response on either runtime (unlike pages/api/*.js, where
 * returning an ImageResponse directly requires Edge), and Node.js lets
 * this route query Postgres directly via lib/sifReports.js instead of an
 * extra internal fetch hop.
 *
 * Renders live (unlike its sibling app/api/og-sif-performance/route.js,
 * which pre-generates -- see that route's header comment for why): this
 * one has run successfully in production throughout the investigation
 * into that route's unexplained 500s, so there's no evidence live
 * rendering itself is the problem here. Element tree lives in
 * lib/sifReportImages.js, shared with scripts/generate_sif_report_images.js
 * so the live route and the pre-generation script can never drift apart
 * in how they render the same data.
 */

import { ImageResponse } from '@vercel/og';
import { getSifAumLeaderboard } from '@/lib/sifReports';
import { buildAumImageElement } from '@/lib/sifReportImages';

export const revalidate = 21600;

export async function GET() {
  const board = await getSifAumLeaderboard();
  const el = buildAumImageElement(board);
  return new ImageResponse(el, {
    width: 1600,
    height: 900,
    headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
  });
}
