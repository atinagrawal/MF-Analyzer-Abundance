/**
 * lib/printWithTitle.js
 *
 * A browser's "Save as PDF" print dialog defaults its suggested filename
 * to the current page's document.title -- every CAS Tracker drawer that
 * calls window.print() directly on the page (not a separate print window,
 * unlike app/cas-tracker/page.js's exportPdf) inherits the page's generic
 * title ("CAS Portfolio Tracker — Live NAV, FIFO Gains & ELSS Lock-in |
 * Abundance", see lib/metadata.js's 'cas-tracker' entry), never anything
 * specific to the report actually being printed.
 *
 * Swaps document.title to `title` for the duration of the print, then
 * restores the original once printing finishes -- via the standard
 * 'afterprint' event, which fires whether the user actually saves or
 * cancels, since window.print() itself doesn't reliably block execution
 * across browsers.
 */
export function printWithTitle(title) {
  const original = document.title;
  // Strip characters that are illegal in a filename on at least one major
  // OS (Windows is the strictest of the three) -- everything else (spaces,
  // hyphens, accented letters) is left as-is for readability.
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();
  document.title = safeTitle || original;

  const restore = () => {
    document.title = original;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);

  window.print();
}
