// tests/proposalShareToken.test.js
//
// Unit tests for lib/proposalShareToken.js's token generation and the
// idempotent ensure-token helper (using a lightweight fake pool instead of
// a live database).
// Run with: node tests/proposalShareToken.test.js

const assert = require('assert');
const { generateShareToken, ensureShareToken } = require('../lib/proposalShareToken');

console.log('=== Running Proposal Share Token Unit Tests ===\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${e.message}`);
    failed++;
  }
}

async function main() {
  await test('generateShareToken returns a non-empty base64url string', () => {
    const token = generateShareToken();
    assert.strictEqual(typeof token, 'string');
    assert.ok(token.length > 0);
    assert.ok(/^[A-Za-z0-9_-]+$/.test(token), `token contains non-base64url characters: ${token}`);
  });

  await test('generateShareToken returns a different value on each call', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    assert.notStrictEqual(a, b);
  });

  await test('ensureShareToken returns the existing token without writing, if one is already set', async () => {
    const calls = [];
    const fakePool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        // COALESCE keeps the pre-existing value in the DB and returns it,
        // regardless of the candidate token passed in as $1.
        return { rows: [{ share_token: 'existing-token' }] };
      },
    };
    const token = await ensureShareToken(fakePool, 'proposal-1');
    assert.strictEqual(token, 'existing-token');
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].sql.trim().startsWith('UPDATE'));
  });

  await test('ensureShareToken generates and persists a new token when none is set', async () => {
    const calls = [];
    const fakePool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        // COALESCE(share_token, $1) writes and returns the newly-generated
        // candidate token ($1) when the column was NULL.
        return { rows: [{ share_token: params[0] }] };
      },
    };
    const token = await ensureShareToken(fakePool, 'proposal-2');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(token));
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].sql.includes('COALESCE'));
    assert.strictEqual(calls[0].params[0], token);
    assert.strictEqual(calls[0].params[1], 'proposal-2');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
