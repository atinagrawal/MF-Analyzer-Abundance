/**
 * app/api/admin/nfo-promo/route.js
 *
 * GET  /api/admin/nfo-promo  -> { promotable, config }
 * POST /api/admin/nfo-promo  Body: { mode: 'auto'|'manual'|'off', slug?: string }
 *
 * Controls which open NFO (if any) app/page.js's homepage banner
 * (components/NfoPromoBanner.jsx) features -- see lib/nfoPromoConfig.js for
 * the config shape and fallback behaviour. `promotable` (GET) is every
 * currently open NFO that has a resolvable invest link (see
 * lib/investLinksCache.js) -- the only ones a 'manual' pick can meaningfully
 * choose from, since the banner's whole point is driving a real transaction.
 *
 * Admin only.
 */

import { auth } from '@/auth';
import { r2Get, r2Put } from '@/lib/r2';
import { getNfoData } from '@/lib/nfoData';
import { getPromotableOpenNfos } from '@/lib/investLinksCache';

const R2_KEY = 'nfo-promo-config.json';
const VALID_MODES = ['auto', 'manual', 'off'];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const data = await getNfoData();
    const open = [...(data.mf || []), ...(data.sif || [])].filter((e) => e.status === 'open');
    const promotable = await getPromotableOpenNfos(open);

    const config = (await r2Get(R2_KEY).catch(() => null)) || { mode: 'auto', slug: null, updatedAt: null, updatedBy: null };

    return Response.json({ promotable, config });

  } catch (err) {
    console.error('[admin/nfo-promo GET]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const { mode, slug } = await req.json();

    if (!VALID_MODES.includes(mode)) {
      return Response.json({ error: `mode must be one of ${VALID_MODES.join(', ')}` }, { status: 400 });
    }
    if (mode === 'manual' && !slug) {
      return Response.json({ error: 'slug is required for manual mode' }, { status: 400 });
    }

    const config = {
      mode,
      slug: mode === 'manual' ? slug : null,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email || session.user.id,
    };

    await r2Put(R2_KEY, JSON.stringify(config));

    return Response.json({ ok: true, config });

  } catch (err) {
    console.error('[admin/nfo-promo POST]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
