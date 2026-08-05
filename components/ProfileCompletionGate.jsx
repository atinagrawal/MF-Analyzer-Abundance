'use client';

/**
 * components/ProfileCompletionGate.jsx
 *
 * Google sign-ins always arrive with a name. Email/OTP/magic-link
 * sign-ins never do -- and there's no way to ask for one BEFORE the
 * account is created: Auth.js consumes the one-time link/code token
 * before any app code runs (traced through @auth/core's callback
 * handler), so intercepting at that point would burn the user's link/code
 * and force them to request a new one. Instead, this redirects a
 * signed-in, nameless user to /complete-profile right after sign-in,
 * before they can reach anything else -- same practical effect (an
 * unusable account until a name is given), enforced a step later.
 *
 * Rendered once at the root layout (inside AuthProvider), so it applies
 * across the whole app without touching every page individually.
 */

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';

const EXEMPT_PATHS = ['/complete-profile', '/login'];

export default function ProfileCompletionGate() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (session?.user?.name) return;
    if (pathname.startsWith('/api/')) return;
    if (EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;

    router.replace(`/complete-profile?from=${encodeURIComponent(pathname)}`);
  }, [status, session, pathname, router]);

  return null;
}
