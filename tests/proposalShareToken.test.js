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
        if (sql.trim().startsWith('SELECT')) return { rows: [{ share_token: 'existing-token' }] };
        throw new Error('UPDATE should not have been called when a token already exists');
      },
    };
    const token = await ensureShareToken(fakePool, 'proposal-1');
    assert.strictEqual(token, 'existing-token');
    assert.strictEqual(calls.length, 1);
  });

  await test('ensureShareToken generates and persists a new token when none is set', async () => {
    const calls = [];
    const fakePool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.trim().startsWith('SELECT')) return { rows: [{ share_token: null }] };
        if (sql.trim().startsWith('UPDATE')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const token = await ensureShareToken(fakePool, 'proposal-2');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(token));
    assert.strictEqual(calls.length, 2);
    assert.ok(calls[1].sql.trim().startsWith('UPDATE'));
    assert.deepStrictEqual(calls[1].params, [token, 'proposal-2']);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
