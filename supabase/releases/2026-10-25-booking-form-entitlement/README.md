# Release: booking-form submissions use the owner's current, verified plan

Project `bgtrfxwviqdewyloncdq`. Prepared 2026-10-25. **Not deployed.** The live issue is not fixed
until the steps below are done and the end-to-end test passes.

## What ships

| Piece | Source | How |
|---|---|---|
| Migration `20261025000000_booking_offer_verified_plan` | `supabase/migrations/` (copied, byte-identical, into `release-workdir/`) | `db push` from `release-workdir/` |
| `booking-public` Edge Function | `supabase/functions/booking-public/` + `supabase/functions/_shared/` | deploy from the project root |
| `entitlement-status` Edge Function (new) | `supabase/functions/entitlement-status/` + `_shared/` | deploy from the project root |
| Public booking page (web) | `app/booking-public.tsx`, `lib/i18n-workflows.ts` | your usual web export + EAS Hosting deploy |
| App update (paywall activation, owner notice) | `app/paywall.tsx`, `app/(tabs)/bookings.tsx`, `lib/pro-activation.ts` | normal app release (not part of this) |

**Not in this release:** `20261021000000_invoice_edit_guard` (pending in production, unrelated,
not authorised). `release-workdir/` holds production's nine applied migrations plus this one only,
so `db push` from there cannot apply it. `tests/booking-offer-verified-plan.test.cjs` runs against
exactly these files and fails if any differs from `supabase/migrations/`.

## Bundle contents

- `release-workdir/supabase/` — `config.toml` and the release migration set.
- `rollback/20261025_rollback.sql` — undoes the migration (sha256 `f77e33630d42a68c2618f88edf77ee96d53544fb84d4b84b19f600bf6b3fc59a`).
- `rollback/booking-public-v1-workdir/` — `booking-public` exactly as deployed before this release
  (downloaded 2026-10-25, version 1). `index.ts` sha256 `a9f10887603803f227f2e667e2b5df0b26f5e9b689b04c680f9dc1c922f20b7c`,
  `payload.ts` sha256 `e4fd5afcaded5002a21b4c71fc229c84daf88c132d9024cbf8c67716d18ba125`.
- `*/supabase/.temp/project-ref` — CLI link state, gitignored. On another machine recreate it:
  `mkdir -p <workdir>/supabase/.temp && cp supabase/.temp/project-ref <workdir>/supabase/.temp/`.

## Behaviour after release

- Each submit attempt checks the owner's entitlement with RevenueCat (`GET /v1/subscribers/:id`,
  secret `REVENUECAT_SECRET_API_KEY`). `owner_plan` on the link and anything the client sends are ignored.
- A failed check is "unknown": submissions within the Free allowance go through; one that would need
  Pro gets a "try again" error, never "limit reached".
- **Throttle (fixed window):** at most 10 attempts per link per 15-minute window; the window starts at
  the first attempt after the previous window ended. Throttled attempts change nothing and do not
  extend the wait; the client is told the time left. The window fields are server-managed (owners
  cannot set them). The previous lifetime cap of 30 no longer blocks, so links that hit it recover.
- **Abuse protection is separate from plan eligibility:** a verified upgrade removes the Free-plan
  restriction on the next attempt, but does not lift a throttle that is already active.
- Booking-form conversion (customer, booking, invoice) still runs in the owner's app, when it loads,
  returns to the foreground, or opens Bookings / Quotes & forms. A submission made while the app is
  closed waits as "submitted" (holding its slot) and is converted once when the app next opens.

## Deployment log

**2026-10-26** — deployed from commit `22bfe24` (live source verified byte-identical afterwards):

| Function | Before | After | Rollback |
|---|---|---|---|
| `invoice-public` | v22 (= `e482225`) | v23 | redeploy from `e482225` (below) |
| `delete-account` | v1 (= `e482225`) | v2 | redeploy from `e482225` (below) — **not recommended**: v1 deletes storage and data before RevenueCat, so with the current key it leaves accounts partially deleted |

Not deployed (blocked): `booking-public` (still v1), `entitlement-status`, migration `20261025000000`.
Migration `20261021000000` stays pending for a separate review.

