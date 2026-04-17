/**
 * lib/pmsDate.js
 *
 * Computes the latest available APMI PMS data month.
 *
 * APMI publishes month N performance data in early month N+1 (~day 5).
 * The Vercel cron (0 2 5-12 * *) fetches it on days 5–12 of each month.
 *
 * Rule:
 *   today ≥ day 5  →  data for (current month − 1) is available
 *   today < day 5  →  cron hasn't run yet; use (current month − 2)
 *
 * Examples (at time of writing, April 13 2026):
 *   Apr 13 → March 2026  ✓  (cron ran Apr 5–12, fetched March data)
 *   Apr  3 → Feb   2026  ✓  (cron hasn't run yet)
 *   Jan  3 → Nov   2025  ✓  (wraps year correctly)
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * @param {Date} [now] - Override for testing. Defaults to current date.
 * @returns {{
 *   month: number,       // 1-indexed (1–12)
 *   year: number,
 *   asOnDate: string,    // "2026-3-31"  — format APMI API expects
 *   label: string,       // "March 2026"
 *   shortLabel: string,  // "Mar 2026"
 *   isoYearMonth: string // "2026-03"
 * }}
 */
export function getLatestPmsDataDate(now = new Date()) {
  let year  = now.getFullYear();
  let month = now.getMonth() - 1; // 0-indexed; one month back (APMI publication lag)

  // Before day 5: cron hasn't fetched this month's APMI update yet
  if (now.getDate() < 5) month -= 1;

  // Normalise when month goes negative (Jan edge case)
  while (month < 0) { month += 12; year -= 1; }

  const month1  = month + 1;                           // 1-indexed
  const lastDay = new Date(year, month1, 0).getDate(); // last calendar day of month

  return {
    month        : month1,
    year,
    asOnDate     : `${year}-${month1}-${lastDay}`,                   // "2026-3-31"
    label        : `${MONTH_NAMES[month]} ${year}`,                  // "March 2026"
    shortLabel   : `${MONTH_NAMES[month].slice(0, 3)} ${year}`,      // "Mar 2026"
    isoYearMonth : `${year}-${String(month1).padStart(2, '0')}`,     // "2026-03"
  };
}
