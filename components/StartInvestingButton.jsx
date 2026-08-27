'use client';

/**
 * components/StartInvestingButton.jsx — shared "Start Investing" CTA.
 * Opens a small dropdown offering the platforms clients can sign up and
 * invest through. Self-contained (own styles, own open/close state) so it
 * can be dropped into the navbar, fund detail page, or screener pages
 * without depending on any host page's CSS.
 */

import { useState, useRef, useEffect } from 'react';

const INVEST_PLATFORMS = [
  { key: 'nj', label: 'NJ Wealth', desc: "India's largest MF distribution platform", href: 'https://nj.getabundance.in' },
  { key: 'assetplus', label: 'AssetPlus', desc: 'Simple, secure online investing', href: 'https://ap.getabundance.in' },
  { key: 'angelone', label: 'Angel One', desc: 'Investing, trading & more', href: 'https://a1.getabundance.in' },
];

const SI_CSS = `
.si-wrap{ position:relative; display:inline-block; }
.si-btn{
  display:inline-flex; align-items:center; gap:6px;
  font-family:'Raleway',sans-serif; font-size:.78rem; font-weight:800;
  color:#fff; background:linear-gradient(135deg, var(--g1), var(--g2));
  border:none; border-radius:10px; padding:9px 16px; cursor:pointer;
  white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,.14);
  transition:transform .14s ease, box-shadow .14s ease;
}
.si-btn:hover{ transform:translateY(-1px); box-shadow:0 4px 14px rgba(0,0,0,.2); }
.si-caret{ transition:transform .18s ease; flex-shrink:0; }
.si-btn[aria-expanded="true"] .si-caret{ transform:rotate(180deg); }
.si-btn-short{ display:none; }
.si-menu{
  position:absolute; top:calc(100% + 8px); right:0; min-width:250px;
  background:var(--surface); border:1.5px solid var(--border); border-radius:12px;
  box-shadow:0 8px 24px rgba(0,0,0,.18); overflow:hidden; z-index:9999;
  animation:siMenuIn .16s ease-out both;
}
@keyframes siMenuIn{ from{opacity:0; transform:translateY(-4px);} to{opacity:1; transform:translateY(0);} }
.si-item{ display:block; padding:11px 14px; text-decoration:none; border-bottom:1px solid var(--border); transition:background .12s ease; }
.si-item:last-child{ border-bottom:none; }
.si-item:hover{ background:var(--s2); }
.si-item-label{ display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:.8rem; font-weight:800; color:var(--text); }
.si-item-desc{ font-size:.62rem; color:var(--muted); margin-top:2px; }
.si-item-ext{ font-size:.7em; opacity:.6; flex-shrink:0; }
@media (max-width:480px){
  .si-btn-full{ display:none; }
  .si-btn-short{ display:inline; }
  .si-btn{ padding:8px 12px; }
}
`;

export default function StartInvestingButton({ style, className }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`si-wrap${className ? ` ${className}` : ''}`} ref={wrapRef} style={style}>
      <style dangerouslySetInnerHTML={{ __html: SI_CSS }} />
      <button
        type="button"
        className="si-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="si-btn-full">Start Investing</span>
        <span className="si-btn-short">Invest</span>
        <svg className="si-caret" width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
          <path d="M1 1L4.5 4.5L8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="si-menu" role="menu">
          {INVEST_PLATFORMS.map((p) => (
            <a
              key={p.key}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              className="si-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <div className="si-item-label">{p.label}<span className="si-item-ext">↗</span></div>
              <div className="si-item-desc">{p.desc}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
