'use client';

/**
 * components/PostHogProvider.jsx
 *
 * Wires up PostHog for two distinct jobs (see the design discussion this
 * came from):
 *   1. Aggregate product analytics — pageviews for everyone, tied to an
 *      anonymous device id until someone signs in.
 *   2. Per-user lead intelligence — once signed in, posthog.identify()
 *      links all past and future events on this device to the real user,
 *      so "what did this specific unknown signup look at" is answerable.
 *
 * person_profiles: 'identified_only' means a pure anonymous visitor's
 * pageviews are still captured (aggregate "top pages" works), but PostHog
 * only creates a billable Person profile once identify() actually fires —
 * i.e. once someone signs up. Matches the actual goal: tracking unknown
 * SIGNUPS, not every drive-by visitor.
 *
 * No-ops entirely if NEXT_PUBLIC_POSTHOG_KEY isn't set, so this is safe to
 * ship before the env var exists anywhere (local, preview, or prod).
 *
 * Usage: wrap {children} in app/layout.js with <PostHogProvider>, inside
 * (or outside — order doesn't matter) <AuthProvider>.
 */

import { useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import posthog from 'posthog-js';

const POSTHOG_KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;
function ensureInit() {
  if (initialized || !POSTHOG_KEY || typeof window === 'undefined') return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // sent manually below — App Router has no native full-page-load event to hook
    capture_pageleave: true,
    person_profiles: 'identified_only',
  });
  initialized = true;
}

// Next.js requires useSearchParams() callers to sit under a Suspense boundary.
function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    ensureInit();
    const query = searchParams?.toString();
    const url = query ? `${window.location.origin}${pathname}?${query}` : `${window.location.origin}${pathname}`;
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify() {
  const { data: session, status } = useSession();
  const identifiedId = useRef(null);

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    ensureInit();

    if (status === 'authenticated' && session?.user?.id) {
      if (identifiedId.current === session.user.id) return; // already identified this session
      posthog.identify(session.user.id, {
        email: session.user.email,
        name:  session.user.name,
        role:  session.user.role,
        plan:  session.user.plan,
      });
      identifiedId.current = session.user.id;
    } else if (status === 'unauthenticated' && identifiedId.current) {
      // Signed out on a device PostHog had linked to a real person —
      // reset so the next visitor on this device isn't attributed to them.
      posthog.reset();
      identifiedId.current = null;
    }
  }, [status, session?.user?.id]);

  return null;
}

export default function PostHogProvider({ children }) {
  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      <PostHogIdentify />
      {children}
    </>
  );
}
