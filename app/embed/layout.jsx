import React from 'react';

/**
 * Isolated layout for embeddable iframes.
 * Strips dashboard baggage and guarantees clean viewport sizing.
 */
export default function EmbedLayout({ children }) {
  return (
    <div
      className="embed-viewport"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg, #f0f7f0)',
        fontFamily: "'Raleway', sans-serif",
        margin: 0,
        padding: 0,
        overflowX: 'hidden',
      }}
    >
      <style>{`
        /* Suppress global fixed/floating overlays inside embed iframes */
        .profile-gate-modal { display: none !important; }
        html, body { background: var(--bg, #f0f7f0) !important; margin: 0 !important; padding: 0 !important; }
      `}</style>
      {children}
    </div>
  );
}
