'use client';

/**
 * app/proposal-studio/ProposalReadOnlyView.jsx
 *
 * Read-only rendering of a proposal -- used by BOTH the public
 * /proposal-studio/view/[token] page (no proposalId passed, since the
 * public API route never returns one) and the owner's
 * /proposal-studio/mine/[id] page (proposalId passed so Export/Print can
 * show "Proposal ID: PROP-XXXX" like the editor does). Runs its own
 * holdings-fetch effect -- simpler than ProposalStudioTool's, since a
 * read-only view never needs to default a fund's amount from its minimum
 * investment (amounts are already fixed by whoever saved the proposal) --
 * then hands the result to the same ProposalAnalysisBlock the editable
 * tool uses, so the two stay pixel-identical for the parts they share. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 */

import { useState, useEffect } from 'react';
import { useMCapIndex, ProposalAnalysisBlock } from './ProposalSections';

export default function ProposalReadOnlyView({
  clientName, clientEmail, clientPhone,
  advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
  proposalType, sipFrequency, selectedFunds, proposalId,
}) {
  const [holdingsByFund, setHoldingsByFund] = useState({});
  const [holdingsError, setHoldingsError] = useState({});
  const mCapIndex = useMCapIndex();

  useEffect(() => {
    selectedFunds.forEach(({ amfiCode, schemeName }) => {
      if (holdingsByFund[amfiCode] || holdingsError[amfiCode]) return;
      fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setHoldingsError((prev) => ({ ...prev, [amfiCode]: data.error }));
          } else {
            setHoldingsByFund((prev) => ({ ...prev, [amfiCode]: data }));
          }
        })
        .catch(() => setHoldingsError((prev) => ({ ...prev, [amfiCode]: 'Failed to load holdings' })));
    });
  }, [selectedFunds, holdingsByFund, holdingsError]);

  const totalAmount = selectedFunds.reduce((s, f) => s + (f.amount || 0), 0);

  return (
    <div className="pfc-tool">
      <div className="pfc-readonly-parties">
        <div className="pfc-readonly-party">
          <div className="pfc-readonly-label">Prepared For</div>
          <div className="pfc-readonly-name">{clientName || 'Client'}</div>
          {clientEmail && <div className="pfc-readonly-detail">{clientEmail}</div>}
          {clientPhone && <div className="pfc-readonly-detail">{clientPhone}</div>}
        </div>
        <div className="pfc-readonly-party">
          <div className="pfc-readonly-label">Prepared By</div>
          <div className="pfc-readonly-name">{advisorName || 'Advisor'}</div>
          {advisorPhone && <div className="pfc-readonly-detail">{advisorPhone}</div>}
          {advisorEmail && <div className="pfc-readonly-detail">{advisorEmail}</div>}
          <div className="pfc-readonly-detail">{advisorArn}{advisorEuin ? ` · EUIN: ${advisorEuin}` : ''}</div>
        </div>
      </div>

      {selectedFunds.length > 0 && (
        <ProposalAnalysisBlock
          selectedFunds={selectedFunds}
          holdingsByFund={holdingsByFund}
          holdingsError={holdingsError}
          totalAmount={totalAmount}
          mCapIndex={mCapIndex}
          proposalType={proposalType}
          sipFrequency={sipFrequency}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          advisorName={advisorName}
          advisorPhone={advisorPhone}
          advisorEmail={advisorEmail}
          advisorArn={advisorArn}
          advisorEuin={advisorEuin}
          proposalId={proposalId}
        />
      )}
    </div>
  );
}
