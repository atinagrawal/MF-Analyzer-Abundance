'use client';

/**
 * components/Navbar.jsx — Shared navigation bar
 *
 * Props:
 *   activePage: string — key of the currently active page
 *   variant: 'default' | 'home'
 *     - 'default': solid dark-green active tag, bottom border (tool pages)
 *     - 'home': light-green active tag, no bottom border, extra "Serving Investors" subtitle
 *
 * Logo: Always uses /logo-navbar.png (280×112, displayed at 140×56).
 *       The green "A" icon is a last-resort fallback only if the image fails to load.
 *       In production this should never happen since the file is in /public.
 *
 * Usage:
 *   <Navbar activePage="rolling" />                  // tool pages
 *   <Navbar activePage="calculator" variant="home" /> // homepage
 */

const NAV_ITEMS = [
  { key: 'home',        label: '🏠 Home',            href: 'https://www.getabundance.in', external: true },
  { key: 'calculator',  label: '📊 MF Calculator',   href: '/' },
  { key: 'industry',    label: '📈 Industry Pulse',  href: '/industry' },
  { key: 'report',      label: '📋 Report Card',     href: '/report' },
  { key: 'geography',   label: '🗺 Geography',       href: '/geography' },
  { key: 'rolling',     label: '📉 Rolling Returns', href: '/rolling' },
  { key: 'indices',     label: '📊 Index Dashboard', href: '/indices' },
  { key: 'cas-tracker', label: '📋 CAS Tracker',     href: '/cas-tracker' },
  { key: 'contact',     label: '📞 Contact',         href: 'https://www.getabundance.in/contact-us', external: true },
];

export default function Navbar({ activePage, variant = 'default' }) {
  const isHome = variant === 'home';

  // Homepage: no bottom border, no bottom margin (merges with brand strip below)
  const navbarStyle = isHome
    ? { borderBottom: 'none', marginBottom: 0, paddingBottom: 16 }
    : {};

  return (
    <nav className="navbar" style={navbarStyle}>
      {/* ── Logo ── */}
      <a
        className="logo-wrap"
        href="https://www.getabundance.in"
        target="_blank"
        rel="noopener noreferrer"
      >
        {/*
         * Primary: /logo-navbar.png (280×112, rendered at 140×56 for retina)
         * This file lives in /public and should always load in production.
         * The "A" icon below is a last-resort fallback only.
         */}
        <img
          className="logo-img"
          src="/logo-navbar.png"
          alt="Abundance Financial Services® — AMFI Registered Mutual Fund Distributor"
          width={140}
          height={56}
          loading="eager"
          fetchPriority="high"
          onError={(e) => {
            // Fallback: hide broken image, show "A" icon
            e.target.style.display = 'none';
            e.target.nextElementSibling.style.display = 'flex';
          }}
        />
        {/* Fallback icon — hidden by default, shown only if image fails */}
        <div className="logo-icon" aria-hidden="true">A</div>

        <div className="logo-text">
          <div className="brand">Abundance</div>
          <div className="sub">
            Financial Services
            <sup style={{ fontSize: '.55em', letterSpacing: 0, verticalAlign: 'super', opacity: .75 }}>®</sup>
          </div>
          {/* Homepage variant: extra tagline */}
          {isHome && (
            <div
              className="sub"
              style={{
                fontSize: '.52rem',
                letterSpacing: '1.2px',
                marginTop: 2,
                color: 'var(--g3)',
              }}
            >
              Serving Investors Across India
            </div>
          )}
        </div>
      </a>

      {/* ── Nav links ── */}
      <div className="nav-right">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activePage;
          const linkProps = item.external
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {};

          if (isActive) {
            // Homepage variant: lighter tag (green-on-light-green)
            // Tool pages: solid white-on-dark-green
            const tagStyle = isHome
              ? {
                  background: 'var(--g-xlight)',
                  border: '1.5px solid var(--g-light)',
                  color: 'var(--g2)',
                }
              : {};

            return (
              <div key={item.key} className="nav-tag" style={tagStyle}>
                {item.label}
              </div>
            );
          }

          return (
            <a
              key={item.key}
              className="nav-link"
              href={item.href}
              {...linkProps}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
