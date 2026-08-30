/**
 * app/api/og-article/route.js
 *
 * OG image for every /articles/[slug] page — returned as PNG via @vercel/og
 * Size: 1200×630 (standard OG). One generic, parameterised route instead of
 * a hardcoded file per article (this site already has ~1800 funds handled
 * the same way via /api/og?code=&name=), so a new article never needs a new
 * image route.
 *
 * Params: ?title=...&pillar=...
 * Design matches the site's existing dark-green OG template (see
 * og-portfolio, og-book-consultation) but swaps the feature-pill row for
 * the article's pillar label as a single eyebrow tag, since an article's
 * distinguishing content is its headline, not a fixed feature list.
 */

import { ImageResponse } from '@vercel/og';
import { OG_LOGO_MARK_URL } from '@/lib/ogAssets';

export const runtime = 'edge';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || 'Abundance Financial Services').slice(0, 140);
  const pillar = (searchParams.get('pillar') || 'Insights').slice(0, 40);

  // Shrink the headline as it gets longer so long titles never overflow the
  // 1200x630 canvas -- article titles vary a lot more in length than this
  // site's other OG templates (which are static, hand-tuned copy).
  const fontSize = title.length > 90 ? 40 : title.length > 60 ? 46 : title.length > 35 ? 54 : 62;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '80px 100px',
          background: 'linear-gradient(135deg, #0a2e0a 0%, #1b5e20 50%, #2e7d32 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 400, height: 400,
          borderRadius: '50%',
          background: 'rgba(100,187,106,.08)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -120, right: 120,
          width: 320, height: 320,
          borderRadius: '50%',
          background: 'rgba(46,125,50,.12)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px)',
          display: 'flex',
        }} />

        <div style={{
          position: 'absolute', top: 48, right: 100,
          padding: '6px 14px', borderRadius: 20,
          border: '1px solid rgba(255,255,255,.2)',
          background: 'rgba(255,255,255,.08)',
          color: 'rgba(255,255,255,.7)',
          fontSize: 13, fontWeight: 700,
          letterSpacing: 1,
          display: 'flex',
        }}>
          ARN-251838
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: 14,
            background: 'rgba(255,255,255,.12)',
            border: '2px solid rgba(255,255,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={OG_LOGO_MARK_URL} width={38} height={38} style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>
              Abundance Financial Services
            </div>
            <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>
              AMFI Registered Mutual Funds & SIF Distributor
            </div>
          </div>
        </div>

        <div style={{
          padding: '7px 16px', borderRadius: 100,
          background: 'rgba(255,255,255,.12)',
          border: '1px solid rgba(255,255,255,.25)',
          color: '#a5d6a7',
          fontSize: 15, fontWeight: 800,
          letterSpacing: 0.5,
          marginBottom: 24,
          display: 'flex',
        }}>
          {pillar}
        </div>

        <div style={{
          color: '#fff',
          fontSize,
          fontWeight: 900,
          letterSpacing: -1.5,
          lineHeight: 1.15,
          maxWidth: 980,
          display: 'flex',
        }}>
          {title}
        </div>

        <div style={{
          position: 'absolute', bottom: 48, right: 100,
          color: 'rgba(255,255,255,.4)',
          fontSize: 16, fontWeight: 600,
          fontFamily: 'monospace',
          display: 'flex',
        }}>
          mfcalc.getabundance.in/articles
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
