'use client';

/**
 * app/proposal-studio/mine/[id]/page.js
 *
 * Owner-only detail page for a saved proposal: read-only rendering plus
 * Edit/Share/Unshare/Send-Email controls. [id] is the proposal's raw
 * internal UUID (the same value formatProposalId() cosmetically shortens
 * to PROP-XXXXXXXX elsewhere) -- not the formatted display id, which is
 * not a routable identifier. Redirects signed-out visitors to /login; shows
 * a friendly message (not a raw error) if signed in but not the owner. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import '../../proposal-studio.css';
import ProposalReadOnlyView from '../../ProposalReadOnlyView';
import ShareControls from '../../ShareControls';
import { formatProposalId } from '../../ProposalSections';
import { isArnBlocked, arnBlockedReason } from '@/lib/amfiDistributor';

export default function ProposalOwnerViewPage() {
  const { id } = useParams();
  const router = useRouter();
  const { status } = useSession();
  const [state, setState] = useState({ loading: true, data: null, forbidden: false });

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch(`/api/proposal-studio/load?id=${encodeURIComponent(id)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) { setState({ loading: false, data: null, forbidden: true }); return; }
        setState({ loading: false, data, forbidden: false });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null, forbidden: true }); });
    return () => { cancelled = true; };
  }, [id, status]);

  if (state.loading || status === 'loading') {
    return (
      <>
        <Navbar />
        <main className="pfc-page"><div className="pfc-hint">Loading proposal…</div></main>
        <Footer />
      </>
    );
  }

  if (state.forbidden) {
    return (
      <>
        <Navbar />
        <main className="pfc-page">
          <div className="pfc-readonly-notfound">This proposal isn't available, or you don't have access to it.</div>
        </main>
        <Footer />
      </>
    );
  }

  const data = state.data;

  return (
    <>
      <Navbar activePage="proposal-studio" />
      <main className="pfc-page">
        <h1 className="pfc-title">Proposal {formatProposalId(id)}</h1>
        <p className="pfc-subtitle">{data.clientName || 'Client'} · {data.proposalType === 'sip' ? 'SIP' : 'Lumpsum'}</p>

        <div className="pfc-actions">
          <button type="button" className="pfc-save-btn" onClick={() => router.push(`/proposal-studio?load=${encodeURIComponent(id)}`)}>
            Edit this proposal
          </button>
          <ShareControls
            proposalId={id}
            initialShareToken={data.shareToken}
            clientEmail={data.clientEmail}
            arnBlocked={isArnBlocked(data.advisorArnVerified)}
            arnBlockedReason={arnBlockedReason(data.advisorArnVerified)}
          />
        </div>

        <ProposalReadOnlyView
          clientName={data.clientName}
          clientEmail={data.clientEmail}
          clientPhone={data.clientPhone}
          advisorName={data.advisorName}
          advisorPhone={data.advisorPhone}
          advisorEmail={data.advisorEmail}
          advisorArn={data.advisorArn}
          advisorEuin={data.advisorEuin}
          advisorArnVerified={data.advisorArnVerified}
          proposalType={data.proposalType}
          sipFrequency={data.sipFrequency}
          selectedFunds={data.selectedFunds || []}
          proposalId={id}
        />
      </main>
      <Footer />
    </>
  );
}
