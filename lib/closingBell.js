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
    hourCycle: 'h23',
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
