'use client';

/**
 * components/NfoPromoBanner.jsx
 *
 * Dismissible homepage banner for an open NFO that has a direct "invest
 * now" link (see lib/investLinksCache.js) -- never a modal/popup (see the
 * design discussion that led here: a blocking popup pushing one AMC's
 * scheme reads as suitability-pushing for a SEBI-registered distributor,
 * especially next to this site's own NFO-trap/₹10-fallacy content). This
 * is an inline strip under the navbar instead, dismissible, never
 * re-shown once closed in that browser.
 *
 * `promo` is resolved server-side (app/page.js, via
 * lib/investLinksCache.js's getPromotableOpenNfos) -- this component only
 * owns the dismiss/localStorage interactivity, never data fetching, so it
 * stays correct for whichever NFO is actually open without being specific
 * to any one AMC.
 */

import { useEffect, useState } from 'react';

function formatDate(d) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NfoPromoBanner({ promo }) {
  const [dismissed, setDismissed] = useState(true);

  const dismissKey = promo ? `nfoPromoDismissed_${promo.slug}` : null;

  useEffect(() => {
    if (!dismissKey) return;
    try {
      if (localStorage.getItem(dismissKey) !== '1') setDismissed(false);
    } catch (e) {
      setDismissed(false);
    }
  }, [dismissKey]);

  if (!promo || dismissed) return null;

  function close() {
    setDismissed(true);
    try { localStorage.setItem(dismissKey, '1'); } catch (e) {}
  }

  return (
    <div className="nfo-promo-banner">
      {promo.logo && <img src={promo.logo} alt={promo.amcName || ''} className="nfo-promo-logo" />}
      <div className="nfo-promo-body">
        <div className="nfo-promo-title">
          {promo.schemeName} — NFO open now
        </div>
        <div className="nfo-promo-sub">
          {promo.category || promo.schemeType}
          {promo.closeDate && <> · Closes {formatDate(promo.closeDate)}</>}
          {promo.minInvestment != null && <> · Min ₹{new Intl.NumberFormat('en-IN').format(promo.minInvestment)}</>}
        </div>
      </div>
      <div className="nfo-promo-actions">
        <a href={promo.investLink} target="_blank" rel="noopener noreferrer" className="nfo-promo-invest">
          Invest Now ↗
        </a>
        <a href={`/nfo/${promo.slug}`} className="nfo-promo-details">
          Details
        </a>
      </div>
      <button className="nfo-promo-close" onClick={close} aria-label="Dismiss">×</button>
      <div className="nfo-promo-disclaimer">
        Not investment advice. Mutual fund investments are subject to market risks — read all scheme-related
        documents carefully before investing. Atin Kumar Agrawal · ARN-251838 (AMFI Registered Mutual Fund &amp; SIF
        Distributor) · APRN04279 (APMI Registered PMS Distributor)
      </div>
    </div>
  );
}
