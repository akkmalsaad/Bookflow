-- Help & Support requests and in-app feedback.
--
-- Both tables are write-only inboxes from the app's point of view. auth.jwt()->>'sub' is the
-- signed-in Clerk user ID (see 20260824000000_create_bookflow_workspaces.sql), so the owner is
-- always taken from the verified session token and can never be supplied by the client.
--
-- What the app may touch is limited twice over:
--   * column-level INSERT grants: the client can only write the message and its diagnostics.
--     `user_id`, `status`, `created_at` and `updated_at` are always the column defaults, so a
--     client cannot file a request as someone else, pre-resolve it, or backdate it.
--   * RLS: every row must belong to the caller. There are no UPDATE or DELETE grants at all —
--     status is changed only by the team through the dashboard / service role.

-- ---------------------------------------------------------------------------------------------
-- support_requests
-- ---------------------------------------------------------------------------------------------

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  topic text not null
    check (topic in ('booking', 'invoice_payment', 'pro', 'account_data', 'technical', 'other')),
  message text not null
    check (char_length(btrim(message)) between 10 and 2000),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  platform text check (platform is null or platform in ('ios', 'android', 'web')),
  os_version text check (os_version is null or char_length(os_version) <= 40),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_user_id_not_empty check (length(user_id) > 0)
);

create index if not exists support_requests_user_created_idx
  on public.support_requests (user_id, created_at desc);
create index if not exists support_requests_status_created_idx
  on public.support_requests (status, created_at desc);

alter table public.support_requests enable row level security;

revoke all on table public.support_requests from anon, authenticated;
grant select on table public.support_requests to authenticated;
grant insert (id, topic, message, app_version, platform, os_version)
  on table public.support_requests to authenticated;

drop policy if exists "Users create their own support requests" on public.support_requests;
create policy "Users create their own support requests"
on public.support_requests
for insert
to authenticated
with check ((select auth.jwt() ->> 'sub') = user_id and status = 'new');

drop policy if exists "Users read their own support requests" on public.support_requests;
create policy "Users read their own support requests"
on public.support_requests
for select
to authenticated
using ((select auth.jwt() ->> 'sub') = user_id);

create or replace function public.touch_support_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_requests_touch_updated_at on public.support_requests;
create trigger support_requests_touch_updated_at
before update on public.support_requests
for each row execute function public.touch_support_request_updated_at();

comment on table public.support_requests is
  'Contact Support messages from the app. Insert-only for users (own rows, readable by owner); status is managed by the BookFlow team.';

-- ---------------------------------------------------------------------------------------------
-- user_feedback
-- ---------------------------------------------------------------------------------------------

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  category text not null
    check (category in ('feature_request', 'improvement', 'praise', 'other')),
  message text not null
    check (char_length(btrim(message)) between 10 and 2000),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  platform text check (platform is null or platform in ('ios', 'android', 'web')),
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'planned', 'closed')),
  created_at timestamptz not null default now(),
  constraint user_feedback_user_id_not_empty check (length(user_id) > 0)
);

create index if not exists user_feedback_user_created_idx
  on public.user_feedback (user_id, created_at desc);
create index if not exists user_feedback_status_created_idx
  on public.user_feedback (status, created_at desc);

alter table public.user_feedback enable row level security;

-- Feedback is never read back in the app, so users get no SELECT at all.
revoke all on table public.user_feedback from anon, authenticated;
grant insert (id, category, message, app_version, platform)
  on table public.user_feedback to authenticated;

drop policy if exists "Users create their own feedback" on public.user_feedback;
create policy "Users create their own feedback"
on public.user_feedback
for insert
to authenticated
with check ((select auth.jwt() ->> 'sub') = user_id and status = 'new');

comment on table public.user_feedback is
  'In-app product feedback. Insert-only for users; never readable from the app. Status is managed by the BookFlow team.';

-- ---------------------------------------------------------------------------------------------
-- Abuse guard: at most 10 messages per user per hour, per table.
-- ---------------------------------------------------------------------------------------------
-- SECURITY DEFINER so the count also works on user_feedback, which users cannot SELECT. It only
-- counts the caller's own rows and returns nothing to them.

create or replace function public.enforce_support_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if tg_table_name = 'support_requests' then
    select count(*) into recent_count
    from public.support_requests
    where user_id = new.user_id and created_at > now() - interval '1 hour';
  else
    select count(*) into recent_count
    from public.user_feedback
    where user_id = new.user_id and created_at > now() - interval '1 hour';
  end if;

  if recent_count >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_support_message_rate_limit() from public, anon, authenticated;

drop trigger if exists support_requests_rate_limit on public.support_requests;
create trigger support_requests_rate_limit
before insert on public.support_requests
for each row execute function public.enforce_support_message_rate_limit();

drop trigger if exists user_feedback_rate_limit on public.user_feedback;
create trigger user_feedback_rate_limit
before insert on public.user_feedback
for each row execute function public.enforce_support_message_rate_limit();
