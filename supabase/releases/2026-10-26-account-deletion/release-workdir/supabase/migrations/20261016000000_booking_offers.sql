-- Booking forms, quotations and customer booking pages.
--
-- Additive and backward compatible: one new table, two private RPCs for the public Edge Function and
-- an owner write guard. Nothing existing is altered, and older app versions never touch this table.
-- Account deletion is unchanged: rows here cascade from the workspace row they belong to.
--
-- Bookings, customers and invoices stay inside the owner's `bookflow_workspaces.data` document. The
-- owner's app saves that document whole, so a server write into it could be overwritten by any app
-- version still holding an older copy. Customer responses therefore live here, in their own row, and
-- the owner's app turns a submission into a customer, booking and invoice with deterministic ids —
-- re-running it can never produce a second record. This row is the durable source of truth.
--
-- Tokens are random UUIDs (122 bits), used as bearer capabilities, scoped to one row, revocable
-- (status 'revoked') and expiring (expires_at). The anon role gets no table or function access at
-- all: customers reach these RPCs only through the `booking-public` Edge Function.

create table if not exists public.public_booking_offers (
  token uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub')
    references public.bookflow_workspaces(user_id) on delete cascade,
  offer_id text not null check (char_length(offer_id) between 1 and 120),
  kind text not null check (kind in ('booking_form', 'quotation', 'booking_page')),
  version integer not null default 1 check (version between 1 and 1000),
  -- Owner-written public snapshot. The server prices and validates every response from this.
  offer jsonb not null check (jsonb_typeof(offer) = 'object' and pg_column_size(offer) < 65536),
  status text not null default 'sent'
    check (status in ('sent', 'submitted', 'accepted', 'declined', 'change_requested', 'converted', 'revoked')),
  -- Owner-private: never returned by the Edge Function.
  customer_id text check (customer_id is null or char_length(customer_id) <= 120),
  owner_plan text not null default 'free' check (owner_plan in ('free', 'pro')),
  -- Customer-written (through the RPC only).
  response jsonb check (response is null or (jsonb_typeof(response) = 'object' and pg_column_size(response) < 16384)),
  responded_version integer,
  change_request text check (change_request is null or char_length(change_request) <= 1000),
  change_request_count integer not null default 0,
  terms_version text check (terms_version is null or char_length(terms_version) <= 40),
  terms_accepted_at timestamptz,
  idempotency_key text check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  submitted_at timestamptz,
  attempt_count integer not null default 0,
  -- Set by the owner's app once the response has become workspace records.
  booking_id text check (booking_id is null or char_length(booking_id) <= 120),
  invoice_id text check (invoice_id is null or char_length(invoice_id) <= 120),
  invoice_token uuid,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, offer_id)
);

create index if not exists public_booking_offers_owner_status_idx
  on public.public_booking_offers (user_id, status);

alter table public.public_booking_offers enable row level security;

revoke all on table public.public_booking_offers from anon, authenticated;
grant select, insert, update, delete on table public.public_booking_offers to authenticated;

drop policy if exists "Users manage their own booking offers" on public.public_booking_offers;
create policy "Users manage their own booking offers"
on public.public_booking_offers
for all
to authenticated
using ((select auth.jwt() ->> 'sub') = user_id)
with check ((select auth.jwt() ->> 'sub') = user_id);

