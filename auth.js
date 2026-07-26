/**
 * auth.js — NextAuth v5 configuration
 *
 * Sign-in methods:
 *   1. Google OAuth  — for users with Google/Gmail accounts
 *   2. Email code or link (Resend) — one email contains both a 6-digit code
 *      and a magic link, sharing one secret. See app/api/auth/verify-otp/
 *      route.js for the code-entry flow (attempt-limited) and
 *      app/login/page.jsx for the UI. Design rationale:
 *      docs/superpowers/specs/2026-07-25-email-otp-signin-design.md
 *
 * Resend setup (one-time):
 *   1. Create account at resend.com
 *   2. Add domain getabundance.in → copy the DNS records they give you → add to your DNS
 *   3. Create an API key → copy it
 *   4. Add to Vercel env vars:
 *        RESEND_KEY = re_xxxxxxxxxxxx  (the API key)
 *   No other env vars needed for email.
 *
 * Required DB tables (already created):
 *   verification_token — already confirmed EXISTS
 *   otp_attempts        — code attempt-limiter, see scripts/schema.sql
 *   otp_codes           — maps a 6-digit code to NextAuth's real token per
 *                          request; the code is a SEPARATE secret from the
 *                          real token, never usable directly against
 *                          NextAuth's own callback endpoint. See
 *                          scripts/schema.sql and
 *                          docs/superpowers/specs/2026-07-25-email-otp-signin-design.md
 *
 * Role values: 'client' | 'distributor' | 'admin'
 */

import NextAuth        from 'next-auth';
import Google          from 'next-auth/providers/google';
import Resend          from 'next-auth/providers/resend';
import PostgresAdapter from '@auth/pg-adapter';
import pool            from '@/lib/db';
import { randomInt }   from 'crypto';

// ── Branded HTML email ────────────────────────────────────────────────────────

export function buildEmail({ url, host, code }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  return {
    subject: `Sign in to Abundance — ${host}`,
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
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Your sign-in code</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};line-height:1.6;">Enter this code on the sign-in page, or click the button below — either works. Expires in <strong>15 minutes</strong> and can only be used once.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;">
      <div style="display:inline-block;padding:16px 28px;background:#f8fafb;border:1.5px solid #e2e8f0;border-radius:10px;font-size:32px;font-weight:900;letter-spacing:8px;color:${brand};font-family:'Courier New',monospace;">${code}</div>
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background:${brand};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">Sign in to Abundance →</a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;color:${muted};line-height:1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:6px 0 0;font-size:11px;color:${brand};word-break:break-all;font-family:'Courier New',monospace;">${url}</p>
    <p style="margin:20px 0 0;font-size:12px;color:${muted};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">If you did not request this email, you can safely ignore it.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${muted};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    text: `Sign in to Abundance\n\nYour code: ${code}\n\nOr click: ${url}\n\nExpires in 15 minutes.\n\nAbundance Financial Services · ARN-251838`,
  };
}

// ── Auth config ───────────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),

  providers: [
    // 1. Google OAuth
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    // 2. Email sign-in via Resend — sends BOTH a 6-digit code and a magic
    // link in one email, but they are SEPARATE secrets. NextAuth's own
    // `token` (full entropy, unmodified default generator) still gates
    // /api/auth/callback/resend — exactly as secure as before this feature
    // existed. The 6-digit `code` below is this app's own creation, mapped
    // to that real token in otp_codes, and is ONLY ever checked by this
    // app's own attempt-limited /api/auth/verify-otp route. A security
    // review caught an earlier version of this file using the code AS the
    // token directly — see docs/superpowers/specs/
    // 2026-07-25-email-otp-signin-design.md's revision note for why that
    // was a critical bypass of the attempt limiter via NextAuth's own
    // public callback endpoint.
    Resend({
      apiKey:  process.env.RESEND_KEY,
      from:    'Abundance Financial Services <noreply@getabundance.in>',
      maxAge:  15 * 60, // 15 minutes — was 24 hours

      // Branded email template — shows an independent code AND the real link
      async sendVerificationRequest({ identifier: email, url, token, provider }) {
        const host = new URL(url).host;
        const code = randomInt(100000, 1000000).toString();
        const expires = new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(
          `INSERT INTO otp_codes (identifier, code, token, expires) VALUES ($1, $2, $3, $4)`,
          [email, code, token, expires]
        );

        const { subject, html, text } = buildEmail({ url, host, code });

        const res = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ from: provider.from, to: email, subject, html, text }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(`Resend error ${res.status}: ${JSON.stringify(error)}`);
        }
      },
    }),
  ],

  session: { strategy: 'database' },

  callbacks: {
    async session({ session, user }) {
      if (session?.user) {
        session.user.id   = user.id;
        session.user.role = user.role ?? 'client';
        // Include plan so client components can check without extra fetch
        const plan    = user.plan ?? 'free';
        const expires = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
        const isLifetime  = plan === 'pro_lifetime';
        const isProAnnual = plan === 'pro' && expires && expires > new Date();
        session.user.plan          = (isLifetime || isProAnnual) ? 'pro' : 'free';
        session.user.planTier      = isLifetime ? 'lifetime' : isProAnnual ? 'annual' : 'free';
        session.user.planExpiresAt = isProAnnual ? expires.toISOString() : null;
      }
      return session;
    },
  },

  pages: {
    signIn:        '/login',
    error:         '/login',
    verifyRequest: '/login?verify=1',
  },
});
