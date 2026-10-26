# Booking workflows — handoff

Branch: `feature/booking-workflows` (created from `customer-payment-workflows`). **Nothing is committed, pushed, deployed or migrated.** Your earlier uncommitted changes to `app/paywall.tsx`, `app/settings/terms.tsx` and the EULA keys in `lib/i18n.ts` are still uncommitted and were left as they were. `lib/i18n.ts` now has both your edits and two small spread lines from this work, so review it before you stage it.

## How it fits the existing architecture

- Bookings, customers, invoices, payments, finance entries and services are still stored in the single `bookflow_workspaces.data` document, and every new field is optional. Bookings or invoices without the new fields read and render exactly as before. Older app versions keep the new fields on bookings, invoices and services. They do drop the new top-level `offers` array when they save; see the limitations section.
- Public booking forms, quotations and customer pages reuse the public-invoice pattern: a capability-token table, `SECURITY DEFINER` RPCs that only `service_role` may call, an Edge Function with `verify_jwt = false`, and an Expo web route (`/b?t=…`, the same 22-character token encoding as `/i`).
- Customer responses are **never written into the workspace document by the server**. The app saves that document whole, so an older or offline app could overwrite a server write. Responses stay in `public_booking_offers`. The owner's app turns a submission into a customer, booking and invoice, using ids derived from the offer (`cust-ofr-…`, `bk-ofr-…`, `inv-ofr-…`), so repeated runs can never create a second record. It does this when the workspace loads, when the app returns to the foreground (at most every 30 seconds) and when Quotes & forms opens. The link is marked `converted` only after the workspace save holding those records has succeeded; a failed save leaves it `submitted` and the next refresh tries again.

## Features

| # | Feature | Where |
|---|---|---|
| 1 | **Additional charges.** A collapsed section in the existing booking modal with add, edit and remove; quantity up to 2 decimals; amounts worked in cents. Charge lines are frozen onto the invoice (`lineItems`) and appear in the in-app preview, PDF and public invoice. The public projection now prints each line's own amount. | `lib/booking-pricing.ts`, `components/booking/BookingChargesEditor.tsx`, `BookingMoneySummary.tsx`, `lib/invoice-design/*`, `supabase/functions/invoice-public/payload.ts` |
| 2 | **Saved packages and add-ons.** A collapsed "Included services & add-ons" section in the service form: deliverables, add-ons with a default price and unit, and a default buffer. These only prefill a booking; the booking stores its own copy. | `components/settings/ServiceForm.tsx`, context `addPackage` / `updatePackage` |
| 3 | **Booking form.** "Send booking form" sits under Save in the create modal. It publishes a snapshot (no booking, no invoice number) and shows a private link with Share (the system sheet includes Copy) and WhatsApp. The customer page collects name, phone, email (required if you ask for it), location and notes, requires accepting the terms, and lets the customer request a change. | `app/booking-public.tsx`, `app/b.tsx`, `supabase/functions/booking-public/*`, migration |
| 4 | **Deposits.** Fixed or percent, an optional due date, package defaults and booking overrides. Deposits are validated against the final total *including* charges, and deposit due and balance show on bookings and invoices. Creating an invoice records no payment. | `resolveBookingMoney`, booking modal, invoice renderer |
| 5 | **Conflict warnings.** Live warnings in the modal list each clash (overlap or buffer only), using a preparation/travel buffer (larger of the two buffers) and handling midnight crossings. They exclude cancelled bookings and the booking being edited. A real overlap needs an explicit "Book anyway". Public responses are rechecked on the server. | `lib/booking-conflicts.ts` (`findBookingConflicts`), `ScheduleConflictNotice.tsx` |
| 6 | **Duplicate booking.** Available from booking details. It copies package, charges, deposit terms, buffer, terms and notes; the customer can be changed, and the date and time must be reviewed before saving. It never copies payments, paid status, invoice number, links, terms acceptance or delivery state. | `AddBookingModal` `mode="duplicate"` |
| 7 | **Quotations.** Quotes & forms screen (the price-tags button in the Bookings header). Draft → share → customer accepts or declines by link, checked against a validity date. Revising after sharing creates a new version and keeps the old one in `history`. An accepted version is locked. Converting uses the accepted version, rechecks availability and plan limits, creates the booking and invoice through the existing invoice stamping, and can't run twice. | `app/offers.tsx`, `lib/booking-offers.ts`, context `saveQuotation`, `shareOffer`, `convertQuotation` |
| 8 | **Booking-linked expenses and job money.** An optional booking picker on the existing expense form (it sets the existing `FinanceEntry.bookingId`). Booking details shows value, collected, outstanding, linked expenses, "value minus linked expenses" and "collected minus linked expenses", labelled as projections. These are the same ledger rows, so nothing is counted twice. | `components/AddTransactionModal.tsx`, `lib/job-financials.ts` |
| 9 | **Delivery tracker.** Status (not started, shoot/service completed, editing, delivered), promised date, http(s) link and internal notes, kept separate from job and payment status. A Schedule/Deliveries tab on Bookings filters Open, Overdue and Delivered. | `lib/booking-fulfilment.ts`, `BookingDetailsSheet.tsx`, `app/(tabs)/bookings.tsx` |
| 10 | **Customer booking page.** "Share customer page" in booking details. It shows agreed details, the charge breakdown, the invoice link, recorded payments, balance, delivery status and the delivery link. It's read-only; turning it off deletes the row, so re-sharing creates a new token. | context `createCustomerPageLink` / `revokeCustomerPageLink` |
| 11 | **Reminders.** Prepared payment, appointment and delivery messages in English or Malay, which you share yourself (WhatsApp or the share sheet). Owner reminders for overdue deliveries and due deposits go to the in-app notification centre, written once and respecting Clear all. New submissions, acceptances and change requests also raise a local notification when permission is already granted. | `lib/booking-messages.ts`, `lib/workflow-reminders.ts`, `presentOwnerNotification` |

