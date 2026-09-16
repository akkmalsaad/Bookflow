const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function loadModule() {
  const file = path.join(__dirname, '..', 'lib', 'support-messages.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Math });
  return exports;
}

const {
  SUPPORT_TOPICS,
  FEEDBACK_CATEGORIES,
  MESSAGE_MIN_LENGTH,
  MESSAGE_MAX_LENGTH,
  validateSupportMessage,
  classifySubmitError,
  isDuplicateSubmission,
  createSubmissionId,
} = loadModule();

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260915000000_create_support_requests_and_user_feedback.sql'),
  'utf8',
);

test('a choice and a real message are both required', () => {
  assert.equal(validateSupportMessage(null, 'The invoice link will not open.'), 'optionRequired');
  assert.equal(validateSupportMessage('booking', ''), 'messageRequired');
  assert.equal(validateSupportMessage('booking', '    \n  '), 'messageRequired');
  assert.equal(validateSupportMessage('booking', 'help'), 'messageTooShort');
  assert.equal(validateSupportMessage('booking', 'The invoice link will not open.'), null);
});

test('whitespace never counts toward the length limits', () => {
  const padded = `   ${'a'.repeat(MESSAGE_MIN_LENGTH - 1)}   `;
  assert.equal(validateSupportMessage('other', padded), 'messageTooShort');
  assert.equal(validateSupportMessage('other', ` ${'a'.repeat(MESSAGE_MIN_LENGTH)} `), null);
  assert.equal(validateSupportMessage('other', 'a'.repeat(MESSAGE_MAX_LENGTH)), null);
  assert.equal(validateSupportMessage('other', 'a'.repeat(MESSAGE_MAX_LENGTH + 1)), 'messageTooLong');
});

test('raw database errors are reduced to user-safe outcomes', () => {
  assert.equal(classifySubmitError({ code: 'P0001', message: 'rate_limited' }), 'rateLimited');
  assert.equal(classifySubmitError({ code: '42501', message: 'new row violates row-level security policy' }), 'unavailable');
  assert.equal(classifySubmitError(undefined), 'unavailable');
});

test('a retried submission that was already stored counts as sent', () => {
  assert.equal(isDuplicateSubmission({ code: '23505' }), true);
  assert.equal(isDuplicateSubmission({ code: '42501' }), false);
  assert.equal(isDuplicateSubmission(null), false);
});

test('submission ids are valid v4 UUIDs the database accepts', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (let i = 0; i < 50; i += 1) assert.match(createSubmissionId(), uuid);
  assert.notEqual(createSubmissionId(), createSubmissionId());
});

test('client option lists match the database check constraints', () => {
  for (const topic of SUPPORT_TOPICS) assert.ok(migration.includes(`'${topic}'`), `${topic} missing from migration`);
  for (const category of FEEDBACK_CATEGORIES) assert.ok(migration.includes(`'${category}'`), `${category} missing from migration`);
  assert.ok(migration.includes(`between ${MESSAGE_MIN_LENGTH} and ${MESSAGE_MAX_LENGTH}`));
});

test('users can never update, delete or read other people’s messages', () => {
  assert.equal(/grant[^;]*\b(update|delete)\b[^;]*\bto authenticated/i.test(migration), false);
  assert.equal(/grant select on table public\.user_feedback/i.test(migration), false);
  assert.match(migration, /revoke all on table public\.support_requests from anon, authenticated;/);
  assert.match(migration, /revoke all on table public\.user_feedback from anon, authenticated;/);
  // Owner, status and timestamps are never client-writable.
  for (const grant of migration.match(/grant insert \(([^)]*)\)/gi) ?? []) {
    assert.equal(/\b(user_id|status|created_at|updated_at)\b/.test(grant), false, grant);
  }
  assert.equal((migration.match(/enable row level security/g) ?? []).length, 2);
});
