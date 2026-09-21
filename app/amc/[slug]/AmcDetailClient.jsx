'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export default function AmcDetailClient({
  amcName,
  amcSlug,
  logoPath,
  totalAumCr,
  schemesCount,
  schemes = [],
  info = {},
  managers = [],
}) {
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [schemeSearch, setSchemeSearch] = useState('');
  const [sortBy, setSortBy] = useState('aum'); // 'aum' | 'ret3y' | 'ret1y' | 'nav' | 'name'
  const [selectedSchemes, setSelectedSchemes] = useState(new Set());

  const categories = useMemo(() => {
    const set = new Set(schemes.map((s) => s.category).filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }, [schemes]);

  const filteredSchemes = useMemo(() => {
    let list = [...schemes];

    if (categoryFilter !== 'ALL') {
      list = list.filter((s) => s.category === categoryFilter);
    }

    if (schemeSearch.trim()) {
      const q = schemeSearch.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.category && s.category.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'ret3y') return (b.ret3y || -999) - (a.ret3y || -999);
      if (sortBy === 'ret1y') return (b.ret1y || -999) - (a.ret1y || -999);
      if (sortBy === 'nav') return (b.nav || 0) - (a.nav || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return (b.aumCr || 0) - (a.aumCr || 0);
    });

    return list;
  }, [schemes, categoryFilter, schemeSearch, sortBy]);

  const fmtAum = (val) => {
    const num = parseFloat(val) || 0;
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lakh Cr`;
    }
    if (num >= 1000) {
      return `₹${(num / 1000).toFixed(1)}k Cr`;
    }
    if (num > 0) {
      return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
    }
    return '—';
  };

  const fmtPct = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '—';
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  };

  const toggleSelect = (code) => {
    const next = new Set(selectedSchemes);
    if (next.has(code)) {
      next.delete(code);
    } else {
      if (next.size < 5) next.add(code);
    }
    setSelectedSchemes(next);
  };

  const compareUrl = useMemo(() => {
    if (selectedSchemes.size < 2) return null;
    const codes = Array.from(selectedSchemes).join('-vs-');
    return `/compare/${codes}`;
  }, [selectedSchemes]);

  const initials = amcName
    .split(' ')
    .filter((w) => !['mutual', 'fund', 'asset', 'management'].includes(w.toLowerCase()))
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
        <Link href="/amc" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Mutual Fund AMCs</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: 'var(--text)', fontWeight: '600' }}>{amcName}</span>
      </nav>

      {/* ── HERO PROFILE CARD ── */}
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
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {logoPath ? (
              <img
                src={logoPath}
                alt={amcName}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1
                  style={{
                    fontSize: 'clamp(22px, 3.5vw, 28px)',
                    fontWeight: '800',
                    color: 'var(--text)',
                    margin: 0,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {amcName}
                </h1>
                {info.rank && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: '#1b5e20',
                      background: 'rgba(27,94,32,0.1)',
                      padding: '3px 10px',
                      borderRadius: '999px',
                    }}
                  >
                    Rank #{info.rank}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                {info.legalName && info.legalName !== amcName ? `${info.legalName} · ` : ''}
                AMFI Registered Mutual Fund
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link
              href={`/amc/${amcSlug}?format=md`}
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

        {/* Highlight Metrics Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            padding: '16px',
            background: 'var(--s2, #f9fafb)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Official Total AUM
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text)', marginTop: '2px' }}>
              {fmtAum(totalAumCr)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              AMFI Disclosed
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Schemes Managed
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text)', marginTop: '2px' }}>
              {schemesCount}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Active Portfolios
            </div>
          </div>

          {info.launchDate && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Inception Date
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginTop: '4px' }}>
                {info.launchDate.split('T')[0]}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Founding Year
              </div>
            </div>
          )}

          {managers.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Key Managers
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text)', marginTop: '2px' }}>
                {managers.length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Tracked Professionals
              </div>
            </div>
          )}
        </div>

        {/* Contact Information Row */}
        {(info.address || info.phone || info.website) && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              fontSize: '13px',
              color: 'var(--text)',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)',
            }}
          >
            {info.address && (
              <div style={{ flex: '1 1 300px' }}>
                <span style={{ color: 'var(--muted)', fontWeight: '600' }}>📍 Office: </span>
                {info.address}
              </div>
            )}
            {info.phone && (
              <div>
                <span style={{ color: 'var(--muted)', fontWeight: '600' }}>📞 Phone: </span>
                {info.phone}
              </div>
            )}
            {info.website && (
              <div>
                <span style={{ color: 'var(--muted)', fontWeight: '600' }}>🌐 Website: </span>
                <a
                  href={info.website.startsWith('http') ? info.website : `https://${info.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#1b5e20', textDecoration: 'underline' }}
                >
                  {info.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── KEY FUND MANAGERS SECTION ── */}
      {managers.length > 0 && (
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
            Key People & Fund Managers ({managers.length})
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '14px',
            }}
          >
            {managers.map((m) => (
              <div
                key={m.name}
                style={{
                  background: 'var(--s1, #fff)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>
                  {m.name}
                </div>
                {m.education && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                    🎓 {m.education}
                  </div>
                )}
                {m.experience && (
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.4, marginBottom: '10px' }}>
                    {m.experience}
                  </div>
                )}
                {Array.isArray(m.fundsManaged) && m.fundsManaged.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Key Schemes Managed ({m.fundsManaged.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {m.fundsManaged.slice(0, 4).map((f) => (
                        <Link
                          key={f.schemeCode}
                          href={`/fund/${f.schemeCode}`}
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--s2, #f0f0f0)',
                            color: 'var(--text)',
                            textDecoration: 'none',
                          }}
                        >
                          {f.schemeName}
                        </Link>
                      ))}
                      {m.fundsManaged.length > 4 && (
                        <span style={{ fontSize: '11px', color: 'var(--muted)', padding: '2px 4px' }}>
                          +{m.fundsManaged.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SCHEMES DIRECTORY TABLE ── */}
      <div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '800',
              color: 'var(--text)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            All Mutual Fund Schemes ({filteredSchemes.length})
          </h2>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search schemes..."
              value={schemeSearch}
              onChange={(e) => setSchemeSearch(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '13px',
                background: 'var(--s1, #fff)',
                color: 'var(--text)',
                outline: 'none',
              }}
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '13px',
                background: 'var(--s1, #fff)',
                color: 'var(--text)',
                outline: 'none',
              }}
            >
              <option value="aum">Sort by AUM</option>
              <option value="ret3y">Sort by 3Y Return</option>
              <option value="ret1y">Sort by 1Y Return</option>
              <option value="nav">Sort by NAV</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                border: categoryFilter === cat ? '1px solid #1b5e20' : '1px solid var(--border)',
                background: categoryFilter === cat ? 'rgba(27,94,32,0.1)' : 'var(--s1, #fff)',
                color: categoryFilter === cat ? '#1b5e20' : 'var(--text)',
              }}
            >
              {cat === 'ALL' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {/* Schemes Table */}
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
                <th style={{ padding: '12px', width: '32px' }}></th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)' }}>Scheme Name</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)' }}>Category</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)', textAlign: 'right' }}>AUM</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)', textAlign: 'right' }}>NAV</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)', textAlign: 'right' }}>1Y Ret</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)', textAlign: 'right' }}>3Y Ret</th>
                <th style={{ padding: '12px', fontWeight: '700', color: 'var(--text)', textAlign: 'right' }}>5Y Ret</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchemes.map((s) => {
                const isSelected = selectedSchemes.has(s.code);
                return (
                  <tr
                    key={s.code}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'rgba(27,94,32,0.04)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(s.code)}
                        title="Select to compare"
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Link
                        href={`/fund/${s.code}`}
                        style={{
                          color: '#1b5e20',
                          fontWeight: '600',
                          textDecoration: 'none',
                        }}
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--muted)' }}>
                      {s.category || '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: 'var(--text)' }}>
                      {fmtAum(s.aumCr)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text)' }}>
                      {s.nav ? `₹${s.nav.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: s.ret1y > 0 ? '#1b5e20' : 'var(--text)' }}>
                      {fmtPct(s.ret1y)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: s.ret3y > 0 ? '#1b5e20' : 'var(--text)' }}>
                      {fmtPct(s.ret3y)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: s.ret5y > 0 ? '#1b5e20' : 'var(--text)' }}>
                      {fmtPct(s.ret5y)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FLOATING COMPARE BAR (WHEN 2+ SCHEMES SELECTED) ── */}
      {selectedSchemes.size >= 2 && compareUrl && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1b5e20',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: '999px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 100,
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: '600' }}>
            {selectedSchemes.size} Funds Selected
          </span>
          <Link
            href={compareUrl}
            style={{
              background: '#fff',
              color: '#1b5e20',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: '700',
              textDecoration: 'none',
            }}
          >
            Compare Now →
          </Link>
          <button
            onClick={() => setSelectedSchemes(new Set())}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
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
          Mutual fund investments are subject to market risks. Read all scheme related documents carefully before investing. Past performance is not indicative of future returns.
        </p>
        <p style={{ margin: 0, fontWeight: '600', color: 'var(--text)' }}>
          Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).
        </p>
      </div>
    </div>
  );
}
