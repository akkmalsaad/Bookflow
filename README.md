# Bookflow

Bookflow is an Expo SDK 54 app. Clerk owns authentication and Supabase stores each signed-in user's business workspace.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and provide:

   ```dotenv
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   The Supabase publishable key is designed for app clients. Never put a Supabase secret or service-role key in an `EXPO_PUBLIC_` variable.

3. In Clerk, open the **Connect with Supabase** integration and enable it for the Clerk instance used by this app.

4. In Supabase, open **Authentication > Third-Party Auth** and add the same Clerk instance. This makes Supabase accept Clerk session tokens with the `authenticated` role.

5. Apply the migrations in [`supabase/migrations`](supabase/migrations) through the connected GitHub integration, Supabase CLI, or SQL Editor. They create the private workspace, secure public-invoice capability links, and RLS policies that limit authenticated operations to rows whose `user_id` matches the Clerk token's `sub` claim.

6. Deploy the Expo web build to an HTTPS host. The unauthenticated `/invoice-public?token=...` route renders the customer-facing invoice.

7. Deploy [`invoice-public`](supabase/functions/invoice-public/index.ts). Its function configuration intentionally disables JWT verification because customers open the capability link without an account; the function itself validates the unguessable, expiring invoice token and performs database changes with its server-side service role. Browser visits to existing Function URLs are redirected to the production Expo web page, while that page uses the Function's JSON API.

8. Restart Expo after changing environment variables:

   ```bash
   npx expo start --clear
   ```

## Data model

`bookflow_workspaces` stores one versioned JSON workspace per Clerk user. It contains packages, customers, bookings, invoices, finance entries, reminders, notifications, the business profile, and currency preference. The app loads this document after Clerk signs in and queues updates whenever the existing context state changes.

`public_invoice_links` stores a 30-day capability token and an invoice snapshot. WhatsApp receives an HTTPS Edge Function URL instead of a private app deep link. The Function redirects browsers to the public Expo web route and exposes invoice data only as JSON after validating the capability token. Customers can review, accept, or decline without a Bookflow login; the response updates both the link status and the owner's workspace. Anonymous callers receive no direct table permissions.

The client never uses Supabase Auth and never receives a database secret. Supabase validates the short-lived Clerk session token supplied to each request, then PostgreSQL RLS enforces ownership.

## Verification

```bash
npx tsc --noEmit
npm run lint
npx expo export --platform web
```

For an isolation check, sign in as two different Clerk users. Each account should see a separate workspace even though both rows are visible to project administrators in the Supabase dashboard.

## Build variants and bundle identifiers

iOS ships as two separate apps. `app.config.js` picks which one it is building from the
`APP_VARIANT` environment variable, which `eas.json` sets per build profile — no file is edited
before a build, and nothing has to be remembered at the command line.

| Profile | `APP_VARIANT` | iOS bundle identifier | Home-screen name | Signing |
| --- | --- | --- | --- | --- |
| `development` | `development` | `my.bookflow.app.dev` | Bookflow Dev | free Apple Personal Team |
| `preview` | `preview` | `my.bookflow.app` | Bookflow | paid team, ad hoc |
| `production` | `production` | `my.bookflow.app` | Bookflow | paid team, App Store |

A bare `npx expo start` or `npx expo run:ios` sets no variable, so local work falls back to the
`development` variant. Because the two variants use different bundle identifiers, the dev app and
the App Store app install side by side on the same device.

Inspect what any variant resolves to without building:

```bash
APP_VARIANT=production npx expo config --type public
```

The Android package (`com.akkmal.Bookflow`) is deliberately shared by every variant — only the iOS
side has been split.

### Deep links

Production keeps the single `bookflow` scheme it has always used. The development variant declares
`["bookflow", "bookflow.dev"]`: `bookflow` still resolves exactly as before, and `bookflow.dev`
gives an unambiguous target once both apps are installed, since iOS picks an arbitrary winner when
two installed apps claim the same scheme.

### Push notifications

Today the app only schedules **local** notifications (`lib/notifications.ts`,
`lib/booking-reminders.ts`); nothing requests an APNs token. Local notifications need no
entitlement, which is why development can run on a free Personal Team.

The `withPersonalTeamSigning` plugin deletes the `aps-environment` and Apple Sign In entitlements,
because a Personal Team is not allowed to sign them. `app.config.js` now applies that plugin **only
to the development variant**, so `preview` and `production` keep the `aps-environment` entitlement
that `expo-notifications` adds. Those builds are therefore push-capable as soon as an APNs key is
attached in EAS credentials, without any further config change.

## iPhone development with a free Apple Personal Team

Development still signs with a free Personal Team, so no paid Apple Developer account is needed to
run BookFlow on a trusted device. `ios.usesAppleSignIn` and Clerk's `appleSignIn` option stay
disabled; the app uses email/password auth and never invokes native Apple authentication, so
nothing depends on them.

Install on the connected iPhone:

```bash
npx expo prebuild --platform ios
npx expo run:ios --device
```

Face ID, Android configuration, notifications and all packages are unaffected. Remote APNs push is
unavailable in a Personal Team build, which does not matter while every notification is local.

### Moving to the paid team

The paid-team switch is now the `production` build profile rather than a manual edit — the plugin
removal, bundle identifier and entitlements all follow `APP_VARIANT`. Nothing in `app.json` or the
Xcode target needs changing by hand.

```bash
eas build --profile development --platform ios   # my.bookflow.app.dev
eas build --profile production  --platform ios   # my.bookflow.app, TestFlight
```

The iOS bundle identifier history for this project is `com.akkmal.Bookflow`, then
`com.akkmal.bookflow.dev`, and now `my.bookflow.app.dev` for development alongside
`my.bookflow.app` for the App Store.

## Short invoice links

New invoice shares use `https://bookflow.expo.app/i?t=<22-character-token>` by default. No custom domain or extra environment variable is required. Restart development clients or rebuild installed apps to pick up this change.

The static `/i` route opens independently of Clerk and workspace loading. Tokens retain every bit of the original UUID, and the backend continues to enforce the 30-day expiry and allowed invoice actions. Existing UUID links remain supported. An optional `EXPO_PUBLIC_INVOICE_WEB_URL` overrides the domain only after the same web routes are deployed there.
