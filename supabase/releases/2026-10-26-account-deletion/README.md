# Release: account deletion (Clerk + Supabase; RevenueCat untouched)

Project `bgtrfxwviqdewyloncdq`. Prepared 2026-10-26. **Not deployed, migration not applied.**

## What ships

| Piece | Source | How |
|---|---|---|
| Migration `20261026000000_account_deletion_guard` | `supabase/migrations/` (copied byte-identical into `release-workdir/`) | `db push` from `release-workdir/` |
| `delete-account` Edge Function | `supabase/functions/delete-account/` | deploy from the project root, **after** the migration |
| App (deletion wording, store subscription link) | `components/settings/AccountDialogs.tsx`, `lib/account-deletion.ts`, `lib/i18n.ts` | normal app release |
| Privacy Policy (English and Malay) | `lib/legal/privacy-policy.ts`, `privacy-policy.ms.ts` | ships with the app — **legal review required first** |
| Runbook | `docs/account-deletion-runbook.md` | — |

`release-workdir/` holds production's nine applied migrations plus `20261026000000` only. The pending
`20261021000000` (invoice-edit guard) and `20261025000000` (booking-form entitlement) are not included.
`tests/account-deletion-guard.test.cjs` runs against exactly these files and fails if any differs from
`supabase/migrations/`.

This migration replaces an earlier draft with the same version number (a manual RevenueCat erasure
queue, commit `b855f32`). That draft was never applied anywhere, so no erasure requests existed.

## Behaviour after release

Storage → database (booking forms included) → PostHog (if configured) → the account is recorded in
`deleted_accounts` (writes refused from then on, from any role) → Clerk user → final sweep.
Success (`{ deleted: true }`) only after the data and the login are both gone; a failure after the
data was removed returns `dataDeleted: true`. RevenueCat is never called. The released app reads
`deleted: true` exactly as before.

## Deployment steps (in order)

**Privacy Policy first.** The policy in the released app and on `bookflow.expo.app` (dated
2026-09-15) says deletion removes "your subscription record with RevenueCat". Once this function is
live that is untrue. Publish the approved policy (web export) before step 3, and ship it in the next
app build.

0. **Backup.** The project lists no physical backups (PITR off). Take a database backup first
   (e.g. `supabase db dump --linked` for schema and data, stored securely — it contains customer
   data). Storage objects are not part of a database backup; this migration does not touch them.
1. `supabase db push --workdir supabase/releases/2026-10-26-account-deletion/release-workdir --dry-run`
   must list only `20261026000000_account_deletion_guard.sql`. (Recreate the link file if missing:
   `mkdir -p <workdir>/supabase/.temp && cp supabase/.temp/project-ref <workdir>/supabase/.temp/`.)
   If `20261025000000` has been applied by then, copy it into `release-workdir/supabase/migrations/`
   first, or the CLI will refuse the unknown remote version.
2. Run it without `--dry-run`.
3. `supabase functions deploy delete-account --project-ref bgtrfxwviqdewyloncdq --use-api`.
   **Not before step 2:** without the migration every deletion stops at `deletion_record` after the
   data step — retryable, but deletion would not complete.
4. Smoke test: `POST` with no token → `401 missing_token`. Then delete a **throwaway test account**
   created in the production app: expect "Account deleted", the account gone in Clerk, and one row in
   `public.deleted_accounts` with both dates set.

### Migration history afterwards

`20261026000000` will be applied with older migrations still pending. Apply those later with
`supabase db push --include-all` once they are authorised; check `supabase migration list` first.

## Recovery

| Situation | Effect | Action |
|---|---|---|
| Function deployed before the migration | Deletions stop after removing data (`deletion_record`), login kept | Apply the migration, then users retry; or redeploy the previous function |
| Function must be rolled back | Deletion refused again (previous v2 refuses the public RevenueCat key up front) | `git worktree add ../bookflow-22bfe24 22bfe24 && supabase functions deploy delete-account --workdir ../bookflow-22bfe24 --project-ref bgtrfxwviqdewyloncdq --use-api` |
| Migration must be undone | Guards and `record_account_deletion` removed; deletion function restored | `psql "<db-url>" --single-transaction -v ON_ERROR_STOP=1 -f supabase/releases/2026-10-26-account-deletion/rollback/20261026_rollback.sql` (or the SQL editor), then `supabase migration repair --status reverted 20261026000000`. Roll the function back too. `deleted_accounts` is kept |

## Open items

- Legal review of the Privacy Policy changes (English and Malay) before release, including the
  booking forms and quotations section and the retention wording.
- Sign in with Apple token revocation is not implemented (see the runbook).
- PostHog deletion needs its keys configured to run.