Booking details: tap a booking card on Bookings. The edit, duplicate, customer page and message actions are inside the sheet, and the status pill opens the existing Job Status sheet.

## Database migration — NOT APPLIED

`supabase/migrations/20261016000000_booking_offers.sql` is additive:

- **New table `public_booking_offers`.** RLS gives each owner only their own rows; `anon` gets nothing. A trigger stops an owner writing customer response fields or changing a version the customer has already submitted or accepted. Links last at most 120 days.
- **`read_booking_offer_state(uuid)` and `respond_to_booking_offer(uuid, text, jsonb, text)`.** `service_role` only. The respond function:
  - locks the workspace row, then the offer row;
  - is idempotent per key;
  - validates every field;
  - checks the terms version and validity date;
  - rechecks availability, including buffers and other pending submissions;
  - enforces Free-plan limits, counting pending submissions;
  - limits attempts (30 per link) and change requests (3).
- **Account deletion is not touched.** `public_booking_offers.user_id` cascades from `bookflow_workspaces`, so deleting the workspace row removes these rows. `tests/account-deletion.test.cjs` expects every table with a `user_id` to be named in the deletion function and will flag this table until that function is next redefined.

It was tested only against in-memory PGlite (`tests/booking-offers-security.test.cjs`, which runs every migration in order). There is no Docker on this machine, so no local Supabase was started, and no hosted database was touched.

## Release steps (in order)

1. Review, then apply the migration to staging (Supabase CLI or SQL editor). Then run the PGlite suite and a manual pass on staging.
2. Deploy the Edge Function: `supabase functions deploy booking-public` (`verify_jwt = false` is set in `supabase/config.toml`). It needs the standard `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` function secrets; no new secrets.
3. Deploy the Expo web build so `/b` and `/booking-public` exist on `https://bookflow.expo.app` (or `EXPO_PUBLIC_INVOICE_WEB_URL`). Until both the function and the web build are live, **booking form, quotation and customer page links will not open**.
4. Ship the app. No new native modules were added (Share and Linking are core React Native and Expo), so this is JS-only, but follow your normal build process.
5. Production: apply the migration and deploy the function **before** shipping app builds that can create links.

## Tests and checks run

