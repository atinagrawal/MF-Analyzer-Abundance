'use client';

/**
 * components/Navbar.jsx — Shared navigation bar
 *
 * Desktop (≥1101px): single-row nav — direct links + grouped mega-menu
 *                     dropdowns (Screeners / Market Data / Tools) + a
 *                     Ctrl/Cmd+K command palette for every destination.
 * Mobile (≤1100px):  hamburger button opens a slide-down menu panel,
 *                     fed by the same flat destination list.
 *                     Logo + hamburger + auth always visible.
 *
 * Key change from v1: "My Portfolio" replaces "CAS Tracker" in nav.
 * CAS Tracker is accessible from the Portfolio page.
 */

import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

// ── Direct links: shown flat on the desktop nav row ─────────────────────────
const NAV_DIRECT = [
  { key: 'home',       label: '🏠 Home',          href: 'https://www.getabundance.in', external: true },
  { key: 'calculator', label: '📊 MF Calculator', href: '/' },
  { key: 'portfolio',  label: '💼 My Portfolio',  href: '/portfolio' },
];

// ── Grouped links: shown as mega-menu dropdowns on desktop ──────────────────
const NAV_GROUPS = [
  {
    key: 'screeners', label: 'Screeners',
    items: [
      { key: 'screener',     label: '🔎 MF Screener',  href: '/screener',     desc: 'Filter and rank mutual funds' },
      { key: 'sifs',         label: '🔬 SIF Screener', href: '/sifs',         desc: 'Specialised Investment Funds' },
      { key: 'pms-screener', label: '🏆 PMS Screener', href: '/pms-screener', desc: 'Portfolio Management Services' },
    ],
  },
  {
    key: 'market', label: 'Market Data',
    items: [
      { key: 'pioneers',     label: '🏛️ 30-Year Club',   href: '/pioneers',       desc: "India's oldest funds & 30-year wealth pioneers" },
      { key: 'market-watch', label: '📡 Market Watch',    href: '/market-watch',   desc: 'Live indices and sector moves' },
      { key: 'breadth',      label: '📊 Market Breadth',  href: '/market-breadth', desc: 'Advance/decline and highs-lows' },
      { key: 'indices',      label: '📊 Index Dashboard', href: '/indices',        desc: 'Nifty and benchmark indices' },
      { key: 'industry',     label: '📈 Industry Pulse',  href: '/industry',       desc: 'Sector-wise fund flows' },
      { key: 'report',       label: '📋 Report Card',     href: '/report',         desc: 'Shareable monthly AUM report card' },
      { key: 'geography',    label: '🗺 Geography',       href: '/geography',      desc: 'State-wise AUM distribution' },
    ],
  },
  {
    key: 'tools', label: 'Tools',
    items: [
      { key: 'widgets',          label: '🪟 Desktop Widgets',  href: '/widgets',          desc: 'Live Windows desktop companion' },
      { key: 'rolling',          label: '📉 Rolling Returns',  href: '/rolling',          desc: 'Consistency across time windows' },
      { key: 'backtest',         label: '🧪 Backtester',       href: '/backtest',         desc: 'Simulate historical SIP/lumpsum' },
      { key: 'proposal-studio',  label: '🧩 Proposal Studio',  href: '/proposal-studio',  desc: 'Build client-ready proposals' },
      { key: 'contact',          label: '📞 Contact',          href: 'https://www.getabundance.in/contact-us', external: true, desc: 'Reach Abundance Financial Services' },
    ],
  },
];

// Flat list of every destination — feeds the mobile hamburger panel and the command palette
const NAV_ITEMS = [...NAV_DIRECT, ...NAV_GROUPS.flatMap(g => g.items)];

/* ──────────────────────────────────────────────────────────────────────────
 * Desktop-only (≥1101px) design polish for the single-row nav + mega-menus.
 * Top-level trigger pills reuse .nav-link/.nav-tag on purpose — those
 * classes already carry the dark-hero overrides (.pf-hero/.sif-hero/
 * .mw-hero) so this file never has to duplicate that theming. Overlay
 * surfaces (mega-menu panel, command palette) are self-contained light
 * cards, matching the existing account-menu dropdown's precedent.
 * Mobile (≤1100px, the hamburger) is untouched.
 * ──────────────────────────────────────────────────────────────────────── */
