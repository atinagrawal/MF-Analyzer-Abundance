/**
 * app/admin/layout.js
 *
 * Minimal layout for the admin panel.
 * noindex + nofollow — admin pages must never appear in search results.
 */

export const metadata = {
  title: 'Admin Panel | Abundance',
  robots: { index: false, follow: false, noarchive: true },
};

export default function AdminLayout({ children }) {
  return children;
}
