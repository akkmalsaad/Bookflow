const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const edgeFunction = read('supabase/functions/delete-account/index.ts');
const migration = read('supabase/migrations/20260916000000_account_deletion.sql');
const clientRequest = read('lib/account-deletion.ts');
const deleteFlow = read('components/settings/AccountDialogs.tsx');
const config = read('supabase/config.toml');

test('the deleted user comes only from the verified token, never the request body', () => {
  assert.equal(/request\.json\(|await request\.text\(|formData\(/.test(edgeFunction), false);
  assert.match(edgeFunction, /jwtVerify\(token/);
  assert.match(edgeFunction, /algorithms: \['RS256'\]/);
  // Impersonation sessions are refused.
  assert.match(edgeFunction, /if \(payload\.act\) return null;/);
  assert.match(clientRequest, /body: '\{\}'/);
});

test('the database deletion function is callable by the service role only', () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.delete_bookflow_account_data\(text\) from public, anon, authenticated;/,
  );
  assert.match(migration, /grant execute on function public\.delete_bookflow_account_data\(text\) to service_role;/);
});

test('every user-owned BookFlow table is covered by the deletion', () => {
  const tables = new Set();
  for (const file of fs.readdirSync(path.join(root, 'supabase', 'migrations'))) {
    const sql = read(`supabase/migrations/${file}`);
    for (const match of sql.matchAll(/create table if not exists public\.(\w+)/g)) {
      const body = sql.slice(match.index, sql.indexOf(');', match.index));
      if (/\buser_id\b/.test(body)) tables.add(match[1]);
    }
  }
  assert.ok(tables.size >= 4);
  for (const table of tables) {
    assert.match(migration, new RegExp(`delete from public\\.${table} where user_id = p_user_id;`), `${table} is not deleted`);
  }
});

test('the Clerk user is deleted only after storage and database cleanup', () => {
  const order = ['await deleteStorage(', 'await deleteDatabaseRows(', 'await deleteRevenueCatCustomer(', 'await deleteClerkUser('];
  const positions = order.map((call) => edgeFunction.indexOf(call));
  positions.forEach((position, index) => assert.ok(position > 0, `${order[index]} missing`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  // Already-deleted resources count as success, so a retry can finish the job.
  assert.match(edgeFunction, /response\.status !== 404\) throw new DeletionError\(\{ step: 'clerk'/);
});

test('no privileged secrets or raw errors reach the client', () => {
  for (const source of [clientRequest, deleteFlow]) {
    assert.equal(/SERVICE_ROLE|CLERK_SECRET|REVENUECAT_SECRET|sk_live|sk_test/.test(source), false);
  }
  assert.equal(/error\.message|errors\[0\]\.message/.test(edgeFunction), false);
  assert.match(config, /\[functions\.delete-account\]\s*\n#[^\n]*\nverify_jwt = false/);
});

test('the final button stays locked until DELETE is typed, and failures never show success', () => {
  assert.match(deleteFlow, /DELETE_CONFIRMATION_WORD = 'DELETE'/);
  assert.match(deleteFlow, /const canDelete = confirmation\.trim\(\) === DELETE_CONFIRMATION_WORD && !isDeleting;/);
  assert.match(deleteFlow, /disabled=\{!canDelete\}/);
  const failureBranch = deleteFlow.slice(deleteFlow.indexOf('if (!deleted) {'), deleteFlow.indexOf('showSnackbar('));
  assert.match(failureBranch, /resumeWorkspaceSync\(\);/);
  assert.match(failureBranch, /return;/);
});
