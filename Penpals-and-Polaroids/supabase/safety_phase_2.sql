-- Phase 2 moderation foundation.
-- First moderator setup:
-- 1. Run this migration in Supabase SQL Editor.
-- 2. Find the first moderator's auth.users.id in Supabase Auth.
-- 3. Run:
--    insert into public.moderator_users (user_id) values ('USER_UUID_HERE')
--    on conflict (user_id) do nothing;
-- Moderator roles are stored in this server-controlled table, not in profiles.

create table if not exists public.moderator_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.moderator_users enable row level security;

create or replace function public.is_moderator(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.moderator_users
    where user_id = check_user_id
  );
$$;

revoke all on function public.is_moderator(uuid) from public;
grant execute on function public.is_moderator(uuid) to authenticated;

drop policy if exists "Moderators can read moderator users" on public.moderator_users;
create policy "Moderators can read moderator users"
  on public.moderator_users
  for select
  to authenticated
  using (public.is_moderator(auth.uid()) or auth.uid() = user_id);

create table if not exists public.account_statuses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active',
  reason text,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint account_statuses_status_check check (status in ('active', 'suspended'))
);

alter table public.account_statuses enable row level security;

create or replace function public.is_account_active(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select status <> 'suspended'
      from public.account_statuses
      where user_id = check_user_id
    ),
    true
  );
$$;

revoke all on function public.is_account_active(uuid) from public;
grant execute on function public.is_account_active(uuid) to authenticated;

drop policy if exists "Users can read their own account status" on public.account_statuses;
create policy "Users can read their own account status"
  on public.account_statuses
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_moderator(auth.uid()));

drop policy if exists "Moderators can manage account statuses" on public.account_statuses;
create policy "Moderators can manage account statuses"
  on public.account_statuses
  for all
  to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

create table if not exists public.account_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  moderator_id uuid not null references auth.users(id) on delete restrict,
  report_id uuid references public.reports(id) on delete set null,
  reason text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.account_warnings enable row level security;

drop policy if exists "Moderators can read account warnings" on public.account_warnings;
create policy "Moderators can read account warnings"
  on public.account_warnings
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

drop policy if exists "Moderators can create account warnings" on public.account_warnings;
create policy "Moderators can create account warnings"
  on public.account_warnings
  for insert
  to authenticated
  with check (public.is_moderator(auth.uid()) and moderator_id = auth.uid());

create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.moderation_audit_log enable row level security;

drop policy if exists "Moderators can read audit log" on public.moderation_audit_log;
create policy "Moderators can read audit log"
  on public.moderation_audit_log
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

drop policy if exists "Moderators can create audit log" on public.moderation_audit_log;
create policy "Moderators can create audit log"
  on public.moderation_audit_log
  for insert
  to authenticated
  with check (public.is_moderator(auth.uid()) and moderator_id = auth.uid());

alter table public.reports
  drop constraint if exists reports_status_check;

alter table public.reports
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolved_at timestamptz;

alter table public.reports
  add constraint reports_status_check
  check (status in ('pending', 'under_review', 'resolved', 'dismissed'));

drop policy if exists "Reporters can read their own reports" on public.reports;
drop policy if exists "Reporters and moderators can read reports" on public.reports;
create policy "Reporters and moderators can read reports"
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id or public.is_moderator(auth.uid()));

drop policy if exists "Moderators can update reports" on public.reports;
create policy "Moderators can update reports"
  on public.reports
  for update
  to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

drop policy if exists "Profiles are visible unless blocked" on public.profiles;
drop policy if exists "Profiles are visible unless blocked or suspended" on public.profiles;
create policy "Profiles are visible unless blocked or suspended"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_moderator(auth.uid())
    or (
      public.is_account_active(id)
      and public.is_account_active(auth.uid())
      and not public.are_users_blocked(auth.uid(), id)
    )
  );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id and public.is_account_active(auth.uid()))
  with check (auth.uid() = id and public.is_account_active(auth.uid()));

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id and public.is_account_active(auth.uid()));

drop policy if exists "Users can send letters" on public.letters;
create policy "Users can send letters"
  on public.letters
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> recipient_id
    and public.is_account_active(sender_id)
    and public.is_account_active(recipient_id)
    and not public.are_users_blocked(sender_id, recipient_id)
  );

drop policy if exists "Users can read unblocked letters they sent or received" on public.letters;
drop policy if exists "Users can read visible letters they sent or received" on public.letters;
create policy "Users can read visible letters they sent or received"
  on public.letters
  for select
  to authenticated
  using (
    public.is_moderator(auth.uid())
    or (
      (auth.uid() = sender_id or auth.uid() = recipient_id)
      and public.is_account_active(sender_id)
      and public.is_account_active(recipient_id)
      and not public.are_users_blocked(sender_id, recipient_id)
    )
  );

drop policy if exists "Recipients can mark letters read" on public.letters;
create policy "Recipients can mark letters read"
  on public.letters
  for update
  to authenticated
  using (
    auth.uid() = recipient_id
    and public.is_account_active(auth.uid())
    and not public.are_users_blocked(sender_id, recipient_id)
  )
  with check (
    auth.uid() = recipient_id
    and public.is_account_active(auth.uid())
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
          public.is_moderator(auth.uid())
          or (
            (
              public.letters.sender_id = auth.uid()
              or public.letters.recipient_id = auth.uid()
            )
            and public.is_account_active(public.letters.sender_id)
            and public.is_account_active(public.letters.recipient_id)
            and not public.are_users_blocked(
              public.letters.sender_id,
              public.letters.recipient_id
            )
          )
        )
    )
  );
