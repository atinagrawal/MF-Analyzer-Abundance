'use client';

/**
 * components/AuthProvider.jsx
 *
 * Wraps the app with NextAuth's SessionProvider so any client component
 * can call useSession() to read the current user's session.
 *
 * Must be a client component ('use client') because SessionProvider
 * uses React context internally.
 *
 * Usage: wrap {children} in app/layout.js with <AuthProvider>.
 */

import { SessionProvider } from 'next-auth/react';

export default function AuthProvider({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
