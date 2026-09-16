-- Current state is read from the owner workspace; the link retains the frozen presentation.
-- This RPC is private to the Edge Function. No workspace is returned to anonymous clients.
create or replace function public.read_public_invoice_state(p_token uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'payload', l.payload, 'status', l.status,
    'invoice', i.item,
    'payments', coalesce((select jsonb_agg(p.item)
      from jsonb_array_elements(coalesce(w.data->'payments', '[]'::jsonb)) p(item)
      where p.item->>'invoiceId' = l.invoice_id), '[]'::jsonb)
  )
  from public.public_invoice_links l
  join public.bookflow_workspaces w on w.user_id = l.user_id
  cross join lateral jsonb_array_elements(coalesce(w.data->'invoices', '[]'::jsonb)) i(item)
  where l.token = p_token and l.expires_at > now() and i.item->>'id' = l.invoice_id;
$$;
revoke all on function public.read_public_invoice_state(uuid) from public, anon, authenticated;
grant execute on function public.read_public_invoice_state(uuid) to service_role;

create or replace function public.respond_to_invoice_link(p_token uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  selected_link public.public_invoice_links%rowtype;
  owner_id text;
  workspace_data jsonb;
  current_invoice jsonb;
  paid_cents numeric;
begin
  if p_status is null or p_status not in ('Accepted', 'Declined') then
    raise exception using errcode = '22023', message = 'Unsupported invoice response';
  end if;
  select user_id into owner_id from public.public_invoice_links
    where token = p_token and expires_at > now();
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice link not found or expired';
  end if;
  -- Lock the workspace before the link, matching owner writes and serializing concurrent responses.
  select data into workspace_data from public.bookflow_workspaces where user_id = owner_id for update;
  select * into selected_link from public.public_invoice_links
    where token = p_token and user_id = owner_id and expires_at > now() for update;
  if not found or workspace_data is null then
    raise exception using errcode = 'P0002', message = 'Invoice link not found or expired';
  end if;
  select item into current_invoice from jsonb_array_elements(coalesce(workspace_data->'invoices','[]')) item
    where item->>'id' = selected_link.invoice_id;
  if current_invoice is null then
    raise exception using errcode = 'P0002', message = 'Invoice link not found or expired';
  end if;
  select coalesce(sum(round((p->>'amount')::numeric * 100)), 0) into paid_cents
    from jsonb_array_elements(coalesce(workspace_data->'payments','[]')) p
    where p->>'invoiceId' = selected_link.invoice_id;
  if selected_link.status <> 'Sent'
    or coalesce(current_invoice->>'status','') not in ('Sent','Overdue')
    or coalesce(current_invoice->>'deletedAt','') <> ''
    or paid_cents > 0
    or coalesce((current_invoice->>'depositPaid')::numeric,0) > 0 then
    raise exception using errcode = 'P0001', message = 'This invoice is no longer active';
  end if;
  update public.bookflow_workspaces set data = jsonb_set(workspace_data, '{invoices}',
    (select jsonb_agg(case when item->>'id' = selected_link.invoice_id
      then jsonb_set(item,'{status}',to_jsonb(p_status)) else item end order by ordinal)
      from jsonb_array_elements(workspace_data->'invoices') with ordinality as entries(item,ordinal))),
    updated_at = now() where user_id = owner_id;
  update public.public_invoice_links set status = p_status,
    payload = jsonb_set(payload,'{invoice,status}',to_jsonb(p_status)), updated_at = now()
    where token = p_token;
  return public.read_public_invoice_state(p_token);
end;
$$;
revoke all on function public.respond_to_invoice_link(uuid,text) from public, anon, authenticated;
grant execute on function public.respond_to_invoice_link(uuid,text) to service_role;
