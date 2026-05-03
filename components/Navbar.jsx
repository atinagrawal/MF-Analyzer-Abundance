'use client';

/**
 * components/Navbar.jsx — Shared navigation bar
 *
 * Desktop (>768px): scrollable horizontal nav row, always visible.
 * Mobile (≤768px):  hamburger button opens a slide-down menu panel.
 *                   Logo + hamburger + auth always visible.
 *
 * Key change from v1: "My Portfolio" replaces "CAS Tracker" in nav.
 * CAS Tracker is accessible from the Portfolio page.
 */

import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

// ── Primary nav: core product (always visible on desktop) ──────────────────
const NAV_PRIMARY = [
  { key: 'home',       label: '🏠 Home',          href: 'https://www.getabundance.in', external: true },
  { key: 'calculator', label: '📊 MF Calculator', href: '/' },
  { key: 'portfolio',  label: '💼 My Portfolio',  href: '/portfolio' },
  { key: 'sifs',       label: '🔬 SIF Screener',  href: '/sifs' },
  { key: 'contact',    label: '📞 Contact',        href: 'https://www.getabundance.in/contact-us', external: true },
];

// ── Secondary nav: analytics tools (second row on desktop) ─────────────────
const NAV_TOOLS = [
  { key: 'market-watch', label: '📡 Market Watch',   href: '/market-watch' },
  { key: 'industry',     label: '📈 Industry Pulse',  href: '/industry' },
  { key: 'report',       label: '📋 Report Card',     href: '/report' },
  { key: 'geography',    label: '🗺 Geography',       href: '/geography' },
  { key: 'rolling',      label: '📉 Rolling Returns', href: '/rolling' },
  { key: 'indices',      label: '📊 Index Dashboard', href: '/indices' },
  { key: 'pms-screener', label: '🏆 PMS Screener',   href: '/pms-screener' },
];

// Combined for mobile hamburger menu
const NAV_ITEMS = [...NAV_PRIMARY, ...NAV_TOOLS];

