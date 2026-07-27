/**
 * app/api/consultation/send-code/route.js
 *
 * POST /api/consultation/send-code
 * Body: { name, email }
 *
 * Sends a 6-digit verification code to the given email — the anti-spam gate
 * for the public Book-a-Consultation page (app/book-consultation/page.jsx).
 * Unrelated to sign-in: writes to consultation_otp / consultation_otp_attempts,
 * never otp_codes/otp_attempts (see scripts/schema.sql for why these stay
 * separate). No NextAuth token or session is involved.
 *
 * Possible `error` values in the `{ ok: false, error: '...' }` response shape:
 *   invalid_request | invalid_name | invalid_email | server_error
 */

import pool from '@/lib/db';
import { randomInt } from 'crypto';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildConsultationCodeEmail({ code }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  return {
    subject: 'Your consultation booking code — Abundance Financial Services',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://mfcalc.getabundance.in/logo-192.png" alt="Abundance Financial Services" width="80" height="80" style="display:block;margin:0 auto 14px;border-radius:14px;border:1.5px solid #e2e8f0;" />
    <div style="font-size:20px;font-weight:900;color:${brand};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${muted};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${brand};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Confirm your email to book</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};line-height:1.6;">Enter this code on the booking page to continue. Expires in <strong>15 minutes</strong> and can only be used once.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:8px;">
      <div style="display:inline-block;padding:16px 28px;background:#f8fafb;border:1.5px solid #e2e8f0;border-radius:10px;font-size:32px;font-weight:900;letter-spacing:8px;color:${brand};font-family:'Courier New',monospace;">${code}</div>
    </td></tr></table>
    <p style="margin:20px 0 0;font-size:12px;color:${muted};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">If you did not request this, you can safely ignore it.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${muted};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    text: `Confirm your email to book a consultation\n\nYour code: ${code}\n\nExpires in 15 minutes.\n\nAbundance Financial Services · ARN-251838`,
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const name  = (body?.name  || '').trim();
  const email = (body?.email || '').trim().toLowerCase();

  if (!name) {
    return Response.json({ ok: false, error: 'invalid_name' }, { status: 400 });
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return Response.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }

  try {
    const code    = randomInt(100000, 1000000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate any prior outstanding code for this email first — same fix
    // applied to otp_codes (auth.js) after a final-review finding there.
    await pool.query(`DELETE FROM consultation_otp WHERE identifier = $1`, [email]);
    await pool.query(
      `INSERT INTO consultation_otp (identifier, code, expires) VALUES ($1, $2, $3)`,
      [email, code, expires]
    );

    const { subject, html, text } = buildConsultationCodeEmail({ code });

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Abundance Financial Services <noreply@getabundance.in>',
        to:      email,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('[consultation/send-code] Resend error', res.status, error);
      return Response.json({ ok: false, error: 'server_error' }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[consultation/send-code]', err.name, err.message);
    return Response.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
