-- Invoice Trash / Void support.
--
-- Bookflow keeps invoices inside the per-user `bookflow_workspaces.data` JSON document rather than
-- in a relational invoices table, so the soft-delete fields (deletedAt, deletionReason, voidedAt,
-- voidReason) live on each invoice object and need no DDL. What *does* need changing is the
-- capability-token table that backs public invoice links: a trashed or voided invoice must stop
-- being answerable by the customer.

-- 1. 'Void' joins the statuses a public invoice link may carry.
alter table public.public_invoice_links
  drop constraint if exists public_invoice_links_status_check;

alter table public.public_invoice_links
  add constraint public_invoice_links_status_check
  check (status in ('Sent', 'Accepted', 'Declined', 'Paid', 'Cancelled', 'Void'));

-- 2. Closed links refuse customer responses server-side.
--
-- The public page already hides Accept/Decline for anything other than 'Sent', but that is only a
-- UI affordance: the Edge Function POST is reachable by anyone holding the token. Moving an invoice
-- to Trash flips its link to 'Cancelled' (or 'Void'), and this guard is what actually makes the
-- link unanswerable. The token itself is unchanged, so restoring an invoice re-opens the same link
-- rather than minting a weaker one.
create or replace function public.respond_to_invoice_link(p_token uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_link public.public_invoice_links%rowtype;
  response_payload jsonb;
begin
  if p_status not in ('Accepted', 'Declined') then
    raise exception 'Unsupported invoice response';
  end if;

  select *
  into selected_link
  from public.public_invoice_links
  where token = p_token
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invoice link not found or expired';
  end if;

  -- Deliberately generic: the customer is never told whether the invoice was cancelled, voided or
  -- deleted, only that it can no longer be responded to.
  if selected_link.status in ('Cancelled', 'Void') then
    raise exception 'This invoice is no longer active';
  end if;

  response_payload := jsonb_set(
    selected_link.payload,
    '{invoice,status}',
    to_jsonb(p_status),
    true
  );

  update public.public_invoice_links
  set status = p_status,
      payload = response_payload,
      updated_at = now()
  where token = p_token;

  -- Only ever touches invoices that are still active in the workspace: an invoice sitting in Trash
  -- (deletedAt set) keeps whatever status it was closed with.
  update public.bookflow_workspaces as workspace
  set data = jsonb_set(
        workspace.data,
        '{invoices}',
        coalesce(
          (
            select jsonb_agg(
              case
                when invoice_item ->> 'id' = selected_link.invoice_id
                  and coalesce(invoice_item ->> 'deletedAt', '') = ''
                  then jsonb_set(invoice_item, '{status}', to_jsonb(p_status), true)
                else invoice_item
              end
            )
            from jsonb_array_elements(coalesce(workspace.data -> 'invoices', '[]'::jsonb)) as invoice_item
          ),
          '[]'::jsonb
        ),
        true
      ),
      updated_at = now()
  where workspace.user_id = selected_link.user_id;

  return jsonb_build_object('payload', response_payload, 'status', p_status);
end;
$$;

revoke all on function public.respond_to_invoice_link(uuid, text) from public, anon, authenticated;
grant execute on function public.respond_to_invoice_link(uuid, text) to service_role;

comment on constraint public_invoice_links_status_check on public.public_invoice_links is
  'Includes Void so a voided invoice can deactivate its public link without losing the token.';
