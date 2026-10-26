-- Account deletion with a tracked RevenueCat erasure.
--
-- BookFlow cannot delete RevenueCat customers through the API: that needs a RevenueCat secret key,
-- and REVENUECAT_SECRET_API_KEY holds the public SDK key, which is being kept unchanged. RevenueCat
-- also supports deleting a customer by hand in its dashboard, so the delete-account Edge Function now
-- deletes everything BookFlow holds (storage, database, Clerk login) and records the RevenueCat
-- customer for an administrator to erase in the dashboard within 30 days.
--
-- What this adds:
--   * revenuecat_erasure_requests — one row per deleted account: the RevenueCat App User ID (the
--     Clerk user id, the only identifier BookFlow ever gives RevenueCat), timestamps, the 30-day
--     deadline and its status. No name, email or other personal detail. No foreign key to the
--     workspace, so deleting the account's data never deletes the record of what is still owed.
--   * Service-role functions the Edge Function uses to open a request and record its progress.
--   * Admin functions in the `bookflow_admin` schema, which the API does not expose: list the queue,
--     and mark an erasure complete after it has been checked in the RevenueCat dashboard. Callable
--     only by the database owner (SQL editor / psql), never through a public endpoint.
--   * A guard that refuses writes for an account whose deletion has been carried out, so a session
--     token still valid for a few seconds cannot bring the deleted data back.
--   * delete_bookflow_account_data now removes booking forms explicitly too (they already cascaded
--     from the workspace), so the result does not depend on that foreign key.
--
-- Statuses: requested (deletion started; the BookFlow account may still exist) → account_deleted
-- (data and Clerk login removed; RevenueCat erasure owed) → completed (RevenueCat customer erased).

create table if not exists public.revenuecat_erasure_requests (
  id uuid primary key default gen_random_uuid(),
  app_user_id text not null unique check (char_length(app_user_id) between 1 and 200),
  clerk_instance text not null check (clerk_instance in ('production', 'development')),
  status text not null default 'requested' check (status in ('requested', 'account_deleted', 'completed')),
  requested_at timestamptz not null default now(),
  deadline_at timestamptz not null default (now() + interval '30 days'),
  account_deleted_at timestamptz,
  completed_at timestamptz,
  -- Who confirmed the erasure: an administrator's name, or 'revenuecat_api' when done automatically.
  completed_by text check (completed_by is null or char_length(completed_by) between 2 and 120),
  constraint revenuecat_erasure_completion check (
    (status = 'completed') = (completed_at is not null and completed_by is not null)
  ),
  constraint revenuecat_erasure_account_deleted check (
    status = 'requested' or account_deleted_at is not null
  )
);

alter table public.revenuecat_erasure_requests enable row level security;
-- No policies: no client role can read or write it. Only security-definer functions below touch it.
revoke all on table public.revenuecat_erasure_requests from public, anon, authenticated, service_role;

comment on table public.revenuecat_erasure_requests is
  'RevenueCat customers owed an erasure after a BookFlow account deletion. Server-only; see bookflow_admin.';

-- ---------------------------------------------------------------------------------------------
-- Used by the delete-account Edge Function (service role only).
-- ---------------------------------------------------------------------------------------------

