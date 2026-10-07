/**
 * scripts/generate_sif_report_images.js
 *
 * Pre-generates the SIF category performance report images and writes
 * them to R2, since rendering them LIVE in a Vercel Function 500s
 * deterministically in production for reasons that remain unresolved
 * after extensive investigation -- see app/api/og-sif-performance/route.js's
 * header comment for the full story. Same mitigation already proven for
 * the BSE index data this session (scripts/sync_bse_index_cache.js):
 * don't render/fetch live in the Function at all, do it on a schedule
 * from a plain Node process instead, write the result to R2, have the
 * live route just serve what's there.
 *
 * Writes one R2 object per category:
 *   sif-report-images/performance-{slug}.json
 *     { pngBase64, asOf, generatedAt }
 * read directly by app/api/og-sif-performance/route.js.
 *
 * Renders the exact same element tree the (removed) live route used to
 * build, via lib/sifReportImages.js's buildPerformanceImageElement --
 * shared, not duplicated, so this script and any future live-rendering
 * attempt can never silently drift apart in appearance.
 *
 * Usage:
 *   node scripts/generate_sif_report_images.js [--dry-run] [--category=<slug>]
 *
 * Env: POSTGRES_URL (via lib/db.js) and R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
 * R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME (via lib/r2.js) are required to
 * persist; without R2 vars, pass --dry-run explicitly.
 */

const { ImageResponse } = require('@vercel/og');

const DRY_RUN = process.argv.includes('--dry-run');
const categoryArg = process.argv.find((a) => a.startsWith('--category='));
const ONLY_CATEGORY = categoryArg ? categoryArg.split('=')[1] : null;

const IMAGE_KEY_PREFIX = 'sif-report-images/performance-';
const WIDTH = 1600;
const HEIGHT = 900;

async function run() {
  console.log('=== Generating SIF performance report images ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active -- no R2 writes]');

  const { r2Put } = await import('../lib/r2.js');
  const { listSifCategories, getSifCategoryPerformance } = await import('../lib/sifReports.js');
  const { buildPerformanceImageElement } = await import('../lib/sifReportImages.js');
  const pool = (await import('../lib/db.js')).default;

  const categories = ONLY_CATEGORY
    ? (await listSifCategories()).filter((c) => c.slug === ONLY_CATEGORY)
    : await listSifCategories();

  if (categories.length === 0) {
    console.error('[SIF Report Images] No categories to generate (check --category spelling, or sif_screener has no rows).');
    await pool.end();
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const cat of categories) {
    try {
      const report = await getSifCategoryPerformance(cat.slug);
      if (!report || report.schemes.length === 0) {
        console.log(`  - ${cat.label} (${cat.slug}): skipped, no live schemes.`);
        continue;
      }

      const el = buildPerformanceImageElement(report);
      const imageResponse = new ImageResponse(el, { width: WIDTH, height: HEIGHT });
      const arrayBuffer = await imageResponse.arrayBuffer();
      const pngBase64 = Buffer.from(arrayBuffer).toString('base64');

      if (!DRY_RUN) {
        await r2Put(`${IMAGE_KEY_PREFIX}${cat.slug}.json`, JSON.stringify({
          pngBase64,
          asOf: report.asOf,
          generatedAt: new Date().toISOString(),
        }));
      }
      ok++;
      console.log(`  ✓ ${cat.label} (${cat.slug}): ${report.schemes.length} schemes, ${(pngBase64.length / 1024).toFixed(0)}KB base64`);
    } catch (err) {
      failed++;
      failures.push({ category: cat.slug, error: err.message });
      console.warn(`  ✗ ${cat.label} (${cat.slug}): ${err.message}`);
    }
  }

  await pool.end();

  console.log(`\nDone. ${ok} images generated, ${failed} failed.`);
  if (failures.length) {
    console.log('Failures:', JSON.stringify(failures, null, 2));
  }

  // Same reasoning as this project's other sync scripts: a handful of
  // failures (one category's data transiently unavailable) shouldn't
  // fail the whole scheduled run, but near-total failure signals
  // something structural worth surfacing as a red workflow run.
  if (ok === 0 && categories.length > 0) {
    throw new Error(`All ${categories.length} category image(s) failed to generate.`);
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[generate_sif_report_images] Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { run };
