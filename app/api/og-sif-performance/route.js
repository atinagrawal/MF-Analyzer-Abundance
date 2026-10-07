/**
 * app/api/og-sif-performance/route.js
 *
 * GET /api/og-sif-performance?category=<slug>
 *
 * Downloadable branded PNG heatmap table for one SIF category's
 * performance comparison (app/sifs/reports/performance/[category]/page.jsx).
 *
 * UNLIKE every other @vercel/og route in this app, this one does NOT
 * render live. It serves a PRE-GENERATED PNG from R2
 * (scripts/generate_sif_report_images.js, scheduled via
 * .github/workflows/sif-report-images.yml), the same "don't render live
 * in the Function" mitigation already proven for the BSE index data
 * earlier this session (lib/bseIndex.js's header comment tells that
 * story).
 *
 * Why: this route rendering live in a Vercel Function 500s deterministically
 * in production -- confirmed across six separate deploys, each eliminating
 * one variable (data complexity, request.url/searchParams usage, a
 * zero-parameter GET matching the sibling og-sif-aum route's exact working
 * signature, a platform-wide outage, a Hobby function-count cap), with no
 * JS stack trace ever appearing in Vercel's logs and no reproduction in
 * next dev or next start against the same production database. The crash
 * appears to happen below what a JS try/catch can observe. Root cause
 * remains genuinely unknown; this route sidesteps the question entirely by
 * not rendering live at all, rather than continuing to guess. The element
 * tree itself (lib/sifReportImages.js's buildPerformanceImageElement) is
 * unchanged and still used -- by the generation script now, not this route.
 */

import { r2Get } from '@/lib/r2';
import { listSifCategories } from '@/lib/sifReports';

export const revalidate = 21600;

const IMAGE_KEY_PREFIX = 'sif-report-images/performance-';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('category') || '';

  let payload = null;
  try {
    payload = await r2Get(`${IMAGE_KEY_PREFIX}${slug}.json`);
  } catch (err) {
    console.error('[og-sif-performance] R2 read failed:', err.message);
  }

  if (!payload?.pngBase64) {
    const categories = await listSifCategories().catch(() => []);
    const known = categories.some((c) => c.slug === slug);
    return new Response(
      known
        ? `Image for "${slug}" has not been generated yet -- it regenerates daily (see .github/workflows/sif-report-images.yml). Please check back shortly.`
        : `Unknown SIF category: "${slug}". Available: ${categories.map((c) => c.slug).join(', ')}`,
      { status: known ? 503 : 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  return new Response(Buffer.from(payload.pngBase64, 'base64'), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  });
}
