// tests/diagnosticRedaction.test.js
//
// Unit test suite for lib/diagnosticRedaction.js:
// 1. Math parity & epsilon guard for computeWeightedOverlap
// 2. Structural projection & weight rounding in sanitizeDiagnosticPayload
// 3. 5-Phase pre-flight assertion gate in assertZeroPII
//
// Run with: node tests/diagnosticRedaction.test.js

const assert = require('assert');

(async () => {
  const {
    computeWeightedOverlap,
    sanitizeDiagnosticPayload,
    assertZeroPII,
    PrivacyViolationError,
  } = await import('../lib/diagnosticRedaction.js');

  console.log('=== Running diagnosticRedaction Unit Tests ===\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${e.message}`);
      failed++;
    }
  }

  // ── 1. computeWeightedOverlap Math Parity ─────────────────────────────────

  test('computeWeightedOverlap: 2-fund equal portfolio (50%/50%, overlap 30%) returns 30.0%', () => {
    const schemes = [{ weightPct: 50 }, { weightPct: 50 }];
    const overlapMatrix = [
      [100, 30],
      [30, 100],
    ];
    const result = computeWeightedOverlap(schemes, overlapMatrix);
    assert.strictEqual(result, 30.0);
  });

  test('computeWeightedOverlap: 3-fund equal portfolio (33.33% each, overlaps 30%, 10%, 20%) returns 20.0%', () => {
    const w = 100 / 3;
    const schemes = [{ weightPct: w }, { weightPct: w }, { weightPct: w }];
    const overlapMatrix = [
      [100, 30, 10],
      [30, 100, 20],
      [10, 20, 100],
    ];
    const result = computeWeightedOverlap(schemes, overlapMatrix);
    assert.strictEqual(result, 20.0);
  });

  test('computeWeightedOverlap: single-fund portfolio (N=1) returns null', () => {
    const schemes = [{ weightPct: 100 }];
    const overlapMatrix = [[100]];
    const result = computeWeightedOverlap(schemes, overlapMatrix);
    assert.strictEqual(result, null);
  });

  test('computeWeightedOverlap: near-all-in-one fund (99.999% and dust) triggers denominator epsilon guard -> returns null', () => {
    // Both other holdings round to 0.00%
    const schemes = [
      { weightPct: 100 },
      { weightPct: 0.0 },
      { weightPct: 0.0 },
    ];
    const overlapMatrix = [
      [100, 25, 30],
      [25, 100, 15],
      [30, 15, 100],
    ];
    const result = computeWeightedOverlap(schemes, overlapMatrix);
    assert.strictEqual(result, null);
  });

  // ── 2. sanitizeDiagnosticPayload ──────────────────────────────────────────

  test('sanitizeDiagnosticPayload: whitelist projection rounds weightPct to 2 decimals and sums to 100.00%', () => {
    const rawHoldings = [
      { amfiCode: 122640, name: 'Parag Parikh Flexi Cap Fund - Regular Plan - Growth', category: 'Flexi Cap Fund', value: 333333, folio: '12345/67', pan: 'ABCDE1234F' },
      { amfiCode: 101762, name: 'HDFC Flexi Cap Fund - Growth Option', category: 'Flexi Cap Fund', value: 333333, folio: '98765432', pan: 'ABCDE1234F' },
      { amfiCode: 118989, name: 'SBI Bluechip Fund - Regular Plan', category: 'Large Cap Fund', value: 333334, folio: '11223344', pan: 'ABCDE1234F' },
    ];

    const payload = sanitizeDiagnosticPayload(rawHoldings, { title: 'Retirement Portfolio' });

    assert.strictEqual(payload.title, 'Retirement Portfolio');
    assert.strictEqual(payload.schemes.length, 3);
    assert.strictEqual(payload.schemes[0].amfiCode, 122640);
    assert.strictEqual(payload.schemes[0].name, 'Parag Parikh Flexi Cap Fund');
    assert.strictEqual(payload.schemes[0].category, 'Flexi Cap Fund');
    assert.strictEqual(typeof payload.schemes[0].weightPct, 'number');

    // Verify folio, value, and pan were completely dropped
    assert.strictEqual(payload.schemes[0].folio, undefined);
    assert.strictEqual(payload.schemes[0].pan, undefined);
    assert.strictEqual(payload.schemes[0].value, undefined);

    // Sum should be 100.00%
    const sum = payload.schemes.reduce((acc, s) => acc + s.weightPct, 0);
    assert.strictEqual(Math.round(sum * 100) / 100, 100.0);
  });

  // ── 3. assertZeroPII Pre-Flight Gate ──────────────────────────────────────

  test('assertZeroPII: clean sanitized payload passes assertion', () => {
    const validPayload = {
      title: 'Mutual Fund Portfolio Diagnostic',
      schemes: [
        { amfiCode: 122640, name: 'Parag Parikh Flexi Cap Fund', category: 'Flexi Cap Fund', weightPct: 50.0 },
        { amfiCode: 101762, name: 'HDFC Flexi Cap Fund', category: 'Flexi Cap Fund', weightPct: 50.0 },
      ],
      metrics: {
        schemesCount: 2,
        weightedOverlapPct: 31.0,
        quartileDistribution: { q1Count: 1, q2Count: 1, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 65.0, mid: 25.0, small: 10.0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [
          { amfiCodeA: 122640, amfiCodeB: 101762, overlapPct: 31.0 },
        ],
      },
      asOfDate: '2026-09-20',
    };

    const context = { investorName: 'Puneet Agarwal', familyName: 'Agarwal Family' };
    assert.strictEqual(assertZeroPII(validPayload, context), true);
  });

  test('assertZeroPII: decimal percentages do not false-positive as folios', () => {
    const payloadWithDecimals = {
      title: 'Diagnostic Test',
      schemes: [
        { amfiCode: 122640, name: 'Scheme A', category: 'Large Cap', weightPct: 33.33 },
        { amfiCode: 101762, name: 'Scheme B', category: 'Mid Cap', weightPct: 33.33 },
        { amfiCode: 118989, name: 'Scheme C', category: 'Small Cap', weightPct: 33.34 },
      ],
      metrics: {
        schemesCount: 3,
        weightedOverlapPct: 14.28,
        quartileDistribution: { q1Count: 1, q2Count: 1, q3Count: 1, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 50.0, mid: 30.0, small: 20.0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [],
      },
      asOfDate: '2026-09-20',
    };

    assert.strictEqual(assertZeroPII(payloadWithDecimals), true);
  });

  test('assertZeroPII: word-boundary name check catches full word but ignores AMC substrings (e.g. Sam in Samco)', () => {
    const payload = {
      title: 'Diagnostic Test',
      schemes: [
        // "Samco" contains "Sam", "Rajasthan" contains "Raj"
        { amfiCode: 140000, name: 'Samco Flexi Cap Fund', category: 'Flexi Cap', weightPct: 50.0 },
        { amfiCode: 140001, name: 'Rajasthan Energy Fund', category: 'Thematic', weightPct: 50.0 },
      ],
      metrics: {
        schemesCount: 2,
        weightedOverlapPct: 15.0,
        quartileDistribution: { q1Count: 1, q2Count: 1, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 70.0, mid: 20.0, small: 10.0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [],
      },
      asOfDate: '2026-09-20',
    };

    // User name has "Sam" and "Raj"
    const context = { investorName: 'Sam Raj' };
    // Should NOT throw because "Samco" and "Rajasthan" have word boundaries
    assert.strictEqual(assertZeroPII(payload, context), true);

    // But if "Sam" appears as an isolated word anywhere in the payload:
    payload.title = 'Diagnostic for Sam';
    assert.throws(
      () => assertZeroPII(payload, context),
      (err) => err instanceof PrivacyViolationError && err.message.includes('Personal name token "sam"')
    );
  });

  test('assertZeroPII: Phase 1 blocks injected PAN', () => {
    const tainted = {
      title: 'Diagnostic Test ABCDE1234F',
      schemes: [{ amfiCode: 122640, name: 'Scheme A', category: 'Large Cap', weightPct: 100.0 }],
      metrics: {
        schemesCount: 1,
        weightedOverlapPct: null,
        quartileDistribution: { q1Count: 1, q2Count: 0, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 100.0, mid: 0, small: 0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [],
      },
      asOfDate: '2026-09-20',
    };

    assert.throws(
      () => assertZeroPII(tainted),
      (err) => err instanceof PrivacyViolationError && err.message.includes('PAN pattern detected')
    );
  });

  test('assertZeroPII: Phase 2 blocks injected folio number', () => {
    const tainted = {
      title: 'Folio 9876543210 Diagnostic',
      schemes: [{ amfiCode: 122640, name: 'Scheme A', category: 'Large Cap', weightPct: 100.0 }],
      metrics: {
        schemesCount: 1,
        weightedOverlapPct: null,
        quartileDistribution: { q1Count: 1, q2Count: 0, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 100.0, mid: 0, small: 0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [],
      },
      asOfDate: '2026-09-20',
    };

    assert.throws(
      () => assertZeroPII(tainted),
      (err) => err instanceof PrivacyViolationError && err.message.includes('Folio number pattern detected')
    );
  });

  test('assertZeroPII: Phase 4 blocks monetary values exceeding 100 in non-exempt fields', () => {
    const tainted = {
      title: 'Diagnostic Test',
      schemes: [{ amfiCode: 122640, name: 'Scheme A', category: 'Large Cap', weightPct: 500000 }], // 5 Lakhs!
      metrics: {
        schemesCount: 1,
        weightedOverlapPct: null,
        quartileDistribution: { q1Count: 1, q2Count: 0, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 100.0, mid: 0, small: 0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [],
      },
      asOfDate: '2026-09-20',
    };

    assert.throws(
      () => assertZeroPII(tainted),
      (err) => err instanceof PrivacyViolationError && err.message.includes('Percentage field "weightPct"')
    );
  });

  test('assertZeroPII: Phase 4 allows integer counts > 100 in INTEGER_EXEMPT_KEYS', () => {
    const largeFamily = {
      title: 'Diagnostic Test',
      schemes: [{ amfiCode: 122640, name: 'Scheme A', category: 'Large Cap', weightPct: 100.0 }],
      metrics: {
        schemesCount: 145, // > 100, exempt!
        weightedOverlapPct: 25.0,
        quartileDistribution: { q1Count: 120, q2Count: 15, q3Count: 5, q4Count: 5, unrankedCount: 0 }, // > 100, exempt!
        mCapAllocation: { large: 80.0, mid: 15.0, small: 5.0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [
          { amfiCodeA: 122640, amfiCodeB: 101762, overlapPct: 42.0 },
        ],
      },
      asOfDate: '2026-09-20',
    };

    assert.strictEqual(assertZeroPII(largeFamily), true);
  });

  test('assertZeroPII: Phase 5 blocks forbidden currency keys like "cost" or "units"', () => {
    const tainted = {
      title: 'Diagnostic Test',
      schemes: [{ amfiCode: 122640, name: 'Scheme A', category: 'Large Cap', weightPct: 100.0, units: 45.2 }],
      metrics: {
        schemesCount: 1,
        weightedOverlapPct: null,
        quartileDistribution: { q1Count: 1, q2Count: 0, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 100.0, mid: 0, small: 0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [],
      },
      asOfDate: '2026-09-20',
    };

    assert.throws(
      () => assertZeroPII(tainted),
      (err) => err instanceof PrivacyViolationError && err.message.includes('Forbidden account/currency key "units"')
    );
  });

  test('assertZeroPII: Phase 5 blocks unauthorized keys', () => {
    const tainted = {
      title: 'Diagnostic Test',
      secretNote: 'Confidential Client Data',
      schemes: [{ amfiCode: 122640, name: 'Scheme A', category: 'Large Cap', weightPct: 100.0 }],
      metrics: {
        schemesCount: 1,
        weightedOverlapPct: null,
        quartileDistribution: { q1Count: 1, q2Count: 0, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 100.0, mid: 0, small: 0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [],
      },
      asOfDate: '2026-09-20',
    };

    assert.throws(
      () => assertZeroPII(tainted),
      (err) => err instanceof PrivacyViolationError && err.message.includes('Unauthorized key "secretNote"')
    );
  });

  test('sanitizeDiagnosticPayload: filters out negative-value accounting reversals and zero balances', () => {
    const rawHoldings = [
      { amfiCode: 122640, name: 'Parag Parikh Flexi Cap Fund', category: 'Flexi Cap Fund', value: 100000 },
      { amfiCode: 101762, name: 'Cancelled Transaction Reversal', category: 'Flexi Cap Fund', value: -500 }, // CAS correction artifact
      { amfiCode: 118989, name: 'Redeemed Zero Balance Folio', category: 'Large Cap Fund', value: 0 },
    ];

    const payload = sanitizeDiagnosticPayload(rawHoldings);
    assert.strictEqual(payload.schemes.length, 1);
    assert.strictEqual(payload.schemes[0].amfiCode, 122640);
    assert.strictEqual(payload.schemes[0].weightPct, 100.0);
    assert.strictEqual(assertZeroPII(payload), true);
  });

  test('assertZeroPII: 7-digit forward-compatible amfiCode does not false-positive as folio', () => {
    const payload7Digit = {
      title: 'Diagnostic Test',
      schemes: [{ amfiCode: 1234567, name: 'Future Scheme', category: 'Large Cap', weightPct: 100.0 }], // 7-digit AMFI code!
      metrics: {
        schemesCount: 1,
        weightedOverlapPct: null,
        quartileDistribution: { q1Count: 1, q2Count: 0, q3Count: 0, q4Count: 0, unrankedCount: 0 },
        mCapAllocation: { large: 100.0, mid: 0, small: 0, unclassified: 0, derivatives: 0 },
        topOverlapPairs: [
          { amfiCodeA: 1234567, amfiCodeB: 101762, overlapPct: 25.0 },
        ],
      },
      asOfDate: '2026-09-20',
    };

    assert.strictEqual(assertZeroPII(payload7Digit), true);
  });

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
})();
