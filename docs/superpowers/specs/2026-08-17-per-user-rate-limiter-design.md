# Per-User Rate Limiter (Design)

## Goal

Stop any signed-in user — free, trial, or fully paid Pro — from scripting
requests against this app's data-lookup API routes to scrape data at
scale, without adding friction to normal UI use. This is sub-project 2 of
2 (sub-project 1, the time-boxed Pro trial mechanism, is a separate,
independent spec — `docs/superpowers/specs/2026-08-17-pro-trial-mechanism-design.md`).
Explicit product framing from the user: "No unfair usage allowed to users
even if they have paid for it" — this protects everyone uniformly, it is
not a plan-tier feature.

## Background — what already exists, and the actual risk shape

No rate-limiting code, dependency (Redis/Upstash), or table exists
anywhere in this app today.

`middleware.js` runs on **Edge runtime** with a narrow matcher (`/`,
`/admin/*` only) and cannot use `lib/db.js`'s Postgres pool (a Node-only
TCP client). A rate limiter therefore belongs inside individual API route
handlers (all already Node.js runtime), not in Edge middleware — this is a
constraint, not a preference.

**Which routes actually need protecting** is not "all of them" or "the
biggest ones" — it's determined by one precise criterion: a route is at
risk of scrape-scale abuse only when a **user-supplied parameter becomes
part of its cache key** (or it has no cache at all). A route that serves
one shared dataset to every caller (`app/api/sif-nav/route.js`,
`app/api/market-watch/route.js`, `app/api/scheme-master-facts/route.js`)
is already self-limiting — the whole world shares one cache entry, so no
amount of per-user request volume can force excessive upstream calls
beyond that cache's own TTL. A route where each distinct parameter value
is its own cache miss — confirmed this session: `pages/api/mf.js`
(`?code=`), `app/api/distributor/route.js` (`?arn=`),
`app/api/proposal-studio/holdings/route.js` (`?amfiCode=`) — is where
someone can genuinely enumerate through thousands of distinct values and
force thousands of real upstream/DB hits. These three are the confirmed,
in-scope routes for this spec.

**Not yet audited, flagged for the implementation plan to check against
the same criterion** rather than guessed at here: `app/api/fund-detail/[code]/route.js`,
`app/api/sif-detail/[id]/route.js`, `app/api/sector-detail/route.js`,
`app/api/sif-history/route.js`, `app/api/stress-test/route.js`. Each takes
a parameter that plausibly makes it per-value-cached (or uncached), but
none were opened and confirmed this session — the plan-writer should read
each one and add it to the protected list only if it actually fits the
criterion above, rather than protecting it on suspicion alone.

## Storage: a Postgres counter table

```sql
CREATE TABLE rate_limit_counters (
  user_id      TEXT        NOT NULL,
  route_key    TEXT        NOT NULL,   -- e.g. 'mf-lookup', 'distributor-lookup'
  window_secs  INT         NOT NULL,   -- distinguishes the two tiers below (600 or 86400)
  window_start TIMESTAMPTZ NOT NULL,   -- truncated to the window boundary
  count        INT         NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, route_key, window_secs, window_start)
);
```

