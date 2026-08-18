/**
 * app/api/cas/resolve-folios/route.js
 *
 * GET /api/cas/resolve-folios?folios=A,B,C&excludeBlobKey=...[&targetUserId=...]
 *
 * For each requested (base) folio number, resolves which PAN it belongs
 * to: a manual override on file takes priority; otherwise, the owner's
 * OTHER saved CAS statements (excluding excludeBlobKey, the one currently
 * being viewed) are scanned live for that same folio number under a
 * valid PAN. A folio this can't confidently resolve is simply omitted --
 * the caller falls through to its own remaining resolution steps (the
 * "only one valid PAN in this statement" auto-fix, then Shared/Unknown).
 *
 * See docs/superpowers/specs/2026-08-18-cas-member-merge-design.md.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';
import { canManageUser } from '@/lib/permissions';
import { pickFolioResolutions } from '@/lib/resolveFolioPan';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const folioNos = (searchParams.get('folios') || '')
      .split(',').map(f => f.trim()).filter(Boolean);
    const excludeBlobKey = searchParams.get('excludeBlobKey') || '';
    const targetUserId = searchParams.get('targetUserId') || '';

    if (!folioNos.length) {
      return Response.json({ resolutions: {} });
    }

    const ownerId = (targetUserId && targetUserId !== session.user.id) ? targetUserId : session.user.id;
    if (ownerId !== session.user.id && !(await canManageUser(session, ownerId))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Manual overrides for these folios.
    const { rows: overrideRows } = await pool.query(
      `SELECT folio_no, pan FROM folio_pan_overrides WHERE user_id = $1 AND folio_no = ANY($2)`,
      [ownerId, folioNos]
    );
    const overridesByFolio = {};
    overrideRows.forEach(r => { overridesByFolio[r.folio_no] = r.pan; });

    // 2. For whatever's left, scan the owner's OTHER saved statements.
    const stillUnresolved = folioNos.filter(f => !overridesByFolio[f]);
    const historicalSightingsByFolio = {};
    if (stillUnresolved.length) {
      const { rows: otherPortfolios } = await pool.query(
        `SELECT blob_key FROM cas_portfolios WHERE user_id = $1 AND blob_key != $2`,
        [ownerId, excludeBlobKey]
      );
      const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
      for (const { blob_key } of otherPortfolios) {
        let data;
        try {
          data = await r2Get(blob_key);
        } catch {
          continue; // an unreadable old statement just contributes nothing
        }
        if (!data) continue;
        (data.folios || []).forEach(folio => {
          const baseFolioNo = (folio.folio || '').split('/')[0].trim();
          if (!stillUnresolved.includes(baseFolioNo)) return;
          const pan = (folio.PAN || '').toUpperCase().trim();
          if (pan.length === 10 && PAN_RE.test(pan)) {
            (historicalSightingsByFolio[baseFolioNo] ||= []).push(pan);
          }
        });
      }
    }

    const resolutions = pickFolioResolutions(folioNos, overridesByFolio, historicalSightingsByFolio);
    return Response.json({ resolutions });

  } catch (err) {
    console.error('[cas/resolve-folios]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
