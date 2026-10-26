-- Bookflow keeps authentication in Clerk. Supabase validates Clerk session
-- tokens through its native Third-Party Auth integration, and auth.jwt()->>'sub'
-- is therefore the signed-in Clerk user ID.

create table if not exists public.bookflow_workspaces (
  user_id text primary key default (auth.jwt() ->> 'sub'),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint bookflow_workspaces_user_id_not_empty check (length(user_id) > 0)
);

alter table public.bookflow_workspaces enable row level security;

revoke all on table public.bookflow_workspaces from anon;
grant select, insert, update, delete on table public.bookflow_workspaces to authenticated;

drop policy if exists "Users manage their own Bookflow workspace" on public.bookflow_workspaces;
create policy "Users manage their own Bookflow workspace"
on public.bookflow_workspaces
for all
to authenticated
using ((select auth.jwt() ->> 'sub') = user_id)
with check ((select auth.jwt() ->> 'sub') = user_id);

comment on table public.bookflow_workspaces is
  'One versioned Bookflow workspace document per Clerk user, protected by RLS.';