Reuses `lib/db.js`'s existing pool — no new service, no new env vars, no
new account to manage. Considered and rejected: Upstash Redis (genuinely
faster and edge-compatible, but a new service to sign up for and manage,
buying nothing noticeable at this app's actual traffic — a solo
distributor's client base, not a high-volume product; revisit if real
scale ever shows up) and an in-memory counter (fundamentally broken on
Vercel — each serverless invocation can land on a different instance with
its own memory, so counts wouldn't actually aggregate across requests).

## Limits — two tiers, per route per user

- **Burst: 100 requests / 10 minutes.** Generous enough that rapid normal
  use (building a 15-fund proposal, clicking through screener rows) never
  comes close; a scripted loop hits it within seconds.
- **Sustained: 1,500 requests / day.** Catches a slow-drip scraper
  deliberately staying under the burst threshold (e.g. one request every
  few seconds around the clock); no realistic day of real work approaches
  it.

Both tiers share one table (distinguished by `window_secs`) and one check
function — a request is limited if it exceeds **either** tier.

## `lib/rateLimit.js`

```js
import pool from '@/lib/db';

export const DEFAULT_TIERS = [
  { windowSeconds: 600,   limit: 100 },   // burst
  { windowSeconds: 86400, limit: 1500 },  // sustained
];

// Atomically increments the counter for each tier and returns the first
// tier exceeded, or { limited: false } if neither tier is over. Call
// AFTER auth() (needs a real userId) and BEFORE any external fetch or
// heavy DB work in the route -- the whole point is to reject before doing
// the expensive part, not after.
export async function checkRateLimit(userId, routeKey, tiers = DEFAULT_TIERS) {
  for (const { windowSeconds, limit } of tiers) {
    const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
    const { rows } = await pool.query(
      `INSERT INTO rate_limit_counters (user_id, route_key, window_secs, window_start, count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (user_id, route_key, window_secs, window_start)
       DO UPDATE SET count = rate_limit_counters.count + 1
       RETURNING count`,
      [userId, routeKey, windowSeconds, windowStart]
    );
    if (rows[0].count > limit) {
      const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000);
      return { limited: true, retryAfterSeconds };
    }
  }
  return { limited: false };
}

// Standard 429 body + Retry-After header for every protected route --
// one shared response shape so the client-side error handling is uniform.
export function rateLimitResponse({ retryAfterSeconds }) {
  const mins  = Math.ceil(retryAfterSeconds / 60);
  const label = mins < 60 ? `${mins} minute${mins === 1 ? '' : 's'}` : `${Math.ceil(mins / 60)} hour${Math.ceil(mins / 60) === 1 ? '' : 's'}`;
  return Response.json(
    {
      error: `You're doing that too fast — try again in ${label}. If this seems wrong, contact support at contact@getabundance.in.`,
      retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}
```

## Exemption: admin and distributor roles

The check is skipped entirely for `session.user.role === 'admin' ||
session.user.role === 'distributor'` — the app owner's own staff accounts,
trusted, not the abuse surface this feature targets. Every protected route
gets this shape:

```js
const session = await auth();
if (!session?.user?.id) return Response.json({ error: 'Unauthorised' }, { status: 401 });
if (session.user.role !== 'admin' && session.user.role !== 'distributor') {
  const rl = await checkRateLimit(session.user.id, 'mf-lookup');
  if (rl.limited) return rateLimitResponse(rl);
}
// ... existing route logic unchanged below this point
```

## Client-side handling

Each protected route's caller needs to surface a `429` distinctly from a
generic failure — check `res.status === 429` and show the server's
`error` message as-is (it's already written to be shown directly to a
user) rather than a generic "something went wrong." Exact UI treatment
(toast vs. inline message) follows whatever pattern each calling
component already uses for its other error states — this is a per-call-site
implementation detail for the plan, not an architectural decision.

## Cleanup

`rate_limit_counters` rows older than both windows are dead weight.
Extended into the existing daily cron
(`scripts/send_lifecycle_emails.mjs`, already runs once a day via
`.github/workflows/lifecycle-emails.yml`) as one more block, reusing its
existing pool connection rather than a new script/workflow:

```sql
DELETE FROM rate_limit_counters WHERE window_start < NOW() - INTERVAL '2 days';
```

## Error handling / edge cases

- A route's own upstream call fails for unrelated reasons (e.g. AMFI is
  down) after passing the rate-limit check: unchanged, existing
  error-handling in that route applies — the rate limiter only ever adds
  an early rejection path, never touches existing failure modes.
- Two concurrent requests from the same user at the exact same instant:
  the `ON CONFLICT ... DO UPDATE` is atomic at the database row level, so
  both increments land correctly with no lost updates or double-counting
  race.
- A user is right at the boundary between two windows: fixed windows
  (not sliding) mean a burst of activity spanning a window boundary could
  in theory allow slightly more than the nominal limit in a short span
  (e.g. 100 requests just before a 10-minute boundary, then 100 more just
  after). Accepted for v1 — the daily tier still bounds total abuse
  regardless, and a sliding-window implementation is meaningfully more
  complex for a marginal precision gain not worth it at this app's scale.

## Testing

- `lib/rateLimit.js`'s `checkRateLimit`/`rateLimitResponse` are pure
  enough to unit test against a mocked `pool.query` (matching this repo's
  plain Node + `assert` convention, no framework) — cover: under the
  limit (not limited), exactly at the limit (not limited — the check is
  `count > limit`, not `>=`), one over (limited, correct tier reported),
  and the retry-after/label formatting at a few boundary values (59s,
  61s, 3599s, 3601s).
- Manual verification: hit a protected route (e.g. `/api/distributor?arn=`)
  more than 100 times in quick succession from a signed-in test client
  account and confirm the 429 lands with a sensible message; confirm an
  admin/distributor account never gets limited under the same load.

## Out of scope (this sub-project)

- IP-based limiting — every candidate route already requires a signed-in
  session, so the risk is per-account abuse, not anonymous traffic; adding
  IP tracking on top would protect against a threat model that doesn't
  apply here.
- Sliding-window precision (see edge case above).
- Any change to the trial mechanism (sub-project 1) — the two are
  independent; the rate limiter applies identically regardless of plan
  tier, including to trial users.
- Auditing/protecting the five not-yet-confirmed candidate routes listed
  above — flagged for the plan to investigate and decide, not pre-decided
  here.
