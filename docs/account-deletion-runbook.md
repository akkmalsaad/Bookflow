# Account deletion — runbook

## What deleting an account does

The `delete-account` Edge Function, after verifying the caller's Clerk session token:

1. Deletes the account's files in Storage (`business-logos/<user_id>/`).
2. Deletes its database rows in one transaction (`delete_bookflow_account_data`): the workspace
   (customers, bookings, invoices including Dustbin, payments, income and expenses, services,
   reminders, notifications, business profile and settings), shared invoice links, booking forms and
   quotations with any client submissions, support requests and feedback.
3. Deletes the PostHog person — **only if** `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` and
   `POSTHOG_HOST` are configured. They are not configured in production today.
4. Records the account in `public.deleted_accounts`, which refuses every further write for it, from
   any role — so a Clerk session token issued before the deletion cannot bring data back.
5. Deletes the Clerk user (last, so a failure above leaves a login to retry with).
6. Sweeps the database once more.

The app reports success only after steps 1–5. If the data is gone but the login is not, the app says
so and offers **Try again**, which repeats the same request safely.

**RevenueCat is not touched.** BookFlow does not delete RevenueCat customer records and does not
cancel subscriptions. The RevenueCat App User ID is the Clerk user id, so after deletion it is no
longer linked to any account, name or email held by BookFlow. The Privacy Policy describes what
RevenueCat keeps and how to ask for erasure.

## `deleted_accounts`

| Column | Meaning |
|---|---|
| `user_id` | The deleted account's Clerk user id. No other detail is stored |
| `clerk_instance` | `production` or `development` |
| `data_deleted_at` | When its data was removed (writes are blocked from here) |
| `login_deleted_at` | When its Clerk login was removed |

Server-only (row-level security, no policies, no client grants). Rows are purged automatically 30
days after `login_deleted_at`, the next time any account is deleted.

Checking a deletion (Supabase SQL editor; you need the user id, e.g. from Clerk's dashboard before
it was deleted):

```sql
select data_deleted_at, login_deleted_at from public.deleted_accounts where user_id = '<clerk user id>';
```

A row with `login_deleted_at` empty means the person's data is gone but their login is not: deletion
did not finish. Ask them to open BookFlow and tap **Try again**, or delete the user in the Clerk
dashboard yourself — the data step has already run.

## Requests to erase RevenueCat records

The Privacy Policy asks people to make this request **before** deleting their account, because that
is when their records can still be identified:

1. Confirm the request comes from the account holder (reply to the account's email address).
2. Clerk dashboard → Users → find the user by email → copy the user id. This is their RevenueCat App
   User ID.
3. Check whether BookFlow must keep the purchase records (for example an open refund, chargeback or
   accounting requirement). If so, explain what is kept and why.
4. Otherwise: RevenueCat dashboard → Customers → search that exact App User ID → open the exact match
   → **Delete customer** (Admin or Customer Admin role) → search again to confirm it is gone.
5. Tell the person, and remind them that this does not cancel an App Store subscription.

After an account is deleted, BookFlow cannot reliably find its RevenueCat records (no email or name
is kept). Say so if asked.

## Known gaps

- **Sign in with Apple token revocation is not implemented.** Clerk does not document revoking a
  user's Sign in with Apple grant when the user is deleted, and BookFlow does not call Apple's
  `/auth/revoke` (that needs the Apple private key configured in Clerk, held server-side, and an Apple
  token). Account deletion does not depend on it. Users can remove BookFlow under Apple ID → Sign in
  with Apple on their device.
- **PostHog analytics are not deleted** while its keys are not configured; the Privacy Policy covers
  analytics retention.