-- ---------------------------------------------------------------------------------------------
-- Owner write guard.
--
-- RLS decides *whose* row it is; this decides what the owner may change. An owner can never write
-- a customer's response, terms acceptance or idempotency key, and can never change the agreed
-- details of a version the customer has already submitted or accepted. The SECURITY DEFINER RPCs
-- below run as the function owner, not as `authenticated`, so they are not restricted by this.
-- ---------------------------------------------------------------------------------------------
create or replace function public.guard_public_booking_offer_owner_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.expires_at > now() + interval '120 days' then
    raise exception using errcode = '22023', message = 'Booking links may last at most 120 days';
  end if;

  if tg_op = 'INSERT' then
    if new.response is not null or new.responded_version is not null or new.change_request is not null
      or new.change_request_count <> 0 or new.terms_version is not null or new.terms_accepted_at is not null
      or new.idempotency_key is not null or new.submitted_at is not null or new.attempt_count <> 0 then
      raise exception using errcode = '42501', message = 'Customer response fields are not writable';
    end if;
    if new.kind = 'booking_page' and new.status not in ('converted', 'revoked') then
      raise exception using errcode = '22023', message = 'A booking page link starts as converted';
    end if;
    if new.kind <> 'booking_page' and new.status not in ('sent', 'revoked') then
      raise exception using errcode = '22023', message = 'A new offer link starts as sent';
    end if;
    return new;
  end if;

  if new.token <> old.token or new.user_id <> old.user_id or new.offer_id <> old.offer_id or new.kind <> old.kind then
    raise exception using errcode = '42501', message = 'Offer identity is immutable';
  end if;

  if new.response is distinct from old.response
    or new.responded_version is distinct from old.responded_version
    or new.change_request is distinct from old.change_request
    or new.change_request_count <> old.change_request_count
    or new.terms_version is distinct from old.terms_version
    or new.terms_accepted_at is distinct from old.terms_accepted_at
    or new.idempotency_key is distinct from old.idempotency_key
    or new.submitted_at is distinct from old.submitted_at
    or new.attempt_count <> old.attempt_count then
    raise exception using errcode = '42501', message = 'Customer response fields are not writable';
  end if;

  if old.status in ('submitted', 'accepted', 'converted') then
    -- What the customer agreed to is frozen.
    if new.offer is distinct from old.offer or new.version <> old.version then
      raise exception using errcode = '42501', message = 'Agreed details cannot be changed after the customer responded';
    end if;
    if new.status not in (old.status, 'converted', 'revoked') then
      raise exception using errcode = '22023', message = 'Unsupported status change';
    end if;
  else
    if new.status not in ('sent', 'revoked', old.status) then
      raise exception using errcode = '22023', message = 'Unsupported status change';
    end if;
    if new.version < old.version then
      raise exception using errcode = '22023', message = 'Versions only move forward';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_public_booking_offer_owner_write() from public, anon, authenticated;

