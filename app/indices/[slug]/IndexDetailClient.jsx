'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { isPaidUser } from '@/lib/permissions';

export default function IndexDetailClient({ detail }) {
  const { data: session } = useSession();
  const isPro = isPaidUser(session);

  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [toastMessage, setToastMessage] = useState(null);

  const constituents = detail?.constituents || [];
  const pe = detail?.val?.pe ?? null;
  const valuationStatus = detail?.valuationStatus;

  // Extract unique sectors with constituent counts
  const sectorList = useMemo(() => {
    const counts = {};
    for (const c of constituents) {
      const s = c.industry || 'Other';
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [constituents]);

  // Filter constituents by search and sector
  const filteredConstituents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return constituents.filter((c) => {
      const matchesSector = selectedSector === 'ALL' || (c.industry || 'Other') === selectedSector;
      if (!matchesSector) return false;
      if (!q) return true;
      return (
        (c.symbol && c.symbol.toLowerCase().includes(q)) ||
        (c.companyName && c.companyName.toLowerCase().includes(q)) ||
        (c.industry && c.industry.toLowerCase().includes(q)) ||
        (c.isin && c.isin.toLowerCase().includes(q))
      );
    });
  }, [constituents, search, selectedSector]);

  function showToast(msg) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }

  function handleExportCsv() {
    if (!isPro) {
      showToast('Export CSV is an Abundance Pro feature — upgrade at /pricing');
      return;
    }

    const headers = ['#', 'Symbol', 'Company Name', 'Industry', 'Series', 'ISIN Code'];
    const rows = filteredConstituents.map((c, i) => [
      i + 1,
      `"${c.symbol || ''}"`,
      `"${(c.companyName || '').replace(/"/g, '""')}"`,
      `"${(c.industry || '').replace(/"/g, '""')}"`,
      `"${c.series || 'EQ'}"`,
      `"${c.isin || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${detail.slug}-constituents.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: 'var(--text)',
            color: 'var(--bg)',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            fontSize: '.88rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span>🔒 {toastMessage}</span>
          <Link
            href="/pricing"
            style={{
              color: '#81c784',
              textDecoration: 'underline',
              fontWeight: 800,
            }}
          >
            Upgrade ➔
          </Link>
        </div>
      )}

      {/* Valuation Gauge Bar (if P/E available) */}
      {pe && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '18px 20px',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--text)' }}>
              🌡 Valuation Meter: {detail.name}
            </div>
            {valuationStatus && (
              <span
                style={{
                  fontSize: '.75rem',
                  fontWeight: 800,
                  color: valuationStatus.color,
                  background: 'var(--s2)',
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                {valuationStatus.label} ({pe.toFixed(2)}x P/E)
              </span>
            )}
          </div>

          {/* Visual Band Bar */}
          <div style={{ position: 'relative', height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex', background: 'var(--s3)' }}>
            <div style={{ flex: '0 0 45%', background: '#43a047' }} title="Undervalued (<18x)" />
            <div style={{ flex: '0 0 25%', background: '#fb8c00' }} title="Fair Value (18-24x)" />
            <div style={{ flex: '0 0 30%', background: '#e53935' }} title="Expensive (>24x)" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--muted)', marginTop: 6 }}>
            <span>&lt; 18x (Undervalued)</span>
            <span>18x – 24x (Fair Value)</span>
            <span>&gt; 24x (Expensive)</span>
          </div>
        </div>
      )}

      {/* Controls Bar: Search & Pro Export */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 450 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${constituents.length} stocks by symbol, name, or industry...`}
            aria-label="Filter constituents"
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              fontSize: '.85rem',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              fontSize: '.85rem',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
            Showing <strong>{filteredConstituents.length}</strong> of {constituents.length} stocks
          </span>

          <button
            onClick={handleExportCsv}
            title={isPro ? 'Export filtered constituents as CSV' : 'Export CSV is a Pro feature'}
            aria-label="Export CSV"
            style={{
              padding: '7px 14px',
              fontSize: '.82rem',
              fontWeight: 700,
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              background: isPro ? 'var(--g1)' : 'var(--s2)',
              color: isPro ? '#fff' : 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⤓ Export CSV</span>
            {!isPro && <span style={{ fontSize: '.75rem' }}>🔒</span>}
          </button>
        </div>
      </div>

      {/* Sector Filter Chips */}
      {sectorList.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 10,
            marginBottom: 16,
            scrollbarWidth: 'thin',
          }}
        >
          <button
            onClick={() => setSelectedSector('ALL')}
            style={{
              padding: '5px 12px',
              fontSize: '.76rem',
              fontWeight: selectedSector === 'ALL' ? 800 : 600,
              borderRadius: 20,
              border: selectedSector === 'ALL' ? '1.5px solid var(--g1)' : '1px solid var(--border)',
              background: selectedSector === 'ALL' ? 'var(--g-light)' : 'var(--surface)',
              color: selectedSector === 'ALL' ? 'var(--g1)' : 'var(--muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            All Sectors ({constituents.length})
          </button>

          {sectorList.map((sec) => {
            const isSelected = selectedSector === sec.name;
            return (
              <button
                key={sec.name}
                onClick={() => setSelectedSector(isSelected ? 'ALL' : sec.name)}
                style={{
                  padding: '5px 12px',
                  fontSize: '.76rem',
                  fontWeight: isSelected ? 800 : 600,
                  borderRadius: 20,
                  border: isSelected ? '1.5px solid var(--g1)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--g-light)' : 'var(--surface)',
                  color: isSelected ? 'var(--g1)' : 'var(--muted)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {sec.name} ({sec.count})
              </button>
            );
          })}
        </div>
      )}

      {/* Constituents Table */}
      <div
        id="constituents"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          background: 'var(--surface)',
          overflowX: 'auto',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '.82rem',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
              <th style={{ padding: '10px 12px', width: 44 }}>#</th>
              <th style={{ padding: '10px 12px', minWidth: 100 }}>Symbol</th>
              <th style={{ padding: '10px 12px', minWidth: 220 }}>Company Name</th>
              <th style={{ padding: '10px 12px', minWidth: 160 }}>Industry / Sector</th>
              <th style={{ padding: '10px 12px', width: 65 }}>Series</th>
              <th style={{ padding: '10px 12px', minWidth: 125 }}>ISIN Code</th>
              <th style={{ padding: '10px 12px', minWidth: 180, textAlign: 'right' }}>Institutional Holdings</th>
            </tr>
          </thead>
          <tbody>
            {filteredConstituents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 36, textAlign: 'center', color: 'var(--muted)' }}>
                  No constituent stocks found matching &quot;{search}&quot;.
                </td>
              </tr>
            ) : (
              filteredConstituents.map((stock, idx) => {
                const stockParam = encodeURIComponent((stock.symbol || '').toLowerCase());
                const targetUrl = `/stocks-in-funds/${stockParam}`;

                return (
                  <tr
                    key={stock.symbol + '_' + idx}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--s2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '.76rem' }}>
                      {idx + 1}
                    </td>

                    <td style={{ padding: '10px 12px', fontWeight: 800 }}>
                      <Link
                        href={targetUrl}
                        style={{ color: 'var(--g1)', textDecoration: 'none' }}
                        title={`View mutual funds holding ${stock.symbol}`}
                      >
                        {stock.symbol}
                      </Link>
                    </td>

                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>
                      {stock.companyName}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          background: 'var(--s2)',
                          color: 'var(--text2)',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: '.74rem',
                          display: 'inline-block',
                        }}
                      >
                        {stock.industry || 'Other'}
                      </span>
                    </td>

                    <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '.75rem' }}>
                      {stock.series || 'EQ'}
                    </td>

                    <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '.76rem', fontFamily: 'monospace' }}>
                      {stock.isin || '—'}
                    </td>

                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <Link
                        href={targetUrl}
                        style={{
                          fontSize: '.75rem',
                          fontWeight: 700,
                          color: 'var(--g1)',
                          background: 'var(--g-light)',
                          padding: '4px 10px',
                          borderRadius: 4,
                          textDecoration: 'none',
                          display: 'inline-block',
                          border: '1px solid var(--border)',
                        }}
                        title={`Check which mutual funds hold ${stock.symbol}`}
                      >
                        View Fund Holdings ➔
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pro Teaser: Multi-Index Overlap Analyser */}
      <div
        style={{
          marginTop: 28,
          background: 'linear-gradient(135deg, rgba(27,94,32,0.06) 0%, rgba(46,125,50,0.02) 100%)',
          border: '1.5px dashed var(--border)',
          borderRadius: 'var(--r)',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: '.72rem', fontWeight: 800, background: 'var(--g1)', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>
              PRO FEATURE
            </span>
            <span style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text)' }}>
              ⚡ Multi-Index Overlap Analyser
            </span>
          </div>
          <p style={{ fontSize: '.84rem', color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
            Compare portfolio overlap, common stock weightings, and sector concentration between <strong>{detail.name}</strong> and any of the other 63 benchmarks (e.g. Nifty 50, Nifty 500, or BSE SENSEX).
          </p>
        </div>

        <Link
          href="/pricing"
          style={{
            background: 'var(--g1)',
            color: '#fff',
            padding: '9px 18px',
            borderRadius: 'var(--r)',
            fontSize: '.84rem',
            fontWeight: 800,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          Unlock Overlap Analyser ➔
        </Link>
      </div>
    </div>
  );
}
