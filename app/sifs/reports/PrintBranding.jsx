/**
 * app/sifs/reports/PrintBranding.jsx
 *
 * Print-only letterhead + footer brand strip, shown on paper/PDF only
 * (display:none on screen -- see sif-reports.css's @media print block).
 * Without this, a printed report reads as a bare data dump once the
 * on-screen navbar is hidden -- nothing ties it back to Abundance for
 * someone who prints it to share with a client or prospect.
 */

export default function PrintBranding({ asOf }) {
  return (
    <div className="sifr-print-masthead">
      <img
        src="/logo-navbar.png"
        alt="Abundance Financial Services"
        className="sifr-print-logo"
        width={140}
        height={56}
      />
      <div className="sifr-print-meta">
        <div className="sifr-print-site">mfcalc.getabundance.in</div>
        {asOf && <div className="sifr-print-asof">Data as of {asOf}</div>}
      </div>
    </div>
  );
}

export function PrintFooterBrand() {
  return (
    <div className="sifr-print-footer-brand">
      <img src="/logo-navbar.png" alt="" className="sifr-print-footer-logo" />
      <span>mfcalc.getabundance.in &middot; Abundance Financial Services</span>
    </div>
  );
}
