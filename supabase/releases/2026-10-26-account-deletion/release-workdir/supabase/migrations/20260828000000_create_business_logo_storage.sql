-- Business logos are public assets because customers must be able to see them on
-- capability-token invoice pages. Writes remain isolated to the signed-in Clerk user.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos',
  'business-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Supabase Storage upsert checks SELECT as well as INSERT/UPDATE permissions.
drop policy if exists "Users read their own business logo metadata" on storage.objects;
create policy "Users read their own business logo metadata"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

drop policy if exists "Users upload their own business logo" on storage.objects;
create policy "Users upload their own business logo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

drop policy if exists "Users update their own business logo" on storage.objects;
create policy "Users update their own business logo"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

drop policy if exists "Users delete their own business logo" on storage.objects;
create policy "Users delete their own business logo"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);