Verified 2026-10-26: `REVENUECAT_SECRET_API_KEY` has the same SHA-256 as the production public iOS SDK key
(`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `appl_…`). With it, `delete-account` v2 refuses every deletion up front
(`deletion_failed` / `revenuecat_config`, nothing deleted) until a RevenueCat secret key is configured, and the
entitlement checks above stay unverified. The project lists no physical backups (PITR off): take one before
applying any migration.

Rolling back a function deployed above to its previous version:

```sh
git worktree add ../bookflow-e482225 e482225
supabase functions deploy <invoice-public|delete-account> --workdir ../bookflow-e482225 --project-ref bgtrfxwviqdewyloncdq --use-api
git worktree remove ../bookflow-e482225
```

## Before deploying — external checks (not verifiable from here; none assumed to pass)

Essential to the initial upgrade flow:

1. **Key type.** RevenueCat → Project settings → API keys: the key stored as `REVENUECAT_SECRET_API_KEY`
   must be a **v1 secret key** (v2 keys also start with `sk_` but are rejected by `/v1/subscribers`).
   The handoff notes list replacing this key as outstanding, and it was last set on 2026-09-16.
   Deployment step 1 below probes it either way.
2. **Entitlement.** RevenueCat → Entitlements: identifier `bookflow_pro` exists and the Test Store
   product (and the App Store product) is attached to it.
3. **Test Store in the same project.** The dev build's `EXPO_PUBLIC_REVENUECAT_TEST_KEY` belongs to the
   same RevenueCat project as the server key, so its purchases are visible server-side. Confirmed in
   end-to-end step 4 by `reason: entitlement_active`.
4. **Identity.** After the simulated purchase, RevenueCat → Customers → the test account's Clerk user id
   shows the purchase (not an `$RCAnonymousID`).

Later subscription lifecycle (do not block the initial upgrade test):

5. **Restore Behavior** (Project settings → General): which account a restored purchase belongs to.
6. **App Store Server Notifications** URL set in the App Store app's settings (and Google RTDN if
   Android ships), so renewals, cancellations, refunds and expiry reach RevenueCat promptly.
7. **Billing grace period** in App Store Connect, if relied on (the check honours RevenueCat's
   `grace_period_expires_date`).

## Deployment steps (in order; run from the project root unless stated)

1. `supabase functions deploy entitlement-status` — nothing uses it until the app update. Probe it
   once with the test account (sign in on a dev build, open the paywall's restore, or POST with that
   session's token). Read `reason`: `key_rejected` → wrong key type; `no_api_key` → secret missing;
   `entitlement_missing` / `customer_not_found` → key works, account has no Pro. Stop and fix the
   secret on the first two.
2. `supabase functions deploy booking-public` — until step 3 it falls back to the previous database
   function on `PGRST202`, so behaviour stays **exactly as today, including the old stored-plan check
   and the old 30-attempt cap**, until the migration is applied.
3. `supabase db push --workdir supabase/releases/2026-10-25-booking-form-entitlement/release-workdir --dry-run`
   — must list only `20261025000000_booking_offer_verified_plan.sql`. Then run it without `--dry-run`.
   This records `20261025000000` in production's migration history in the normal way.
4. Smoke test: an under-limit submission succeeds; a Free owner at the limit gets the limit message.
5. Deploy the public web page.
6. Run the end-to-end test below.

### Migration history afterwards

Production will have `20261025000000` applied and `20261021000000` still pending (older timestamp).
When the invoice-edit guard is authorised, apply it from the project root with
`supabase db push --include-all` (a plain `db push` refuses an older pending migration). Check with
`supabase migration list` before and after.

## Recovery

| Situation | Effect | Action |
|---|---|---|
| Step 1 probe fails | Nothing customer-facing changed | Fix the secret (`supabase secrets set --env-file <file outside the repo>`), re-probe; or `supabase functions delete entitlement-status` |
| After step 2, function misbehaves | Submissions affected | `supabase functions deploy booking-public --workdir supabase/releases/2026-10-25-booking-form-entitlement/rollback/booking-public-v1-workdir` (exact previous version) |
| Migration applied, `booking-public` still/rolled back to v1 | Under-limit submissions work; owners at the Free usage level get a generic temporary error (plan unverifiable). No limit is bypassed | Deploy the new `booking-public` |
| Migration must be undone | Previous function and owner guard restored exactly (columns left in place) | `psql "<db-url>" --single-transaction -v ON_ERROR_STOP=1 -f supabase/releases/2026-10-25-booking-form-entitlement/rollback/20261025_rollback.sql`, then `supabase migration repair --status reverted 20261025000000`, then `supabase migration list` to confirm. Redeploy `booking-public` v1 as above so it matches |
| `entitlement-status` returns errors after the app update | Paywall shows "Pro is still activating" with Retry; submissions unaffected | Fix per `reason`; no rollback needed |

## End-to-end test (test account, simulated purchase only)

Setup: a dev build using the RevenueCat Test Store key, signed in to a **test** Clerk account on Free.
Create three booking forms A, B, C (different dates) and share their links. Bring this month's usage to
the Free limit (5 bookings). Note the counts of customers, bookings and invoices.

1. **Blocked at the limit.** Open A's link in a browser, fill in details, tick terms, Submit (once or
   twice — stay under 10 attempts). Expect the "cannot take new online bookings… not submitted"
   message; the form card in the app still shows Awaiting client details and the qualified
   Free-limit notice. Leave this browser tab open. (This message needs RevenueCat to have answered
   "free" for the test account; "couldn't finish checking this booking" instead means the server
   check is failing — see deployment step 1.)
2. **Throttle expires (form B).** Submit B 10 times quickly (refused each time), then once more:
   expect "Too many attempts… Please wait N min". Note N. Continue with step 3 meanwhile.
3. **Verified upgrade.** In the app, buy Pro in the Test Store (simulated). Expect "Activating Pro…",
   then "Pro is active. Existing booking links are ready to use." If instead "Pro is still activating",
   read the `[pro-activation]` dev log reason: `entitlement_missing`/`customer_not_found` → identity or
   Test Store visibility (checks 3–4); `key_rejected`/`no_api_key` → server key; `session_rejected` →
   sign-in; `timeout`/`network` → connectivity. Do not continue until it says active.
4. **Same open page, original link.** Back in A's tab — no reload — tap Submit again. Expect success;
   details and terms were kept. Tap Submit again / reload: still submitted, no second submission.
5. **Throttle ended.** After B's wait has passed, submit B from its original link: expect success
   (also confirms that the upgrade did not need to lift the throttle).
6. **Owner's app closed.** Force-quit the app. Open C's original link fresh, submit: expect success.
   In the SQL editor (read-only): `select offer_id, status, booking_id from public_booking_offers
   where user_id = '<test user id>' and offer_id in ('<A>', '<B>', '<C>');` — C is `submitted`,
   `booking_id` null (not converted yet).
7. **Converted exactly once on reopening.** Open the app: one new customer (if new), booking and
   invoice each for A, B and C. Background the app for 30+ seconds and return, open Bookings and
   Quotes & forms: counts unchanged. Re-run the query: all three `converted` with a `booking_id`.

Cleanup: remove the simulated entitlement for the test customer in RevenueCat, or retire the test
account. Do not use real customer records.
