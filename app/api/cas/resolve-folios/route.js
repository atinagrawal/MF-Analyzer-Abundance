/**
 * app/api/cas/resolve-folios/route.js
 *
 * GET /api/cas/resolve-folios?folios=A,B,C&ambiguousFolios=B,C&excludeBlobKey=...[&targetUserId=...]
 *
 * For each requested (base) folio number, resolves which PAN it belongs
 * to: a manual override on file takes priority; otherwise, the owner's
 * OTHER saved CAS statements (excluding excludeBlobKey, the one currently
 * being viewed) are scanned live for that same folio number under a
 * valid PAN. A folio this can't confidently resolve is simply omitted --
 * the caller falls through to its own remaining resolution steps (the
 * "only one valid PAN in this statement" auto-fix, then Shared/Unknown).
 *
 * Two folio lists, deliberately:
 *   - `folios`          -- EVERY folio in the statement. Manual overrides
 *     are checked for all of them, because a manual merge must be able to
 *     override a folio whose own PAN is well-formed but simply WRONG (an
 *     OCR/parser error producing a bogus extra "member"). That check is one
 *     indexed DB query, so widening it is free.
 *   - `ambiguousFolios` -- only the folios that lack a valid PAN of their
 *     own in the current statement. The cross-statement history scan (many
 *     R2 reads) stays restricted to these, since a folio that already
 *     carries its own valid PAN has nothing to gain from history: history
 *     ranks BELOW the folio's own PAN in the resolution order.
 *
 * See docs/superpowers/specs/2026-08-18-cas-member-merge-design.md.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';
import { canManageUser } from '@/lib/permissions';
import { PAN_REGEX } from '@/lib/casAuth';
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
    const ambiguousFolios = (searchParams.get('ambiguousFolios') || '')
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

    // 1. Manual overrides -- checked for EVERY folio in the statement, not
    //    just the ambiguous ones: a manual merge outranks even a folio's own
    //    well-formed-but-wrong PAN (see the header comment).
    const { rows: overrideRows } = await pool.query(
      `SELECT folio_no, pan FROM folio_pan_overrides WHERE user_id = $1 AND folio_no = ANY($2)`,
      [ownerId, folioNos]
    );
    const overridesByFolio = {};
    overrideRows.forEach(r => { overridesByFolio[r.folio_no] = r.pan; });

    // 2. For the ambiguous folios still without an answer, scan the owner's
    //    OTHER saved statements. Bounded to the same 20 most recent uploads
    //    /api/cas/list already caps at, so a large upload history can never
    //    turn one page load into an unbounded pile of R2 reads.
    const stillUnresolved = ambiguousFolios.filter(f => !overridesByFolio[f]);
    const historicalSightingsByFolio = {};
    if (stillUnresolved.length) {
      const { rows: otherPortfolios } = await pool.query(
        `SELECT blob_key FROM cas_portfolios
          WHERE user_id = $1 AND blob_key != $2
          ORDER BY uploaded_at DESC
          LIMIT 20`,
        [ownerId, excludeBlobKey]
      );
      // Folios still waiting for their first sighting. Once this empties,
      // there is nothing further to learn from older statements, so the scan
      // stops early rather than reading every remaining blob. (Trade-off: a
      // conflicting sighting that only exists in an older, never-read
      // statement won't be seen, so such a folio resolves from the newer
      // statements instead of being left unresolved. Newest-first ordering
      // means the sighting that does win is the most recent one.)
      const awaiting = new Set(stillUnresolved);
      for (const { blob_key } of otherPortfolios) {
        if (!awaiting.size) break;
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
          if (pan.length === 10 && PAN_REGEX.test(pan)) {
            (historicalSightingsByFolio[baseFolioNo] ||= []).push(pan);
            awaiting.delete(baseFolioNo);
          }
        });
      }
    }

    // Resolved over the FULL folio list so an override on a folio that has a
    // valid PAN of its own still comes back; historicalSightingsByFolio only
    // ever holds ambiguous folios (the only ones scanned), and folios with no
    // sighting are simply omitted by pickFolioResolutions.
    const resolutions = pickFolioResolutions(folioNos, overridesByFolio, historicalSightingsByFolio);
    return Response.json({ resolutions });

  } catch (err) {
    console.error('[cas/resolve-folios]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
