/**
 * components/Footer.jsx — Shared dark footer
 *
 * Props:
 *   variant: 'default' | 'home'
 *     - 'default': minimal footer (disclaimer bar + copyright row) — for tool pages
 *     - 'home': full 3-column footer (brand+stats, contact+social, CTA) — for homepage
 *   activePage: string — highlights the active link in tools list (home variant only)
 *   disclaimer: string — optional custom disclaimer text
 *
 * Logos used:
 *   - Home variant: /logo-footer-white.png (300×104, white version for dark bg)
 *   - Default variant: no logo (matches rolling.html footer)
 *
 * Usage:
 *   <Footer />                                // tool pages (default)
 *   <Footer variant="home" activePage="calculator" /> // homepage
 */

const DEFAULT_DISCLAIMER =
  '⚠ Disclaimer: Mutual fund investments are subject to market risks. ' +
  'Read all scheme-related documents carefully before investing. ' +
  'Past performance is not indicative of future returns. ' +
  'This tool is for informational and educational purposes only and does not constitute financial advice. ' +
  'Please consult your financial advisor before making investment decisions. ' +
  'Mutual fund data sourced from AMFI (amfiindia.com).';

export default function Footer({ variant = 'default', activePage, disclaimer }) {
  const year = new Date().getFullYear();
  const isHome = variant === 'home';

  return (
    <footer className="dark-footer">
      <div className="dark-footer-edge" />
      <div className="dark-footer-inner">

        {/* ── HOME VARIANT: 3-column rich footer ── */}
        {isHome && (
          <div className="dark-footer-cols">

            {/* Col 1: Brand + stats */}
            <div className="dfc dfc-brand">
              <img
                className="dfc-logo"
                src="/logo-footer-white.png"
                loading="lazy"
                width={150}
                height={52}
                alt="Abundance Financial Services"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <div className="dfc-name">
                Abundance Financial Services<span>®</span>
              </div>
              <div className="dfc-tagline">
                AMFI Registered Mutual Funds &amp; SIF Distributor · Pan-India
              </div>
              <div className="dfc-arn">ARN-251838</div>
              <div className="dfc-stats">
                <div className="dfc-stat">
                  <div className="dfc-stat-val">₹250Cr+</div>
                  <div className="dfc-stat-lbl">AUM</div>
                </div>
                <div className="dfc-stat">
                  <div className="dfc-stat-val">350+</div>
                  <div className="dfc-stat-lbl">Clients</div>
                </div>
                <div className="dfc-stat">
                  <div className="dfc-stat-val">15+</div>
                  <div className="dfc-stat-lbl">Yrs Exp.</div>
                </div>
              </div>
            </div>

            {/* Col 2: Contact */}
            <div className="dfc dfc-contact">
              <div className="dfc-head">Get in Touch</div>
              <div className="dfc-contact-list">
                <a href="tel:+919808105923" className="dfc-contact-item">
                  <span className="dfc-contact-icon">📞</span>
                  <span>+91 98081 05923</span>
                </a>
                <a
                  href="https://www.getabundance.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dfc-contact-item"
                >
                  <span className="dfc-contact-icon">🌐</span>
                  <span>www.getabundance.in</span>
                </a>
                <div className="dfc-contact-item dfc-contact-addr">
                  <span className="dfc-contact-icon">🏢</span>
                  <a
                    href="https://maps.app.goo.gl/TgQSLRDo3UBKR77g7"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    1st Floor, Kapil Complex,<br />
                    Mukhani, Haldwani — 263139, Uttarakhand
                    <br />
                    <span style={{ color: '#a5d6a7', fontSize: '.9em' }}>
                      Serving clients across India · Online &amp; Remote
                    </span>
                  </a>
                </div>
              </div>
              {/* Social icons */}
              <div className="dfc-social">
                <a className="dfc-social-btn" href="https://www.instagram.com/abundancefinancialservices/" target="_blank" rel="noopener noreferrer" title="Instagram">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                </a>
                <a className="dfc-social-btn" href="https://www.facebook.com/abundancefinancialservices" target="_blank" rel="noopener noreferrer" title="Facebook">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                </a>
                <a className="dfc-social-btn" href="https://x.com/abundancefinsvs" target="_blank" rel="noopener noreferrer" title="X (Twitter)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a className="dfc-social-btn" href="https://wa.me/919808105923" target="_blank" rel="noopener noreferrer" title="WhatsApp">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                </a>
              </div>
            </div>

            {/* Col 3: CTA */}
            <div className="dfc dfc-cta">
              <div className="dfc-head">Start Your Journey</div>
              <p className="dfc-cta-desc">
                Expert guidance on mutual funds, SIPs, SWP, SIF and loan planning — personalised for your goals.
                Serving investors across India, online and remotely.
              </p>
              <a
                href="https://www.getabundance.in/contact-us"
                target="_blank"
                rel="noopener noreferrer"
                className="dfc-cta-btn"
              >
                📅 Book a Consultation
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="https://www.getabundance.in"
                target="_blank"
                rel="noopener noreferrer"
                className="dfc-cta-link"
              >
                Visit getabundance.in →
              </a>
              <div className="dfc-tool-badge">
                <span>🛠</span>
                <span>Live AMFI data · MF &amp; SIF Distributor · EMI + SIP + SWP + Goal + Fund Compare</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Disclaimer bar (both variants) ── */}
        <div className="dark-footer-disclaimer">
          {isHome && <span className="dfd-warn">⚠</span>}
          <p>
            <strong>Disclaimer:</strong>{' '}
            {disclaimer || DEFAULT_DISCLAIMER.replace('⚠ Disclaimer: ', '')}
          </p>
        </div>

        {/* ── Bottom bar (both variants) ── */}
        <div className="dark-footer-bottom">
          <span>© {year} Abundance Financial Services® · Atin Kumar Agrawal</span>
          <span className="dfb-arn">
            ARN-251838 · AMFI Registered Mutual Funds Distributor &amp; SIF Distributor
          </span>
          <span className="dfb-arn">GST: 05AXYPA6954G1Z3</span>
        </div>
      </div>
    </footer>
  );
}
