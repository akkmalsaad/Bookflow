-- Server-side account deletion.
--
-- Called only by the `delete-account` Edge Function, which verifies the caller's Clerk session
-- token itself and passes the verified Clerk user id. Nothing here is reachable from the app:
-- execute is revoked from public, anon and authenticated and granted to service_role alone, so a
-- client can never ask to delete someone else's data by supplying an id.
--
-- Every BookFlow table keyed by the Clerk user id is removed in one transaction, so a failure part
-- way through leaves the account's data exactly as it was. Deleting rows that are already gone is
-- a no-op, which makes a retry after any later failure safe.
--
-- Storage objects (business-logos/<user_id>/...) are removed by the Edge Function through the
-- Storage API before this runs — Supabase does not support deleting storage objects with SQL.

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

comment on function public.delete_bookflow_account_data(text) is
  'Deletes every BookFlow database row owned by a Clerk user. service_role only; invoked by the delete-account Edge Function after it verifies the caller.';
