/**
 * scripts/send_lifecycle_emails.mjs
 *
 * Daily lifecycle email drip for signed-up users, run via
 * .github/workflows/lifecycle-emails.yml. Two emails, each sent at most
 * once ever per user (enforced by lifecycle_emails_sent's
 * UNIQUE(user_id, email_type), not just this script's own SELECT):
 *
 *   day3_nudge    — signed up 3+ days ago, never uploaded a CAS. Nudges
 *                   them toward the CAS Tracker, the single highest-intent
 *                   action a free-tool visitor can take.
 *   day14_winback — signed up 14+ days ago AND (never active again, or
 *                   inactive 14+ days). Re-engagement nudge.
 *
 * Both are scoped to role = 'client' — admin/distributor accounts (the
 * business's own staff, not leads) are excluded. Learned the hard way on
 * the first-ever run: without this filter, the founder's own admin account
 * got a "we miss you" email.
 *
 * Safe to re-run / run more than once a day: the WHERE NOT EXISTS guards
 * are a first filter, and the INSERT ... ON CONFLICT DO NOTHING in
 * sendLifecycleEmail() is the actual guard against a double-send.
 *
 * Usage:
 *   node scripts/send_lifecycle_emails.mjs
 * Env: POSTGRES_URL, RESEND_KEY (both required).
 */

import pg from 'pg';

const BRAND = '#1a7a4a';
const MUTED = '#64748b';
const FROM  = 'Abundance Financial Services <noreply@getabundance.in>';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function wrap(bodyHtml) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://mfcalc.getabundance.in/logo-192.png" alt="Abundance Financial Services" width="80" height="80" style="display:block;margin:0 auto 14px;border-radius:14px;border:1.5px solid #e2e8f0;" />
    <div style="font-size:20px;font-weight:900;color:${BRAND};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${MUTED};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${BRAND};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    ${bodyHtml}
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${MUTED};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

function buildDay3NudgeEmail({ name }) {
  const first = (name || '').trim().split(' ')[0] || 'there';
  return {
    subject: 'The fastest way to see your own numbers',
    html: wrap(`
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Hi ${esc(first)},</h1>
      <p style="margin:0 0 18px;font-size:14px;color:${MUTED};line-height:1.6;">You signed up a few days ago — in case the tools weren't obvious at first glance, the one most people find useful right away is the CAS Tracker: upload your Consolidated Account Statement and see every mutual fund you own, live gains, and ELSS lock-in status, all in one place. Takes about 2 minutes.</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-top:8px;">
        <a href="https://mfcalc.getabundance.in/cas-tracker" style="display:inline-block;padding:14px 32px;background:${BRAND};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">Upload your CAS →</a>
      </td></tr></table>
      <p style="margin:24px 0 0;font-size:13px;color:${MUTED};line-height:1.6;border-top:1px solid #f1f5f9;padding-top:16px;">Prefer to talk it through instead? Just reply to this email — it comes straight to me.</p>
    `),
    text: `Hi ${first},\n\nThe fastest way to see your own numbers: upload your CAS at https://mfcalc.getabundance.in/cas-tracker — takes about 2 minutes and shows every fund you own with live gains and ELSS lock-in status.\n\nPrefer to talk it through? Just reply to this email.\n\nAbundance Financial Services · ARN-251838`,
  };
}

function buildDay14WinbackEmail({ name }) {
  const first = (name || '').trim().split(' ')[0] || 'there';
  return {
    subject: 'We miss you — pick up where you left off',
    html: wrap(`
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Hi ${esc(first)},</h1>
      <p style="margin:0 0 18px;font-size:14px;color:${MUTED};line-height:1.6;">It's been a couple of weeks since you last visited. Your account and tools are still there whenever you want them — the Fund Screener now covers mutual funds, SIFs, and PMS strategies side by side, and the CAS Tracker will show your full portfolio the moment you upload a statement.</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-top:8px;">
        <a href="https://mfcalc.getabundance.in/screener" style="display:inline-block;padding:14px 32px;background:${BRAND};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">Take another look →</a>
      </td></tr></table>
      <p style="margin:24px 0 0;font-size:13px;color:${MUTED};line-height:1.6;border-top:1px solid #f1f5f9;padding-top:16px;">If something wasn't useful, or you'd rather just talk to a person about your investments, reply to this email — it comes straight to me.</p>
    `),
    text: `Hi ${first},\n\nIt's been a couple of weeks — your account is still there. The Fund Screener now covers mutual funds, SIFs, and PMS side by side: https://mfcalc.getabundance.in/screener\n\nReply to this email if you'd rather talk to a person about your investments.\n\nAbundance Financial Services · ARN-251838`,
  };
}

async function sendLifecycleEmail(pool, resendKey, userId, email, emailType, { subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: email, subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
  }
  await pool.query(
    `INSERT INTO lifecycle_emails_sent (user_id, email_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, emailType]
  );
}

async function main() {
  const pgUrl = process.env.POSTGRES_URL;
  const resendKey = process.env.RESEND_KEY;
  if (!pgUrl || !resendKey) {
    console.error('Both POSTGRES_URL and RESEND_KEY are required.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });

  // ── Day 3 nudge: signed up 3+ days ago, never uploaded a CAS ──
  const nudgeCandidates = await pool.query(`
    SELECT u.id, u.name, u.email
    FROM users u
    WHERE u.role = 'client'
      AND u.created_at <= NOW() - INTERVAL '3 days'
      AND NOT EXISTS (SELECT 1 FROM cas_portfolios cp WHERE cp.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM lifecycle_emails_sent l WHERE l.user_id = u.id AND l.email_type = 'day3_nudge')
      AND u.email IS NOT NULL
  `);
  console.log(`[lifecycle] day3_nudge candidates: ${nudgeCandidates.rows.length}`);

  let nudgeSent = 0, nudgeFailed = 0;
  for (const u of nudgeCandidates.rows) {
    try {
      await sendLifecycleEmail(pool, resendKey, u.id, u.email, 'day3_nudge', buildDay3NudgeEmail({ name: u.name }));
      nudgeSent++;
    } catch (e) {
      console.error(`[lifecycle] day3_nudge failed for ${u.id}:`, e.message);
      nudgeFailed++;
    }
  }

  // ── Day 14 win-back: signed up 14+ days ago, inactive (or never active) 14+ days ──
  const winbackCandidates = await pool.query(`
    SELECT u.id, u.name, u.email
    FROM users u
    WHERE u.role = 'client'
      AND u.created_at <= NOW() - INTERVAL '14 days'
      AND (u.last_active_at IS NULL OR u.last_active_at <= NOW() - INTERVAL '14 days')
      AND NOT EXISTS (SELECT 1 FROM lifecycle_emails_sent l WHERE l.user_id = u.id AND l.email_type = 'day14_winback')
      AND u.email IS NOT NULL
  `);
  console.log(`[lifecycle] day14_winback candidates: ${winbackCandidates.rows.length}`);

  let winbackSent = 0, winbackFailed = 0;
  for (const u of winbackCandidates.rows) {
    try {
      await sendLifecycleEmail(pool, resendKey, u.id, u.email, 'day14_winback', buildDay14WinbackEmail({ name: u.name }));
      winbackSent++;
    } catch (e) {
      console.error(`[lifecycle] day14_winback failed for ${u.id}:`, e.message);
      winbackFailed++;
    }
  }

  console.log(`[lifecycle] done — nudge: ${nudgeSent} sent, ${nudgeFailed} failed · winback: ${winbackSent} sent, ${winbackFailed} failed`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
