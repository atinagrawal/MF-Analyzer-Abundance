'use client';

/**
 * components/ProviderAvatar.jsx
 *
 * Shared component for rendering a fund/PMS/SIF provider logo.
 * Shows the actual logo image when available, falls back to a styled
 * initials circle on error or when no logo path is provided.
 *
 * Props:
 *  name      {string}  — Provider display name (used for initials fallback)
 *  logoPath  {string|null} — Local path e.g. "/logos/mf-hdfcfund-com.png"
 *  size      {number}  — Pixel size (default 32)
 *  radius    {number}  — Border radius in px (default 8)
 *  className {string}  — Extra class names on the root element
 *  style     {object}  — Extra inline styles
 */

import { useState } from 'react';

// Generate 2-letter initials from a provider name
function initials(name) {
  return (name || '')
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Pick a deterministic accent color from the initials (accessible, premium palette)
const ACCENT_PALETTE = [
  ['#1a237e', '#e8eaf6'], // deep indigo
  ['#004d40', '#e0f2f1'], // deep teal
  ['#b71c1c', '#ffebee'], // deep red
  ['#1b5e20', '#e8f5e9'], // deep green
  ['#4a148c', '#f3e5f5'], // deep purple
  ['#e65100', '#fff3e0'], // deep orange
  ['#0d47a1', '#e3f2fd'], // deep blue
  ['#37474f', '#eceff1'], // blue-grey
];

function pickAccent(name) {
  const code = (name || 'A').charCodeAt(0) + ((name || 'A').charCodeAt(1) || 0);
  return ACCENT_PALETTE[code % ACCENT_PALETTE.length];
}

export default function ProviderAvatar({
  name,
  logoPath,
  size = 32,
  radius = 8,
  className = '',
  style = {},
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const showLogo = logoPath && !imgFailed;
  const [fgColor, bgColor] = pickAccent(name);

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    ...style,
  };

  if (showLogo) {
    return (
      <div
        className={`provider-avatar provider-avatar--logo ${className}`}
        style={{
          ...baseStyle,
          background: '#ffffff',
          border: '1.5px solid rgba(0,0,0,.10)',
          boxShadow: '0 1px 4px rgba(0,0,0,.08)',
        }}
      >
        <img
          src={logoPath}
          alt={name}
          onError={() => setImgFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: size <= 32 ? '3px' : '5px',
            display: 'block',
          }}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  // Initials fallback
  return (
    <div
      className={`provider-avatar provider-avatar--initials ${className}`}
      style={{
        ...baseStyle,
        background: bgColor,
        border: `1.5px solid ${fgColor}22`,
        color: fgColor,
        fontSize: size <= 32 ? '0.58rem' : size <= 44 ? '0.72rem' : '0.88rem',
        fontWeight: 800,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.5px',
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
