'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import WidgetAttributionFooter from '@/components/widgets/WidgetAttributionFooter';

export default function EmbedBreadthWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: '#5e8a5e' }}>Loading Market Breadth…</div>}>
      <EmbedBreadthClient />
    </Suspense>
  );
}

function EmbedBreadthClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/market-watch');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setError(null);
      } else {
        // Fallback to /api/breadth if market-watch is unavailable
        const bRes = await fetch('/api/breadth');
        if (bRes.ok) {
          const bJson = await bRes.json();
          const lastSnap = bJson.snaps?.[bJson.snaps.length - 1];
          if (lastSnap) {
            setData({
              marketStatus: 'Closed',
              isOpen: false,
              nifty50: {
                advances: lastSnap.advancing || 0,
                declines: lastSnap.declining || 0,
                unchanged: lastSnap.unchanged || 0,
              },
              indices: [],
            });
            setError(null);
          } else {
            setError('Breadth data unavailable');
          }
        } else {
          setError('Failed to fetch market data');
        }
      }
    } catch (err) {
      setError(err.message || 'Error fetching breadth');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setLastFetch(new Date());
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh: 30s during market hours, 5min if closed
    const interval = setInterval(() => {
      fetchData();
    }, (data?.isOpen ? 30 : 300) * 1000);

    return () => clearInterval(interval);
  }, [fetchData, data?.isOpen]);

  const niftyIndex = data?.indices?.find(
    (x) => x?.id === 'NIFTY 50' || x?.name === 'Nifty 50'
  );

  const advances = data?.nifty50?.advances ?? 0;
  const declines = data?.nifty50?.declines ?? 0;
  const unchanged = data?.nifty50?.unchanged ?? 0;
  const total = advances + declines + unchanged || 50;

  const advPct = Math.round((advances / total) * 100);
  const decPct = Math.round((declines / total) * 100);
  const unchPct = 100 - advPct - decPct;

  const ratio = declines > 0 ? (advances / declines).toFixed(2) : advances > 0 ? '50.0' : '1.0';
  const numRatio = parseFloat(ratio);

  let sentiment = 'Neutral';
  let sentimentColor = '#43a047';
  let sentimentBg = '#e8f5e9';

  if (numRatio >= 2.0) {
    sentiment = 'Strongly Bullish';
    sentimentColor = '#1b5e20';
    sentimentBg = '#c8e6c9';
  } else if (numRatio >= 1.2) {
    sentiment = 'Bullish';
    sentimentColor = '#2e7d32';
    sentimentBg = '#e8f5e9';
  } else if (numRatio <= 0.5) {
    sentiment = 'Strongly Bearish';
    sentimentColor = '#b71c1c';
    sentimentBg = '#ffcdd2';
  } else if (numRatio <= 0.8) {
    sentiment = 'Bearish';
    sentimentColor = '#c62828';
    sentimentBg = '#ffebee';
  }

  const lastPrice = niftyIndex?.last != null ? Number(niftyIndex.last).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  const changeVal = niftyIndex?.change != null ? Number(niftyIndex.change) : null;
  const changePct = niftyIndex?.pct != null ? Number(niftyIndex.pct) : null;
  const isPositive = changeVal != null && changeVal >= 0;

  const fullBreadthUrl = 'https://mfcalc.getabundance.in/market-breadth?utm_source=widget_embed&utm_medium=cta&utm_campaign=nifty50_breadth';

  return (
    <div style={{
      maxWidth: '460px',
      margin: '0 auto',
      width: '100%',
      height: '100%',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface, #ffffff)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
      border: '1px solid var(--border, #c2dfc2)',
    }}>
      {/* Header */}
      <header style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border, #c2dfc2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--s2, #edf6ed)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📊</span>
          <h1 style={{
            fontSize: '14px',
            fontWeight: '700',
            color: 'var(--g1, #1b5e20)',
            margin: 0,
          }}>
            Nifty 50 Advance / Decline Breadth
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: '700',
            color: data?.isOpen ? '#1b5e20' : '#64748b',
            background: data?.isOpen ? '#dcfce7' : '#f1f5f9',
            padding: '2px 6px',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: data?.isOpen ? '#16a34a' : '#94a3b8',
            }} />
            {data?.isOpen ? 'Live Market' : 'Market Closed'}
          </span>
          <button
            type="button"
            onClick={fetchData}
            title="Refresh market data"
            disabled={isRefreshing}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--muted, #5e8a5e)',
              opacity: isRefreshing ? 0.4 : 1,
            }}
          >
            ↻
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted, #5e8a5e)', fontSize: '13px' }}>
            Fetching live NSE breadth data…
          </div>
        ) : error ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#b71c1c', fontSize: '12px' }}>
            {error}. Click ↻ to retry.
          </div>
        ) : (
          <>
            {/* Top Index Level (if available) */}
            {lastPrice && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                background: 'var(--s2, #edf6ed)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border, #c2dfc2)',
              }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted, #5e8a5e)', fontWeight: '600' }}>
                    NIFTY 50 LEVEL
                  </span>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '18px',
                    fontWeight: '800',
                    color: 'var(--text, #162616)',
                  }}>
                    {lastPrice}
                  </div>
                </div>

                {changeVal != null && (
                  <div style={{
                    textAlign: 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '13px',
                    fontWeight: '700',
                    color: isPositive ? '#16a34a' : '#dc2626',
                  }}>
                    <span>{isPositive ? '▲ +' : '▼ '}{Math.abs(changeVal).toFixed(2)}</span>
                    <span style={{ marginLeft: '4px', fontSize: '11px' }}>
                      ({isPositive ? '+' : ''}{changePct?.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Advance / Decline Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text2, #2e4d2e)' }}>
                  Market Breadth Ratio: <strong style={{ fontFamily: 'monospace' }}>{ratio}x</strong>
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: '700',
                  color: sentimentColor,
                  background: sentimentBg,
                  padding: '2px 8px',
                  borderRadius: '10px',
                }}>
                  {sentiment}
                </span>
              </div>

              {/* Segmented Bar */}
              <div style={{
                height: '24px',
                width: '100%',
                background: '#e2e8f0',
                borderRadius: '6px',
                overflow: 'hidden',
                display: 'flex',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <div
                  style={{
                    width: `${advPct}%`,
                    background: '#16a34a',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    transition: 'width 0.3s ease',
                  }}
                  title={`${advances} Advances (${advPct}%)`}
                >
                  {advances > 0 ? advances : ''}
                </div>

                {unchanged > 0 && (
                  <div
                    style={{
                      width: `${unchPct}%`,
                      background: '#94a3b8',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'monospace',
                      transition: 'width 0.3s ease',
                    }}
                    title={`${unchanged} Unchanged`}
                  >
                    {unchanged}
                  </div>
                )}

                <div
                  style={{
                    width: `${decPct}%`,
                    background: '#dc2626',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    transition: 'width 0.3s ease',
                  }}
                  title={`${declines} Declines (${decPct}%)`}
                >
                  {declines > 0 ? declines : ''}
                </div>
              </div>

              {/* Legend */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                marginTop: '6px',
                color: 'var(--text2, #2e4d2e)',
              }}>
                <span style={{ color: '#16a34a', fontWeight: '700' }}>
                  ▲ {advances} Advances ({advPct}%)
                </span>
                {unchanged > 0 && (
                  <span style={{ color: '#64748b', fontWeight: '600' }}>
                    — {unchanged} Unchanged
                  </span>
                )}
                <span style={{ color: '#dc2626', fontWeight: '700' }}>
                  ▼ {declines} Declines ({decPct}%)
                </span>
              </div>
            </div>

            {/* Deep Link CTA */}
            <a
              href={fullBreadthUrl}
              target="_blank"
              rel="noopener"
              style={{
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--g1, #1b5e20)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                marginTop: '4px',
              }}
              onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Full Market Breadth & McClellan Oscillator ↗
            </a>
          </>
        )}
      </div>

      {/* Attribution Footer */}
      <WidgetAttributionFooter widget="nifty50_breadth" defaultHeight={260} />
    </div>
  );
}