const DESKTOP_NAV_CSS = `
@media (min-width:1101px){
  .navbar{ gap:20px; }

  .navbar .nav-row{ gap:5px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

  .navbar .nav-row .nav-link{
    font-size:.7rem; font-weight:700; padding:6px 11px;
    border-radius:9px; line-height:1.1; letter-spacing:0; white-space:nowrap;
  }
  .navbar .nav-row .nav-tag{
    font-size:.7rem !important; font-weight:800; padding:6px 11px !important;
    border-radius:9px; line-height:1.1; text-transform:none !important;
    letter-spacing:0 !important; white-space:nowrap;
  }

  .navbar .nav-row .nav-link,
  .navbar .nav-row .nav-group-trigger{ transition:transform .14s ease, color .14s ease, background .14s ease, border-color .14s ease; }
  .navbar .nav-row .nav-link:hover{ transform:translateY(-1px); }

  /* ── Mega-menu group trigger ── */
  .nav-group{ position:relative; }
  .nav-group-trigger{ display:inline-flex; align-items:center; gap:5px; cursor:pointer; font-family:inherit; }
  .nav-group-trigger.active{ position:relative; }
  .nav-group-trigger.active::after{
    content:''; position:absolute; left:11px; right:11px; bottom:3px;
    height:2px; border-radius:2px; background:currentColor; opacity:.55;
  }
  .nav-caret{ transition:transform .18s ease; opacity:.7; flex-shrink:0; }
  .nav-group-trigger[aria-expanded="true"] .nav-caret{ transform:rotate(180deg); }

  /* Panel sits below the trigger; padding-top bridges the visual gap so
     the pointer never leaves a hoverable box while crossing it. */
  .nav-mega{
    position:absolute; top:100%; right:0;
    padding-top:10px; z-index:10000;
    animation:navMegaIn .16s ease-out both;
  }
  @keyframes navMegaIn{ from{ opacity:0; transform:translateY(-4px);} to{ opacity:1; transform:translateY(0);} }
  .nav-mega-inner{
    background:var(--surface); border:1.5px solid var(--border); border-radius:12px;
    box-shadow:0 12px 32px rgba(0,0,0,.16);
    padding:8px; width:250px; display:flex; flex-direction:column; gap:2px;
  }
  .nav-mega-item{
    display:flex; flex-direction:column; gap:1px; padding:8px 10px;
    border-radius:8px; text-decoration:none; transition:background .12s;
  }
  .nav-mega-item:hover, .nav-mega-item.active{ background:var(--s2); }
  .nav-mega-item-label{ font-size:.74rem; font-weight:700; color:var(--text); }
  .nav-mega-item.active .nav-mega-item-label{ color:var(--g2); }
  .nav-mega-item-desc{ font-size:.62rem; color:var(--muted); }

  /* ── Command palette trigger button ── */
  .nav-cp-btn{ display:inline-flex; align-items:center; gap:6px; }
  .nav-cp-kbd{
    font-family:'JetBrains Mono', monospace; font-size:.58rem; font-weight:700;
    padding:1px 5px; border-radius:4px; border:1px solid currentColor; opacity:.6;
  }
}

/* ── Command palette overlay (all viewports — reachable via Ctrl/Cmd+K) ── */
.cp-backdrop{
  position:fixed; inset:0; z-index:10050;
  background:rgba(20,30,25,.4); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);
  display:flex; align-items:flex-start; justify-content:center;
  padding:14vh 16px 16px;
  animation:cpFadeIn .15s ease-out both;
}
@keyframes cpFadeIn{ from{ opacity:0; } to{ opacity:1; } }
.cp-panel{
  width:100%; max-width:520px;
  background:var(--surface); border:1.5px solid var(--border); border-radius:14px;
  box-shadow:0 20px 60px rgba(0,0,0,.28);
  overflow:hidden; animation:cpPanelIn .18s cubic-bezier(.2,.8,.3,1) both;
}
@keyframes cpPanelIn{ from{ opacity:0; transform:translateY(-8px) scale(.98); } to{ opacity:1; transform:translateY(0) scale(1); } }
.cp-search-row{ display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1.5px solid var(--border); color:var(--muted); }
.cp-input{ flex:1; border:none; outline:none; background:transparent; font-size:.85rem; font-family:inherit; color:var(--text); }
.cp-close{
  border:none; background:var(--s2); color:var(--muted); cursor:pointer;
  width:22px; height:22px; border-radius:6px; font-size:.7rem; line-height:1;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.cp-close:hover{ background:var(--s3); }
.cp-list{ max-height:min(50vh, 380px); overflow-y:auto; padding:6px; }
.cp-empty{ padding:16px; text-align:center; font-size:.75rem; color:var(--muted); }
.cp-item{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  width:100%; text-align:left; border:none; background:transparent; cursor:pointer;
  padding:9px 10px; border-radius:8px; font-size:.78rem; font-weight:600; color:var(--text);
  font-family:inherit;
}
.cp-item.active{ background:var(--g-xlight); color:var(--g2); }
.cp-item-ext{ font-size:.7rem; opacity:.6; }
.cp-hint{
  display:flex; gap:12px; padding:9px 16px; border-top:1.5px solid var(--border);
  font-size:.6rem; color:var(--muted); font-family:'JetBrains Mono', monospace;
}
.cp-hint kbd{ font-family:inherit; }
@media (max-width:600px){ .cp-backdrop{ padding:8vh 10px 10px; } }
`;

