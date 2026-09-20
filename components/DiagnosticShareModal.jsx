'use client';

/**
 * components/DiagnosticShareModal.jsx
 *
 * Pre-share Transparency Modal for CAS Portfolio Diagnostic.
 *
 * Guarantees:
 * - Computes factual pairwise overlap and AMFI market-cap split client-side.
 * - Strips all PII and absolute balances via sanitizeDiagnosticPayload().
 * - Executes the 5-phase pre-flight assertion gate assertZeroPII() before any network call.
 * - Displays a 4-point privacy guarantee checklist and full transparent JSON preview.
 * - Calls POST /api/portfolio/diagnostic/create and provides one-tap copy/share controls.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  sanitizeDiagnosticPayload,
  computeWeightedOverlap,
  assertZeroPII,
} from '@/lib/diagnosticRedaction';
import {
  computeOverlap,
  computeMCapAllocation,
  normalizeName,
} from '@/lib/portfolioAnalysis';

export default function DiagnosticShareModal({
  isOpen,
  onClose,
  holdings = [],
  report = null,
  investorName = '',
  familyName = '',
}) {
  const [title, setTitle] = useState('Mutual Fund Portfolio Diagnostic');
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [overlapData, setOverlapData] = useState(null);
  const [mCapData, setMCapData] = useState(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [shareResult, setShareResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  // Filter positive holdings
  const validHoldings = useMemo(
    () => holdings.filter((h) => (Number(h.value) || 0) > 0),
    [holdings]
  );

  // Fetch underlying holdings & categorization to compute overlap & market cap
  useEffect(() => {
    if (!isOpen || validHoldings.length === 0) return;

    let cancelled = false;
    setLoadingAnalysis(true);
    setAnalysisError(null);

    async function runAnalysis() {
      try {
        // 1. Fetch AMFI Cap Categorization
        const mCapRes = await fetch('/data/amfi-cap-categorization.json');
        let mCapMap = new Map();
        if (mCapRes.ok) {
          const mCapJson = await mCapRes.json();
          if (mCapJson?.categories) {
            mCapMap = new Map(Object.entries(mCapJson.categories));
          }
        }

        // 2. Fetch underlying holdings for each unique scheme
        const uniqueSchemes = [];
        const seenCodes = new Set();
        for (const h of validHoldings) {
          const code = h.amfiCode || h.code;
          if (code && !seenCodes.has(String(code))) {
            seenCodes.add(String(code));
            uniqueSchemes.push({ amfiCode: code, schemeName: h.name || h.schemeName });
          }
        }

        const holdingsPromises = uniqueSchemes.map(async (s) => {
          try {
            const r = await fetch(
              `/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(
                s.amfiCode
              )}&schemeName=${encodeURIComponent(s.schemeName || '')}`
            );
            if (!r.ok) return null;
            const data = await r.json();
            return {
              amfiCode: s.amfiCode,
              schemeName: s.schemeName,
              holdings: data.holdings || [],
            };
          } catch {
            return null;
          }
        });

        const fundResults = (await Promise.all(holdingsPromises)).filter(Boolean);

        if (cancelled) return;

        // 3. Compute pairwise overlap if >= 2 funds
        let grid = null;
        let weightedOverlap = null;
        const topPairs = [];

        if (fundResults.length >= 2) {
          grid = computeOverlap(fundResults);

          // Build schemes weight list aligned with fundResults
          const totalVal = validHoldings.reduce((sum, h) => sum + (Number(h.value) || 0), 0);
          const alignedSchemes = fundResults.map((f) => {
            const fundVal = validHoldings
              .filter((h) => String(h.amfiCode || h.code) === String(f.amfiCode))
              .reduce((s, h) => s + (Number(h.value) || 0), 0);
            return {
              weightPct: totalVal > 0 ? (fundVal / totalVal) * 100 : 0,
            };
          });

          weightedOverlap = computeWeightedOverlap(alignedSchemes, grid);

          // Find top overlap pairs (i < j)
          for (let i = 0; i < fundResults.length; i++) {
            for (let j = i + 1; j < fundResults.length; j++) {
              const pairOverlap = grid[i]?.[j] ?? 0;
              if (pairOverlap > 5) {
                topPairs.push({
                  amfiCodeA: Number(fundResults[i].amfiCode) || 0,
                  amfiCodeB: Number(fundResults[j].amfiCode) || 0,
                  overlapPct: Math.round(pairOverlap * 10) / 10,
                });
              }
            }
          }
          topPairs.sort((a, b) => b.overlapPct - a.overlapPct);
        }

        // 4. Compute aggregate equity market cap allocation
        let totalLarge = 0;
        let totalMid = 0;
        let totalSmall = 0;
        let totalWeight = 0;

        for (const f of fundResults) {
          if (!f.holdings || f.holdings.length === 0) continue;
          const fundVal = validHoldings
            .filter((h) => String(h.amfiCode || h.code) === String(f.amfiCode))
            .reduce((s, h) => s + (Number(h.value) || 0), 0);

          if (fundVal <= 0) continue;
          const mcap = computeMCapAllocation(f, mCapMap);
          totalLarge += (mcap.large || 0) * fundVal;
          totalMid += (mcap.mid || 0) * fundVal;
          totalSmall += (mcap.small || 0) * fundVal;
          totalWeight += fundVal;
        }

        const mCapAllocation =
          totalWeight > 0
            ? {
                large: Math.round((totalLarge / totalWeight) * 10) / 10,
                mid: Math.round((totalMid / totalWeight) * 10) / 10,
                small: Math.round((totalSmall / totalWeight) * 10) / 10,
                unclassified: 0,
                derivatives: 0,
              }
            : { large: 0, mid: 0, small: 0, unclassified: 0, derivatives: 0 };

        setOverlapData({
          weightedOverlapPct: weightedOverlap,
          topOverlapPairs: topPairs.slice(0, 5),
        });
        setMCapData(mCapAllocation);
        setLoadingAnalysis(false);
      } catch (err) {
        if (!cancelled) {
          console.warn('[DiagnosticShareModal] Analysis computation warning:', err);
          setLoadingAnalysis(false);
        }
      }
    }

    runAnalysis();

    return () => {
      cancelled = true;
    };
  }, [isOpen, validHoldings]);

  // Build the sanitized diagnostic payload
  const diagnosticPayload = useMemo(() => {
    if (!isOpen || validHoldings.length === 0) return null;

    try {
      const sanitized = sanitizeDiagnosticPayload(validHoldings, { title });

      // Populate Quartile Distribution from report
      let q1 = 0,
        q2 = 0,
        q3 = 0,
        q4 = 0,
        unranked = 0;
      if (report?.categories) {
        for (const cat of report.categories) {
          for (const item of cat.items || []) {
            const q = item.quartile;
            if (q === 1) q1++;
            else if (q === 2) q2++;
            else if (q === 3) q3++;
            else if (q === 4) q4++;
            else unranked++;
          }
        }
      }
      if (report?.unranked) {
        unranked += report.unranked.length;
      }

      sanitized.metrics.quartileDistribution = {
        q1Count: q1,
        q2Count: q2,
        q3Count: q3,
        q4Count: q4,
        unrankedCount: unranked,
      };

      if (overlapData) {
        sanitized.metrics.weightedOverlapPct = overlapData.weightedOverlapPct;
        sanitized.metrics.topOverlapPairs = overlapData.topOverlapPairs || [];
      }

      if (mCapData) {
        sanitized.metrics.mCapAllocation = mCapData;
      }

      return sanitized;
    } catch (err) {
      console.error('[DiagnosticShareModal] Payload generation error:', err);
      return null;
    }
  }, [isOpen, validHoldings, title, report, overlapData, mCapData]);

  // Client-side assertion test
  const piiVerification = useMemo(() => {
    if (!diagnosticPayload) return { ok: false, error: 'Generating payload…' };
    try {
      assertZeroPII(diagnosticPayload, {
        investorName,
        familyName,
      });
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [diagnosticPayload, investorName, familyName]);

  async function handleCreateShareLink() {
    if (!diagnosticPayload || !piiVerification.ok) return;

    setCreating(true);
    setCreateError(null);

    try {
      // Final client-side assertion gate check
      assertZeroPII(diagnosticPayload, { investorName, familyName });

      const res = await fetch('/api/portfolio/diagnostic/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: diagnosticPayload, title }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Please sign in to your Abundance account to create and manage shareable links.');
        }
        throw new Error(data.error || 'Failed to create shareable diagnostic');
      }

      setShareResult(data);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (!shareResult?.shareUrl) return;
    const fullUrl = `${window.location.origin}${shareResult.shareUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0d1f12',
          border: '1.5px solid rgba(102, 187, 106, 0.25)',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          color: '#ffffff',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div
              style={{
                color: '#81c784',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Shareable Diagnostic
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
              Privacy-Verified Portfolio Card
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '1.3rem',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {!shareResult ? (
          <>
            {/* Privacy Guarantee Box */}
            <div
              style={{
                background: 'rgba(46, 125, 50, 0.15)',
                border: '1px solid rgba(102, 187, 106, 0.3)',
                borderRadius: 14,
                padding: '16px 18px',
              }}
            >
              <div
                style={{
                  color: '#a5d6a7',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>🛡️</span> Zero-PII Client-Side Privacy Guarantee
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px 16px',
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                <div>✓ 0 PANs or Tax IDs</div>
                <div>✓ 0 Folio Numbers</div>
                <div>✓ 0 Rupee Balances or Units</div>
                <div>✓ 0 Personal or Family Names</div>
              </div>
            </div>

            {/* Diagnostic Scope Summary */}
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>Holdings Included:</span>
                <span style={{ fontWeight: 800, color: '#ffffff' }}>{validHoldings.length} Schemes</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>Weighted Overlap:</span>
                <span style={{ fontWeight: 800, color: '#4db6ac' }}>
                  {loadingAnalysis
                    ? 'Calculating…'
                    : overlapData?.weightedOverlapPct != null
                    ? `${overlapData.weightedOverlapPct.toFixed(1)}%`
                    : validHoldings.length <= 1
                    ? 'Single Fund'
                    : 'N/A'}
                </span>
              </div>

              {mCapData && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Market Cap Allocation:</span>
                  <span style={{ fontWeight: 700, color: '#a5d6a7' }}>
                    {Math.round(mCapData.large)}% Large · {Math.round(mCapData.mid)}% Mid ·{' '}
                    {Math.round(mCapData.small)}% Small
                  </span>
                </div>
              )}
            </div>

            {/* Title Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                Diagnostic Title (publicly visible)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                placeholder="e.g. Mutual Fund Portfolio Diagnostic"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
            </div>

            {/* JSON Transparency Accordion */}
            <div>
              <button
                type="button"
                onClick={() => setShowJsonPreview(!showJsonPreview)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#81c784',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {showJsonPreview ? '▼ Hide' : '▶ Inspect'} Exact Redacted JSON Payload
              </button>

              {showJsonPreview && (
                <pre
                  style={{
                    marginTop: 10,
                    padding: '12px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    fontSize: '0.7rem',
                    color: '#80cbc4',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {JSON.stringify(diagnosticPayload, null, 2)}
                </pre>
              )}
            </div>

            {/* Assertion Status / Error */}
            {!piiVerification.ok && (
              <div
                style={{
                  background: 'rgba(229, 57, 53, 0.15)',
                  border: '1px solid #ef5350',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#ffcdd2',
                  fontSize: '0.78rem',
                }}
              >
                Privacy Gate Warning: {piiVerification.error}
              </div>
            )}

            {createError && (
              <div
                style={{
                  background: 'rgba(229, 57, 53, 0.15)',
                  border: '1px solid #ef5350',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#ffcdd2',
                  fontSize: '0.78rem',
                }}
              >
                {createError}
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={handleCreateShareLink}
              disabled={creating || !piiVerification.ok}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 12,
                background: piiVerification.ok ? '#2e7d32' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 800,
                cursor: piiVerification.ok ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              {creating ? 'Generating Secure Link…' : 'Generate Shareable Link & Card →'}
            </button>
          </>
        ) : (
          /* Success Screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                background: 'rgba(46, 125, 50, 0.15)',
                border: '1.5px solid #66bb6a',
                borderRadius: 14,
                padding: '18px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>🎉</div>
              <div style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: 800, marginBottom: 4 }}>
                Diagnostic Link Ready
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
                Your redacted portfolio snapshot and OpenGraph card are live.
              </div>
            </div>

            {/* Share URL Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: '6px 6px 6px 14px',
                gap: 8,
              }}
            >
              <span
                style={{
                  color: '#80cbc4',
                  fontSize: '0.78rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {typeof window !== 'undefined'
                  ? `${window.location.origin}${shareResult.shareUrl}`
                  : shareResult.shareUrl}
              </span>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? '#2e7d32' : '#00897b',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Check out my mutual fund portfolio diagnostic on Abundance: ${
                    typeof window !== 'undefined' ? window.location.origin : ''
                  }${shareResult.shareUrl}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px',
                  borderRadius: 10,
                  background: '#25D366',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                }}
              >
                Share on WhatsApp
              </a>

              <a
                href={shareResult.shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              >
                View Public Page ↗
              </a>
            </div>

            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', textAlign: 'center', lineHeight: 1.4 }}>
              Active for 90 days. You can instantly revoke this link at any time from your account settings.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
