const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const edgeFunction = read('supabase/functions/delete-account/index.ts');
// The deletion function is redefined whenever a new user-owned table is added, so the latest
// migration that defines it is the one in force.
const migration = fs
  .readdirSync(path.join(root, 'supabase', 'migrations'))
  .sort()
  .map((file) => read(`supabase/migrations/${file}`))
  .filter((sql) => sql.includes('create or replace function public.delete_bookflow_account_data'))
  .pop();
const clientRequest = read('lib/account-deletion.ts');
const deleteFlow = read('components/settings/AccountDialogs.tsx');
const config = read('supabase/config.toml');

test('the deleted user comes only from the verified token, never the request body', () => {
  assert.equal(/request\.json\(|await request\.text\(|formData\(/.test(edgeFunction), false);
  assert.match(edgeFunction, /jwtVerify\(token/);
  assert.match(edgeFunction, /algorithms: \['RS256'\]/);
  // Impersonation sessions are refused.
  assert.match(edgeFunction, /if \(payload\.act\) return \{ ok: false, reason: 'impersonation'/);
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
  // Covered means deleted explicitly by the function, or removed by an ON DELETE CASCADE from the
  // workspace row the function deletes.
  const tables = new Map();
  for (const file of fs.readdirSync(path.join(root, 'supabase', 'migrations'))) {
    const sql = read(`supabase/migrations/${file}`);
    for (const match of sql.matchAll(/create table if not exists public\.(\w+)/g)) {
      const body = sql.slice(match.index, sql.indexOf(');', match.index));
      if (/\buser_id\b/.test(body)) {
        tables.set(match[1], /\buser_id\b[^,]*references public\.bookflow_workspaces\(user_id\)\s+on delete cascade/.test(body));
      }
    }
  }
  assert.ok(tables.size >= 4);
  const deletesWorkspace = /delete from public\.bookflow_workspaces where user_id = p_user_id;/.test(migration);
  assert.ok(deletesWorkspace, 'the workspace row is not deleted');
  for (const [table, cascades] of tables) {
    const explicit = new RegExp(`delete from public\\.${table} where user_id = p_user_id;`).test(migration);
    assert.ok(explicit || cascades, `${table} is neither deleted nor cascaded from the workspace`);
  }
});

test('the erasure request comes first, then storage and database, then the Clerk user', () => {
  // The RevenueCat erasure owed is recorded before anything is removed; if it cannot be, nothing is.
  const order = ['await requestErasure(', 'await deleteStorage(', 'await deleteDatabaseRows(', 'await deleteClerkUser(', "await recordErasure(admin, userId, 'account_deleted')", 'await eraseRevenueCatCustomer('];
  // The order that matters is the request handler's; helpers defined above it are not steps.
  const handler = edgeFunction.slice(edgeFunction.indexOf('Deno.serve('));
  const positions = order.map((call) => handler.indexOf(call));
  positions.forEach((position, index) => assert.ok(position > 0, `${order[index]} missing`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  // Already-deleted resources count as success, so a retry can finish the job.
  assert.match(edgeFunction, /response\.status !== 404\) throw new DeletionError\(\{ step: `clerk_/);
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
  const failureBranch = deleteFlow.slice(deleteFlow.indexOf('if (!deleted) {'), deleteFlow.indexOf('Alert.alert('));
  assert.match(failureBranch, /if \(!dataDeleted\) resumeWorkspaceSync\(\);/);
  assert.match(failureBranch, /setFailed\(dataDeleted \? 'partial' : 'failed'\);/);
  assert.match(failureBranch, /return;/);
  assert.equal(/deleteAccount\.done/.test(failureBranch), false, 'no success wording on a failure');
});

test('success names exactly what is done and what is still scheduled, with the store subscription note', () => {
  const success = deleteFlow.slice(deleteFlow.indexOf('const erasure: RevenueCatErasure'), deleteFlow.indexOf('await cancelBookingReminderNotifications()'));
  assert.match(success, /t\(erasure\.status === 'completed' \? 'deleteAccount\.done\.complete' : 'deleteAccount\.done\.pending'\)/);
  assert.match(success, /t\('deleteAccount\.done\.subscription'\)/);
  assert.match(success, /onPress: openStoreSubscriptions/);
  // A lost answer with the account verifiably gone is reported as pending, never as complete.
  assert.match(success, /result\.outcome === 'deleted' \? result\.revenuecat : \{ status: 'pending' \}/);
  assert.match(deleteFlow, /'https:\/\/apps\.apple\.com\/account\/subscriptions'/);
  assert.match(deleteFlow, /Linking\.openURL\(STORE_SUBSCRIPTIONS_URL\)/);
  const { loadTs } = require('./helpers/load-ts.cjs');
  const i18n = loadTs('lib/i18n.ts');
  assert.equal(i18n.translate('en', 'deleteAccount.done.pending'), 'Your BookFlow account and business data have been deleted. Your RevenueCat subscription record is scheduled for deletion within 30 days.');
  for (const key of ['deleteAccount.done.pending', 'deleteAccount.done.complete', 'deleteAccount.done.subscription', 'deleteAccount.done.reference', 'deleteAccount.partial.title', 'deleteAccount.partial.body', 'deleteAccount.record.revenuecat', 'deleteAccount.record.forms', 'deleteAccount.subscription.manageStore', 'deleteAccount.subscription.openFailed']) {
    const en = i18n.translate('en', key);
    const ms = i18n.translate('ms-MY', key);
    assert.ok(en !== key && ms !== key && en !== ms, key);
  }
});
