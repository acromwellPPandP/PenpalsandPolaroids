create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_no_self_block check (blocker_id <> blocked_user_id),
  constraint blocked_users_unique_pair unique (blocker_id, blocked_user_id)
);

alter table public.blocked_users enable row level security;

create or replace function public.are_users_blocked(user_one uuid, user_two uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.blocked_users
    where (
      blocker_id = user_one
      and blocked_user_id = user_two
    ) or (
      blocker_id = user_two
      and blocked_user_id = user_one
    )
  );
$$;

revoke all on function public.are_users_blocked(uuid, uuid) from public;
grant execute on function public.are_users_blocked(uuid, uuid) to authenticated;

drop policy if exists "Users can read their own blocks" on public.blocked_users;
create policy "Users can read their own blocks"
  on public.blocked_users
  for select
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "Users can create their own blocks" on public.blocked_users;
create policy "Users can create their own blocks"
  on public.blocked_users
  for insert
  to authenticated
  with check (
    auth.uid() = blocker_id
    and blocker_id <> blocked_user_id
  );

drop policy if exists "Users can delete their own blocks" on public.blocked_users;
create policy "Users can delete their own blocks"
  on public.blocked_users
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  letter_id uuid references public.letters(id) on delete set null,
  scrapbook_id uuid,
  category text not null,
  description text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint reports_no_self_report check (reporter_id <> reported_user_id),
  constraint reports_category_check check (
    category in (
      'harassment',
      'inappropriate_content',
      'spam',
      'impersonation',
      'privacy_concern',
      'underage_safety',
      'other'
    )
  ),
  constraint reports_status_check check (status = 'pending')
);

create unique index if not exists reports_prevent_duplicate_reports
  on public.reports (
    reporter_id,
    reported_user_id,
    category,
    coalesce(letter_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(scrapbook_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.reports enable row level security;

drop policy if exists "Reporters can read their own reports" on public.reports;
create policy "Reporters can read their own reports"
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "Reporters can create pending reports" on public.reports;
create policy "Reporters can create pending reports"
  on public.reports
  for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and reporter_id <> reported_user_id
    and status = 'pending'
  );

drop policy if exists "Profiles are visible to signed-in users" on public.profiles;
drop policy if exists "Profiles are visible unless blocked" on public.profiles;
create policy "Profiles are visible unless blocked"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or not public.are_users_blocked(auth.uid(), id)
  );

drop policy if exists "Users can send letters" on public.letters;
create policy "Users can send letters"
  on public.letters
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> recipient_id
    and not public.are_users_blocked(sender_id, recipient_id)
  );

drop policy if exists "Users can read letters they sent or received" on public.letters;
drop policy if exists "Users can read unblocked letters they sent or received" on public.letters;
create policy "Users can read unblocked letters they sent or received"
  on public.letters
  for select
  to authenticated
  using (
    (auth.uid() = sender_id or auth.uid() = recipient_id)
    and not public.are_users_blocked(sender_id, recipient_id)
  );

drop policy if exists "Recipients can mark letters read" on public.letters;
create policy "Recipients can mark letters read"
  on public.letters
  for update
  to authenticated
  using (
    auth.uid() = recipient_id
    and not public.are_users_blocked(sender_id, recipient_id)
  )
  with check (
    auth.uid() = recipient_id
    and not public.are_users_blocked(sender_id, recipient_id)
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
        and not public.are_users_blocked(
          public.letters.sender_id,
          public.letters.recipient_id
        )
    )
  );
