'use client';

/**
 * app/proposal-studio/view/[token]/page.js
 *
 * Public, unauthenticated view of a shared proposal -- no sign-in check,
 * mirroring the public /api/proposal-studio/shared/[token] route it calls.
 * A revoked or unknown token shows a plain message rather than a raw
 * error, matching the API route's deliberately generic 404. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import '../../proposal-studio.css';
import ProposalReadOnlyView from '../../ProposalReadOnlyView';

export default function ProposalPublicViewPage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, data: null, notFound: false });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proposal-studio/shared/${encodeURIComponent(token)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setState({ loading: false, data: null, notFound: true });
        else setState({ loading: false, data, notFound: false });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null, notFound: true }); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <Navbar />
      <main className="pfc-page">
        {state.loading && <div className="pfc-hint">Loading proposal…</div>}
        {!state.loading && state.notFound && (
          <div className="pfc-readonly-notfound">This proposal link isn't available. It may have been removed, or the link may be incorrect.</div>
        )}
        {!state.loading && state.data && (
          <>
            <h1 className="pfc-title">Investment Proposal</h1>
            <p className="pfc-subtitle">Shared by {state.data.advisorName || 'your advisor'} via Abundance Financial Services.</p>
            <ProposalReadOnlyView
              clientName={state.data.clientName}
              clientEmail={state.data.clientEmail}
              clientPhone={state.data.clientPhone}
              advisorName={state.data.advisorName}
              advisorPhone={state.data.advisorPhone}
              advisorEmail={state.data.advisorEmail}
              advisorArn={state.data.advisorArn}
              advisorEuin={state.data.advisorEuin}
              proposalType={state.data.proposalType}
              sipFrequency={state.data.sipFrequency}
              selectedFunds={state.data.selectedFunds || []}
            />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