drop trigger if exists public_booking_offers_owner_guard on public.public_booking_offers;
create trigger public_booking_offers_owner_guard
before insert or update on public.public_booking_offers
for each row execute function public.guard_public_booking_offer_owner_write();

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- 'HH:MM' → minutes after midnight, or null.
create or replace function public.booking_offer_minutes(p_value text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
      then split_part(p_value, ':', 1)::integer * 60 + split_part(p_value, ':', 2)::integer
    else null
  end;
$$;

-- 'YYYY-MM-DD' → a date, or null (never raises on bad input).
create or replace function public.booking_offer_date(p_value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_value::date;
exception when others then
  return null;
end;
$$;

-- The calendar month a workspace record was created in, read the way lib/plan-limits does: its
-- stored day key, or the millisecond timestamp in a legacy id, in the owner's own timezone.
create or replace function public.booking_offer_record_month(p_item jsonb, p_field text, p_zone text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  stored text := p_item ->> p_field;
  stamp text;
begin
  if stored ~ '^\d{4}-\d{2}' then
    return left(stored, 7);
  end if;
  stamp := substring(coalesce(p_item ->> 'id', '') from '(?:^|-)(\d{13})(?:-|$)');
  if stamp is null then
    return null;
  end if;
  return to_char(to_timestamp(stamp::bigint / 1000.0) at time zone p_zone, 'YYYY-MM');
end;
$$;

revoke all on function public.booking_offer_minutes(text) from public, anon, authenticated;
revoke all on function public.booking_offer_date(text) from public, anon, authenticated;
revoke all on function public.booking_offer_record_month(jsonb, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Read (service_role only — called by the booking-public Edge Function).
--
-- Returns the stored snapshot plus the live state of the booking, invoice and payments the offer
-- became. The Edge Function projects this through an allow-list before anything leaves the server;
-- internal notes, customer ids and other bookings are never part of the response.
-- ---------------------------------------------------------------------------------------------
create or replace function public.read_booking_offer_state(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'kind', l.kind,
    'status', l.status,
    'version', l.version,
    'offer', l.offer,
    'expires_at', l.expires_at,
    'submitted_at', l.submitted_at,
    'terms_accepted_at', l.terms_accepted_at,
    'responded_version', l.responded_version,
    'change_request_count', l.change_request_count,
    'invoice_token', l.invoice_token,
    'booking', (
      select b.item from jsonb_array_elements(coalesce(w.data -> 'bookings', '[]'::jsonb)) b(item)
      where l.booking_id is not null and b.item ->> 'id' = l.booking_id
      limit 1
    ),
    'invoice', (
      select i.item from jsonb_array_elements(coalesce(w.data -> 'invoices', '[]'::jsonb)) i(item)
      where l.invoice_id is not null and i.item ->> 'id' = l.invoice_id
      limit 1
    ),
    'payments', coalesce((
      select jsonb_agg(p.item)
      from jsonb_array_elements(coalesce(w.data -> 'payments', '[]'::jsonb)) p(item)
      where l.invoice_id is not null and p.item ->> 'invoiceId' = l.invoice_id
    ), '[]'::jsonb)
  )
  from public.public_booking_offers l
  join public.bookflow_workspaces w on w.user_id = l.user_id
  where l.token = p_token
    and l.status <> 'revoked'
    and l.expires_at > now();
$$;

revoke all on function public.read_booking_offer_state(uuid) from public, anon, authenticated;
grant execute on function public.read_booking_offer_state(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Respond (service_role only).
--
-- p_action: 'submit' (booking form), 'accept' / 'decline' (quotation), 'request_change' (either).
-- Business failures are *returned* as {ok:false,error} rather than raised, so the attempt counter
-- survives them; only an unknown or closed link raises (P0002), which the function maps to 404.
--
-- Concurrency: the owner's workspace row is locked first (the same order respond_to_invoice_link
-- uses), then the offer row. Two simultaneous submissions for the same owner therefore run one
-- after the other, and the second sees the first's slot and plan usage.
-- ---------------------------------------------------------------------------------------------
create or replace function public.respond_to_booking_offer(
  p_token uuid,
  p_action text,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id text;
  workspace_data jsonb;
  link public.public_booking_offers%rowtype;
  snapshot jsonb;
  payload jsonb := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  v_name text;
  v_phone text;
  v_email text;
  v_location text;
  v_customer_location text;
  v_message text;
  v_zone text;
  v_today date;
  v_month text;
  v_date date;
  v_start integer;
  v_end integer;
  v_buffer integer;
  v_req_start bigint;
  v_req_end bigint;
  v_known text[];
  v_conflicts integer;
  v_used integer;
  v_email_known boolean;
  v_valid_until date;
begin
  if p_action is null or p_action not in ('submit', 'accept', 'decline', 'request_change') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_action');
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select user_id into owner_id from public.public_booking_offers where token = p_token;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking link not found or expired';
  end if;

  select data into workspace_data from public.bookflow_workspaces where user_id = owner_id for update;
  select * into link from public.public_booking_offers where token = p_token and user_id = owner_id for update;
  if not found or workspace_data is null or link.status = 'revoked' or link.expires_at <= now() then
    raise exception using errcode = 'P0002', message = 'Booking link not found or expired';
  end if;

  -- A retried request that already succeeded returns the same result instead of failing.
  if link.idempotency_key is not null and link.idempotency_key = p_idempotency_key then
    return jsonb_build_object('ok', true, 'state', public.read_booking_offer_state(p_token));
  end if;

  if link.attempt_count >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  update public.public_booking_offers set attempt_count = attempt_count + 1 where token = p_token;

  if link.kind = 'booking_page' then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if link.status not in ('sent', 'change_requested') then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  -- The customer must be answering the version they were shown.
  if coalesce(payload ->> 'version', '') !~ '^\d{1,4}$' or (payload ->> 'version')::integer <> link.version then
    return jsonb_build_object('ok', false, 'error', 'offer_changed');
  end if;

  snapshot := link.offer;
  v_zone := coalesce(nullif(snapshot ->> 'timeZone', ''), 'UTC');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    v_zone := 'UTC';
  end if;
  v_today := (now() at time zone v_zone)::date;
  v_month := to_char(v_today, 'YYYY-MM');

  -- ------------------------------------------------------------------ change request
  if p_action = 'request_change' then
    v_message := btrim(coalesce(payload ->> 'message', ''));
    if char_length(v_message) < 5 or char_length(v_message) > 1000 then
      return jsonb_build_object('ok', false, 'error', 'invalid_change');
    end if;
    if link.change_request_count >= 3 then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    update public.public_booking_offers
      set status = 'change_requested',
          change_request = v_message,
          change_request_count = change_request_count + 1,
          idempotency_key = p_idempotency_key,
          updated_at = now()
      where token = p_token;
    return jsonb_build_object('ok', true, 'state', public.read_booking_offer_state(p_token));
  end if;

  -- ------------------------------------------------------------------ decline
  if p_action = 'decline' then
    if link.kind <> 'quotation' then
      return jsonb_build_object('ok', false, 'error', 'unsupported_action');
    end if;
    update public.public_booking_offers
      set status = 'declined', responded_version = link.version, idempotency_key = p_idempotency_key, updated_at = now()
      where token = p_token;
    return jsonb_build_object('ok', true, 'state', public.read_booking_offer_state(p_token));
  end if;

  if (p_action = 'accept' and link.kind <> 'quotation') or (p_action = 'submit' and link.kind <> 'booking_form') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_action');
  end if;

  -- ------------------------------------------------------------------ terms and validity
  if coalesce(payload ->> 'acceptTerms', '') <> 'true'
    or coalesce(payload ->> 'termsVersion', '') <> coalesce(snapshot ->> 'termsVersion', '') then
    return jsonb_build_object('ok', false, 'error', 'terms_required');
  end if;
  v_valid_until := public.booking_offer_date(snapshot ->> 'validUntil');
  if v_valid_until is not null and v_today > v_valid_until then
    return jsonb_build_object('ok', false, 'error', 'offer_expired');
  end if;

  -- ------------------------------------------------------------------ customer details
  -- Only these five are ever read from the customer. Everything else on the booking (package,
  -- price, charges, deposit, date, time, terms) comes from the owner's stored snapshot.
  v_name := btrim(coalesce(payload ->> 'name', ''));
  v_phone := btrim(coalesce(payload ->> 'phone', ''));
  v_email := lower(btrim(coalesce(payload ->> 'email', '')));
  v_location := btrim(coalesce(payload ->> 'location', ''));
  v_customer_location := btrim(coalesce(payload ->> 'customerLocation', ''));

  if p_action = 'submit' then
    if char_length(v_name) < 2 or char_length(v_name) > 120 then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if v_phone !~ '^\+?[0-9 ().-]{7,24}$' or char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 15 then
      return jsonb_build_object('ok', false, 'error', 'invalid_phone');
    end if;
    -- The customer's email is always required on a booking form.
    if v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_email');
    end if;
    if (v_location = '' and coalesce(snapshot ->> 'location', '') = '') or char_length(v_location) > 300 then
      return jsonb_build_object('ok', false, 'error', 'invalid_location');
    end if;
    if char_length(v_customer_location) > 300 then
      return jsonb_build_object('ok', false, 'error', 'invalid_customer_location');
    end if;
  else
    -- Accepting a quotation only optionally records who accepted it.
    v_name := left(v_name, 120);
    v_phone := '';
    v_email := '';
    v_location := '';
    v_customer_location := '';
  end if;

  -- ------------------------------------------------------------------ availability
  v_date := public.booking_offer_date(snapshot ->> 'date');
  v_start := public.booking_offer_minutes(snapshot ->> 'startTime');
  v_end := public.booking_offer_minutes(snapshot ->> 'endTime');
  if v_date is null or v_start is null or v_end is null or v_end <= v_start then
    return jsonb_build_object('ok', false, 'error', 'offer_invalid');
  end if;
  v_buffer := least(coalesce(case when (snapshot ->> 'bufferMinutes') ~ '^\d{1,4}$' then (snapshot ->> 'bufferMinutes')::integer end, 0), 720);
  v_req_start := (v_date - date '2000-01-01')::bigint * 1440 + v_start;
  v_req_end := (v_date - date '2000-01-01')::bigint * 1440 + v_end;
  -- Bookings the owner saw clashing and deliberately accepted when preparing this offer.
  select coalesce(array_agg(value), '{}') into v_known
    from jsonb_array_elements_text(coalesce(snapshot -> 'acceptedConflictIds', '[]'::jsonb));

  with existing as (
    select
      b.item ->> 'id' as id,
      public.booking_offer_date(b.item ->> 'date') as day,
      public.booking_offer_minutes(coalesce(b.item ->> 'startTime', b.item ->> 'time')) as start_minutes,
      public.booking_offer_minutes(b.item ->> 'endTime') as end_minutes,
      least(coalesce(case when (b.item ->> 'bufferMinutes') ~ '^\d{1,4}$' then (b.item ->> 'bufferMinutes')::integer end, 0), 720) as buffer
    from jsonb_array_elements(coalesce(workspace_data -> 'bookings', '[]'::jsonb)) b(item)
    where coalesce(b.item ->> 'status', '') <> 'Cancelled'
    union all
    -- Other customers' responses not yet turned into bookings still hold their slot.
    select
      o.offer_id,
      public.booking_offer_date(o.offer ->> 'date'),
      public.booking_offer_minutes(o.offer ->> 'startTime'),
      public.booking_offer_minutes(o.offer ->> 'endTime'),
      least(coalesce(case when (o.offer ->> 'bufferMinutes') ~ '^\d{1,4}$' then (o.offer ->> 'bufferMinutes')::integer end, 0), 720)
    from public.public_booking_offers o
    where o.user_id = owner_id
      and o.token <> p_token
      and o.status in ('submitted', 'accepted')
      and o.booking_id is null
  ), ranges as (
    select id,
      (day - date '2000-01-01')::bigint * 1440 + start_minutes as range_start,
      (day - date '2000-01-01')::bigint * 1440 + case when end_minutes is not null and end_minutes > start_minutes then end_minutes else 1440 end as range_end,
      greatest(buffer, v_buffer) as gap
    from existing
    where day is not null and start_minutes is not null and abs(day - v_date) <= 1
  )
  select count(*) into v_conflicts
  from ranges
  where v_req_start < range_end + gap
    and range_start < v_req_end + gap
    and not coalesce(id = any(v_known), false);

  if v_conflicts > 0 then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  -- ------------------------------------------------------------------ plan limits
  -- The Free allowance (lib/plan-limits: 5 clients, 5 bookings and 3 invoices a month) counted
  -- from the workspace plus responses still waiting to become records. `owner_plan` is written by
  -- the owner's app from its RevenueCat entitlement — the same trust the app's own limits rely on.
  if p_action = 'submit' and link.owner_plan = 'free' then
    select count(*) into v_used
      from jsonb_array_elements(coalesce(workspace_data -> 'bookings', '[]'::jsonb)) b(item)
      where public.booking_offer_record_month(b.item, 'createdAt', v_zone) = v_month;
    v_used := v_used + (
      select count(*) from public.public_booking_offers o
      where o.user_id = owner_id and o.token <> p_token and o.kind = 'booking_form'
        and o.status = 'submitted' and o.booking_id is null
        and to_char(o.submitted_at at time zone v_zone, 'YYYY-MM') = v_month);
    if v_used >= 5 then
      return jsonb_build_object('ok', false, 'error', 'plan_limit');
    end if;

    select count(*) into v_used
      from jsonb_array_elements(coalesce(workspace_data -> 'invoices', '[]'::jsonb)) i(item)
      where public.booking_offer_record_month(i.item, 'sentAt', v_zone) = v_month;
    v_used := v_used + (
      select count(*) from public.public_booking_offers o
      where o.user_id = owner_id and o.token <> p_token and o.kind = 'booking_form'
        and o.status = 'submitted' and o.booking_id is null
        and to_char(o.submitted_at at time zone v_zone, 'YYYY-MM') = v_month);
    if v_used >= 3 then
      return jsonb_build_object('ok', false, 'error', 'plan_limit');
    end if;

    if link.customer_id is null then
      select exists (
        select 1 from jsonb_array_elements(coalesce(workspace_data -> 'customers', '[]'::jsonb)) c(item)
        where v_email <> '' and lower(btrim(coalesce(c.item ->> 'email', ''))) = v_email
      ) into v_email_known;
      if not v_email_known then
        v_used := jsonb_array_length(coalesce(workspace_data -> 'customers', '[]'::jsonb)) + (
          select count(*) from public.public_booking_offers o
          where o.user_id = owner_id and o.token <> p_token and o.kind = 'booking_form'
            and o.status = 'submitted' and o.booking_id is null and o.customer_id is null);
        if v_used >= 5 then
          return jsonb_build_object('ok', false, 'error', 'plan_limit');
        end if;
      end if;
    end if;
  end if;

  update public.public_booking_offers
    set status = case when p_action = 'accept' then 'accepted' else 'submitted' end,
        response = jsonb_strip_nulls(jsonb_build_object(
          'name', nullif(v_name, ''),
          'phone', nullif(v_phone, ''),
          'email', nullif(v_email, ''),
          'location', nullif(v_location, ''),
          'customerLocation', nullif(v_customer_location, '')
        )),
        responded_version = link.version,
        terms_version = snapshot ->> 'termsVersion',
        terms_accepted_at = now(),
        submitted_at = now(),
        idempotency_key = p_idempotency_key,
        updated_at = now()
    where token = p_token;

  return jsonb_build_object('ok', true, 'state', public.read_booking_offer_state(p_token));
end;
$$;

revoke all on function public.respond_to_booking_offer(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.respond_to_booking_offer(uuid, text, jsonb, text) to service_role;

comment on table public.public_booking_offers is
  'Capability-token booking forms, quotations and customer booking pages, served through the booking-public Edge Function.';
