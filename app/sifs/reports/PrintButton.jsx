'use client';

/**
 * app/sifs/reports/PrintButton.jsx
 *
 * Replaces the "Download shareable image" button as the primary way to
 * save/share a report -- browser print-to-PDF instead of a generated PNG.
 * Zero server compute, zero R2 storage, always reflects live data (unlike
 * the weekly-regenerated og-sif-* images, which still exist for social
 * link-preview thumbnails via openGraph/twitter meta tags, just not as a
 * user-facing download button any more).
 *
 * Print-specific layout (hiding nav/chrome, flattening the dark table to
 * a print-safe light one) lives in sif-reports.css's @media print block.
 */

export default function PrintButton({ label = 'Print / Save as PDF' }) {
  return (
    <button type="button" className="sifr-download-btn sifr-no-print" onClick={() => window.print()}>
      &#128424; {label}
    </button>
  );
}
