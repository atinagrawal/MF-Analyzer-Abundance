/**
 * lib/proposalEmail.js
 *
 * Branded HTML/text email for Proposal Studio's "Send Email" action --
 * mirrors auth.js's buildEmail() visual conventions (same brand green,
 * logo, card layout, footer) so a client's inbox sees a consistent
 * Abundance look regardless of which feature sent the email. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 *
 * CommonJS (module.exports), matching lib/portfolioAnalysis.js and
 * lib/chartSvg.js's dual-purpose style -- importable both via Next's
 * `import` (send-email/route.js) and plain `node`/`require`
 * (tests/proposalEmail.test.js).
 */

const BRAND = '#1a7a4a';
const MUTED = '#64748b';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Basic input-validation shape check, not a security control -- the route
// that uses this is already gated on the proposal's own owner (see
// app/api/proposal-studio/send-email/route.js).
function isPlausibleEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function buildProposalShareEmail({ clientName, advisorName, advisorPhone, advisorEmail, shareUrl, proposalType }) {
  const greetingName = clientName ? esc(clientName) : 'there';
  const advisorEsc = advisorName ? esc(advisorName) : 'your advisor';
  const typeLabel = proposalType === 'sip' ? 'SIP' : 'Lumpsum';
  const contactLine = [advisorPhone ? esc(advisorPhone) : null, advisorEmail ? esc(advisorEmail) : null].filter(Boolean).join(' · ');

  const subject = `${advisorEsc} has shared an investment proposal with you`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://mfcalc.getabundance.in/logo-192.png" alt="Abundance Financial Services" width="80" height="80" style="display:block;margin:0 auto 14px;border-radius:14px;border:1.5px solid #e2e8f0;" />
    <div style="font-size:20px;font-weight:900;color:${BRAND};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${MUTED};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${BRAND};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Hi ${greetingName},</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${MUTED};line-height:1.6;">${advisorEsc} has shared a ${typeLabel} investment proposal with you. No sign-in needed — just click below to view it.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;">
      <a href="${shareUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">View Proposal →</a>
    </td></tr></table>
    <p style="margin:0 0 4px;font-size:12px;color:${MUTED};line-height:1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:11px;color:${BRAND};word-break:break-all;font-family:'Courier New',monospace;">${shareUrl}</p>
    ${contactLine ? `<p style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">Questions? Reach ${advisorEsc} at ${contactLine}.</p>` : ''}
    <p style="margin:20px 0 0;font-size:12px;color:${MUTED};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">Full terms and disclaimers are shown on the proposal page itself.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${MUTED};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  const text = `Hi ${clientName || 'there'},\n\n${advisorName || 'Your advisor'} has shared a ${typeLabel} investment proposal with you. No sign-in needed.\n\nView it here: ${shareUrl}\n\n${contactLine ? `Questions? Reach ${advisorName || 'your advisor'} at ${contactLine}.\n\n` : ''}Abundance Financial Services · ARN-251838`;

  return { subject, html, text };
}

module.exports = { buildProposalShareEmail, isPlausibleEmail };
