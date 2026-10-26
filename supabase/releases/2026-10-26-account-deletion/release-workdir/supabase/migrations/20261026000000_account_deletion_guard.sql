-- Account deletion: deleted accounts stay deleted.
--
-- The delete-account Edge Function removes an account's Storage files and database rows, then its
-- Clerk login. Clerk session tokens are verified offline by Supabase until they expire, so a token
-- issued just before the deletion could still write — and a write would bring the deleted data back.
-- This records each deleted account and refuses any further write for it, from any role.
--
-- RevenueCat is not involved: BookFlow does not delete RevenueCat customer records (see the Privacy
-- Policy for what RevenueCat keeps and how to ask for its erasure).
--
-- What this adds:
--   * deleted_accounts — one row per deleted account: the Clerk user id, which Clerk instance, and
--     when its data and its login were removed. No other detail. Server-only. Kept for 30 days after
--     the login was removed (to block stale tokens and to answer "did my deletion finish?"), then
--     purged automatically the next time any account is deleted.
--   * record_account_deletion — used by the Edge Function (service role only).
--   * A guard on every table keyed by the account, refusing inserts and updates for a deleted
--     account.
--   * delete_bookflow_account_data now removes booking forms explicitly too (they already cascaded
--     from the workspace), so the result does not depend on that foreign key.
--
-- This replaces an earlier, never-applied draft of this migration (a manual RevenueCat erasure
-- queue, commit b855f32). Nothing was ever written to that queue.

create table if not exists public.deleted_accounts (
  user_id text primary key check (char_length(user_id) between 1 and 200),
  clerk_instance text not null check (clerk_instance in ('production', 'development')),
  data_deleted_at timestamptz not null default now(),
  login_deleted_at timestamptz
);

alter table public.deleted_accounts enable row level security;
-- No policies and no grants: no client role can read or write it.
revoke all on table public.deleted_accounts from public, anon, authenticated, service_role;

comment on table public.deleted_accounts is
  'Deleted BookFlow accounts, so no stale session can write their data back. Server-only; purged 30 days after the login is removed.';

-- 'data_deleted': the account's data is gone — from now on its rows can never be written again.
-- 'login_deleted': its Clerk login is gone too. Idempotent: repeating either changes nothing.
-- Also purges records whose login was removed more than 30 days ago.
create or replace function public.record_account_deletion(p_user_id text, p_clerk_instance text, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or char_length(p_user_id) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'A user id is required';
  end if;
  if p_event not in ('data_deleted', 'login_deleted') then
    raise exception using errcode = '22023', message = 'Unknown deletion event';
  end if;

  insert into public.deleted_accounts (user_id, clerk_instance)
  values (p_user_id, p_clerk_instance)
  on conflict (user_id) do nothing;

  if p_event = 'login_deleted' then
    update public.deleted_accounts
      set login_deleted_at = coalesce(login_deleted_at, now())
      where user_id = p_user_id;
  end if;

  delete from public.deleted_accounts where login_deleted_at < now() - interval '30 days';
end;
$$;

revoke all on function public.record_account_deletion(text, text, text) from public, anon, authenticated;
grant execute on function public.record_account_deletion(text, text, text) to service_role;

-- Refuses inserts and updates for a deleted account, whoever makes them.
create or replace function public.refuse_writes_for_deleted_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.deleted_accounts where user_id = new.user_id) then
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
-- The account's own data: booking forms (with any client submissions) are now removed explicitly
-- as well. Everything else is as defined in 20260916000000_account_deletion.
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

notify pgrst, 'reload schema';
