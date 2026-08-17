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
 * Required DB tables — verification_token already exists; otp_attempts and
 * otp_codes are NEW as of this feature and MUST be created on the live
 * database (run the CREATE TABLE statements in scripts/schema.sql via the
 * Vercel Postgres query tab) before deploying, or every sign-in request —
 * code OR link — will throw at the otp_codes INSERT and return a 500:
 *   verification_token — pre-existing, already confirmed EXISTS
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

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── Welcome email — sent once, from events.createUser below ────────────────────
// Warm/personal on purpose, not a corporate onboarding drip: the actual
// product here is Atin's advisory relationship, and the free tools are how
// people discover that. Points at the 3 tools a brand-new, unknown signup
// is most likely to get value from immediately, then offers a human reply
// as the differentiator versus a pure SaaS tool.

function buildWelcomeEmail({ name }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  const first = (name || '').trim().split(' ')[0] || 'there';
  return {
    subject: 'Welcome to Abundance — here’s where to start',
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
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Hi ${esc(first)}, welcome aboard 👋</h1>
    <p style="margin:0 0 18px;font-size:14px;color:${muted};line-height:1.6;">Thanks for signing up. This isn't just a software product — it's a set of free tools built by a real AMFI-registered advisor (that's me, Atin) to help you actually understand your money. A few places worth starting:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr><td style="padding:10px 0;border-top:1px solid #f1f5f9;">
        <div style="font-size:14px;font-weight:700;color:#1e293b;">📋 CAS Tracker</div>
        <div style="font-size:13px;color:${muted};line-height:1.5;margin-top:2px;">Upload your Consolidated Account Statement to see every fund you own, live gains, and ELSS lock-in status in one place.</div>
      </td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #f1f5f9;">
        <div style="font-size:14px;font-weight:700;color:#1e293b;">🔎 Fund Screener</div>
        <div style="font-size:13px;color:${muted};line-height:1.5;margin-top:2px;">Compare mutual funds, SIFs, and PMS strategies on real historical returns and risk — not brochure numbers.</div>
      </td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:14px;font-weight:700;color:#1e293b;">🧪 Backtester</div>
        <div style="font-size:13px;color:${muted};line-height:1.5;margin-top:2px;">Stress-test a SIP or lumpsum idea against real historical NAVs before you commit money to it.</div>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-top:22px;">
      <a href="https://mfcalc.getabundance.in/portfolio" style="display:inline-block;padding:14px 32px;background:${brand};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">Open your portfolio →</a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:13px;color:${muted};line-height:1.6;border-top:1px solid #f1f5f9;padding-top:16px;">Have a question about your investments, or want to talk it through with a person instead of a screen? Just reply to this email — it comes straight to me.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${muted};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    text: `Hi ${first}, welcome to Abundance.\n\nThis is a set of free tools built by a real AMFI-registered advisor (Atin) to help you understand your money:\n\n- CAS Tracker: see every fund you own, live gains, ELSS lock-in — https://mfcalc.getabundance.in/portfolio\n- Fund Screener: compare mutual funds, SIFs, and PMS on real returns and risk — https://mfcalc.getabundance.in/screener\n- Backtester: stress-test a SIP or lumpsum idea against real historical NAVs — https://mfcalc.getabundance.in/backtest\n\nHave a question about your investments? Just reply to this email — it comes straight to me.\n\nAbundance Financial Services · ARN-251838`,
  };
}

async function sendLifecycleEmail(userId, email, emailType, { subject, html, text }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from: 'Abundance Financial Services <noreply@getabundance.in>',
        reply_to: 'contact@getabundance.in', // these templates invite a reply ("comes straight to me") — noreply@ can't honor that, so replies route here instead
        to: email, subject, html, text,
      }),
    });
    if (!res.ok) {
      console.error(`[lifecycle email:${emailType}] Resend error`, res.status, await res.text().catch(() => ''));
      return;
    }
    // ON CONFLICT DO NOTHING: UNIQUE(user_id, email_type) is the real guard
    // against double-sends, not this check-then-insert.
    await pool.query(
      `INSERT INTO lifecycle_emails_sent (user_id, email_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, emailType]
    );
  } catch (e) {
    console.error(`[lifecycle email:${emailType}] failed`, e.message);
  }
}

// ── Auth config ───────────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),

  providers: [
    // 1. Google OAuth
    //
    // allowDangerousEmailAccountLinking: without this, @auth/core's
    // handleLoginOrRegister refuses to link a Google sign-in to any
    // existing users row with the same email (admin-invited placeholder
    // rows from app/api/admin/clients, or an account that first signed up
    // via the Resend email/OTP provider below) -- it throws
    // OAuthAccountNotLinked instead. That's the opposite of this app's own
    // stated intent (see the comment in app/api/admin/clients/route.js).
    // Traced this precisely through node_modules/@auth/core/src/lib/actions/
    // callback/handle-login.js (2026-08): the OTHER direction -- an
    // existing Google/placeholder account signing in via email/OTP later --
    // always works unconditionally, since Auth.js trusts the email
    // provider's own verification step. This flag only affects the
    // OAuth-arrives-second direction.
    //
    // Safe to enable here specifically because the signIn callback below
    // requires Google's own `email_verified` claim before allowing the
    // link -- Auth.js's own docs recommend exactly this pairing. Without
    // that check, "dangerous" would mean trusting any OAuth provider's
    // email claim; with it, we're only trusting Google's claim after Google
    // itself has confirmed the address, which is the standard safe usage.
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
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

        // Invalidate any prior outstanding code for this email BEFORE inserting
        // the new one. Without this, repeated code requests within the same
        // 15-minute window would leave multiple valid codes simultaneously
        // outstanding for one email — each an independent 1-in-1,000,000
        // target, so the combined odds of a random guess hitting SOME valid
        // code scale up with however many are outstanding. Only the newest
        // code should ever be valid. This also keeps the table from
        // accumulating old rows from repeat requesters.
        await pool.query(`DELETE FROM otp_codes WHERE identifier = $1`, [email]);

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
    // Only Google needs a check here: the Resend/email provider's own
    // token-verification step (consuming a one-time link/code) is already
    // this app's proof of email ownership. Google separately verifies
    // email ownership itself and reports it via `profile.email_verified` --
    // required here since allowDangerousEmailAccountLinking above trusts
    // that claim to link into an existing account. Every real Google
    // consumer account has this set true; false/missing would mean a
    // non-compliant or misconfigured OAuth response, not a real user.
    async signIn({ account, profile }) {
      if (account?.provider === 'google') {
        return profile?.email_verified === true;
      }
      return true;
    },

    async session({ session, user }) {
      if (session?.user) {
        session.user.id   = user.id;
        session.user.role = user.role ?? 'client';
        // Include plan so client components can check without extra fetch
        const plan    = user.plan ?? 'free';
        const expires = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
        const isLifetime  = plan === 'pro_lifetime';
        const isProAnnual = plan === 'pro'   && expires && expires > new Date();
        const isTrial     = plan === 'trial' && expires && expires > new Date();
        session.user.plan          = (isLifetime || isProAnnual || isTrial) ? 'pro' : 'free';
        session.user.planTier      = isLifetime ? 'lifetime' : isProAnnual ? 'annual' : isTrial ? 'trial' : 'free';
        session.user.planExpiresAt = (isProAnnual || isTrial) ? expires.toISOString() : null;
        // CAS Tracker's default multi-PAN family tab -- see
        // app/api/cas/default-pan/route.js. Included here so the common
        // case (viewing your own account) needs no extra fetch; an admin
        // viewing a CLIENT's family CAS fetches THAT client's default_pan
        // via the API instead, since it's not on the admin's own session.
        session.user.defaultPan = user.default_pan ?? null;

        // Fire-and-forget, throttled to at most once/hour per user — this
        // callback runs on essentially every useSession()/auth() check, so
        // writing on every call would turn routine page loads into DB
        // writes. Before this, there was NO usage signal at all beyond
        // created_at and whatever a user explicitly saved (CAS uploads,
        // proposals) — this is what "last active" in the admin panel and
        // the lifecycle-email win-back window read from.
        pool.query(
          `UPDATE users SET last_active_at = NOW()
           WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '1 hour')`,
          [user.id]
        ).catch(e => console.error('[last_active_at]', e.message));
      }
      return session;
    },
  },

  events: {
    // Fires exactly once, on first signup (both Google and email/OTP go
    // through this — @auth/core only calls createUser for a brand-new row,
    // never on a returning sign-in). Fire-and-forget: a failed welcome
    // email must never block or fail the sign-in itself.
    async createUser({ user }) {
      if (!user.email) return;
      sendLifecycleEmail(user.id, user.email, 'welcome', buildWelcomeEmail({ name: user.name }));
    },

    // When allowDangerousEmailAccountLinking links a Google sign-in to a
    // PRE-EXISTING nameless row (an admin-invited placeholder from
    // app/api/admin/clients, or an account that first signed up via
    // email/OTP), @auth/core's handleLoginOrRegister links the account but
    // never copies over the Google profile's name/image -- it only does
    // that for a brand-new user via createUser(). Without this, that user
    // would be sent to /complete-profile (components/ProfileCompletionGate)
    // despite Google having already given us a name. Only touches columns
    // that are still empty (COALESCE), so it never overwrites a name the
    // user already set via /complete-profile.
    async linkAccount({ user, account, profile }) {
      if (account.provider !== 'google' || user.name) return;
      const name = profile?.name || null;
      const image = profile?.picture || null;
      if (!name && !image) return;
      await pool.query(
        'UPDATE users SET name = COALESCE(name, $1), image = COALESCE(image, $2) WHERE id = $3',
        [name, image, user.id]
      );
    },
  },

  pages: {
    signIn:        '/login',
    error:         '/login',
    verifyRequest: '/login?verify=1',
  },
});