// ── Avatar dropdown ──────────────────────────────────────────────────────────
function UserAvatar({ session, onNavClose }) {
  const [open, setOpen] = useState(false);
  const btnRef  = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (
        dropRef.current && !dropRef.current.contains(e.target) &&
        btnRef.current  && !btnRef.current.contains(e.target)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSignOut = () => {
    const callbackUrl = typeof window !== 'undefined' ? window.location.href : '/';
    signOut({ callbackUrl });
  };

  const user     = session.user;
  const name     = user?.name  || 'User';
  const email    = user?.email || '';
  const image    = user?.image || null;
  const role     = user?.role  || 'client';
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={() => { setOpen(o => !o); }}
        aria-label="Account menu"
        style={{
          width: 32, height: 32,
          borderRadius: '50%',
          border: open ? '2px solid var(--g1)' : '2px solid var(--border)',
          overflow: 'hidden',
          cursor: 'pointer',
          background: 'var(--s2)',
          padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color .15s',
          flexShrink: 0,
        }}
      >
        {image ? (
          <img src={image} alt={name} width={32} height={32}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            referrerPolicy="no-referrer" />
        ) : (
          <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--g1)', fontFamily: "'JetBrains Mono', monospace" }}>
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div ref={dropRef} style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--r)',
          boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          minWidth: 210,
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'fadeUp .2s ease-out',
        }}>
          {/* User info */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {email}
            </div>
            <div style={{
              display: 'inline-block', marginTop: 6,
              fontSize: '.52rem', fontWeight: 800,
              letterSpacing: '.5px', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 4,
              fontFamily: "'JetBrains Mono', monospace",
              background: role === 'admin' ? '#fff3e0' : role === 'distributor' ? '#e8f5e9' : 'var(--s2)',
              color: role === 'admin' ? '#e65100' : role === 'distributor' ? '#1b5e20' : 'var(--muted)',
              border: '1px solid var(--border)',
            }}>
              {role}
            </div>
          </div>

          {/* My Portfolio */}
          <a href="/portfolio" onClick={() => { setOpen(false); onNavClose?.(); }}
            style={{ display: 'block', padding: '10px 14px', fontSize: '.75rem', fontWeight: 600, color: 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            💼 My Portfolio
          </a>

          {/* CAS Tracker */}
          <a href="/cas-tracker" onClick={() => { setOpen(false); onNavClose?.(); }}
            style={{ display: 'block', padding: '10px 14px', fontSize: '.75rem', fontWeight: 600, color: 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            📋 CAS Tracker
          </a>

          {/* Admin panel — admin only */}
          {role === 'admin' && (
            <a href="/admin" onClick={() => { setOpen(false); onNavClose?.(); }}
              style={{ display: 'block', padding: '10px 14px', fontSize: '.75rem', fontWeight: 600, color: 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              ⚙ Admin Panel
            </a>
          )}

          {/* Sign out */}
          <button onClick={handleSignOut}
            style={{ display: 'block', width: '100%', padding: '10px 14px', fontSize: '.75rem', fontWeight: 600, color: 'var(--neg)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .12s', fontFamily: 'Raleway, sans-serif' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--neg-bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Hamburger icon ────────────────────────────────────────────────────────────
function HamburgerIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <style>{`
        .hb-top, .hb-mid, .hb-bot { transition: all .25s cubic-bezier(.4,0,.2,1); transform-origin: center; }
      `}</style>
      <line className="hb-top" x1="3" y1={open ? 10 : 5}  x2="17" y2={open ? 10 : 5}  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        style={{ transform: open ? 'rotate(45deg)' : 'none' }} />
      <line className="hb-mid" x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        style={{ opacity: open ? 0 : 1 }} />
      <line className="hb-bot" x1="3" y1={open ? 10 : 15} x2="17" y2={open ? 10 : 15} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        style={{ transform: open ? 'rotate(-45deg)' : 'none' }} />
    </svg>
  );
}

// ── Main Navbar ──────────────────────────────────────────────────────────────
export default function Navbar({ activePage, variant = 'default' }) {
  const isHome = variant === 'home';
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on route change / resize
  useEffect(() => {
    function onResize() { if (window.innerWidth > 768) setMenuOpen(false); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const navbarStyle = isHome
    ? { borderBottom: 'none', marginBottom: 0, paddingBottom: 16 }
    : {};

  return (
    <>
      <nav className="navbar" style={navbarStyle}>
        {/* ── Logo ── */}
        <a className="logo-wrap" href="https://www.getabundance.in" target="_blank" rel="noopener noreferrer">
          <img className="logo-img" src="/logo-navbar.png"
            alt="Abundance Financial Services® — AMFI Registered Mutual Fund Distributor"
            width={140} height={56} loading="eager" fetchPriority="high"
            onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}
          />
          <div className="logo-icon" aria-hidden="true">A</div>
          <div className="logo-text">
            <div className="brand">Abundance</div>
            <div className="sub">
              Financial Services
              <sup style={{ fontSize: '.55em', letterSpacing: 0, verticalAlign: 'super', opacity: .75 }}>®</sup>
            </div>
            {isHome && (
              <div className="sub" style={{ fontSize: '.52rem', letterSpacing: '1.2px', marginTop: 2, color: 'var(--g3)' }}>
                Serving Investors Across India
              </div>
            )}
          </div>
        </a>

        {/* ── Desktop nav: two rows ── */}
        <div className="nav-desktop nav-two-row">
          {/* Row 1: primary */}
          <div className="nav-row nav-row-primary">
            {NAV_PRIMARY.map(item => {
              const isActive = item.key === activePage;
              const linkProps = item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
              if (isActive) {
                const tagStyle = isHome ? { background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', color: 'var(--g2)' } : {};
                return <div key={item.key} className="nav-tag" style={tagStyle}>{item.label}</div>;
              }
              return <a key={item.key} className="nav-link" href={item.href} {...linkProps}>{item.label}</a>;
            })}
          </div>
          {/* Row 2: tools (smaller, subtle) */}
          <div className="nav-row nav-row-tools">
            {NAV_TOOLS.map(item => {
              const isActive = item.key === activePage;
              if (isActive) {
                return <div key={item.key} className="nav-tag nav-tag-sm">{item.label}</div>;
              }
              return <a key={item.key} className="nav-link nav-link-sm" href={item.href}>{item.label}</a>;
            })}
          </div>
        </div>

        {/* ── Right side: hamburger (mobile) + auth ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 4 }}>
          {/* Hamburger — mobile only */}
          <button
            className={`nav-hamburger${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <HamburgerIcon open={menuOpen} />
          </button>

          {/* Auth */}
          {status === 'authenticated' && session ? (
            <UserAvatar session={session} onNavClose={() => setMenuOpen(false)} />
          ) : status === 'unauthenticated' ? (
            <a href="/login" className="nav-link"
              style={{ color: 'var(--g1)', borderColor: 'var(--g-light)', background: 'var(--g-xlight)', whiteSpace: 'nowrap' }}>
              Sign in
            </a>
          ) : null}
        </div>
      </nav>

      {/* ── Mobile menu panel ── */}
      {/* clicking the backdrop (outer div) closes the menu */}
      <div
        className={`nav-mobile-panel${menuOpen ? ' open' : ''}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
        role="dialog"
        aria-modal="true"
      >
        <div className="nav-mobile-inner" onClick={e => e.stopPropagation()}>
          {NAV_ITEMS.map(item => {
            const isActive = item.key === activePage;
            const linkProps = item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
            return (
              <a key={item.key} href={item.href} {...linkProps}
                onClick={() => setMenuOpen(false)}
                className={`nav-mobile-item${isActive ? ' active' : ''}`}>
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
}
