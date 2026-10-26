-- ROLLBACK for 20261026000000_account_deletion_guard. Not a migration: run only to undo it,
-- in one transaction (psql --single-transaction -v ON_ERROR_STOP=1 -f <this file>).
--
-- Removes the deleted-account write guards and record_account_deletion, and restores
-- delete_bookflow_account_data exactly as 20260916000000 defined it.
--
-- The deleted_accounts table is kept: it holds only ids of accounts already deleted, which
-- the previous delete-account function does not use, and it ages out of relevance on its own.
-- Afterwards: supabase migration repair --status reverted 20261026000000

begin;

drop trigger if exists bookflow_workspaces_deleted_account_guard on public.bookflow_workspaces;
drop trigger if exists public_invoice_links_deleted_account_guard on public.public_invoice_links;
drop trigger if exists public_booking_offers_deleted_account_guard on public.public_booking_offers;
drop trigger if exists support_requests_deleted_account_guard on public.support_requests;
drop trigger if exists user_feedback_deleted_account_guard on public.user_feedback;
drop function if exists public.refuse_writes_for_deleted_accounts();
drop function if exists public.record_account_deletion(text, text, text);

create or replace function public.delete_bookflow_account_data(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_invoice_links integer;
  deleted_support_requests integer;
  deleted_feedback integer;
  deleted_workspaces integer;
begin
  if p_user_id is null or length(p_user_id) = 0 then
    raise exception 'A user id is required';
  end if;

  -- Children first. public_invoice_links would also cascade from the workspace, but is removed
  -- explicitly so the result does not depend on that foreign key staying in place.
  delete from public.public_invoice_links where user_id = p_user_id;
  get diagnostics deleted_invoice_links = row_count;

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
    'support_requests', deleted_support_requests,
    'user_feedback', deleted_feedback,
    'bookflow_workspaces', deleted_workspaces
  );
end;
$$;

revoke all on function public.delete_bookflow_account_data(text) from public, anon, authenticated;
grant execute on function public.delete_bookflow_account_data(text) to service_role;

notify pgrst, 'reload schema';

commit;
