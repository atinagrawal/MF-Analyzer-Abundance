'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export default function StockHoldersClient({ stock = {}, holdings = [] }) {
  const [holderTypeFilter, setHolderTypeFilter] = useState('ALL'); // 'ALL' | 'MF' | 'PMS'
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFunds, setSelectedFunds] = useState([]); // array of up to 2 scheme codes for compare

  // Count summaries
  const mfHoldings = useMemo(() => holdings.filter((h) => h.holder_type === 'MF'), [holdings]);
  const pmsHoldings = useMemo(() => holdings.filter((h) => h.holder_type === 'PMS'), [holdings]);

  // Aggregate metrics
  const totalValCr = useMemo(
    () => holdings.reduce((sum, h) => sum + (parseFloat(h.market_value_cr) || 0), 0),
    [holdings]
  );
  const avgWeight = useMemo(() => {
    if (!holdings.length) return 0;
    const totalW = holdings.reduce((sum, h) => sum + (parseFloat(h.weight_pct) || 0), 0);
    return (totalW / holdings.length).toFixed(2);
  }, [holdings]);

  const topHolding = useMemo(() => {
    if (!holdings.length) return null;
    return [...holdings].sort((a, b) => (parseFloat(b.weight_pct) || 0) - (parseFloat(a.weight_pct) || 0))[0];
  }, [holdings]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set(holdings.map((h) => h.category).filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }, [holdings]);

  // Category distribution for allocation bar
  const categoryDistribution = useMemo(() => {
    const catMap = {};
    for (const h of holdings) {
      const cat = h.category || (h.holder_type === 'PMS' ? 'PMS' : 'Other');
      catMap[cat] = (catMap[cat] || 0) + 1;
    }
    const total = holdings.length;
    return Object.entries(catMap)
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [holdings]);

  // Filtered rows
  const filteredHoldings = useMemo(() => {
    return holdings.filter((h) => {
      if (holderTypeFilter !== 'ALL' && h.holder_type !== holderTypeFilter) return false;
      if (selectedCategory !== 'ALL' && h.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchScheme = h.scheme_name && h.scheme_name.toLowerCase().includes(q);
        const matchProvider = h.provider_name && h.provider_name.toLowerCase().includes(q);
        const matchCat = h.category && h.category.toLowerCase().includes(q);
        if (!matchScheme && !matchProvider && !matchCat) return false;
      }
      return true;
    });
  }, [holdings, holderTypeFilter, selectedCategory, searchQuery]);

  // Handle fund selection for compare
  const toggleFundSelect = (scheme) => {
    if (scheme.holder_type !== 'MF') return; // Compare tool is MF-focused
    const exists = selectedFunds.find((f) => f.code === scheme.scheme_code);
    if (exists) {
      setSelectedFunds(selectedFunds.filter((f) => f.code !== scheme.scheme_code));
    } else {
      if (selectedFunds.length >= 2) {
        // Replace second fund
        setSelectedFunds([selectedFunds[0], { code: scheme.scheme_code, name: scheme.scheme_name }]);
      } else {
        setSelectedFunds([...selectedFunds, { code: scheme.scheme_code, name: scheme.scheme_name }]);
      }
    }
  };

  const formatCr = (val) => {
    const num = parseFloat(val) || 0;
    if (num <= 0) return '—';
    if (num >= 10000) {
      return `₹${(num / 1000).toFixed(1)}k Cr`;
    }
    return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* ── BREADCRUMBS ── */}
      <nav
        aria-label="Breadcrumbs"
        style={{
          display: 'flex',
          gap: '8px',
          fontSize: '13px',
          color: 'var(--muted)',
          marginBottom: '20px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          Home
        </Link>
        <span>/</span>
        <Link href="/stocks-in-funds" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          Stocks in Funds
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text)', fontWeight: '700' }}>
          {stock.companyName} ({stock.ticker || stock.slug})
        </span>
      </nav>

      {/* ── HEADER BANNER ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(27,94,32,0.07) 0%, rgba(46,125,50,0.02) 100%)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '28px 24px',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: 'clamp(22px, 3.5vw, 32px)',
                  fontWeight: '800',
                  color: 'var(--text)',
                  lineHeight: 1.2,
                }}
              >
                {stock.companyName}
              </h1>
              {stock.ticker && (
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: '800',
                    background: 'var(--g-xlight)',
                    color: 'var(--g1)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {stock.ticker}
                </span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: '8px',
                fontSize: '13px',
                color: 'var(--muted)',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span>Sector: <strong style={{ color: 'var(--text2)' }}>{stock.sector || 'Diversified'}</strong></span>
              {stock.isin && <span>· ISIN: <code style={{ fontFamily: 'JetBrains Mono' }}>{stock.isin}</code></span>}
              <span>· Source: <strong style={{ color: 'var(--text2)' }}>AMFI &amp; PMS Disclosures</strong></span>
            </div>
          </div>

          <Link
            href="/stocks-in-funds"
            style={{
              fontSize: '13px',
              color: 'var(--g2)',
              textDecoration: 'none',
              fontWeight: '600',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            ← Back to All Stocks
          </Link>
        </div>

        {/* ── METRIC STAT CARDS ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '700' }}>
              Institutional Holders
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: '800',
                color: 'var(--g1)',
                margin: '4px 0',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {holdings.length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {mfHoldings.length} Mutual Funds · {pmsHoldings.length} PMS
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '700' }}>
              Total Disclosed Value
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: '800',
                color: 'var(--text)',
                margin: '4px 0',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {totalValCr > 0 ? formatCr(totalValCr) : '—'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Across mutual fund portfolios
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '700' }}>
              Average Portfolio Weight
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: '800',
                color: 'var(--text)',
                margin: '4px 0',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {avgWeight}%
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Mean weight across all holders
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '700' }}>
              Highest Allocation
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: '800',
                color: 'var(--warn)',
                margin: '4px 0',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {topHolding ? `${parseFloat(topHolding.weight_pct).toFixed(2)}%` : '—'}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={topHolding?.scheme_name}
            >
              {topHolding?.scheme_name || '—'}
            </div>
          </div>
        </div>

        {/* ── CATEGORY DISTRIBUTION ALLOCATION BAR ── */}
        {categoryDistribution.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: '700',
                color: 'var(--text2)',
                marginBottom: '8px',
              }}
            >
              <span>Holders Category Distribution</span>
              <span style={{ color: 'var(--muted)' }}>Top categories holding {stock.ticker || 'this stock'}</span>
            </div>

            {/* Segmented bar */}
            <div
              style={{
                display: 'flex',
                height: '14px',
                borderRadius: '7px',
                overflow: 'hidden',
                background: 'var(--s3)',
              }}
            >
              {categoryDistribution.slice(0, 5).map((cat, idx) => {
                const colors = ['#2e7d32', '#43a047', '#66bb6a', '#81c784', '#a5d6a7'];
                return (
                  <div
                    key={cat.name}
                    title={`${cat.name}: ${cat.count} schemes (${cat.pct}%)`}
                    style={{
                      width: `${cat.pct}%`,
                      background: colors[idx % colors.length],
                      minWidth: '4px',
                    }}
                  />
                );
              })}
            </div>

            {/* Category pills legend */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '10px',
                fontSize: '11px',
                color: 'var(--text2)',
              }}
            >
              {categoryDistribution.slice(0, 5).map((cat, idx) => {
                const colors = ['#2e7d32', '#43a047', '#66bb6a', '#81c784', '#a5d6a7'];
                return (
                  <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: colors[idx % colors.length],
                      }}
                    />
                    <span>
                      {cat.name} <strong>({cat.count})</strong>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── HOLDERS TABLE SECTION ── */}
      <div style={{ marginBottom: '40px' }}>
        {/* Table Filters & Selector Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '16px',
          }}
        >
          {/* Filter Pills: [All | Mutual Funds | PMS] */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--s2)',
              borderRadius: '10px',
              padding: '3px',
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => setHolderTypeFilter('ALL')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: holderTypeFilter === 'ALL' ? 'var(--surface)' : 'transparent',
                color: holderTypeFilter === 'ALL' ? 'var(--g1)' : 'var(--muted)',
                fontWeight: holderTypeFilter === 'ALL' ? '700' : '500',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: holderTypeFilter === 'ALL' ? 'var(--shadow)' : 'none',
              }}
            >
              All Holders ({holdings.length})
            </button>
            <button
              type="button"
              onClick={() => setHolderTypeFilter('MF')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: holderTypeFilter === 'MF' ? 'var(--surface)' : 'transparent',
                color: holderTypeFilter === 'MF' ? 'var(--g1)' : 'var(--muted)',
                fontWeight: holderTypeFilter === 'MF' ? '700' : '500',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: holderTypeFilter === 'MF' ? 'var(--shadow)' : 'none',
              }}
            >
              Mutual Funds ({mfHoldings.length})
            </button>
            <button
              type="button"
              onClick={() => setHolderTypeFilter('PMS')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: holderTypeFilter === 'PMS' ? 'var(--surface)' : 'transparent',
                color: holderTypeFilter === 'PMS' ? 'var(--g1)' : 'var(--muted)',
                fontWeight: holderTypeFilter === 'PMS' ? '700' : '500',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: holderTypeFilter === 'PMS' ? 'var(--shadow)' : 'none',
              }}
            >
              PMS Strategies ({pmsHoldings.length})
            </button>
          </div>

          {/* Search within holders & Category Filter */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search scheme or AMC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
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
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── HOLDINGS DATA TABLE ── */}
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '750px' }}>
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
                <th style={{ padding: '12px 14px', width: '40px', textAlign: 'center' }}>
                  <span title="Select funds to compare">⚔️</span>
                </th>
                <th style={{ padding: '12px 16px' }}>Scheme / Strategy Name</th>
                <th style={{ padding: '12px 14px', width: '80px' }}>Type</th>
                <th style={{ padding: '12px 16px' }}>Category</th>
                <th style={{ padding: '12px 16px' }}>Provider / AMC</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', width: '130px' }}>Portfolio Weight</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', width: '130px' }}>Holding Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--muted)' }}>
                    No institutional holders match the current filter selection.
                  </td>
                </tr>
              ) : (
                filteredHoldings.map((h, idx) => {
                  const isSelected = selectedFunds.some((f) => f.code === h.scheme_code);
                  const isMF = h.holder_type === 'MF';
                  const weight = parseFloat(h.weight_pct) || 0;
                  const maxBarWidth = 100;
                  const barWidth = Math.min(Math.round((weight / 10) * maxBarWidth), 100);

                  return (
                    <tr
                      key={`${h.scheme_code}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--s2)',
                        background: isSelected ? 'rgba(46,125,50,0.06)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--s2)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Compare Checkbox (MF only) */}
                      <td style={{ padding: '14px', textAlign: 'center' }}>
                        {isMF ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFundSelect(h)}
                            title="Select to compare portfolio overlap"
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        ) : (
                          <span style={{ color: 'var(--border2)', fontSize: '11px' }}>—</span>
                        )}
                      </td>

                      {/* Scheme Name */}
                      <td style={{ padding: '14px 16px' }}>
                        {isMF ? (
                          <Link
                            href={`/fund/${h.scheme_code}`}
                            style={{
                              fontWeight: '700',
                              fontSize: '14px',
                              color: 'var(--g1)',
                              textDecoration: 'none',
                            }}
                          >
                            {h.scheme_name}
                          </Link>
                        ) : (
                          <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text)' }}>
                            {h.scheme_name}
                          </span>
                        )}
                      </td>

                      {/* Holder Type Badge */}
                      <td style={{ padding: '14px' }}>
                        {isMF ? (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              background: 'var(--s3)',
                              color: 'var(--g1)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            MF
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              background: 'rgba(230,81,0,0.12)',
                              color: '#d84315',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid rgba(230,81,0,0.25)',
                            }}
                          >
                            PMS
                          </span>
                        )}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text2)' }}>
                        {h.category || (isMF ? 'Mutual Fund' : 'PMS Strategy')}
                      </td>

                      {/* Provider */}
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--muted)' }}>
                        {h.provider_name}
                      </td>

                      {/* Portfolio Weight */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span
                            style={{
                              fontWeight: '700',
                              fontSize: '13px',
                              fontFamily: 'JetBrains Mono, monospace',
                              color: 'var(--text)',
                            }}
                          >
                            {weight.toFixed(2)}%
                          </span>
                          <div
                            style={{
                              width: '60px',
                              height: '4px',
                              background: 'var(--s3)',
                              borderRadius: '2px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${barWidth}%`,
                                height: '100%',
                                background: weight >= 7 ? 'var(--warn)' : 'var(--g2)',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Market Value (₹ Cr) */}
                      <td
                        style={{
                          padding: '14px 16px',
                          textAlign: 'right',
                          fontWeight: '700',
                          fontSize: '13px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: 'var(--text2)',
                        }}
                      >
                        {formatCr(h.market_value_cr)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── STICKY COMPARE CTA BAR ── */}
      {selectedFunds.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '2px solid var(--g2)',
            borderRadius: '16px',
            padding: '14px 24px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 100,
            maxWidth: '90%',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text)' }}>
            {selectedFunds.length === 1 ? (
              <span>
                1 fund selected (<strong>{selectedFunds[0].name.slice(0, 30)}...</strong>). Select 1 more to compare.
              </span>
            ) : (
              <span>
                Compare <strong>{selectedFunds[0].name.slice(0, 25)}...</strong> vs{' '}
                <strong>{selectedFunds[1].name.slice(0, 25)}...</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {selectedFunds.length === 2 ? (
              <Link
                href={`/compare/${selectedFunds[0].code}-vs-${selectedFunds[1].code}`}
                style={{
                  background: 'var(--g1)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '700',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                }}
              >
                Compare Overlap ↗
              </Link>
            ) : (
              <span
                style={{
                  background: 'var(--s3)',
                  color: 'var(--muted)',
                  fontSize: '13px',
                  fontWeight: '600',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'not-allowed',
                }}
              >
                Select 1 more
              </span>
            )}
            <button
              type="button"
              onClick={() => setSelectedFunds([])}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '13px',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '0 6px',
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

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
          <strong>Institutional Holding Data Source:</strong> Compiled from publicly disclosed monthly mutual fund
          portfolio statements and PMS factsheets in accordance with SEBI disclosure guidelines. For informational and
          analytical purposes only; does not constitute investment advice, equity research, or a recommendation to buy,
          sell, or hold any security.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Abundance Financial Services</strong> (ARN-251838, AMFI Registered Mutual Fund Distributor) ·{' '}
          <strong>Atin Kumar Agrawal</strong> (APRN04279, APMI Registered PMS Distributor). Mutual Fund investments are
          subject to market risks, read all scheme related documents carefully.
        </p>
      </div>
    </div>
  );
}
