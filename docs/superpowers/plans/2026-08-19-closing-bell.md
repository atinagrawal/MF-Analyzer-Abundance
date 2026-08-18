# Closing Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ring a short synthesized bell (sound + toast) for any visitor who is actively, visibly on the site at 3:30 PM IST on an NSE trading day — live only, no catch-up, never while the tab is backgrounded.

**Architecture:** A pure decision-logic module (`lib/closingBell.js`) computes IST wall-clock time and whether "now" should ring, given a holiday list and the last-rung date — no DOM, no fetch, fully unit-testable. A thin, long-cached API route (`/api/market-holidays`) supplies the holiday list, decoupled from the much heavier `/api/market-watch` payload. A small client component (`components/ClosingBell.jsx`), mounted once in the root layout, fetches the holiday list once, polls every ~15s (only while the tab is visible), and on a positive `shouldRingNow()` result plays a Web-Audio-synthesized chime and shows a brief toast.

**Tech Stack:** Next.js 16 App Router (client component + Route Handler), `Intl.DateTimeFormat` for timezone-correct IST computation, Web Audio API (no external audio asset), Cloudflare R2 via `lib/r2.js` for server-side caching, plain Node + `assert` for the one pure-logic test file.

## Global Constraints

- **Market close time**: 15:30:00 IST, exactly. Not configurable per-market — this app only covers NSE equity cash market hours.
- **Grace window**: 2 minutes (`120000` ms) by default — a poll landing at or after 15:30:00 IST and before 15:30:00 + grace window IST rings; before or after does not. This is what implements "live only, no catch-up."
- **Tab must be visible right now** (`document.visibilityState === 'visible'`) for a ring to ever fire — no exceptions, no catch-up when a hidden tab becomes visible later than the grace window allows.
- **Once per IST calendar day**: after ringing, no further ring until the IST date changes, tracked via `localStorage`.
- **Fail loose** on a holiday-data fetch failure (client or server): treat today as an ordinary weekday if it can't be confirmed as a holiday, rather than silently disabling the feature.
- **No external audio file** — the chime is synthesized with the Web Audio API.
- **IST computation must not depend on the visitor's own timezone** — always compute wall-clock IST explicitly via `Intl.DateTimeFormat(..., { timeZone: 'Asia/Kolkata' })`.
- Work directly on `main`, no feature branches. Stage only the exact files each commit touches — never a broad `git add -A`/`git add .`. No Claude/AI co-author signature in any commit, ever.
- Testing convention: plain Node + `assert`, `node tests/<file>.test.js`, no framework.

---

### Task 1: `lib/closingBell.js` — pure trading-day/timing decision logic

**Files:**
- Create: `lib/closingBell.js`
- Create: `tests/closingBell.test.js`

**Interfaces:**
- Produces: `computeIstNow(now = new Date())` → `{ dateStr: 'YYYY-MM-DD', weekday: 0-6 (0=Sun, matching `Date.prototype.getUTCDay()`), hour: 0-23, minute: 0-59, second: 0-59 }`, all computed in IST regardless of the caller's own timezone.
- Produces: `isTradingDay(istNow, holidayDates)` → boolean. `holidayDates` is `string[]` of `'YYYY-MM-DD'` dates.
- Produces: `shouldRingNow({ istNow, holidayDates, lastRungDateStr, graceWindowMs = DEFAULT_GRACE_WINDOW_MS })` → boolean.
- Produces: `DEFAULT_GRACE_WINDOW_MS` (exported constant, `120000`).
- Consumed by: Task 3's `components/ClosingBell.jsx` (imports `computeIstNow`, `shouldRingNow` via `@/lib/closingBell`).

- [ ] **Step 1: Write the failing tests**

Create `tests/closingBell.test.js`:

```js
import assert from 'node:assert';
import { isTradingDay, shouldRingNow, DEFAULT_GRACE_WINDOW_MS } from '../lib/closingBell.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}`); console.log(`  ${e.message}`); failed++; }
}

