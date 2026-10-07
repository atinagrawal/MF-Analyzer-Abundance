/**
 * TEMPORARY diagnostic route -- same as og-sif-perf-test but WITH a
 * request parameter and new URL(request.url).searchParams read, to
 * isolate whether that specific pattern is the crash trigger. Delete
 * once root-caused.
 */
import { ImageResponse } from '@vercel/og';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const x = searchParams.get('x') || 'none';
  return new ImageResponse(
    { type: 'div', props: { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1f0a', color: '#fff', fontSize: 40 }, children: `with-request test OK (x=${x})` } },
    { width: 800, height: 400 }
  );
}
