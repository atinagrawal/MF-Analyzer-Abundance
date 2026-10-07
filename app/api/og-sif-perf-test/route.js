/**
 * TEMPORARY diagnostic route -- isolates whether a zero-parameter GET
 * (exactly matching og-sif-aum/route.js's working signature, no request
 * argument, no searchParams/request.url usage at all) succeeds where
 * og-sif-performance's GET(request) + new URL(request.url) consistently
 * 500s in production with no catchable JS error. Delete once root-caused.
 */
import { ImageResponse } from '@vercel/og';

export async function GET() {
  return new ImageResponse(
    { type: 'div', props: { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1f0a', color: '#fff', fontSize: 40 }, children: 'zero-param test OK' } },
    { width: 800, height: 400 }
  );
}
