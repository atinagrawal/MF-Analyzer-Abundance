/**
 * app/proposal-studio/view/[token]/layout.js
 *
 * The public share page (page.js) is 'use client', so it can't export
 * `metadata` itself -- this server-component layout does it instead. Each
 * share link contains client PII (name/email/phone) and is not meant to be
 * discoverable, so it's excluded from search indexing here and from
 * crawling in app/robots.js.
 */
export const metadata = {
  robots: { index: false, follow: false },
};

export default function ProposalPublicViewLayout({ children }) {
  return children;
}
