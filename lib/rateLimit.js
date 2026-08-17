/**
 * lib/rateLimit.js
 *
 * Two-tier (burst + sustained), Postgres-backed rate limiter shared by
 * every protected route. Reuses lib/db.js's existing pool -- no new
 * service. See docs/superpowers/specs/2026-08-17-per-user-rate-limiter-design.md.
 *
 * subjectKey convention: 'user:<id>' for a route that already requires a
 * signed-in session, 'ip:<address>' for a route that's deliberately
 * public (see the plan doc's mid-planning scope correction for why both
 * exist).
 */

import pool from './db.js';

export const DEFAULT_TIERS = [
  { windowSeconds: 600,   limit: 100 },   // burst
  { windowSeconds: 86400, limit: 1500 },  // sustained
];

// Atomically increments the counter for each tier in order and returns the
// FIRST tier exceeded (stopping there -- a caller already over the burst
// tier doesn't also need the sustained tier checked), or { limited: false }
// if neither tier is over. Call AFTER any auth() check and BEFORE any
// external fetch or heavy DB work in the route.
export async function checkRateLimit(subjectKey, routeKey, tiers = DEFAULT_TIERS) {
  for (const { windowSeconds, limit } of tiers) {
    const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
    const { rows } = await pool.query(
      `INSERT INTO rate_limit_counters (subject_key, route_key, window_secs, window_start, count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (subject_key, route_key, window_secs, window_start)
       DO UPDATE SET count = rate_limit_counters.count + 1
       RETURNING count`,
      [subjectKey, routeKey, windowSeconds, windowStart]
    );
    if (rows[0].count > limit) {
      const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000);
      return { limited: true, retryAfterSeconds };
    }
  }
  return { limited: false };
}

// Pure formatting -- shared by both this app's route styles (App Router's
// rateLimitResponse() below returns a Fetch API Response; the one Pages
// Router route, pages/api/mf.js, uses its own (req,res)-style error
// helper and calls rateLimitMessage() directly instead).
export function formatRetryLabel(retryAfterSeconds) {
  if (retryAfterSeconds < 3600) {
    const mins = Math.ceil(retryAfterSeconds / 60);
    return `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(retryAfterSeconds / 3600);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function rateLimitMessage(retryAfterSeconds) {
  return `You're doing that too fast — try again in ${formatRetryLabel(retryAfterSeconds)}. If this seems wrong, contact support at contact@getabundance.in.`;
}

// App Router (Fetch API Response) helper.
export function rateLimitResponse({ retryAfterSeconds }) {
  return Response.json(
    { error: rateLimitMessage(retryAfterSeconds), retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

// Best-effort real client IP from a Fetch API Request (App Router).
// Vercel's edge network sets x-forwarded-for to the true client IP as the
// first entry in a possibly-comma-separated list.
export function getClientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// Same, for a Pages Router (req, res) handler's Node-style request object.
export function getClientIpFromNodeReq(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
