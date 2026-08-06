// tests/proposalEmail.test.js
//
// Unit tests for lib/proposalEmail.js's branded share-email builder and
// email-format validator.
// Run with: node tests/proposalEmail.test.js

const assert = require('assert');
const { buildProposalShareEmail, isPlausibleEmail } = require('../lib/proposalEmail');

console.log('=== Running Proposal Email Unit Tests ===\n');

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

test('isPlausibleEmail accepts a normal address', () => {
  assert.strictEqual(isPlausibleEmail('client@example.com'), true);
});

test('isPlausibleEmail rejects malformed or empty input', () => {
  assert.strictEqual(isPlausibleEmail('not-an-email'), false);
  assert.strictEqual(isPlausibleEmail('missing-domain@'), false);
  assert.strictEqual(isPlausibleEmail(''), false);
  assert.strictEqual(isPlausibleEmail(null), false);
  assert.strictEqual(isPlausibleEmail(undefined), false);
});

test('buildProposalShareEmail subject names the advisor', () => {
  const { subject } = buildProposalShareEmail({
    advisorName: 'Atin Kumar Agrawal',
    shareUrl: 'https://mfcalc.getabundance.in/proposal-studio/view/abc',
    proposalType: 'sip',
  });
  assert.strictEqual(subject, 'Atin Kumar Agrawal has shared an investment proposal with you');
});

test('buildProposalShareEmail html and text both include the share link', () => {
  const url = 'https://mfcalc.getabundance.in/proposal-studio/view/xyz123';
  const { html, text } = buildProposalShareEmail({ advisorName: 'A', clientName: 'B', shareUrl: url, proposalType: 'lumpsum' });
  assert.ok(html.includes(url), 'html missing share URL');
  assert.ok(text.includes(url), 'text missing share URL');
});

test('buildProposalShareEmail escapes HTML-unsafe characters in names', () => {
  const { html } = buildProposalShareEmail({ advisorName: 'A & <B>', clientName: 'C & <D>', shareUrl: 'https://x', proposalType: 'sip' });
  assert.ok(!html.includes('<B>'), 'advisor name was not escaped');
  assert.ok(!html.includes('<D>'), 'client name was not escaped');
  assert.ok(html.includes('A &amp; &lt;B&gt;'));
});

test('buildProposalShareEmail omits the contact line when advisor has no phone/email', () => {
  const { html, text } = buildProposalShareEmail({ advisorName: 'A', shareUrl: 'https://x', proposalType: 'sip' });
  assert.ok(!html.includes('Questions?'));
  assert.ok(!text.includes('Questions?'));
});

test('buildProposalShareEmail includes the contact line when advisor has phone/email', () => {
  const { html, text } = buildProposalShareEmail({ advisorName: 'A', advisorPhone: '9999999999', advisorEmail: 'a@x.com', shareUrl: 'https://x', proposalType: 'sip' });
  assert.ok(html.includes('9999999999') && html.includes('a@x.com'));
  assert.ok(text.includes('9999999999') && text.includes('a@x.com'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
