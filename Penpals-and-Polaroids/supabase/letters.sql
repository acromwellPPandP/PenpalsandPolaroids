create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  photo_path text not null,
  photo_name text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.letters enable row level security;

insert into storage.buckets (id, name, public)
values ('letter-photos', 'letter-photos', false)
on conflict (id) do nothing;

drop policy if exists "Users can send letters" on public.letters;
create policy "Users can send letters"
  on public.letters
  for insert
  to authenticated
  with check (auth.uid() = sender_id);

drop policy if exists "Users can read letters they sent or received" on public.letters;
create policy "Users can read letters they sent or received"
  on public.letters
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Recipients can mark letters read" on public.letters;
create policy "Recipients can mark letters read"
  on public.letters
  for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "Users can upload their letter photos" on storage.objects;
create policy "Users can upload their letter photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'letter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read letter photos they can access" on storage.objects;
create policy "Users can read letter photos they can access"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'letter-photos'
    and exists (
      select 1
      from public.letters
      where public.letters.photo_path = storage.objects.name
        and (
          public.letters.sender_id = auth.uid()
          or public.letters.recipient_id = auth.uid()
        )
    )
  );
