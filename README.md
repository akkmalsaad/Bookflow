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

5. Run [the workspace migration](supabase/migrations/20260824000000_create_bookflow_workspaces.sql) in the Supabase SQL Editor, or apply it through the Supabase CLI. The migration creates the table, grants only authenticated access, enables RLS, and limits every operation to rows whose `user_id` matches the Clerk token's `sub` claim.

6. Restart Expo after changing environment variables:

   ```bash
   npx expo start --clear
   ```

## Data model

`bookflow_workspaces` stores one versioned JSON workspace per Clerk user. It contains packages, customers, bookings, invoices, finance entries, reminders, notifications, the business profile, and currency preference. The app loads this document after Clerk signs in and queues updates whenever the existing context state changes.

The client never uses Supabase Auth and never receives a database secret. Supabase validates the short-lived Clerk session token supplied to each request, then PostgreSQL RLS enforces ownership.

## Verification

```bash
npx tsc --noEmit
npm run lint
npx expo export --platform web
```

For an isolation check, sign in as two different Clerk users. Each account should see a separate workspace even though both rows are visible to project administrators in the Supabase dashboard.
