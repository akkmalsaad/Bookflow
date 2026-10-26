# Release: account deletion with tracked RevenueCat erasure

Project `bgtrfxwviqdewyloncdq`. Prepared 2026-10-26. **Not deployed, migration not applied.**

## What ships

| Piece | Source | How |
|---|---|---|
| Migration `20261026000000_revenuecat_erasure_queue` | `supabase/migrations/` (copied byte-identical into `release-workdir/`) | `db push` from `release-workdir/` |
| `delete-account` Edge Function | `supabase/functions/delete-account/` | deploy from the project root, **after** the migration |
| App (deletion messages, store subscription link) | `components/settings/AccountDialogs.tsx`, `lib/account-deletion.ts`, `lib/i18n.ts` | normal app release |
| Admin runbook | `docs/account-deletion-runbook.md` | — |

`release-workdir/` holds production's nine applied migrations plus `20261026000000` only. The pending
`20261021000000` (invoice-edit guard) and `20261025000000` (booking-form entitlement) are not included.
`tests/account-deletion-erasure.test.cjs` runs against exactly these files and fails if any differs
from `supabase/migrations/`.

## Behaviour after release

1. The Clerk token is verified (unchanged). The body is never read.
2. A `revenuecat_erasure_requests` row is opened **before anything is deleted** (one per account; a
   retry reuses it). If it cannot be written, nothing is deleted: `500 erasure_request`.
3. Storage, database (now including booking forms explicitly), PostHog; then the Clerk user.
   A failure before the Clerk step keeps the login so the user can retry; after the data is gone the
   response says `dataDeleted: true`.
4. The request is marked `account_deleted`; from then on no role can write that user's rows again.
5. RevenueCat: with the current public key, **no call is made**; the request stays pending for the
   dashboard (see the runbook). With a v1 secret key it would be deleted via the API and completed.
6. Response: `{ deleted: true, revenuecat: { status: 'pending', deadline }, reference }`. Released
   app versions read `deleted: true` as success (the account and data are gone); the new app shows
   "Your BookFlow account and business data have been deleted. Your RevenueCat subscription record is
   scheduled for deletion within 30 days.", the App Store subscription note, a link to Apple's
   subscription settings and the deletion reference.

## Deployment steps (in order)

0. **Backup.** The project lists no physical backups (PITR off). Take one before step 2.
1. `supabase db push --workdir supabase/releases/2026-10-26-account-deletion/release-workdir --dry-run`
   must list only `20261026000000_revenuecat_erasure_queue.sql`.
   (Recreate the link file first if missing:
   `mkdir -p <workdir>/supabase/.temp && cp supabase/.temp/project-ref <workdir>/supabase/.temp/`.)
   If `20261025000000` has been applied by then, copy it into `release-workdir/supabase/migrations/`
   first, or the CLI will refuse the unknown remote version.
2. Run it without `--dry-run`.
3. `supabase functions deploy delete-account --project-ref bgtrfxwviqdewyloncdq --use-api`.
   **Not before step 2:** without the migration every deletion fails at `erasure_request` (safely —
   nothing is deleted — but deletion would not work).
4. Smoke test: `POST` with no token → `401 missing_token`. Then, with a **throwaway test account**
   created in the production app, delete it from the app: expect the scheduled-deletion message and
   one `pending` row in `bookflow_admin.revenuecat_erasure_queue()`. Erase that test customer in the
   RevenueCat dashboard and complete it per the runbook.

### Migration history afterwards

`20261026000000` will be applied with older migrations still pending. Apply those later with
`supabase db push --include-all` once they are authorised; check `supabase migration list` first.

## Recovery

| Situation | Effect | Action |
|---|---|---|
| Function deployed, migration not applied | Every deletion refused, nothing deleted | Apply the migration, or redeploy the previous function |
| Function must be rolled back | Deletion refused again (previous v2 refuses the public key) | `git worktree add ../bookflow-22bfe24 22bfe24 && supabase functions deploy delete-account --workdir ../bookflow-22bfe24 --project-ref bgtrfxwviqdewyloncdq --use-api` |
| Migration must be undone | Guards, functions and admin schema removed; deletion function restored | `psql "<db-url>" --single-transaction -v ON_ERROR_STOP=1 -f supabase/releases/2026-10-26-account-deletion/rollback/20261026_rollback.sql`, then `supabase migration repair --status reverted 20261026000000`. **The queue table is kept**: finish or export owed erasures first. Roll the function back too |

## Open items

- Sign in with Apple token revocation is not implemented (see the runbook's known gaps).
- The Privacy Policy says deletion removes the RevenueCat record; it does not state the 30-day window.
  Have it reviewed and updated (English and Malay).
