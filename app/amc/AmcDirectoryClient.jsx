'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export default function AmcDirectoryClient({ amcs = [], totalAum = 0, totalSchemes = 0 }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('aum'); // 'aum' | 'schemes' | 'name' | 'ret'
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'TOP10' | 'EQUITY'

  const filteredAmcs = useMemo(() => {
    let list = [...amcs];

    // Filter by type
    if (filterType === 'TOP10') {
      list = list.slice(0, 10);
    } else if (filterType === 'EQUITY') {
      list = list.filter((a) => a.equitySchemes >= 15);
    }

    // Filter by search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.amcName.toLowerCase().includes(q) ||
          a.amcSlug.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'schemes') {
        return b.totalSchemes - a.totalSchemes;
      }
      if (sortBy === 'name') {
        return a.amcName.localeCompare(b.amcName);
      }
      if (sortBy === 'ret') {
        return (b.avgRet3y || 0) - (a.avgRet3y || 0);
      }
      return b.totalAumCr - a.totalAumCr;
    });

    return list;
  }, [amcs, search, sortBy, filterType]);

  const fmtAum = (val) => {
    const num = parseFloat(val) || 0;
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lakh Cr`;
    }
    if (num >= 1000) {
      return `₹${(num / 1000).toFixed(1)}k Cr`;
    }
    if (num > 0) {
      return `₹${num.toLocaleString('en-IN')} Cr`;
    }
    return '—';
  };

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
          Institutional Directory Hub
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
          All 52 Mutual Fund AMCs in India
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
          Explore official AMFI data for all asset management companies in India. Compare total assets under management,
          fund manager directories, active scheme counts, and performance.
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
            🏛️ <strong>{amcs.length}</strong> Registered AMCs
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
            💰 <strong>{fmtAum(totalAum)}</strong> Total Industry AUM
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
            📊 <strong>{totalSchemes.toLocaleString('en-IN')}</strong> Active Schemes
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ maxWidth: '520px', margin: '0 auto', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search AMC by name (e.g., HDFC, SBI, Nippon, PPFAS)..."
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

      {/* ── CONTROLS & FILTERS ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: `All AMCs (${amcs.length})` },
            { key: 'TOP10', label: 'Top 10 by AUM' },
            { key: 'EQUITY', label: 'Equity Heavy (15+ Funds)' },
          ].map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilterType(btn.key)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                border: filterType === btn.key ? '1px solid #1b5e20' : '1px solid var(--border)',
                background: filterType === btn.key ? 'rgba(27,94,32,0.1)' : 'var(--s1, #fff)',
                color: filterType === btn.key ? '#1b5e20' : 'var(--text)',
                transition: 'all 0.15s ease',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              fontSize: '13px',
              background: 'var(--s1, #fff)',
              color: 'var(--text)',
              outline: 'none',
            }}
          >
            <option value="aum">Total AUM (High to Low)</option>
            <option value="schemes">Scheme Count (Most First)</option>
            <option value="ret">3Y Avg Return</option>
            <option value="name">AMC Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* ── AMC CARDS GRID ── */}
      {filteredAmcs.length === 0 ? (
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
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>No AMCs Match Your Search</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>Try clearing the search query or changing filter options.</div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredAmcs.map((amc, idx) => {
            const initials = amc.amcName
              .split(' ')
              .filter((w) => !['mutual', 'fund', 'asset', 'management'].includes(w.toLowerCase()))
              .map((w) => w[0])
              .join('')
              .slice(0, 3)
              .toUpperCase();

            return (
              <Link
                key={amc.amcSlug}
                href={`/amc/${amc.amcSlug}`}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'var(--s1, #fff)',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                  padding: '18px',
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
                  {/* Card Header: Logo & Rank Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {amc.logoPath ? (
                        <img
                          src={amc.logoPath}
                          alt={amc.amcName}
                          style={{
                            width: '40px',
                            height: '40px',
                            objectFit: 'contain',
                            borderRadius: '8px',
                            background: '#fff',
                            border: '1px solid var(--border)',
                            padding: '2px',
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: '13px',
                          display: amc.logoPath ? 'none' : 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)', lineHeight: 1.25 }}>
                          {amc.amcName}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                          AMFI Registered Fund House
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: 'var(--muted)',
                        background: 'var(--s2, #f5f5f5)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Metrics Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      padding: '10px 12px',
                      background: 'var(--s2, #f9fafb)',
                      borderRadius: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        Official AUM
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)', marginTop: '2px' }}>
                        {fmtAum(amc.totalAumCr)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        Total Schemes
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)', marginTop: '2px' }}>
                        {amc.totalSchemes} Funds
                      </div>
                    </div>
                  </div>

                  {/* Scheme Breakdown Tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                    {amc.equitySchemes > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(27,94,32,0.08)',
                          color: '#1b5e20',
                          fontWeight: '600',
                        }}
                      >
                        {amc.equitySchemes} Equity
                      </span>
                    )}
                    {amc.hybridSchemes > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(2,136,209,0.08)',
                          color: '#0288d1',
                          fontWeight: '600',
                        }}
                      >
                        {amc.hybridSchemes} Hybrid
                      </span>
                    )}
                    {amc.debtSchemes > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(117,117,117,0.08)',
                          color: 'var(--muted)',
                          fontWeight: '600',
                        }}
                      >
                        {amc.debtSchemes} Debt
                      </span>
                    )}
                    {amc.avgRet3y != null && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(239,108,0,0.08)',
                          color: '#ef6c00',
                          fontWeight: '600',
                        }}
                      >
                        3Y Avg: +{amc.avgRet3y}%
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
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border)',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#1b5e20',
                  }}
                >
                  <span>Explore Schemes & Managers</span>
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
          Mutual fund investments are subject to market risks. Read all scheme related documents carefully before investing. Historical performance does not guarantee future results.
        </p>
        <p style={{ margin: 0, fontWeight: '600', color: 'var(--text)' }}>
          Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).
        </p>
      </div>
    </div>
  );
}
