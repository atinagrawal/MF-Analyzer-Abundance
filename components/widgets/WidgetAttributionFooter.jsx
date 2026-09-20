'use client';

import React, { useState } from 'react';

/**
 * Shared attribution footer for embeddable widgets.
 * 
 * Satisfies §4.3 of SEO & GEO Growth Plan:
 * - Mandatory attribution backlink to mfcalc.getabundance.in
 * - AMFI Registered Distributor ARN-251838 disclosure
 * - One-click embed code generator/copier
 */
export default function WidgetAttributionFooter({ 
  widget = 'sip_calculator',
  defaultHeight = 480,
  defaultWidth = '100%',
  maxWidth = '460px'
}) {
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const embedUrl = `https://mfcalc.getabundance.in/embed/${widget === 'sip_calculator' ? 'sip-calculator' : 'nifty50-breadth'}`;
  const title = widget === 'sip_calculator' ? 'Abundance SIP Calculator' : 'Abundance Nifty 50 Market Breadth Ticker';
  const fallbackUrl = widget === 'sip_calculator' ? 'https://mfcalc.getabundance.in/sip-calculator' : 'https://mfcalc.getabundance.in/market-breadth';
  const fallbackLabel = widget === 'sip_calculator' ? 'SIP Calculator' : 'Market Breadth';

  const embedCode = `<iframe src="${embedUrl}" width="${defaultWidth}" height="${defaultHeight}" style="border: 1px solid #c2dfc2; border-radius: 12px; max-width: ${maxWidth}; width: 100%; display: block;" title="${title}" loading="lazy"></iframe>
<p style="font-size: 11px; color: #5e8a5e; margin-top: 4px; font-family: sans-serif;">
  Powered by <a href="${fallbackUrl}" target="_blank" rel="noopener" style="color: #1b5e20; text-decoration: underline;">Abundance ${fallbackLabel}</a> (ARN-251838)
</p>`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API not available
    }
  };

  return (
    <footer style={{
      borderTop: '1px solid var(--border, #c2dfc2)',
      background: 'rgba(255, 255, 255, 0.75)',
      backdropFilter: 'blur(4px)',
      padding: '7px 12px',
      fontSize: '11px',
      lineHeight: '1.3',
      color: 'var(--muted, #5e8a5e)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      flexShrink: 0,
      fontFamily: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span style={{ color: 'var(--g1, #1b5e20)', fontWeight: '700' }}>⚡</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Powered by{' '}
          <a
            href={`https://mfcalc.getabundance.in/?utm_source=widget_embed&utm_medium=iframe&utm_campaign=${widget}`}
            target="_blank"
            rel="noopener"
            style={{
              color: 'var(--g1, #1b5e20)',
              fontWeight: '700',
              textDecoration: 'none',
            }}
            onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            Abundance (ARN-251838)
          </a>
          <span style={{ opacity: 0.8, fontSize: '10px', marginLeft: '4px' }}>
            · AMFI Registered MFD
          </span>
        </span>
      </div>

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setShowEmbedModal(!showEmbedModal)}
          title="Get embed code for your website"
          style={{
            background: 'transparent',
            border: '1px solid var(--border, #c2dfc2)',
            borderRadius: '4px',
            color: 'var(--text2, #2e4d2e)',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: '600',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          &lt;/&gt;
        </button>

        {showEmbedModal && (
          <div
            style={{
              position: 'absolute',
              bottom: '120%',
              right: 0,
              width: '280px',
              maxWidth: '85vw',
              background: '#fff',
              border: '1px solid var(--border, #c2dfc2)',
              borderRadius: '8px',
              padding: '10px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              zIndex: 50,
              textAlign: 'left',
              color: 'var(--text, #162616)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <strong style={{ fontSize: '11px', color: 'var(--g1, #1b5e20)' }}>Embed on your website</strong>
              <button
                type="button"
                onClick={() => setShowEmbedModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#999' }}
              >
                ✕
              </button>
            </div>
            <textarea
              readOnly
              value={embedCode}
              rows={4}
              style={{
                width: '100%',
                fontSize: '10px',
                fontFamily: 'monospace',
                background: 'var(--s2, #edf6ed)',
                border: '1px solid var(--border, #c2dfc2)',
                borderRadius: '4px',
                padding: '4px',
                resize: 'none',
                color: '#333',
                marginBottom: '6px',
              }}
            />
            <button
              type="button"
              onClick={copyCode}
              style={{
                width: '100%',
                background: 'var(--g1, #1b5e20)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '5px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {copied ? '✓ Code Copied to Clipboard!' : 'Copy Embed Code'}
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}
