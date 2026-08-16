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

import { useState, useEffect, useMemo } from 'react';
import { useMCapIndex, ProposalAnalysisBlock, prettifySchemeName } from './ProposalSections';
import { isArnBlocked, arnBlockedReason } from '@/lib/amfiDistributor';

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function ProposalReadOnlyView({
  clientName, clientEmail, clientPhone,
  advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin, advisorArnVerified,
  proposalType, sipFrequency, selectedFunds: rawSelectedFunds, proposalId,
}) {
  const [holdingsByFund, setHoldingsByFund] = useState({});
  const [holdingsError, setHoldingsError] = useState({});
  const mCapIndex = useMCapIndex();

  // Prettified once here, near the top, and used everywhere downstream --
  // the editor prettifies ALL-CAPS CAS-derived scheme names when funds are
  // added/loaded, but a saved proposal's raw payload never goes through that
  // path, so without this the read-only view (public share link and owner's
  // mine/[id] page) would show ALL CAPS names the editor never would.
  const selectedFunds = useMemo(
    () => rawSelectedFunds.map((f) => ({ ...f, schemeName: prettifySchemeName(f.schemeName) })),
    [rawSelectedFunds],
  );

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
          {advisorArnVerified ? (
            <div className="pfc-readonly-detail">
              {isArnBlocked(advisorArnVerified)
                ? <>⚠ {advisorArn}{advisorEuin ? ` · EUIN: ${advisorEuin}` : ''} — {arnBlockedReason(advisorArnVerified)}</>
                : <>✓ AMFI Registered · {advisorArn}{advisorArnVerified.arnValidTill ? ` · Valid till ${new Date(advisorArnVerified.arnValidTill).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}</>}
            </div>
          ) : (
            <div className="pfc-readonly-detail">{advisorArn}{advisorEuin ? ` · EUIN: ${advisorEuin}` : ''}</div>
          )}
        </div>
      </div>

      {selectedFunds.length > 0 && (
        <section className="pfc-client-details">
          <h3>Selected Funds</h3>
          <div className="pfc-table-wrap">
            <table className="pfc-table">
              <thead>
                <tr>
                  <th>Fund</th>
                  <th className="pfc-table-pct">Amount</th>
                  <th className="pfc-table-pct">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedFunds.map((f) => (
                  <tr key={f.amfiCode}>
                    <td>{f.schemeName}</td>
                    <td className="pfc-table-pct">{inr(f.amount || 0)}</td>
                    <td className="pfc-table-pct">{(totalAmount > 0 ? ((f.amount || 0) / totalAmount) * 100 : 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
