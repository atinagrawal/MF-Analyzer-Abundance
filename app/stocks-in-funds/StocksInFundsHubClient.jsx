'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function StocksInFundsHubClient({ initialTopStocks = [], stats = {} }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef(null);

  // Table filters & sorting
  const [tableFilter, setTableFilter] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [sortBy, setSortBy] = useState('holders'); // 'holders' | 'value' | 'weight'

  // Extract unique sectors from initialTopStocks
  const sectors = ['ALL', ...new Set(initialTopStocks.map((s) => s.sector).filter(Boolean))].sort();

  // Autocomplete debounced lookup
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 1) {
      setSearchResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setIsOpen(true);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter and sort leaderboard stocks
  const filteredStocks = initialTopStocks.filter((s) => {
    const matchesSector = selectedSector === 'ALL' || s.sector === selectedSector;
    const term = tableFilter.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (s.ticker && s.ticker.toLowerCase().includes(term)) ||
      (s.company_name && s.company_name.toLowerCase().includes(term)) ||
      (s.sector && s.sector.toLowerCase().includes(term));
    return matchesSector && matchesSearch;
  });

  filteredStocks.sort((a, b) => {
    if (sortBy === 'value') {
      return (parseFloat(b.total_val_cr) || 0) - (parseFloat(a.total_val_cr) || 0);
    }
    if (sortBy === 'weight') {
      return (parseFloat(b.avg_weight_pct) || 0) - (parseFloat(a.avg_weight_pct) || 0);
    }
    return (parseInt(b.total_holders, 10) || 0) - (parseInt(a.total_holders, 10) || 0);
  });

  const formatCr = (val) => {
    const num = parseFloat(val) || 0;
    if (num >= 10000) {
      return `₹${(num / 1000).toFixed(1)}k Cr`;
    }
    return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* ── HERO & SEARCH SECTION ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(27,94,32,0.08) 0%, rgba(46,125,50,0.03) 100%)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '36px 24px',
          textAlign: 'center',
          marginBottom: '32px',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontSize: '12px',
            fontWeight: '700',
            color: 'var(--g1)',
            background: 'var(--g-xlight)',
            padding: '4px 12px',
            borderRadius: '20px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: '12px',
            border: '1px solid var(--border)',
          }}
        >
          Reverse Holdings Engine · SEBI Disclosures
        </span>
        <h1
          style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: '800',
            color: 'var(--text)',
            marginBottom: '12px',
            lineHeight: 1.2,
          }}
        >
          Who Owns This Stock?
        </h1>
        <p
          style={{
            fontSize: '16px',
            color: 'var(--text2)',
            maxWidth: '650px',
            margin: '0 auto 28px',
            lineHeight: 1.5,
          }}
        >
          Search any listed Indian stock to discover which mutual funds and PMS strategies hold it,
          complete with portfolio weights, aggregate holdings value, and comparison tools.
        </p>

        {/* ── AUTOCOMPLETE SEARCH BOX ── */}
        <div ref={searchRef} style={{ position: 'relative', maxWidth: '600px', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '2px solid var(--border2)',
              boxShadow: '0 4px 20px rgba(46,125,50,0.12)',
              padding: '6px 14px',
            }}
          >
            <span style={{ fontSize: '20px', marginRight: '10px', color: 'var(--muted)' }}>🔍</span>
            <input
              type="text"
              placeholder="Search by stock name or NSE ticker (e.g. HDFC Bank, Zomato, Reliance)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setIsOpen(true);
              }}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '16px',
                color: 'var(--text)',
                padding: '8px 0',
                fontFamily: 'inherit',
              }}
            />
            {isSearching && (
              <span style={{ fontSize: '13px', color: 'var(--muted)', marginLeft: '8px' }}>
                Searching...
              </span>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: 'var(--surface)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 50,
                overflow: 'hidden',
                textAlign: 'left',
              }}
            >
              {searchResults.map((item, idx) => {
                const targetTicker = item.ticker || item.stock_slug;
                return (
                  <Link
                    key={idx}
                    href={`/stocks-in-funds/${targetTicker}`}
                    onClick={() => setIsOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderBottom:
                        idx === searchResults.length - 1 ? 'none' : '1px solid var(--s2)',
                      transition: 'background 0.15s ease',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--s2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontWeight: '700',
                            fontSize: '15px',
                            color: 'var(--text)',
                          }}
                        >
                          {item.company_name}
                        </span>
                        {item.ticker && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              background: 'var(--s3)',
                              color: 'var(--g1)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            {item.ticker}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                        {item.sector || 'Diversified'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: '700',
                          color: 'var(--g1)',
                        }}
                      >
                        {item.holder_count} funds
                      </span>
                      {parseFloat(item.total_val_cr) > 0 && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--muted)',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        >
                          {formatCr(item.total_val_cr)}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Stats Pill Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            marginTop: '28px',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          >
            <span style={{ color: 'var(--muted)' }}>Indexed Securities: </span>
            <strong style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
              {stats.uniqueStocks?.toLocaleString('en-IN') || '1,900+'}
            </strong>
          </div>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          >
            <span style={{ color: 'var(--muted)' }}>Total Holdings Disclosed: </span>
            <strong style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
              {stats.totalHoldings?.toLocaleString('en-IN') || '11,500+'}
            </strong>
          </div>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          >
            <span style={{ color: 'var(--muted)' }}>Total Institutional Value: </span>
            <strong style={{ color: 'var(--g1)', fontFamily: 'JetBrains Mono, monospace' }}>
              {stats.totalValueCr ? `₹${(stats.totalValueCr / 100000).toFixed(1)} Lakh Cr` : '₹10+ Lakh Cr'}
            </strong>
          </div>
        </div>
      </div>

      {/* ── LEADERBOARD SECTION ── */}
      <div style={{ marginBottom: '40px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text)' }}>
              Top 50 Most Widely Held Stocks
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '2px' }}>
              Ranked by institutional mutual fund &amp; PMS strategy penetration.
            </p>
          </div>

          {/* Filter & Sort Controls */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Filter leaderboard..."
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: '13px',
                color: 'var(--text)',
                outline: 'none',
              }}
            />

            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: '13px',
                color: 'var(--text)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? 'All Sectors' : sec}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: '13px',
                color: 'var(--text)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="holders">Sort by Holders</option>
              <option value="value">Sort by Value (₹ Cr)</option>
              <option value="weight">Sort by Avg Weight</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
            <thead>
              <tr
                style={{
                  background: 'var(--s2)',
                  borderBottom: '2px solid var(--border)',
                  fontSize: '12px',
                  fontWeight: '700',
                  color: 'var(--text2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '12px 16px', width: '50px' }}>#</th>
                <th style={{ padding: '12px 16px' }}>Stock / Company</th>
                <th style={{ padding: '12px 16px' }}>Sector</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Institutional Holders</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Value</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Avg Weight</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                    No stocks match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((s, idx) => {
                  const targetTicker = s.ticker || s.stock_slug;
                  return (
                    <tr
                      key={s.symbol || s.stock_slug}
                      style={{
                        borderBottom: '1px solid var(--s2)',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--s2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <Link
                          href={`/stocks-in-funds/${targetTicker}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--text)' }}>
                              {s.company_name}
                            </strong>
                            {s.ticker && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  background: 'var(--s3)',
                                  color: 'var(--g1)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontFamily: 'JetBrains Mono, monospace',
                                }}
                              >
                                {s.ticker}
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text2)' }}>
                        <span
                          style={{
                            background: 'var(--s2)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                          }}
                        >
                          {s.sector || 'Diversified'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontWeight: '700',
                              fontSize: '14px',
                              color: 'var(--g1)',
                              fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            {s.total_holders}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            ({s.mf_count} MF{parseInt(s.pms_count, 10) > 0 ? ` + ${s.pms_count} PMS` : ''})
                          </span>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: '14px 16px',
                          textAlign: 'right',
                          fontWeight: '700',
                          fontSize: '13px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: 'var(--text)',
                        }}
                      >
                        {parseFloat(s.total_val_cr) > 0 ? formatCr(s.total_val_cr) : '—'}
                      </td>
                      <td
                        style={{
                          padding: '14px 16px',
                          textAlign: 'right',
                          fontSize: '13px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: 'var(--text2)',
                        }}
                      >
                        {parseFloat(s.avg_weight_pct) > 0 ? `${parseFloat(s.avg_weight_pct).toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <Link
                          href={`/stocks-in-funds/${targetTicker}`}
                          style={{
                            display: 'inline-block',
                            background: 'var(--g2)',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: '600',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            transition: 'opacity 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                        >
                          View Holders →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── REGULATORY ATTRIBUTION & DISCLAIMER FOOTER ── */}
      <div
        style={{
          marginTop: '40px',
          padding: '20px',
          background: 'var(--surface)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          fontSize: '12px',
          color: 'var(--muted)',
          lineHeight: '1.6',
        }}
      >
        <p style={{ marginBottom: '8px' }}>
          <strong>Regulatory Notice &amp; Factual Holdings Disclosure:</strong> Holding data compiled
          from publicly disclosed monthly mutual fund portfolios and PMS factsheets mandated by SEBI.
          This tool is provided for educational and informational research purposes only. It does not
          constitute investment advice, equity research, financial analysis, or a recommendation to buy,
          sell, or hold any security.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Abundance Financial Services</strong> (ARN-251838, AMFI Registered Mutual Fund
          Distributor) · <strong>Atin Kumar Agrawal</strong> (APRN04279, APMI Registered PMS
          Distributor). Mutual Fund investments are subject to market risks, read all scheme related
          documents carefully.
        </p>
      </div>
    </div>
  );
}
