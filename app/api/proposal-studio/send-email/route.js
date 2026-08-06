/**
 * app/api/proposal-studio/send-email/route.js
 *
 * POST /api/proposal-studio/send-email
 * Body (JSON): { id, toEmail }
 *
 * Emails a proposal's share link to a recipient the sender types in --
 * never auto-sent silently (see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md,
 * decision 6). Requires the caller to own the proposal (same ownership
 * check as /share, /unshare, /delete). Shares the proposal first if it
 * isn't already shared -- a link must exist before it can be emailed --
 * and returns the resulting shareToken/shareUrl so the caller can update
 * its own UI without a second round-trip.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';
import { ensureShareToken } from '@/lib/proposalShareToken';
import { buildProposalShareEmail, isPlausibleEmail } from '@/lib/proposalEmail';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id, toEmail } = await req.json();
    if (!id || !toEmail) {
      return Response.json({ error: 'Missing id or toEmail' }, { status: 400 });
    }
    if (!isPlausibleEmail(toEmail)) {
      return Response.json({ error: 'That does not look like a valid email address.' }, { status: 400 });
    }

    const result = await pool.query(`SELECT user_id, blob_key FROM proposals WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.user_id !== session.user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await r2Get(row.blob_key);
    if (!payload) {
      return Response.json({ error: 'Saved payload missing from storage' }, { status: 404 });
    }

    const shareToken = await ensureShareToken(pool, id);
    const origin = new URL(req.url).origin;
    const shareUrl = `${origin}/proposal-studio/view/${shareToken}`;

    const { subject, html, text } = buildProposalShareEmail({
      clientName: payload.clientName,
      advisorName: payload.advisorName,
      advisorPhone: payload.advisorPhone,
      advisorEmail: payload.advisorEmail,
      shareUrl,
      proposalType: payload.proposalType,
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Abundance Financial Services <noreply@getabundance.in>',
        to: toEmail.trim(),
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('[proposal-studio/send-email] Resend error:', res.status, error);
      return Response.json({ error: 'Could not send the email.' }, { status: 502 });
    }

    return Response.json({ ok: true, shareToken, shareUrl });

  } catch (err) {
    console.error('[proposal-studio/send-email]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
