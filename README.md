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

6. Deploy the [`invoice-public`](supabase/functions/invoice-public/index.ts) Edge Function. Its function configuration intentionally disables JWT verification because customers open the capability link without an account; the function itself validates the unguessable, expiring invoice token and performs database changes with its server-side service role.

7. Restart Expo after changing environment variables:

   ```bash
   npx expo start --clear
   ```

## Data model

`bookflow_workspaces` stores one versioned JSON workspace per Clerk user. It contains packages, customers, bookings, invoices, finance entries, reminders, notifications, the business profile, and currency preference. The app loads this document after Clerk signs in and queues updates whenever the existing context state changes.

`public_invoice_links` stores a 30-day capability token and an invoice snapshot. WhatsApp receives an HTTPS Edge Function URL instead of a private app deep link. Customers can review, accept, or decline without a Bookflow login; the response updates both the link status and the owner's workspace. Anonymous callers receive no direct table permissions.

The client never uses Supabase Auth and never receives a database secret. Supabase validates the short-lived Clerk session token supplied to each request, then PostgreSQL RLS enforces ownership.

## Verification

```bash
npx tsc --noEmit
npm run lint
npx expo export --platform web
```

For an isolation check, sign in as two different Clerk users. Each account should see a separate workspace even though both rows are visible to project administrators in the Supabase dashboard.
