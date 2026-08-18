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
