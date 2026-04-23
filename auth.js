/**
 * auth.js — NextAuth v5 configuration
 *
 * Sign-in methods:
 *   1. Google OAuth  — for users with Google/Gmail accounts
 *   2. Email magic link (Nodemailer/Microsoft 365) — for all other users
 *
 * Microsoft 365 SMTP settings:
 *   host: smtp.office365.com, port: 587, STARTTLS
 *
 * Required env vars (add in Vercel → Settings → Environment Variables):
 *   EMAIL_FROM            — sender address, e.g. noreply@getabundance.in
 *   EMAIL_SERVER_PASSWORD — M365 password (or App Password if MFA is on)
 *
 * Required DB table (run once in Vercel Postgres if not present):
 *   CREATE TABLE IF NOT EXISTS verification_token (
 *     identifier TEXT NOT NULL,
 *     expires    TIMESTAMPTZ NOT NULL,
 *     token      TEXT NOT NULL,
 *     PRIMARY KEY (identifier, token)
 *   );
 *
 * Role values: 'client' | 'distributor' | 'admin'
 */

import NextAuth        from 'next-auth';
import Google          from 'next-auth/providers/google';
import Nodemailer      from 'next-auth/providers/nodemailer';
import PostgresAdapter from '@auth/pg-adapter';
import pool            from '@/lib/db';

// ── Branded HTML email ────────────────────────────────────────────────────────

function buildEmail({ url, host }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  return {
    subject: `Sign in to Abundance — ${host}`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <div style="font-size:22px;font-weight:900;color:${brand};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${muted};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${brand};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Your sign-in link</h1>
    <p style="margin:0 0 28px;font-size:14px;color:${muted};line-height:1.6;">Click the button below to sign in to your Abundance account. This link expires in <strong>24 hours</strong> and can only be used once.</p>
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
    text: `Sign in to Abundance\n\n${url}\n\nThis link expires in 24 hours.\n\nAbundance Financial Services · ARN-251838`,
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

    // 2. Magic link via Microsoft 365 SMTP
    Nodemailer({
      server: {
        host:       'smtp.office365.com',
        port:       587,
        secure:     false,      // STARTTLS — NOT SSL on 465
        requireTLS: true,
        auth: {
          user: process.env.EMAIL_FROM,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
        tls: { rejectUnauthorized: true },
        connectionTimeout: 10000,
        greetingTimeout:   10000,
      },
      from: process.env.EMAIL_FROM,

      async sendVerificationRequest({ identifier: email, url, provider }) {
        const nodemailer = (await import('nodemailer')).default;
        const transport  = nodemailer.createTransport(provider.server);
        const host       = new URL(url).host;
        const { subject, html, text } = buildEmail({ url, host });

        const result = await transport.sendMail({
          to:      email,
          from:    `Abundance Financial Services <${provider.from}>`,
          subject, html, text,
        });

        const failed = (result.rejected ?? []).concat(result.pending ?? []).filter(Boolean);
        if (failed.length) {
          throw new Error(`Email delivery failed for: ${failed.join(', ')}`);
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
