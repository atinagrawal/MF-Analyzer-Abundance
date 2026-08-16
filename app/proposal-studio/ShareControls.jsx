'use client';

/**
 * app/proposal-studio/ShareControls.jsx
 *
 * Share/Copy Link/Unshare/Send Email widget for a saved proposal -- shared
 * by two call sites: ProposalStudioTool's own .pfc-actions bar right after
 * a fresh save (initialShareToken is always null there, since saveProposal
 * always creates a brand-new, as-yet-unshared row -- see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md,
 * decision 3), and app/proposal-studio/mine/[id]/page.js for a proposal
 * reopened later from "My Saved Proposals" (initialShareToken there comes
 * from /api/proposal-studio/load's shareToken field).
 */

import { useState } from 'react';

export default function ShareControls({ proposalId, initialShareToken, clientEmail, arnBlocked = false, arnBlockedReason = null }) {
  const [shareToken, setShareToken] = useState(initialShareToken || null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy Link');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(clientEmail || '');
  const [emailStatus, setEmailStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [emailError, setEmailError] = useState('');

  const shareUrl = shareToken && typeof window !== 'undefined'
    ? `${window.location.origin}/proposal-studio/view/${shareToken}`
    : '';

  async function handleShare() {
    setShareBusy(true);
    setShareError('');
    try {
      const res = await fetch('/api/proposal-studio/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not share this proposal.');
      setShareToken(data.shareToken);
    } catch (err) {
      setShareError(err.message);
    } finally {
      setShareBusy(false);
    }
  }

  async function handleUnshare() {
    setShareBusy(true);
    setShareError('');
    try {
      const res = await fetch('/api/proposal-studio/unshare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not unshare this proposal.');
      setShareToken(null);
    } catch (err) {
      setShareError(err.message);
    } finally {
      setShareBusy(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel('Copied!');
    } catch {
      setCopyLabel('Copy failed');
    }
    setTimeout(() => setCopyLabel('Copy Link'), 1500);
  }

  async function handleSendEmail(e) {
    e.preventDefault();
    setEmailStatus('sending');
    setEmailError('');
    try {
      const res = await fetch('/api/proposal-studio/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId, toEmail: emailTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send the email.');
      setEmailStatus('sent');
      // send-email/route.js shares the proposal first if it wasn't already
      // -- the response carries the resulting token, so this reflects that
      // immediately instead of requiring the user to reopen the page.
      if (data.shareToken) setShareToken(data.shareToken);
    } catch (err) {
      setEmailStatus('error');
      setEmailError(err.message);
    }
  }

  return (
    <div className="pfc-share-controls">
      {!shareToken && (
        <button type="button" className="pfc-save-btn" disabled={shareBusy || arnBlocked} title={arnBlocked ? arnBlockedReason : undefined} onClick={handleShare}>
          {shareBusy ? 'Sharing…' : 'Share'}
        </button>
      )}
      {shareToken && (
        <>
          <input className="pfc-client-input pfc-share-link-input" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
          <button type="button" className="pfc-save-btn" onClick={handleCopy}>{copyLabel}</button>
          <button type="button" className="pfc-saved-delete" disabled={shareBusy} onClick={handleUnshare}>
            {shareBusy ? 'Unsharing…' : 'Unshare'}
          </button>
        </>
      )}
      {shareError && <span className="pfc-error-hint">{shareError}</span>}

      <button type="button" className="pfc-save-btn" disabled={arnBlocked} title={arnBlocked ? arnBlockedReason : undefined} onClick={() => setEmailOpen((o) => !o)}>
        {emailOpen ? 'Close' : 'Send Email'}
      </button>

      {emailOpen && (
        <form className="pfc-send-email-form" onSubmit={handleSendEmail}>
          <input
            className="pfc-client-input"
            type="email"
            required
            placeholder="Client email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
          />
          <button type="submit" className="pfc-save-btn" disabled={emailStatus === 'sending' || arnBlocked}>
            {emailStatus === 'sending' ? 'Sending…' : 'Send'}
          </button>
          {emailStatus === 'sent' && <span className="pfc-hint">Email sent.</span>}
          {emailStatus === 'error' && <span className="pfc-error-hint">{emailError}</span>}
        </form>
      )}
    </div>
  );
}
