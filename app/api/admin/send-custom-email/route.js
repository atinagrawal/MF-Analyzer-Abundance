/**
 * app/api/admin/send-custom-email/route.js
 *
 * POST /api/admin/send-custom-email
 * Body: { userId, email, name, subject, message }
 *
 * Sends a free-text email to a client, written by the admin -- same
 * branded wrapper as app/api/admin/notify/route.js's fixed "portfolio
 * ready" template, but with admin-authored subject/message in place of
 * that fixed copy. Unlike that route, sets reply_to so a client's reply
 * actually reaches someone, rather than the plain noreply@ sender both
 * routes send from.
 *
 * Admin only.
 */

import { auth } from '@/auth';

export const runtime = 'nodejs';

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildCustomEmail({ name, message }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  const displayName = name || 'there';
  const bodyHtml = escapeHtml(message).replace(/\n/g, '<br>');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://mfcalc.getabundance.in/logo-192.png" alt="Abundance Financial Services"
      width="80" height="80"
      style="display:block;margin:0 auto 14px;border-radius:14px;border:1.5px solid #e2e8f0;" />
    <div style="font-size:20px;font-weight:900;color:${brand};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${muted};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${brand};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <p style="margin:0 0 20px;font-size:14px;color:#1e293b;line-height:1.7;">
      Hi ${displayName},
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#1e293b;line-height:1.7;">
      ${bodyHtml}
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:${muted};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">
      If you believe this was sent to you in error, please ignore this email or contact your distributor.
    </p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${muted};font-family:'Courier New',monospace;">
      Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  const text = `Hi ${displayName},\n\n${message}\n\nAbundance Financial Services · ARN-251838`;

  return { html, text };
}

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const { email, name, subject, message } = await req.json();

    if (!email)   return Response.json({ error: 'email is required' },   { status: 400 });
    if (!subject) return Response.json({ error: 'subject is required' }, { status: 400 });
    if (!message) return Response.json({ error: 'message is required' }, { status: 400 });

    const { html, text } = buildCustomEmail({ name, message });

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     'Abundance Financial Services <noreply@getabundance.in>',
        to:       email,
        reply_to: 'atin@getabundance.in',
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`);
    }

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[admin/send-custom-email]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
