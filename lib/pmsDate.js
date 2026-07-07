/**
 * lib/pmsDate.js
 *
 * Computes the two most relevant APMI PMS data months.
 *
 * APMI publishes month N data gradually throughout month N+1 — different PMS
 * managers submit at different times. We fetch BOTH months concurrently and
 * show each strategy's most recently available data:
 *   - if the strategy appears in the latest month's APMI response → use it
 *   - otherwise fall back to the previous month's data
 *
 * Months:
 *   latest  = previous calendar month (may be partially populated)
 *   prev    = two months back (fully populated)
 *
 * Examples on July 8, 2026:
 *   latest  = June 2026   (some managers have reported, some haven't)
 *   prev    = May  2026   (fully reported, used as fallback)
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function makeMonthInfo(month0, year) {
  const month1  = month0 + 1;
  const lastDay = new Date(year, month1, 0).getDate();
  return {
    month        : month1,
    year,
    asOnDate     : `${year}-${month1}-${lastDay}`,
    label        : `${MONTH_NAMES[month0]} ${year}`,
    shortLabel   : `${MONTH_NAMES[month0].slice(0, 3)} ${year}`,
    isoYearMonth : `${year}-${String(month1).padStart(2, '0')}`,
  };
}

/**
 * Returns both the latest and previous APMI data months.
 * @param {Date} [now]
 * @returns {{ latest: MonthInfo, prev: MonthInfo }}
 */
export function getPmsDataMonths(now = new Date()) {
  let latestYear  = now.getFullYear();
  let latestMonth = now.getMonth() - 1; // 0-indexed; previous calendar month

  if (latestMonth < 0) { latestMonth += 12; latestYear -= 1; }

  let prevYear  = latestYear;
  let prevMonth = latestMonth - 1;
  if (prevMonth < 0) { prevMonth += 12; prevYear -= 1; }

  return {
    latest : makeMonthInfo(latestMonth, latestYear),
    prev   : makeMonthInfo(prevMonth,   prevYear),
  };
}

/**
 * Backward-compat alias used by layout.jsx for SEO metadata.
 * Returns only the latest month info.
 * @param {Date} [now]
 */
export function getLatestPmsDataDate(now = new Date()) {
  return getPmsDataMonths(now).latest;
}