- `npx tsc --noEmit`: clean (before and after).
- `npm run lint`: 0 errors. The same 6 pre-existing warnings in `BookFlowLoading.tsx` and `BookFlowSplash.tsx`.
- `node --test tests/*.test.cjs`: 223 tests, 211 pass. The **12 failures are pre-existing** and unchanged from the baseline before any edits: `booking-reminders` (8, a missing `getReminderLeadTimeMs` export in the vm stub), `privacy-policy` (2) and `terms-of-service` (2).
- New tests:
  - `booking-pricing`: cents maths, validation, deposits, legacy bookings, the money resolver.
  - `booking-conflicts`: buffers, midnight, exclusions.
  - `booking-workflows`: snapshots, versions, customer matching, deterministic records, delivery, job money without double counting, messages, owner reminders, backup round-trip.
  - `booking-offers-security`: SQL RPCs, RLS, guard, limits, concurrency, idempotency, expiry and revocation, account deletion.
  - `booking-public-function`: Edge Function input handling, error mapping, projection leak checks.
  - An extra multi-line and deposit-due test in `public-invoice-security`.
- `npx expo export --platform web` succeeded into a temporary folder. The `/offers`, `/b` and `/booking-public` routes bundle.

**Not verified:**

- **No visual check on iOS or in a browser.** There was no simulator session with a signed-in account and no browser automation in this environment.
- Keyboard behaviour, scrolling on small iPhones, safe areas and dark mode for the modal sections, booking details sheet, Quotes & forms screen and public page were checked by code review only. They reuse the existing modal and sheet components (`modalScrollProps`, `BottomSheetModal`, `KeyboardDoneButton`).
- The PGlite concurrency test runs the two calls one after the other, so it doesn't exercise real lock contention. The `for update` row locks are what protect production; test them on staging with parallel requests.

## Assumptions

- **Entitlements.** No policy existed for these features. Every new feature is available on Free and Pro, and anything that creates bookings, customers or invoices still counts toward the existing Free limits. It's isolated in `lib/workflow-entitlements.ts`: change an entry to `'pro'` to gate it.
- **Server-side plan limits** read `owner_plan`, which the owner's app writes from its RevenueCat entitlement. That's the same trust level as the app's existing client-side limits. A verified server-side entitlement would need a RevenueCat webhook or REST check, which doesn't exist yet.
- **Discounts and tax.** None exist in BookFlow, so none were added. Totals are package price plus charges.
- **Customer matching** for submissions: a customer you chose when preparing the form wins. Otherwise the app reuses an existing customer only on an exact case-insensitive email match. It never matches on name, or on phone alone.
- **Submissions don't confirm anything.** A submitted form or a converted quotation becomes an `Inquiry` booking with a `Draft` invoice; you confirm it with the existing Job Status sheet. The submitted form's invoice is shared through the existing invoice link mechanism (which marks it `Sent`) so the customer page can show "View invoice".
- **Timezone.** Dates and times are the owner's local wall-clock values, as today. Snapshots carry the owner's IANA zone, which the server uses for "this month" and the public page shows. DST transitions aren't modelled (Malaysia has none).
- **Copying links.** Instead of adding `expo-clipboard` (a new native module), links use the system share sheet, which includes Copy, plus a selectable link field.

## Known limitations and follow-ups

- **When records appear, and owner notifications.** A submitted form becomes a customer, booking and invoice only once the owner's app syncs, and the customer page shows the invoice only once the owner has shared it. BookFlow has no push notifications, so the owner only finds out when they next open the app.
- **Automated customer reminders aren't implemented.** There's no messaging provider (WhatsApp Business API, email or SMS) and no server scheduler, so no automatic-send control is shown. Adding them needs:
  - an authenticated provider account and its secrets in Supabase function secrets;
  - a scheduled function (Supabase cron or pg_cron);
  - per-customer opt-in and opt-out storage;
  - a send-log table with unique `(booking_id, kind, due_date)` for duplicate prevention;
  - retry limits and an audit history;
  - an off-by-default setting.
- **Older app versions.** Older builds drop the top-level `offers` array when they save the workspace. Shared offers are rebuilt from `public_booking_offers` on the next refresh. Unshared draft quotations would be lost if an older build on another device saved in between.
- **Backups.** Workspace backups don't include quotations or booking forms; their links live server-side. Charges, deposit terms, delivery tracking, invoice lines and service extras are kept.
- **Unapplied migration.** Until the migration and function are deployed, "Send booking form", "Share link" and "Share customer page" show a connection error. Nothing else is affected.