// weekday: 0=Sun ... 6=Sat, matching Date.prototype.getUTCDay()
const wed = { dateStr: '2026-08-19', weekday: 3, hour: 15, minute: 30, second: 0 };
const sat = { dateStr: '2026-08-22', weekday: 6, hour: 15, minute: 30, second: 0 };
const sun = { dateStr: '2026-08-23', weekday: 0, hour: 15, minute: 30, second: 0 };

test('isTradingDay: true for an ordinary weekday not on the holiday list', () => {
  assert.strictEqual(isTradingDay(wed, []), true);
});

test('isTradingDay: false for Saturday', () => {
  assert.strictEqual(isTradingDay(sat, []), false);
});

test('isTradingDay: false for Sunday', () => {
  assert.strictEqual(isTradingDay(sun, []), false);
});

test('isTradingDay: false for a weekday that IS on the holiday list', () => {
  assert.strictEqual(isTradingDay(wed, ['2026-08-19']), false);
});

test('isTradingDay: true for a weekday not matching a DIFFERENT holiday date', () => {
  assert.strictEqual(isTradingDay(wed, ['2026-01-26']), true);
});

test('shouldRingNow: true exactly at 15:30:00 on a trading day, never rung yet', () => {
  const istNow = { ...wed, hour: 15, minute: 30, second: 0 };
  assert.strictEqual(shouldRingNow({ istNow, holidayDates: [], lastRungDateStr: null }), true);
});

test('shouldRingNow: true just inside the default 2-minute grace window (15:31:59)', () => {
  const istNow = { ...wed, hour: 15, minute: 31, second: 59 };
  assert.strictEqual(shouldRingNow({ istNow, holidayDates: [], lastRungDateStr: null }), true);
});

test('shouldRingNow: false just outside the default 2-minute grace window (15:32:01)', () => {
  const istNow = { ...wed, hour: 15, minute: 32, second: 1 };
  assert.strictEqual(shouldRingNow({ istNow, holidayDates: [], lastRungDateStr: null }), false);
});

test('shouldRingNow: false before market close (15:29:59)', () => {
  const istNow = { ...wed, hour: 15, minute: 29, second: 59 };
  assert.strictEqual(shouldRingNow({ istNow, holidayDates: [], lastRungDateStr: null }), false);
});

test('shouldRingNow: false long after close (opening the site at 4 PM -- no catch-up)', () => {
  const istNow = { ...wed, hour: 16, minute: 0, second: 0 };
  assert.strictEqual(shouldRingNow({ istNow, holidayDates: [], lastRungDateStr: null }), false);
});

test('shouldRingNow: false on a weekend even at exactly 15:30', () => {
  assert.strictEqual(shouldRingNow({ istNow: sat, holidayDates: [], lastRungDateStr: null }), false);
});

test('shouldRingNow: false on a market holiday even at exactly 15:30', () => {
  assert.strictEqual(shouldRingNow({ istNow: wed, holidayDates: ['2026-08-19'], lastRungDateStr: null }), false);
});

test('shouldRingNow: false if already rung today', () => {
  assert.strictEqual(shouldRingNow({ istNow: wed, holidayDates: [], lastRungDateStr: '2026-08-19' }), false);
});

test('shouldRingNow: true if last rung was a DIFFERENT day', () => {
  assert.strictEqual(shouldRingNow({ istNow: wed, holidayDates: [], lastRungDateStr: '2026-08-18' }), true);
});

test('shouldRingNow: respects a custom graceWindowMs', () => {
  const istNow = { ...wed, hour: 15, minute: 30, second: 30 }; // 30s after close
  assert.strictEqual(shouldRingNow({ istNow, holidayDates: [], lastRungDateStr: null, graceWindowMs: 10_000 }), false);
  assert.strictEqual(shouldRingNow({ istNow, holidayDates: [], lastRungDateStr: null, graceWindowMs: 60_000 }), true);
});

