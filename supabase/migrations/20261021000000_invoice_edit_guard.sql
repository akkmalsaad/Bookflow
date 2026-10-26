-- Invoice editing: the server half of an edit's validation.
--
-- Additive and backward compatible: one trigger function and one trigger. Nothing existing is altered.
--
-- Invoices live inside the owner's `bookflow_workspaces.data` document, and RLS already restricts that
-- row to its owner — no other user can read or write it. Customers reach an invoice only through the
-- `invoice-public` Edge Function, which can record Accept/Decline and nothing more. Editing therefore
-- needs no new access path; what it needs is a rule for what an owner write may do to an invoice that
-- already exists. RLS decides whose invoice it is; this decides what an owner write may change:
--
--  * An invoice keeps its number for good. (Its id is what the old and new copies are matched by.)
--  * A changed total must be a positive number, and never less than the payments already recorded
--    against the invoice — an edit can never rewrite or outgrow money that has been received.
--  * A closed invoice (in the Dustbin, cancelled, declined or void) keeps its total.
--
-- Acceptance is deliberately not a restriction: an accepted invoice can be edited and stays accepted.
--
-- Only invoices whose stored value actually changed are inspected, so a workspace save that does not
-- touch an invoice is never refused because of it. SECURITY DEFINER functions (the customer response
-- RPC, account deletion) and the service role run as other roles and are not restricted by this,
-- matching the booking offers owner guard.
create or replace function public.guard_bookflow_workspace_invoice_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed record;
  paid_cents numeric;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  for changed in
    select old_item, new_item
    from jsonb_array_elements(
        case when jsonb_typeof(old.data -> 'invoices') = 'array' then old.data -> 'invoices' else '[]'::jsonb end
      ) as old_items(old_item)
    join jsonb_array_elements(
        case when jsonb_typeof(new.data -> 'invoices') = 'array' then new.data -> 'invoices' else '[]'::jsonb end
      ) as new_items(new_item)
      on new_item ->> 'id' = old_item ->> 'id'
    where new_item is distinct from old_item
  loop
    if coalesce(changed.old_item ->> 'invoiceNumber', '') <> ''
      and changed.new_item ->> 'invoiceNumber' is distinct from changed.old_item ->> 'invoiceNumber' then
      raise exception using errcode = '42501', message = 'An invoice number cannot be changed';
    end if;

    if changed.new_item -> 'amount' is distinct from changed.old_item -> 'amount' then
      if coalesce(changed.old_item ->> 'deletedAt', '') <> ''
        or coalesce(changed.old_item ->> 'status', '') in ('Cancelled', 'Declined', 'Void') then
        raise exception using errcode = '42501', message = 'A closed invoice cannot be edited';
      end if;

      if jsonb_typeof(changed.new_item -> 'amount') is distinct from 'number'
        or (changed.new_item ->> 'amount')::numeric <= 0 then
        raise exception using errcode = '22023', message = 'An invoice total must be greater than zero';
      end if;

      select coalesce(sum(round((payment ->> 'amount')::numeric * 100)), 0)
      into paid_cents
      from jsonb_array_elements(
          case when jsonb_typeof(new.data -> 'payments') = 'array' then new.data -> 'payments' else '[]'::jsonb end
        ) as payments(payment)
      where payment ->> 'invoiceId' = changed.new_item ->> 'id'
        and jsonb_typeof(payment -> 'amount') = 'number';

      if round((changed.new_item ->> 'amount')::numeric * 100) < paid_cents then
        raise exception using errcode = '22023', message = 'An invoice total cannot be less than the payments received';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.guard_bookflow_workspace_invoice_write() from public, anon, authenticated;

drop trigger if exists bookflow_workspaces_invoice_guard on public.bookflow_workspaces;
create trigger bookflow_workspaces_invoice_guard
before update on public.bookflow_workspaces
for each row execute function public.guard_bookflow_workspace_invoice_write();