-- Opens the erasure request before anything is deleted. Repeating it (a retried deletion) returns
-- the existing request unchanged, so there is never more than one per account.
create or replace function public.request_revenuecat_erasure(p_app_user_id text, p_clerk_instance text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.revenuecat_erasure_requests%rowtype;
begin
  if p_app_user_id is null or char_length(p_app_user_id) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'An app user id is required';
  end if;

  insert into public.revenuecat_erasure_requests (app_user_id, clerk_instance)
  values (p_app_user_id, p_clerk_instance)
  on conflict (app_user_id) do nothing;

  select * into request from public.revenuecat_erasure_requests where app_user_id = p_app_user_id;
  return jsonb_build_object('reference', request.id, 'status', request.status, 'deadline', request.deadline_at);
end;
$$;

-- Records progress. 'account_deleted': BookFlow data and the Clerk login are gone. 'erased_by_api':
-- the customer was deleted through RevenueCat's API (only possible with a secret key). Never moves
-- a request backwards and never overwrites a completion.
create or replace function public.record_revenuecat_erasure_progress(p_app_user_id text, p_event text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.revenuecat_erasure_requests%rowtype;
begin
  if p_event not in ('account_deleted', 'erased_by_api') then
    raise exception using errcode = '22023', message = 'Unknown erasure event';
  end if;

  update public.revenuecat_erasure_requests
    set account_deleted_at = coalesce(account_deleted_at, now()),
        status = case
          when status = 'completed' then status
          when p_event = 'erased_by_api' then 'completed'
          else 'account_deleted'
        end,
        completed_at = case when status <> 'completed' and p_event = 'erased_by_api' then now() else completed_at end,
        completed_by = case when status <> 'completed' and p_event = 'erased_by_api' then 'revenuecat_api' else completed_by end
    where app_user_id = p_app_user_id
    returning * into request;

  if not found then
    raise exception using errcode = 'P0002', message = 'No erasure request for this account';
  end if;
  return jsonb_build_object('reference', request.id, 'status', request.status, 'deadline', request.deadline_at);
end;
$$;

revoke all on function public.request_revenuecat_erasure(text, text) from public, anon, authenticated;
revoke all on function public.record_revenuecat_erasure_progress(text, text) from public, anon, authenticated;
grant execute on function public.request_revenuecat_erasure(text, text) to service_role;
grant execute on function public.record_revenuecat_erasure_progress(text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Deleted accounts stay deleted.
--
-- Once an account's deletion has been carried out (account_deleted or completed), no write may
-- recreate its rows — not even from a session token that has not expired yet. Applies to every
-- role. A request still 'requested' does not block: the account still exists and the person can
-- retry, or keep using it if the deletion failed before anything was removed.
-- ---------------------------------------------------------------------------------------------
create or replace function public.refuse_writes_for_deleted_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.revenuecat_erasure_requests
    where app_user_id = new.user_id and status in ('account_deleted', 'completed')
  ) then
    raise exception using errcode = '42501', message = 'This account has been deleted';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_writes_for_deleted_accounts() from public, anon, authenticated;

drop trigger if exists bookflow_workspaces_deleted_account_guard on public.bookflow_workspaces;
create trigger bookflow_workspaces_deleted_account_guard
  before insert or update on public.bookflow_workspaces
  for each row execute function public.refuse_writes_for_deleted_accounts();

drop trigger if exists public_invoice_links_deleted_account_guard on public.public_invoice_links;
create trigger public_invoice_links_deleted_account_guard
  before insert or update on public.public_invoice_links
  for each row execute function public.refuse_writes_for_deleted_accounts();

drop trigger if exists public_booking_offers_deleted_account_guard on public.public_booking_offers;
create trigger public_booking_offers_deleted_account_guard
  before insert or update on public.public_booking_offers
  for each row execute function public.refuse_writes_for_deleted_accounts();

drop trigger if exists support_requests_deleted_account_guard on public.support_requests;
create trigger support_requests_deleted_account_guard
  before insert or update on public.support_requests
  for each row execute function public.refuse_writes_for_deleted_accounts();

drop trigger if exists user_feedback_deleted_account_guard on public.user_feedback;
create trigger user_feedback_deleted_account_guard
  before insert or update on public.user_feedback
  for each row execute function public.refuse_writes_for_deleted_accounts();

-- ---------------------------------------------------------------------------------------------
-- The account's own data: booking forms are now removed explicitly as well. Everything else is as
-- defined in 20260916000000_account_deletion. Erasure requests are deliberately not touched.
-- ---------------------------------------------------------------------------------------------
create or replace function public.delete_bookflow_account_data(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_invoice_links integer;
  deleted_booking_offers integer;
  deleted_support_requests integer;
  deleted_feedback integer;
  deleted_workspaces integer;
begin
  if p_user_id is null or length(p_user_id) = 0 then
    raise exception 'A user id is required';
  end if;

  -- Children first. Links and booking forms would also cascade from the workspace, but are removed
  -- explicitly so the result does not depend on those foreign keys staying in place.
  delete from public.public_invoice_links where user_id = p_user_id;
  get diagnostics deleted_invoice_links = row_count;

  delete from public.public_booking_offers where user_id = p_user_id;
  get diagnostics deleted_booking_offers = row_count;

  delete from public.support_requests where user_id = p_user_id;
  get diagnostics deleted_support_requests = row_count;

  delete from public.user_feedback where user_id = p_user_id;
  get diagnostics deleted_feedback = row_count;

  -- The workspace document holds customers, bookings, invoices (Dustbin included), payments,
  -- income and expense entries, services, reminders, notifications, business profile, currency,
  -- language and invoice settings.
  delete from public.bookflow_workspaces where user_id = p_user_id;
  get diagnostics deleted_workspaces = row_count;

  return jsonb_build_object(
    'public_invoice_links', deleted_invoice_links,
    'public_booking_offers', deleted_booking_offers,
    'support_requests', deleted_support_requests,
    'user_feedback', deleted_feedback,
    'bookflow_workspaces', deleted_workspaces
  );
end;
$$;

revoke all on function public.delete_bookflow_account_data(text) from public, anon, authenticated;
grant execute on function public.delete_bookflow_account_data(text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Administration: the `bookflow_admin` schema is not in the API's exposed schemas, and its
-- functions are executable only by the database owner — i.e. from the Supabase SQL editor or psql
-- by someone signed in to the Supabase dashboard. There is no HTTP endpoint for any of this.
-- ---------------------------------------------------------------------------------------------
create schema if not exists bookflow_admin;
revoke all on schema bookflow_admin from public, anon, authenticated, service_role;

-- The queue, most urgent first. urgency: overdue (past the deadline) · due_soon (7 days or less) ·
-- pending (erasure owed) · awaiting_account_deletion (the BookFlow account still exists: do not
-- erase in RevenueCat yet) · completed.
create or replace function bookflow_admin.revenuecat_erasure_queue(p_include_completed boolean default false)
returns table (
  reference uuid,
  app_user_id text,
  clerk_instance text,
  status text,
  urgency text,
  requested_at timestamptz,
  deadline_at timestamptz,
  days_left integer,
  account_deleted_at timestamptz,
  completed_at timestamptz,
  completed_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.app_user_id, r.clerk_instance, r.status,
    case
      when r.status = 'completed' then 'completed'
      when now() > r.deadline_at then 'overdue'
      when r.status = 'requested' then 'awaiting_account_deletion'
      when r.deadline_at - now() <= interval '7 days' then 'due_soon'
      else 'pending'
    end,
    r.requested_at, r.deadline_at,
    ceil(extract(epoch from (r.deadline_at - now())) / 86400)::integer,
    r.account_deleted_at, r.completed_at, r.completed_by
  from public.revenuecat_erasure_requests r
  where p_include_completed or r.status <> 'completed'
  order by (r.status = 'completed'), r.deadline_at;
$$;

-- Marks an erasure done — only after the customer has been deleted in the RevenueCat dashboard and
-- checked to be gone. Refuses an account whose BookFlow deletion has not finished. Repeating it is
-- harmless and never changes who confirmed the original completion.
create or replace function bookflow_admin.complete_revenuecat_erasure(p_app_user_id text, p_verified_by text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.revenuecat_erasure_requests%rowtype;
begin
  if p_verified_by is null or char_length(btrim(p_verified_by)) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Say who verified the erasure';
  end if;

  select * into request from public.revenuecat_erasure_requests where app_user_id = p_app_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No erasure request for this app user id';
  end if;
  if request.status = 'requested' then
    raise exception using errcode = '55000', message = 'The BookFlow account deletion has not finished; do not erase the RevenueCat customer yet';
  end if;

  if request.status = 'account_deleted' then
    update public.revenuecat_erasure_requests
      set status = 'completed', completed_at = now(), completed_by = btrim(p_verified_by)
      where app_user_id = p_app_user_id
      returning * into request;
  end if;
  return jsonb_build_object('reference', request.id, 'status', request.status, 'completed_at', request.completed_at, 'completed_by', request.completed_by);
end;
$$;

revoke all on function bookflow_admin.revenuecat_erasure_queue(boolean) from public, anon, authenticated, service_role;
revoke all on function bookflow_admin.complete_revenuecat_erasure(text, text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
