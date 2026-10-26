# Account deletion — RevenueCat erasure runbook

BookFlow deletes an account's data and Clerk sign-in immediately, in the `delete-account` Edge
Function. The account's RevenueCat customer record cannot be deleted through RevenueCat's API: that
needs a RevenueCat **secret** key, and `REVENUECAT_SECRET_API_KEY` holds the public SDK key, which is
being kept unchanged. RevenueCat supports deleting a customer by hand in its dashboard, so each
deletion records the customer in a server-only queue and an administrator erases it there.

**Commitment:** every queued customer is erased in RevenueCat **within 30 days** of the deletion
request. Users are told exactly this when they delete their account, and the Privacy Policy promises
the RevenueCat record is deleted.

## What is recorded

`public.revenuecat_erasure_requests` — one row per account, never more:

| Column | Meaning |
|---|---|
| `id` | The **deletion reference** shown to the user |
| `app_user_id` | The RevenueCat App User ID (= the Clerk user id). The only identifier stored |
| `clerk_instance` | `production` or `development` |
| `status` | `requested` → `account_deleted` → `completed` |
| `requested_at`, `deadline_at` | Deadline = request + 30 days |
| `account_deleted_at` | When BookFlow data and the Clerk login were confirmed gone |
| `completed_at`, `completed_by` | When and by whom the RevenueCat erasure was verified |

No name, email or other personal detail is stored. The table has row-level security with no
policies and no client grants; the queue functions live in the `bookflow_admin` schema, which the API
does not expose. Everything below runs in the **Supabase SQL editor** (dashboard login required).

## Weekly review (every Monday, and whenever a support request asks)

```sql
select reference, app_user_id, status, urgency, deadline_at, days_left
from bookflow_admin.revenuecat_erasure_queue();
```

| `urgency` | Action |
|---|---|
| `overdue` | Past the 30-day deadline. Erase **today**, then tell the business owner it was late |
| `due_soon` | 7 days or less left. Erase **this week** |
| `pending` | Erase at this review |
| `awaiting_account_deletion` | The BookFlow account may still exist. **Do not erase in RevenueCat.** See below |

Completed requests: `select * from bookflow_admin.revenuecat_erasure_queue(true);`

## Erasing one customer

1. RevenueCat dashboard → the BookFlow project → **Customers** → search the exact `app_user_id`.
2. Open the customer whose App User ID matches **exactly**. Do not act on a partial match.
3. **Delete customer** and confirm. (Requires the Admin or Customer Admin role.)
4. Search the same App User ID again and confirm it is no longer found.
5. Only then record it, with your name:

   ```sql
   select bookflow_admin.complete_revenuecat_erasure('<app_user_id>', '<your name>');
   ```

   It refuses a request whose BookFlow deletion has not finished, and repeating it changes nothing.

If RevenueCat reports the customer does not exist, it was never created (the person never reached
the paywall): record it as complete in the same way.

## `awaiting_account_deletion`

The user started deleting but the deletion did not finish (for example the Clerk step failed). The
app told them to tap **Try again**, which continues the same request.

- Check Clerk (production or development dashboard, per `clerk_instance`) → Users → that user id.
- If the user **still exists**: leave it. If it is still unfinished at 7 days before the deadline,
  delete the user in Clerk yourself (the data step is safe to repeat: run
  `select public.delete_bookflow_account_data('<app_user_id>');`), then continue below.
- If the user **no longer exists**: the account is gone and only the marker was missed. Record it,
  then erase as above:

  ```sql
  select public.record_revenuecat_erasure_progress('<app_user_id>', 'account_deleted');
  ```

## Answering "has my deletion finished?"

The user quotes the deletion reference from the confirmation:

```sql
select status, completed_at from public.revenuecat_erasure_requests where id = '<reference>';
```

Reply with the status only. BookFlow keeps no contact details for deleted accounts, so there is no
automatic completion notice; the reference is how a person can check.

## Known gaps

- **Sign in with Apple token revocation is not implemented.** Clerk is not documented to revoke a
  user's Sign in with Apple grant when the user is deleted, and BookFlow does not call Apple's
  `/auth/revoke`. Doing so needs an Apple authorization code from the device at deletion time and a
  Sign in with Apple private key (`.p8`) held server-side — new credentials. Apple asks apps to revoke;
  until then, users can remove BookFlow under Apple ID → Sign in with Apple on their device.
- **No automatic escalation.** The deadline is tracked in the queue (`urgency`); escalation is this
  weekly review. If BookFlow gains an email or scheduling service, alert on `due_soon`/`overdue`.
- **Automatic erasure** happens only if a RevenueCat v1 secret key is ever configured: the function
  then deletes the customer through the API and marks the request completed itself.
