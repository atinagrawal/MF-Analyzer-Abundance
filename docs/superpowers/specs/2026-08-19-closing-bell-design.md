# Closing Bell (Design)

## Goal

Mirror the ritual some broking apps have of ringing a bell at market close
(3:30 PM IST) — but only for a visitor who is actually, actively on the
site at that moment, with the tab in the foreground. Not a push
notification, not a catch-up reminder for someone who opens the site
later — a live, in-the-moment touch for whoever happens to be there.

Explicit constraints from the user:
- Weekends are off (NSE doesn't trade Sat/Sun).
- The site already has an NSE market-holiday calendar (`/market-watch`'s
  `HolidaysCalendar`, sourced from NSE's own `holiday-master` API) — this
  feature must respect the same list, so it never rings on a real market
  holiday that happens to fall on a weekday.
- "Only if the tab is actually open, not if the app is sitting in
  background" — the sound must never play for a backgrounded tab.
- Live only, no catch-up — someone opening the site for the first time at,
  say, 4 PM on a trading day sees nothing special. Missed is missed.

## Background — what already exists

- `app/api/market-watch/route.js` already fetches NSE's
  `holiday-master?type=trading` API as one of several `Promise.allSettled`
  calls, R2-cached 5 minutes, and returns `holidays: [{ date, day, desc }]`
  where `date` is NSE's own `tradingDate` string (format `DD-Mon-YYYY`,
  e.g. `26-Jan-2026` — confirmed via `app/market-watch/page.js`'s
  `HolidaysCalendar`, which already splits this same field on `-` to
  render day/month). This feature needs only the holiday dates, not the
  rest of that route's much heavier live-index/gainers/losers payload, and
  needs a far longer cache TTL (this list is published once a year and
  rarely amended) — see Data source below for why a new, smaller route is
  worth it rather than reusing `/api/market-watch` directly.
- No shared toast/notification component exists anywhere in this app yet
  (checked) — this feature's toast is small and self-contained, not meant
  to become shared infrastructure.
- No audio assets exist in `public/` — see Sound below for why this
  doesn't need one.
- `app/layout.js` already mounts site-wide, always-present pieces (the
  Razorpay `checkout.js` `<Script>`, etc.) — this feature's component
  slots into the same root layout, so it's present on every page
  regardless of which one a visitor is on.

## Data source

New `GET /api/market-holidays` route: a thin wrapper making the exact
same NSE `holiday-master?type=trading` call `/api/market-watch` already
makes, returning just `{ holidays: [{ date, day, desc }] }`. R2-cached
with a 24-hour TTL (vs. market-watch's 5 minutes) — this data is
effectively static day-to-day, and this route needs to be cheap to call
from literally every page load site-wide, which the heavier
market-watch payload isn't suited for.

**Fetch failure handling**: if this route (or the underlying NSE call)
fails, the feature fails *loose*, not closed — it still treats an
ordinary Monday–Friday as a trading day, just without holiday awareness
for that session. Worst case on a genuine holiday during an outage: the
bell rings when the market wasn't actually open, which is rare (holiday
fetch failures should be uncommon) and harmless (nothing depends on this
signal being authoritative — it's a delight feature, not a trading
signal). The alternative (fail closed, don't ring without confirmation)
would silently disable the feature on real trading days whenever the
fetch has a bad moment, which is a worse failure mode for something this
low-stakes.

## Trigger logic

All four conditions must hold, checked on a recurring poll (every ~15s)
that only runs while the tab is visible:

1. **Trading day** — today, in IST, is Monday–Friday and its date isn't
   in the fetched holiday list (matched as IST calendar dates, not
   browser-local dates — see IST computation below).
2. **At or just past close, within a grace window** — current IST time is
   `>= 15:30:00` and `< 15:30:00 + GRACE_WINDOW_MS` (default 2 minutes,
   tunable). This is what implements "live only, no catch-up" without
   needing a single fragile precise-to-the-second timer: a poll that
   happens to land at 15:30:07 because of normal `setInterval` jitter
   still counts as live; a tab opened fresh at 4 PM is far outside the
   window and does nothing.
3. **Tab visible right now** — `document.visibilityState === 'visible'`.
   A poll tick while the tab is hidden simply does nothing this tick; no
   special handling fires when the tab becomes visible again later
   (see Error handling / edge cases for the specific case of returning
   to a *visible* tab just outside the grace window).
4. **Hasn't already rung today** — a dated flag in `localStorage`
   (IST calendar date, e.g. `2026-08-19`), checked before ringing and set
   immediately after, so navigating between pages after it's rung doesn't
   re-trigger it, and it naturally resets the next trading day without
   needing any cleanup logic.

**IST computation**: never trust the visitor's local timezone (a visitor
could be anywhere). Compute IST wall-clock time explicitly via
`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', hour12: false,
year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
minute: '2-digit', second: '2-digit' })`, formatted then parsed into
`{ dateStr, hour, minute, second }` — used for both the trading-day date
match and the 15:30 comparison.

## Sound

No external audio file. Synthesized directly with the Web Audio API on
the client: a short 2–3 note chime (e.g. two layered oscillators — a
bright fundamental + a harmonic overtone — each with a quick attack and
an exponential-decay envelope over roughly 1–1.5 seconds), loosely
mimicking a real bell strike, played twice in quick succession. This
avoids bundling or sourcing a licensed audio asset entirely — a
well-trodden pattern for a UI "ding," and it means the whole feature
ships as code, not an asset dependency.

Wrapped in try/catch: constructing/starting an `AudioContext` can throw
or be blocked in some browser/embed contexts (e.g. certain in-app
browsers, or a page that's never had a user gesture at all). A failure
here is caught and only skips the sound — the toast still shows, and
nothing else on the page is affected.

## Toast

A small, self-built, fixed-position element (top-right), auto-dismissing
after ~5 seconds, styled with this app's existing design tokens (`var(--
g1)`, `var(--border)`, etc. — matching the visual language already used
elsewhere, e.g. `components/CasMemberMerge.jsx`'s panel styling).
Content: "🔔 Market Closed for the day" (v1 copy — no live index data
pulled in, to keep this feature fully decoupled from market-watch's
heavier payload; a future version could add today's Nifty move if
wanted, out of scope here).

## Component structure

- `lib/closingBell.js` — pure decision logic, no DOM/React/fetch:
  - `computeIstNow()` → `{ dateStr, hour, minute, second }` from
    `Intl.DateTimeFormat`.
  - `isTradingDay(dateStr, weekdayIndex, holidayDates)` → boolean (weekday
    check + holiday-list membership).
  - `shouldRingNow({ istNow, weekdayIndex, holidayDates, lastRungDateStr,
    graceWindowMs })` → boolean, composing all four trigger conditions
    (visibility is NOT part of this pure function — that's a DOM concern
    the component checks itself before even calling this).
- `components/ClosingBell.jsx` — the actual client component:
  - On mount: fetches `/api/market-holidays` once, stores the holiday
    date list in state/ref.
  - Sets up a `setInterval` (~15s) that, only when
    `document.visibilityState === 'visible'`, calls `shouldRingNow(...)`
    with the current holiday list and `localStorage`'s last-rung date;
    if true, plays the chime, shows the toast, and writes today's IST
    date to `localStorage`.
  - Renders nothing but the ephemeral toast — no visual footprint
    normally.
  - Mounted once in `app/layout.js`, alongside the existing site-wide
    elements.

## Error handling / edge cases

- Holiday fetch fails: see Data source above (fail loose).
- `AudioContext` throws/blocked: see Sound above (skip sound only, toast
  still shows).
- A tab that's open and visible from before 3:30, stays visible through
  3:30: rings normally, exactly the primary case this feature is for.
- A tab backgrounded exactly at 3:30, user returns at 3:31 (1 minute
  later, so still inside the default 2-minute grace window): per the
  trigger logic above, this DOES ring — the grace window doesn't
  distinguish "was this tab visible continuously since before 3:30" from
  "just became visible again," it only checks whether the *current*
  moment is within the window and the tab is *currently* visible. This is
  a deliberate simplification: the alternative (tracking visibility
  continuity precisely) adds real complexity for a live/backgrounded
  distinction the user's own instruction doesn't actually require —
  their stated rule is "don't ring while backgrounded," which this
  satisfies exactly (nothing plays while hidden), not "must have been
  visible for the entire preceding period."
- A tab backgrounded at 3:30, user returns at 3:35 (outside the grace
  window): does not ring — same outcome as opening fresh at 3:35, which
  matches "live only, no catch-up."
- Multiple tabs of the site open simultaneously: each tab independently
  polls and independently checks `localStorage`, which is shared across
  tabs in the same browser — the first tab to ring writes the flag, so a
  second tab's next poll tick (within ~15s) sees it's already rung and
  stays silent. A narrow race (both tabs poll within the same ~15s window
  before either writes the flag) could ring in two tabs at once — accepted
  as a rare, harmless cosmetic edge case, not worth a cross-tab lock for a
  delight feature.
- Server-rendering / no `window`: the component only runs its effects
  client-side (`useEffect`), so this is a non-issue — same pattern every
  other client-only feature in this app already follows.

## Testing

`lib/closingBell.js`'s `isTradingDay` and `shouldRingNow` are pure
functions, testable against a mocked "now" and a mocked holiday list
with plain Node + `assert` (`tests/closingBell.test.js`), matching this
repo's established convention (e.g. `tests/resolveFolioPan.test.js`).
Cover: a normal weekday before/at/after 15:30, a weekend day, a weekday
that's in the holiday list, the grace-window boundary (just inside vs.
just outside), and the already-rung-today gate.

`components/ClosingBell.jsx` itself (DOM/timer/AudioContext-dependent)
is manually verified: temporarily shrink the grace window and/or mock
the clock during dev testing to confirm a visible tab rings once, a
backgrounded tab doesn't, and navigating pages after ringing doesn't
re-trigger it.

## Out of scope

- A mute/opt-out control (e.g. a bell icon toggle in the Navbar) — not
  requested; can be added later if the sound turns out to be unwanted by
  some visitors.
- Live index data in the toast (e.g. today's Nifty close %) — v1 copy is
  static, deliberately decoupled from the heavier market-watch payload.
- A market-open "opening bell" equivalent — only closing was requested.
- Special/reduced trading sessions (e.g. Diwali Muhurat trading, which
  runs a short EXTRA evening session on an otherwise-closed day) — NSE's
  regular holiday-master list already marks that day as a holiday (since
  it's not a normal trading day), so this feature correctly treats it as
  a non-trading day and stays silent, which is the safe default; ringing
  a SECOND, differently-timed bell for Muhurat's own special close time
  is a distinct, much rarer feature not requested here.
