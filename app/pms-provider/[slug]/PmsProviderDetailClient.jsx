'use client';

import React from 'react';
import Link from 'next/link';

export default function PmsProviderDetailClient({
  providerSlug,
  displayName,
  logoPath,
  strategyCount,
  strategies = [],
  syncedAt,
}) {
  const initials = displayName
    .split(' ')
    .filter((w) => !['capital', 'advisors', 'management', 'investments', 'managers'].includes(w.toLowerCase()))
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* ── BREADCRUMBS ── */}
      <nav style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
        <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Home</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href="/pms-provider" style={{ color: 'var(--muted)', textDecoration: 'none' }}>PMS Providers</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: 'var(--text)', fontWeight: '600' }}>{displayName}</span>
      </nav>

      {/* ── PROVIDER HERO CARD ── */}
      <div
        style={{
          background: 'var(--s1, #fff)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '28px 24px',
          marginBottom: '28px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {logoPath ? (
              <img
                src={logoPath}
                alt={displayName}
                style={{
                  width: '64px',
                  height: '64px',
                  objectFit: 'contain',
                  borderRadius: '12px',
                  background: '#fff',
                  border: '1px solid var(--border)',
                  padding: '4px',
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
                color: '#fff',
                fontWeight: '800',
                fontSize: '20px',
                display: logoPath ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials}
            </div>

            <div>
              <h1
                style={{
                  fontSize: 'clamp(22px, 3.5vw, 28px)',
                  fontWeight: '800',
                  color: 'var(--text)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                {displayName}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                SEBI-Registered Portfolio Manager · {strategyCount} Active Strategies Tracked
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link
              href={`/pms-provider/${providerSlug}?format=md`}
              target="_blank"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                textDecoration: 'none',
                color: 'var(--text)',
                background: 'var(--s2, #f5f5f5)',
                border: '1px solid var(--border)',
              }}
            >
              <span>📄</span> Markdown Feed
            </Link>
          </div>
        </div>
      </div>

      {/* ── STRATEGIES & FACTSHEETS SECTION ── */}
      <div style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '20px',
            fontWeight: '800',
            color: 'var(--text)',
            margin: '0 0 16px',
            letterSpacing: '-0.01em',
          }}
        >
          Investment Strategies & Monthly Factsheets ({strategies.length})
        </h2>

        <div
          style={{
            background: 'var(--s1, #fff)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--s2, #f9fafb)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--text)' }}>Strategy Name</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)' }}>Doc Type</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)' }}>Reporting Period</th>
                <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--text)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr key={s.strategyName} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text)', fontSize: '14px' }}>
                      {s.strategyName}
                    </div>
                    {s.title && s.title !== s.strategyName && (
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                        {s.title}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: s.docType === 'presentation' ? 'rgba(2,136,209,0.08)' : 'rgba(27,94,32,0.08)',
                        color: s.docType === 'presentation' ? '#0288d1' : '#1b5e20',
                      }}
                    >
                      {s.docType}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--muted)' }}>
                    {s.period || 'Latest'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                      {s.iaid ? (
                        <Link
                          href={`/pms/${s.iaid}`}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            textDecoration: 'none',
                            background: '#1b5e20',
                            color: '#fff',
                          }}
                        >
                          View Analytics →
                        </Link>
                      ) : null}
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            textDecoration: 'none',
                            background: 'var(--s2, #f0f0f0)',
                            color: 'var(--text)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          Download PDF 📥
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── EXTRACTED HOLDINGS INSIGHTS (IF PRESENT) ── */}
      {strategies.some((s) => s.extracted && s.extracted.topHoldings?.length > 0) && (
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '800',
              color: 'var(--text)',
              margin: '0 0 16px',
              letterSpacing: '-0.01em',
            }}
          >
            Strategy Portfolio Holdings Snapshot
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {strategies
              .filter((s) => s.extracted && s.extracted.topHoldings?.length > 0)
              .map((s) => (
                <div
                  key={s.strategyName}
                  style={{
                    background: 'var(--s1, #fff)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>
                      {s.strategyName}
                    </div>
                    {s.extracted.asOfDate && (
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        As of {s.extracted.asOfDate}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Top Extracted Holdings
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {s.extracted.topHoldings.map((h, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '13px',
                          padding: '4px 0',
                          borderBottom: i < s.extracted.topHoldings.length - 1 ? '1px dashed var(--border)' : 'none',
                        }}
                      >
                        <span style={{ color: 'var(--text)', fontWeight: '500' }}>
                          {h.company || h.name}
                        </span>
                        <span style={{ color: '#1b5e20', fontWeight: '700' }}>
                          {h.weight ? `${parseFloat(h.weight).toFixed(2)}%` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── STATUTORY REGULATORY DISCLOSURE ── */}
      <div
        style={{
          marginTop: '40px',
          padding: '18px 24px',
          borderRadius: '12px',
          background: 'var(--s1, #fff)',
          border: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: '0 0 6px' }}>
          Portfolio Management Services (PMS) are subject to market risks. Discretionary and non-discretionary investments are not guaranteed. Minimum investment in PMS in India is ₹50 Lakhs as mandated by SEBI. Read the Disclosure Document and strategy factsheets carefully before investing.
        </p>
        <p style={{ margin: 0, fontWeight: '600', color: 'var(--text)' }}>
          Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).
        </p>
      </div>
    </div>
  );
}