// ── Mega-menu group (hover-intent with a cancellable close-delay, so the
//    dropdown survives the visual gap between trigger and panel) ───────────
function NavGroup({ group, activePage, openKey, setOpenKey }) {
  const isOpen = openKey === group.key;
  const hasActive = group.items.some(i => i.key === activePage);
  const closeTimer = useRef(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function cancelClose() { clearTimeout(closeTimer.current); }
  function scheduleClose() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpenKey(k => (k === group.key ? null : k));
    }, 220);
  }

  return (
    <div
      className="nav-group"
      onMouseEnter={() => { cancelClose(); setOpenKey(group.key); }}
      onMouseLeave={scheduleClose}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) scheduleClose(); }}
    >
      <button
        type="button"
        className={`nav-link nav-group-trigger${hasActive ? ' active' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onFocus={() => { cancelClose(); setOpenKey(group.key); }}
        onClick={() => setOpenKey(k => (k === group.key ? null : group.key))}
      >
        {group.label}
        <svg className="nav-caret" width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
          <path d="M1 1L4.5 4.5L8 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div className="nav-mega" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          <div className="nav-mega-inner">
            {group.items.map(item => {
              const linkProps = item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
              return (
                <a key={item.key} href={item.href} {...linkProps}
                  className={`nav-mega-item${item.key === activePage ? ' active' : ''}`}
                  onClick={() => setOpenKey(null)}>
                  <span className="nav-mega-item-label">{item.label}</span>
                  <span className="nav-mega-item-desc">{item.desc}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ctrl/Cmd+K command palette — fuzzy-free substring search across every
//    site destination. Closes on outside click, ✕, or Escape (not just Escape). ─
function CommandPalette({ open, onClose, items }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = q.trim()
    ? items.filter(i => i.label.toLowerCase().includes(q.trim().toLowerCase()))
    : items;

  useEffect(() => { setIdx(0); }, [q]);

  function go(item) {
    if (!item) return;
    onClose();
    if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer');
    else window.location.href = item.href;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(filtered[idx]); }
  }

  if (!open) return null;

  return (
    <div className="cp-backdrop" onClick={onClose}>
      <div className="cp-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search pages">
        <div className="cp-search-row">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
            <line x1="14" y1="14" x2="18" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search pages…" className="cp-input" aria-label="Search pages" />
          <button type="button" className="cp-close" onClick={onClose} aria-label="Close search">✕</button>
        </div>
        <div className="cp-list" role="listbox">
          {filtered.length === 0 && <div className="cp-empty">No matches</div>}
          {filtered.map((item, i) => (
            <button key={item.key} type="button"
              className={`cp-item${i === idx ? ' active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(item)}
              role="option"
              aria-selected={i === idx}>
              <span>{item.label}</span>
              {item.external && <span className="cp-item-ext">↗</span>}
            </button>
          ))}
        </div>
        <div className="cp-hint"><kbd>↑↓</kbd>&nbsp;navigate&nbsp;&nbsp;<kbd>↵</kbd>&nbsp;open&nbsp;&nbsp;<kbd>esc</kbd>&nbsp;close</div>
      </div>
    </div>
  );
}

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

  const user      = session.user;
  const name      = user?.name  || 'User';
  const email     = user?.email || '';
  const image     = user?.image || null;
  const role      = user?.role  || 'client';
  const plan      = user?.plan  || 'free';
  const planTier  = user?.planTier || 'free'; // 'free' | 'trial' | 'annual' | 'lifetime'
  const initials  = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // On-site expiry reminder — annual Pro or an active trial, within 30 days
  // of expiry (a trial is normally only a few days long, so this fires
  // almost immediately for one, which is the point). Lifetime members never
  // expire, so this never applies to them.
  const daysToExpiry = ((planTier === 'annual' || planTier === 'trial') && user?.planExpiresAt)
    ? Math.ceil((new Date(user.planExpiresAt) - new Date()) / 864e5)
    : null;
  const showRenewalReminder = daysToExpiry != null && daysToExpiry <= 30 && daysToExpiry >= 0;

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
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              <div style={{
                display: 'inline-block',
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
              <div style={{
                display: 'inline-block',
                fontSize: '.52rem', fontWeight: 800,
                letterSpacing: '.5px', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 4,
                fontFamily: "'JetBrains Mono', monospace",
                background: planTier === 'lifetime' ? '#fff8e1' : planTier === 'trial' ? '#e3f2fd' : plan === 'pro' ? '#e8f5e9' : 'var(--s2)',
                color:      planTier === 'lifetime' ? '#96690a' : planTier === 'trial' ? '#1565c0' : plan === 'pro' ? '#1b5e20' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
                {planTier === 'lifetime' ? '★ Lifetime' : planTier === 'trial' ? '⏱ Trial' : plan === 'pro' ? '★ Pro' : 'Free'}
              </div>
            </div>
            {showRenewalReminder && (
              <a href="/pricing" onClick={() => { setOpen(false); onNavClose?.(); }}
                style={{ display: 'block', marginTop: 6, fontSize: '.62rem', fontWeight: 700, color: '#e65100', textDecoration: 'none' }}>
                ⚠ {planTier === 'trial' ? 'Trial' : 'Pro'} expires {daysToExpiry <= 0 ? 'today' : `in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`} — {planTier === 'trial' ? 'Upgrade' : 'Renew'} →
              </a>
            )}
          </div>

          {/* Upgrade — free users only */}
          {plan !== 'pro' && (
            <a href="/pricing" onClick={() => { setOpen(false); onNavClose?.(); }}
              style={{ display: 'block', padding: '10px 14px', fontSize: '.75rem', fontWeight: 700, color: '#1a7a4a', textDecoration: 'none', borderBottom: '1px solid var(--border)', transition: 'background .12s', background: '#f0faf4' }}
              onMouseEnter={e => e.currentTarget.style.background = '#e0f5ea'}
              onMouseLeave={e => e.currentTarget.style.background = '#f0faf4'}>
              ★ Upgrade to Pro — ₹499/yr + GST
            </a>
          )}

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

          {/* Admin panel — admin (full) or distributor (scoped to their own clients) */}
          {(role === 'admin' || role === 'distributor') && (
            <a href="/admin" onClick={() => { setOpen(false); onNavClose?.(); }}
              style={{ display: 'block', padding: '10px 14px', fontSize: '.75rem', fontWeight: 600, color: 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {role === 'admin' ? '⚙ Admin Panel' : '👥 My Clients'}
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
  const [openGroup, setOpenGroup] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ''));
  }, []);

  // Close mobile menu on route change / resize
  useEffect(() => {
    function onResize() { if (window.innerWidth > 768) setMenuOpen(false); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ctrl/Cmd+K opens the command palette from anywhere; Escape closes
  // whichever mega-menu is open even when focus isn't inside it.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      } else if (e.key === 'Escape' && openGroup) {
        setOpenGroup(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openGroup]);

  const navbarStyle = isHome
    ? { borderBottom: 'none', marginBottom: 0, paddingBottom: 16 }
    : {};

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESKTOP_NAV_CSS }} />
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

        {/* ── Desktop nav: direct links + grouped mega-menus + search ── */}
        <div className="nav-desktop">
          <div className="nav-row">
            {NAV_DIRECT.map(item => {
              const isActive = item.key === activePage;
              const linkProps = item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
              if (isActive) {
                const tagStyle = isHome ? { background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', color: 'var(--g2)' } : {};
                return <div key={item.key} className="nav-tag" style={tagStyle}>{item.label}</div>;
              }
              return <a key={item.key} className="nav-link" href={item.href} {...linkProps}>{item.label}</a>;
            })}
            {NAV_GROUPS.map(group => (
              <NavGroup key={group.key} group={group} activePage={activePage}
                openKey={openGroup} setOpenKey={setOpenGroup} />
            ))}
            <button type="button" className="nav-link nav-cp-btn" onClick={() => setPaletteOpen(true)}
              aria-label="Search pages">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                <line x1="14" y1="14" x2="18" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <kbd className="nav-cp-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
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

      {/* ── Ctrl/Cmd+K command palette ── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={NAV_ITEMS} />
    </>
  );
}
