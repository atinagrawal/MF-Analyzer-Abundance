/**
 * app/api/admin/notify/route.js
 *
 * POST /api/admin/notify
 * Body: { userId, email, name, fileName, blobKey, panCount, uploadedAt }
 *
 * Sends a branded email to the client informing them their CAS portfolio
 * has been uploaded and is ready to view. Uses Resend (RESEND_KEY env var).
 *
 * Admin only.
 */

import { auth } from '@/auth';

export const runtime = 'nodejs';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function buildNotifyEmail({ name, fileName, panCount, uploadedAt, viewUrl }) {
  const brand      = '#1a7a4a';
  const muted      = '#64748b';
  const displayName = name || 'there';

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
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">
      Your portfolio is ready
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};line-height:1.6;">
      Hi ${displayName}, your Consolidated Account Statement (CAS) has been uploaded and analysed.
      Your portfolio is now available to view on the Abundance MF Analyzer.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8fafb;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;color:${muted};font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.5px;">File</span><br>
          <span style="font-size:13px;font-weight:700;color:#1e293b;">${fileName}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11px;color:${muted};font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.5px;">Folios / PANs</span><br>
          <span style="font-size:13px;font-weight:700;color:#1e293b;">${panCount} PAN${panCount !== 1 ? 's' : ''}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;">
          <span style="font-size:11px;color:${muted};font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.5px;">Uploaded on</span><br>
          <span style="font-size:13px;font-weight:700;color:#1e293b;">${fmtDate(uploadedAt)}</span>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${viewUrl}"
        style="display:inline-block;padding:14px 32px;background:${brand};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">
        View My Portfolio →
      </a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;color:${muted};line-height:1.6;">
      You will need to sign in to view your portfolio. Use the same email address
      this notification was sent to.
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:${muted};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">
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

  const text = `Hi ${displayName},\n\nYour CAS portfolio has been uploaded and is ready to view.\n\nFile: ${fileName}\nPANs: ${panCount}\nUploaded: ${fmtDate(uploadedAt)}\n\nView your portfolio: ${viewUrl}\n\nYou will need to sign in using this email address.\n\nAbundance Financial Services · ARN-251838`;

  return { html, text };
}

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const { userId, email, name, fileName, blobKey, panCount, uploadedAt } = await req.json();

    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });
    if (!blobKey) return Response.json({ error: 'blobKey is required' }, { status: 400 });

    const viewUrl = `https://mfcalc.getabundance.in/cas-tracker?load=${encodeURIComponent(blobKey)}`;
    const { html, text } = buildNotifyEmail({ name, fileName, panCount, uploadedAt, viewUrl });

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Abundance Financial Services <noreply@getabundance.in>',
        to:      email,
        subject: 'Your portfolio is ready — Abundance MF Analyzer',
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
    console.error('[admin/notify]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