## Bug fixes: account deletion and invoice → booking removal

### Account deletion (`supabase/functions/delete-account`)

**Confirmed findings**

- The production app signs in through Clerk instance `clerk.bookflow.my` (`pk_live`, in both `.env.production.local` and the EAS production environment). Development builds use `splendid-pangolin-4730.clerk.accounts.dev`. Supabase third-party auth trusts **both** instances for database access.
- The deployed function is byte-identical to git `HEAD`.
- The function's `CLERK_SECRET_KEY` is a valid key for *some* instance: Clerk's key server answers it. It is not the development key; the SHA-256 digests differ. That is why development-build deletions fail at authentication (proven with a genuine development token: `401`).
- **`REVENUECAT_SECRET_API_KEY` in Supabase has the same SHA-256 digest as the app's public iOS SDK key (`appl_…`).** RevenueCat rejects that key for deletion: `401`, code 7225 "Invalid API Key", reproduced against a non-existent customer id.
- In the deployed function the RevenueCat step runs **after** storage and database deletion. So a production customer who passes authentication has their logo and BookFlow data deleted, then gets "Your account hasn't been deleted", and their Clerk login remains.
- Database side is fine: `delete_bookflow_account_data` exists, is service-role only, and covers all four user-owned tables. The foreign key cascades, and the logo bucket exists.

**Not confirmed**

- Which step a real production customer's attempt hit. Supabase's logs API only holds gateway logs for 16–17 September, with no function requests, and there is no function-console source. The dashboard's per-function log view may hold more.
- Whether `CLERK_SECRET_KEY` is the `clerk.bookflow.my` secret. No production secret is available locally.

**Fix**

- RevenueCat now runs first, and a non-secret key is refused up front (`revenuecat_config`), before anything is deleted.
- Tokens are verified against each configured instance's keys, pinned to that instance's issuer.
- Development support is opt-in: it needs both `CLERK_DEVELOPMENT_SECRET_KEY` and `CLERK_DEVELOPMENT_ISSUER`.
- Rejections log reason codes and the issuer host only.
- The client never turns a definite server refusal into "deleted".

**Required before release**

1. Replace `REVENUECAT_SECRET_API_KEY` with a RevenueCat **secret** API key (`sk_…`, from RevenueCat → Project settings → API keys).
2. Confirm `CLERK_SECRET_KEY` is the `clerk.bookflow.my` (production) secret key.
3. Set `CLERK_ISSUER=https://clerk.bookflow.my`.
4. Deploy: `supabase functions deploy delete-account`.
5. Optional, development deletion only: set `CLERK_DEVELOPMENT_SECRET_KEY` (the `sk_test_…` key) and `CLERK_DEVELOPMENT_ISSUER=https://splendid-pangolin-4730.clerk.accounts.dev`.

Set secrets without echoing them or putting them in shell history, for example `supabase secrets set --env-file <file outside the repo>`, then delete the file.

### Deleting an invoice removes its linked booking (`lib/invoice-booking-link.ts`)

**Scope.**
- Applies to a plain **Delete**, its Undo, Dustbin restore, permanent delete and the 30-day purge.
- **Cancel and Void leave the booking exactly as before.**

**How it works.**
- The booking is found only through the invoice's stored `bookingId`.
- On Delete it moves out of `bookings` onto the invoice (`invoice.removedBooking`), in the same workspace save. It is kept if another active invoice still references it.
- Restore puts it back.
- Permanent delete or purge removes it, unless another invoice still references it; then it is put back (active invoice) or handed to that invoice (Dustbin).

**Released App Store app.**
- It renders, conflict-checks and reminds only from `bookings`, so it never shows a removed booking.
- It preserves `removedBooking` on invoices when it saves; tested against git `HEAD` code.
- If it restores such an invoice, `reconcileLinkedBookings` puts the booking back the next time this version loads the workspace.

**Remaining dependency.**
- If the released app permanently deletes a Dustbin invoice whose booking another Dustbin invoice references, the booking is lost (it does not hand it over).
- Any client that saves a stale copy of the whole workspace document overwrites newer changes. That is pre-existing behaviour of the single-document design, not specific to this change.