test('DEFAULT_GRACE_WINDOW_MS is 2 minutes', () => {
  assert.strictEqual(DEFAULT_GRACE_WINDOW_MS, 120_000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/closingBell.test.js`
Expected: fails immediately — `lib/closingBell.js` doesn't exist yet (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Implement `lib/closingBell.js`**

```js
/**
 * lib/closingBell.js
 *
 * Pure decision logic for the closing-bell feature -- no DOM, no fetch,
 * no timers, so it's directly unit-testable. components/ClosingBell.jsx
 * owns everything DOM-related (visibility checks, the actual poll
 * interval, localStorage reads/writes, playing the sound) and calls
 * these functions with plain values.
 *
 * See docs/superpowers/specs/2026-08-19-closing-bell-design.md.
 */

const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTE = 30;
export const DEFAULT_GRACE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// Current wall-clock time in IST, regardless of the visitor's own
// timezone -- { dateStr: 'YYYY-MM-DD', weekday: 0-6 (0=Sun), hour, minute, second }.
export function computeIstNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  // Date-only parse (no time-of-day) is safely timezone-independent --
  // 'YYYY-MM-DD' is parsed as UTC midnight by every JS engine, and
  // getUTCDay() reads it back without any local-timezone reinterpretation.
  const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();

  return {
    dateStr,
    weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// holidayDates: string[] of 'YYYY-MM-DD' dates (the caller normalizes
// NSE's own 'DD-Mon-YYYY' tradingDate format into this shape server-side
// -- see app/api/market-holidays/route.js).
export function isTradingDay(istNow, holidayDates) {
  const isWeekend = istNow.weekday === 0 || istNow.weekday === 6;
  if (isWeekend) return false;
  return !holidayDates.includes(istNow.dateStr);
}

// Everything the DOM-facing component needs to decide, in one call.
// lastRungDateStr: whatever's currently in localStorage (or null/undefined).
export function shouldRingNow({ istNow, holidayDates, lastRungDateStr, graceWindowMs = DEFAULT_GRACE_WINDOW_MS }) {
  if (!isTradingDay(istNow, holidayDates)) return false;
  if (lastRungDateStr === istNow.dateStr) return false;

  const closeMs = (MARKET_CLOSE_HOUR * 3600 + MARKET_CLOSE_MINUTE * 60) * 1000;
  const nowMs = (istNow.hour * 3600 + istNow.minute * 60 + istNow.second) * 1000;
  const elapsed = nowMs - closeMs;

  return elapsed >= 0 && elapsed < graceWindowMs;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node tests/closingBell.test.js`
Expected: `15 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/closingBell.js tests/closingBell.test.js
git commit -m "feat(closing-bell): add pure trading-day/timing decision logic"
```

---

### Task 2: `GET /api/market-holidays` — thin, long-cached holiday list

**Files:**
- Create: `app/api/market-holidays/route.js`

**Interfaces:**
- Consumes: `r2Get`, `r2Put` from `lib/r2.js` (already exists, do not modify).
- Produces: `GET /api/market-holidays` → `{ holidays: ['YYYY-MM-DD', ...] }`, always HTTP 200 (never an error status — see Step 1's fail-loose behavior). Consumed by Task 3's `components/ClosingBell.jsx`.

- [ ] **Step 1: Implement the route**

Read `app/api/market-watch/route.js` in full first (already exists) — this route's `blobGet`/`blobPut`/TTL/stale-fallback shape is the exact pattern to mirror, adapted for a much longer TTL and a much smaller payload.

Create `app/api/market-holidays/route.js`:

```js
/**
 * app/api/market-holidays/route.js
 *
 * GET /api/market-holidays
 * Response: { holidays: ['YYYY-MM-DD', ...] }
 *
 * Thin, long-cached wrapper around the same NSE holiday-master call
 * app/api/market-watch/route.js already makes -- split out separately
 * because components/ClosingBell.jsx needs to load this on EVERY page
 * site-wide, and market-watch's full payload (live indices, gainers/
 * losers, FII/DII) is much heavier than this needs, with a much shorter
 * (5-min) TTL than this basically-static list warrants.
 *
 * Fails loose: if both the live NSE fetch AND the stale cache fallback
 * come up empty, this still returns 200 with an empty holidays array
 * (never an error status) -- an empty list still lets the client's
 * isTradingDay() correctly treat ordinary weekdays as trading days, it
 * just won't know about a specific holiday today. See
 * docs/superpowers/specs/2026-08-19-closing-bell-design.md's Data source
 * section for why this is the deliberate choice over failing closed.
 */

import { r2Get, r2Put } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_KEY = 'market-holidays/latest.json';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours -- this list is published once a year

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.nseindia.com/',
  'Accept-Language': 'en-IN,en;q=0.9',
};

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

// NSE's tradingDate field is 'DD-Mon-YYYY' (e.g. '26-Jan-2026') -- convert
// to 'YYYY-MM-DD' server-side so the client can match it against
// lib/closingBell.js's computeIstNow() output with plain string equality,
// no date-format parsing on the client at all.
function toIsoDate(nseDate) {
  const parts = (nseDate || '').split('-');
  if (parts.length !== 3) return null;
  const [dd, mon, yyyy] = parts;
  const mm = MONTHS[mon];
  if (!mm || !/^\d{1,2}$/.test(dd) || !/^\d{4}$/.test(yyyy)) return null;
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
}

async function fetchHolidays() {
  const res = await fetch('https://www.nseindia.com/api/holiday-master?type=trading', {
    headers: H,
    signal: AbortSignal.timeout(14_000),
  });
  if (!res.ok) throw new Error(`NSE holiday-master returned ${res.status}`);
  const data = await res.json();
  const holidays = (data.CM || [])
    .map(h => toIsoDate(h.tradingDate))
    .filter(Boolean);
  return { holidays, cached_at: new Date().toISOString() };
}

async function blobGet() {
  try { return await r2Get(BLOB_KEY); } catch { return null; }
}

async function blobPut(payload) {
  try { await r2Put(BLOB_KEY, JSON.stringify(payload)); } catch {}
}

export async function GET(req) {
  const bust = new URL(req.url).searchParams.has('bust');

  if (!bust) {
    const cached = await blobGet();
    if (cached?.cached_at && (Date.now() - new Date(cached.cached_at).getTime()) < TTL_MS) {
      return Response.json({ holidays: cached.holidays }, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } });
    }
  }

  try {
    const data = await fetchHolidays();
    blobPut(data);
    return Response.json({ holidays: data.holidays }, { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[market-holidays]', err.name, err.message);
    const stale = await blobGet();
    if (stale) {
      return Response.json({ holidays: stale.holidays }, { headers: { 'X-Cache': 'STALE', 'Cache-Control': 'no-store' } });
    }
    return Response.json({ holidays: [] }, { headers: { 'X-Cache': 'MISS-EMPTY', 'Cache-Control': 'no-store' } });
  }
}
```

- [ ] **Step 2: Verify**

Run `node --check app/api/market-holidays/route.js`. Then start the dev server (`npm run dev`) and confirm `curl http://localhost:3000/api/market-holidays` (or a browser visit) returns `{"holidays": [...]}` with a non-empty array of `YYYY-MM-DD` strings (assuming NSE's API is reachable from your network — if it isn't, an empty array with `X-Cache: MISS-EMPTY` is still a valid, correctly-handled result per the fail-loose design, not a bug).

- [ ] **Step 3: Commit**

```bash
git add app/api/market-holidays/route.js
git commit -m "feat(closing-bell): add thin, 24h-cached /api/market-holidays route"
```

---

### Task 3: `components/ClosingBell.jsx` — the component, its styling, and mounting it

**Files:**
- Create: `components/ClosingBell.jsx`
- Modify: `app/globals.css` (append a new CSS block)
- Modify: `app/layout.js`

**Interfaces:**
- Consumes: `computeIstNow`, `shouldRingNow` from `@/lib/closingBell` (Task 1). `GET /api/market-holidays` (Task 2), expected shape `{ holidays: string[] }`.
- Produces: default export `ClosingBell`, a self-contained component taking no props, safe to mount once anywhere in the tree (renders `null` except for its own ephemeral toast).

- [ ] **Step 1: Implement the component**

Create `components/ClosingBell.jsx`:

```jsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { computeIstNow, shouldRingNow } from '@/lib/closingBell';

const POLL_INTERVAL_MS = 15_000;
const LOCAL_STORAGE_KEY = 'mfcalc_closing_bell_last_rung';
const TOAST_DURATION_MS = 5_000;

// Two-note bell chime synthesized with the Web Audio API -- no external
// audio file (avoids bundling/licensing an asset). A bright fundamental +
// an inharmonic overtone per note, each with a quick exponential decay,
// played twice in quick succession to loosely mimic a real bell strike.
// See docs/superpowers/specs/2026-08-19-closing-bell-design.md's Sound
// section. The caller wraps this in try/catch -- AudioContext can throw
// or be blocked in some browser/embed contexts.
function playBellChime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();

  function strike(startTime) {
    const fundamental = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    fundamental.type = 'sine';
    fundamental.frequency.value = 880; // A5
    overtone.type = 'sine';
    overtone.frequency.value = 880 * 2.4; // inharmonic overtone -- bell-like, not a clean octave

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.3);

    fundamental.connect(gain);
    overtone.connect(gain);
    gain.connect(ctx.destination);

    fundamental.start(startTime);
    overtone.start(startTime);
    fundamental.stop(startTime + 1.4);
    overtone.stop(startTime + 1.4);
  }

  const now = ctx.currentTime;
  strike(now);
  strike(now + 0.55);

  // Let the tail ring out, then release the context.
  setTimeout(() => ctx.close().catch(() => {}), 2200);
}

export default function ClosingBell() {
  const [toastVisible, setToastVisible] = useState(false);
  const holidaysRef = useRef([]);
  const holidaysLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/market-holidays')
      .then(r => (r.ok ? r.json() : { holidays: [] }))
      .then(d => { if (!cancelled) holidaysRef.current = d.holidays || []; })
      .catch(() => { if (!cancelled) holidaysRef.current = []; }) // fail loose -- see spec's Data source section
      .finally(() => { if (!cancelled) holidaysLoadedRef.current = true; });

    function tick() {
      if (document.visibilityState !== 'visible') return;
      if (!holidaysLoadedRef.current) return; // don't guess before the holiday list has loaded at least once

      const istNow = computeIstNow();
      const lastRungDateStr = window.localStorage.getItem(LOCAL_STORAGE_KEY);

      if (shouldRingNow({ istNow, holidayDates: holidaysRef.current, lastRungDateStr })) {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, istNow.dateStr);
        try { playBellChime(); } catch { /* sound is best-effort -- toast still shows */ }
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), TOAST_DURATION_MS);
      }
    }

    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    // Also check immediately on mount, and whenever the tab regains
    // visibility -- catches the "tabbed back in during the live window"
    // case as fast as possible instead of waiting up to 15s for the next
    // poll. shouldRingNow()'s own conditions are the single source of
    // truth regardless of which of these triggers the check.
    tick();
    document.addEventListener('visibilitychange', tick);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  if (!toastVisible) return null;

  return (
    <div className="closing-bell-toast" role="status" aria-live="polite">
      🔔 Market Closed for the day
    </div>
  );
}
```

- [ ] **Step 2: Add the toast's CSS**

Read `app/globals.css`'s custom-property block (top of file, `--surface`, `--border`, `--text`, `--g1`, etc.) to confirm the exact token names before using them. Append this block to the end of `app/globals.css`:

```css
/* ── Closing Bell toast (components/ClosingBell.jsx) ─────────────────────── */
.closing-bell-toast {
  position: fixed;
  top: 84px;
  right: 20px;
  z-index: 9999;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-left: 4px solid var(--g1);
  border-radius: 10px;
  padding: 14px 20px;
  font-family: 'Raleway', sans-serif;
  font-size: .85rem;
  font-weight: 700;
  color: var(--text);
  box-shadow: var(--shadow-lg);
  animation: closing-bell-toast-in .35s ease-out, closing-bell-toast-out .35s ease-in 4.65s forwards;
}

@keyframes closing-bell-toast-in {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes closing-bell-toast-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
```

`top: 84px` is a starting estimate for clearing the Navbar — during Step 4's manual verification, visually confirm the toast doesn't overlap the Navbar on both desktop and mobile widths, and adjust this value if it does.

- [ ] **Step 3: Mount it in the root layout**

Read `app/layout.js` in full first (already exists). Add the import near its other component imports, and mount `<ClosingBell />` as a sibling near `<SpeedInsights />`:

```js
import ClosingBell from '@/components/ClosingBell';
```

```jsx
        <SpeedInsights />
        <ClosingBell />
```

(Insert `<ClosingBell />` immediately after the existing `<SpeedInsights />` line — read the surrounding JSX to confirm the exact insertion point, since this file may have been touched by unrelated work since it was last read.)

- [ ] **Step 4: Verify**

Run `npm run build` — must succeed. Then, with the dev server running (`npm run dev`), manually verify:
1. Open the site in a browser, open DevTools console, and confirm no errors from `ClosingBell`.
2. Temporarily test the ring path without waiting for real market close: in the browser console, run `localStorage.removeItem('mfcalc_closing_bell_last_rung')`, then temporarily edit `lib/closingBell.js`'s `MARKET_CLOSE_HOUR`/`MARKET_CLOSE_MINUTE` constants to a value a minute or two in the future (in IST), save (triggering a dev-server hot reload), and confirm within ~15s the chime plays and the toast appears — then revert those two constants back to `15`/`30` before committing.
3. While testing, switch to a different browser tab right before the test time and confirm the bell does NOT ring while backgrounded, then switch back within the grace window and confirm it DOES ring on return.
4. Confirm the toast visually clears the Navbar at both a desktop and a narrow (mobile) viewport width; adjust `top` in the CSS from Step 2 if it doesn't.

- [ ] **Step 5: Commit**

```bash
git add components/ClosingBell.jsx app/globals.css app/layout.js
git commit -m "feat(closing-bell): add the component (Web Audio chime + toast), mount site-wide"
```

---

## Self-Review Notes

- **Spec coverage**: trading-day check (Task 1), grace window (Task 1), tab-visibility gating (Task 3's `tick()` + `visibilitychange`), once-per-day gating (Task 1's `shouldRingNow` + Task 3's `localStorage`), IST computation (Task 1's `computeIstNow`), fail-loose on holiday-fetch failure (Task 2's empty-array-on-total-failure + Task 3's `.catch()`), no external audio file (Task 3's Web Audio synthesis), toast (Task 3), site-wide mount (Task 3 Step 3) — all covered.
- **Type/shape consistency**: `computeIstNow()`'s return shape (`dateStr`, `weekday`, `hour`, `minute`, `second`) is used identically in Task 1's tests and Task 3's component. `holidayDates` is `string[]` of `'YYYY-MM-DD'` everywhere (Task 1's `isTradingDay`/`shouldRingNow`, Task 2's route output, Task 3's `holidaysRef`) — no mismatched date formats anywhere in the chain.
- **Out-of-scope items from the spec** (mute toggle, live index data in the toast, an opening-bell equivalent, a separate Muhurat-trading bell) are correctly not represented by any task here, matching the spec's explicit Out of scope section.
