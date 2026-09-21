'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export default function PmsProviderDirectoryClient({ providers = [], totalStrategies = 0 }) {
  const [search, setSearch] = useState('');

  const filteredProviders = useMemo(() => {
    if (!search.trim()) return providers;
    const q = search.trim().toLowerCase();
    return providers.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.providerSlug.toLowerCase().includes(q)
    );
  }, [providers, search]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* ── HERO BANNER ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(27,94,32,0.08) 0%, rgba(46,125,50,0.03) 100%)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '36px 24px',
          textAlign: 'center',
          marginBottom: '28px',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            borderRadius: '999px',
            background: 'rgba(27,94,32,0.12)',
            color: '#1b5e20',
            marginBottom: '12px',
          }}
        >
          HNI & PMS Hub
        </span>
        <h1
          style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: '800',
            color: 'var(--text)',
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
          }}
        >
          PMS Providers Directory
        </h1>
        <p
          style={{
            fontSize: '15px',
            color: 'var(--muted)',
            maxWidth: '680px',
            margin: '0 auto 20px',
            lineHeight: 1.5,
          }}
        >
          Explore tracked Portfolio Management Services asset managers in India. View active strategy documents,
          download official monthly factsheets, and deep-link to APMI performance analytics.
        </p>

        {/* Global Statistics Chips */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              background: 'var(--s1, #fff)',
              border: '1px solid var(--border)',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--text)',
            }}
          >
            🏢 <strong>{providers.length}</strong> Tracked Providers
          </div>
          <div
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              background: 'var(--s1, #fff)',
              border: '1px solid var(--border)',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--text)',
            }}
          >
            📑 <strong>{totalStrategies}</strong> Factsheets & Presentations
          </div>
          <div
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              background: 'var(--s1, #fff)',
              border: '1px solid var(--border)',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--text)',
            }}
          >
            📈 <strong>Direct Links</strong> to Strategy Analytics
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ maxWidth: '480px', margin: '0 auto', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search provider (e.g., Carnelian, Abakkus, Alchemy)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 18px 12px 42px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              fontSize: '15px',
              background: 'var(--s1, #fff)',
              color: 'var(--text)',
              outline: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '15px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '16px',
              color: 'var(--muted)',
            }}
          >
            🔍
          </span>
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                fontSize: '16px',
                cursor: 'pointer',
                color: 'var(--muted)',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── PROVIDERS GRID ── */}
      {filteredProviders.length === 0 ? (
        <div
          style={{
            padding: '48px 16px',
            textAlign: 'center',
            background: 'var(--s1, #fff)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>No Providers Match Your Search</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>Try searching with a different provider name.</div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredProviders.map((p) => {
            const initials = p.displayName
              .split(' ')
              .filter((w) => !['capital', 'advisors', 'management', 'investments', 'managers'].includes(w.toLowerCase()))
              .map((w) => w[0])
              .join('')
              .slice(0, 3)
              .toUpperCase();

            return (
              <Link
                key={p.providerSlug}
                href={`/pms-provider/${p.providerSlug}`}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'var(--s1, #fff)',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                  padding: '20px',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(27,94,32,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <div>
                  {/* Card Header: Logo & Title */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                    {p.logoPath ? (
                      <img
                        src={p.logoPath}
                        alt={p.displayName}
                        style={{
                          width: '44px',
                          height: '44px',
                          objectFit: 'contain',
                          borderRadius: '10px',
                          background: '#fff',
                          border: '1px solid var(--border)',
                          padding: '3px',
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
                        color: '#fff',
                        fontWeight: '700',
                        fontSize: '15px',
                        display: p.logoPath ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', lineHeight: 1.25 }}>
                        {p.displayName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        SEBI Registered Portfolio Manager
                      </div>
                    </div>
                  </div>

                  {/* Badges / Metrics Row */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '16px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'rgba(27,94,32,0.08)',
                        color: '#1b5e20',
                        fontWeight: '600',
                      }}
                    >
                      📑 {p.strategyCount} Strategies
                    </span>
                    {p.latestPeriod && (
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'var(--s2, #f5f5f5)',
                          color: 'var(--text)',
                          fontWeight: '500',
                        }}
                      >
                        🕒 {p.latestPeriod}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer CTA */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#1b5e20',
                  }}
                >
                  <span>View Strategies & Documents</span>
                  <span>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── STATUTORY REGULATORY ATTRIBUTION BANNER ── */}
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
          Portfolio Management Services are subject to market risks. Past performance does not guarantee future results. Investments in PMS are subject to a statutory minimum ticket size of ₹50 Lakhs as mandated by SEBI.
        </p>
        <p style={{ margin: 0, fontWeight: '600', color: 'var(--text)' }}>
          Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).
        </p>
      </div>
    </div>
  );
}
