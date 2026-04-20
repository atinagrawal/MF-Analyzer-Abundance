/**
 * app/api/auth/[...nextauth]/route.js
 *
 * Mounts the NextAuth v5 handlers at /api/auth/*.
 * Handles: /api/auth/signin, /api/auth/signout,
 *          /api/auth/callback/google, /api/auth/session, etc.
 */

import { handlers } from '@/auth';

export const { GET, POST } = handlers;
