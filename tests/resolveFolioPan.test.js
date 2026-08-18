import assert from 'node:assert';
import { pickFolioResolutions } from '../lib/resolveFolioPan.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}`); console.log(`  ${e.message}`); failed++; }
}

test('manual override takes priority over history', () => {
  const result = pickFolioResolutions(
    ['F1'],
    { F1: 'AAAAA1111A' },
    { F1: ['BBBBB2222B'] }
  );
  assert.deepStrictEqual(result, { F1: { pan: 'AAAAA1111A', source: 'manual' } });
});

test('resolves via a single consistent historical sighting', () => {
  const result = pickFolioResolutions(
    ['F1'],
    {},
    { F1: ['AAAAA1111A'] }
  );
  assert.deepStrictEqual(result, { F1: { pan: 'AAAAA1111A', source: 'history' } });
});

test('resolves via multiple identical historical sightings (same PAN, several statements)', () => {
  const result = pickFolioResolutions(
    ['F1'],
    {},
    { F1: ['AAAAA1111A', 'AAAAA1111A', 'AAAAA1111A'] }
  );
  assert.deepStrictEqual(result, { F1: { pan: 'AAAAA1111A', source: 'history' } });
});

test('conflicting historical PANs for the same folio are left unresolved', () => {
  const result = pickFolioResolutions(
    ['F1'],
    {},
    { F1: ['AAAAA1111A', 'BBBBB2222B'] }
  );
  assert.deepStrictEqual(result, {});
});

test('a folio with no override and no history is omitted, not an error', () => {
  const result = pickFolioResolutions(['F1'], {}, {});
  assert.deepStrictEqual(result, {});
});

test('resolves each requested folio independently', () => {
  const result = pickFolioResolutions(
    ['F1', 'F2', 'F3'],
    { F1: 'AAAAA1111A' },
    { F2: ['BBBBB2222B'], F3: ['CCCCC3333C', 'DDDDD4444D'] }
  );
  assert.deepStrictEqual(result, {
    F1: { pan: 'AAAAA1111A', source: 'manual' },
    F2: { pan: 'BBBBB2222B', source: 'history' },
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
