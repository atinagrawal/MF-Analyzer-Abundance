/**
 * app/login/layout.js
 *
 * Minimal layout for the login page.
 * noindex — login pages should not appear in search results.
 */

export const metadata = {
  title: 'Sign In | Abundance MF Tracker',
  description: 'Sign in to your Abundance account to access your CAS portfolio tracker and saved data.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }) {
  return children;
}
