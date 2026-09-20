/**
 * app/portfolio/layout.js
 *
 * Passthrough layout for the /portfolio route hierarchy.
 * Page-specific metadata and JSON-LD structured data are scoped to
 * app/portfolio/page.jsx so nested sibling routes like
 * /portfolio/diagnostic/[share_token] retain their own independent
 * canonical URLs, OpenGraph cards, and schema without layout pollution.
 */

export default function PortfolioLayout({ children }) {
  return children;
}
