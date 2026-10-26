create table if not exists public.public_invoice_links (
  token uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub')
    references public.bookflow_workspaces(user_id) on delete cascade,
  invoice_id text not null,
  payload jsonb not null,
  status text not null default 'Sent'
    check (status in ('Sent', 'Accepted', 'Declined', 'Paid', 'Cancelled')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_id)
);

alter table public.public_invoice_links enable row level security;

revoke all on table public.public_invoice_links from anon;
grant select, insert, update, delete on table public.public_invoice_links to authenticated;

drop policy if exists "Users manage their own public invoice links" on public.public_invoice_links;
create policy "Users manage their own public invoice links"
on public.public_invoice_links
for all
to authenticated
using ((select auth.jwt() ->> 'sub') = user_id)
with check ((select auth.jwt() ->> 'sub') = user_id);

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

  update public.bookflow_workspaces as workspace
  set data = jsonb_set(
        workspace.data,
        '{invoices}',
        coalesce(
          (
            select jsonb_agg(
              case
                when invoice_item ->> 'id' = selected_link.invoice_id
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

comment on table public.public_invoice_links is
  'Capability-token invoice snapshots served through the public invoice Edge Function.';
