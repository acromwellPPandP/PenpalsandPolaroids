-- Secure letter removal and withdrawal controls for Penpals & Polaroids.
-- Run after delivery.sql, safety_phase_1.sql, safety_phase_2.sql, and letter_posting_rpc.sql.

alter table public.letters
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by uuid references auth.users(id) on delete set null,
  add column if not exists withdrawal_reason text;

alter table public.letters
  drop constraint if exists letters_withdrawal_consistency_check,
  add constraint letters_withdrawal_consistency_check check (
    (
      withdrawn_at is null
      and withdrawn_by is null
      and delivery_status <> 'withdrawn'
    )
    or (
      withdrawn_at is not null
      and withdrawn_by is not null
      and delivery_status = 'withdrawn'
    )
  );

alter table public.letters
  drop constraint if exists letters_delivery_status_check,
  add constraint letters_delivery_status_check check (
    delivery_status in (
      'preparing',
      'posted',
      'processing_origin',
      'departed_origin',
      'international_transit',
      'arrived_destination',
      'out_for_delivery',
      'delivered',
      'delivery_exception',
      'withdrawn'
    )
  );

create table if not exists public.letter_user_visibility (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  restored_at timestamptz,
  permanently_removed_from_view_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint letter_user_visibility_unique_user_letter unique (letter_id, user_id)
);

alter table public.letter_user_visibility enable row level security;

create or replace function public.is_letter_visible_to_user(letter_uuid uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from public.letter_user_visibility luv
    where luv.letter_id = letter_uuid
      and luv.user_id = check_user_id
      and luv.hidden_at is not null
      and luv.restored_at is null
  );
$$;

create or replace function public.is_letter_visibility_owner(letter_uuid uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.letters l
    where l.id = letter_uuid
      and (l.sender_id = check_user_id or l.recipient_id = check_user_id)
      and public.is_account_active(l.sender_id)
      and public.is_account_active(l.recipient_id)
      and not public.are_users_blocked(l.sender_id, l.recipient_id)
  );
$$;

drop policy if exists "Users can read their own letter visibility" on public.letter_user_visibility;
create policy "Users can read their own letter visibility"
  on public.letter_user_visibility
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create visibility for their own letters" on public.letter_user_visibility;
create policy "Users can create visibility for their own letters"
  on public.letter_user_visibility
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_letter_visibility_owner(letter_id, auth.uid())
  );

drop policy if exists "Users can update their own letter visibility" on public.letter_user_visibility;
create policy "Users can update their own letter visibility"
  on public.letter_user_visibility
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and public.is_letter_visibility_owner(letter_id, auth.uid())
  )
  with check (
    auth.uid() = user_id
    and public.is_letter_visibility_owner(letter_id, auth.uid())
  );

create or replace function public.remove_letter_from_my_view(letter_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_letter_visibility_owner(letter_uuid, auth.uid()) then
    raise exception 'This action is not available for this letter.';
  end if;

  insert into public.letter_user_visibility (
    letter_id,
    user_id,
    hidden_at,
    restored_at,
    permanently_removed_from_view_at,
    updated_at
  )
  values (
    letter_uuid,
    auth.uid(),
    now(),
    null,
    null,
    now()
  )
  on conflict (letter_id, user_id)
  do update set
    hidden_at = now(),
    restored_at = null,
    updated_at = now();
end;
$$;

create or replace function public.restore_letter_to_my_view(letter_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.letter_user_visibility
  set restored_at = now(),
      updated_at = now()
  where letter_id = letter_uuid
    and user_id = auth.uid();
end;
$$;

create or replace function public.permanently_remove_letter_from_my_view(letter_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.reports r
    where r.letter_id = letter_uuid
      and r.status in ('pending', 'under_review')
  ) then
    raise exception 'This action is not available for this letter.';
  end if;

  update public.letter_user_visibility
  set permanently_removed_from_view_at = now(),
      updated_at = now()
  where letter_id = letter_uuid
    and user_id = auth.uid()
    and hidden_at is not null
    and restored_at is null;
end;
$$;

create or replace function public.withdraw_letter(letter_uuid uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.letters
  set delivery_status = 'withdrawn',
      withdrawn_at = now(),
      withdrawn_by = auth.uid(),
      withdrawal_reason = nullif(left(coalesce(reason, ''), 500), ''),
      delivered_at = null
  where id = letter_uuid
    and sender_id = auth.uid()
    and delivery_status <> 'withdrawn'
    and delivery_status <> 'delivered'
    and delivered_at is null
    and public.is_account_active(sender_id)
    and public.is_account_active(recipient_id)
    and not public.are_users_blocked(sender_id, recipient_id);

  if not found then
    raise exception 'This letter has already arrived and can no longer be withdrawn.';
  end if;

  delete from public.notifications
  where letter_id = letter_uuid
    and type = 'letter_delivered';
end;
$$;

create or replace function public.can_view_letter_contents(letter_uuid uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.letters
    where id = letter_uuid
      and delivery_status <> 'withdrawn'
      and public.is_letter_visible_to_user(id, check_user_id)
      and (
        sender_id = check_user_id
        or (
          recipient_id = check_user_id
          and delivery_status = 'delivered'
          and delivered_at is not null
          and delivered_at <= now()
        )
        or public.is_moderator(check_user_id)
      )
      and not public.are_users_blocked(sender_id, recipient_id)
      and public.is_account_active(sender_id)
      and public.is_account_active(recipient_id)
  );
$$;

drop function if exists public.get_letter_envelope(uuid) cascade;
drop function if exists public.get_letter_envelopes() cascade;

create function public.get_letter_envelopes()
returns table (
  id uuid,
  sender_id uuid,
  recipient_id uuid,
  origin_country_code text,
  destination_country_code text,
  posted_at timestamptz,
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  delivery_status text,
  tracking_reference text,
  delivery_mode text,
  delivery_version integer,
  created_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select
    l.id,
    l.sender_id,
    l.recipient_id,
    l.origin_country_code,
    l.destination_country_code,
    l.posted_at,
    l.estimated_delivery_at,
    l.delivered_at,
    l.delivery_status,
    l.tracking_reference,
    l.delivery_mode,
    l.delivery_version,
    l.created_at,
    l.withdrawn_at,
    l.withdrawn_by
  from public.letters l
  where (l.sender_id = auth.uid() or l.recipient_id = auth.uid())
    and public.is_letter_visible_to_user(l.id, auth.uid())
    and not (
      l.recipient_id = auth.uid()
      and l.delivery_status = 'withdrawn'
    )
    and not public.are_users_blocked(l.sender_id, l.recipient_id)
    and public.is_account_active(l.sender_id)
    and public.is_account_active(l.recipient_id);
$$;

create function public.get_letter_envelope(letter_uuid uuid)
returns table (
  id uuid,
  sender_id uuid,
  recipient_id uuid,
  origin_country_code text,
  destination_country_code text,
  posted_at timestamptz,
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  delivery_status text,
  tracking_reference text,
  delivery_mode text,
  delivery_version integer,
  created_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.get_letter_envelopes()
  where id = letter_uuid;
$$;

create or replace function public.process_due_deliveries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.letter_tracking_events e
  set occurred_at = e.scheduled_at
  from public.letters l
  where e.letter_id = l.id
    and e.occurred_at is null
    and e.scheduled_at <= now()
    and l.delivery_status <> 'withdrawn';

  update public.letters l
  set
    delivery_status = 'delivered',
    delivered_at = coalesce(l.delivered_at, now())
  where l.delivery_status <> 'delivered'
    and l.delivery_status <> 'withdrawn'
    and l.estimated_delivery_at <= now();

  insert into public.notifications (
    recipient_id,
    letter_id,
    type,
    message
  )
  select
    l.recipient_id,
    l.id,
    'letter_delivered',
    'Your letter has arrived.'
  from public.letters l
  where l.delivery_status = 'delivered'
    and l.delivered_at is not null
    and l.delivery_status <> 'withdrawn'
  on conflict do nothing;
end;
$$;

revoke all on function public.remove_letter_from_my_view(uuid) from public;
revoke all on function public.restore_letter_to_my_view(uuid) from public;
revoke all on function public.permanently_remove_letter_from_my_view(uuid) from public;
revoke all on function public.withdraw_letter(uuid, text) from public;
revoke all on function public.is_letter_visible_to_user(uuid, uuid) from public;
revoke all on function public.is_letter_visibility_owner(uuid, uuid) from public;

grant execute on function public.remove_letter_from_my_view(uuid) to authenticated;
grant execute on function public.restore_letter_to_my_view(uuid) to authenticated;
grant execute on function public.permanently_remove_letter_from_my_view(uuid) to authenticated;
grant execute on function public.withdraw_letter(uuid, text) to authenticated;
grant execute on function public.is_letter_visible_to_user(uuid, uuid) to authenticated;
grant execute on function public.is_letter_visibility_owner(uuid, uuid) to authenticated;

create or replace function public.get_recently_removed_letters()
returns table (
  letter_id uuid,
  other_user_id uuid,
  direction text,
  posted_at timestamptz,
  delivered_at timestamptz,
  delivery_status text,
  hidden_at timestamptz,
  permanently_removed_from_view_at timestamptz,
  other_country_code text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    l.id as letter_id,
    case when l.sender_id = auth.uid() then l.recipient_id else l.sender_id end as other_user_id,
    case when l.sender_id = auth.uid() then 'Sent' else 'Received' end as direction,
    l.posted_at,
    l.delivered_at,
    l.delivery_status,
    luv.hidden_at,
    luv.permanently_removed_from_view_at,
    case
      when l.sender_id = auth.uid() then l.destination_country_code
      else l.origin_country_code
    end as other_country_code
  from public.letter_user_visibility luv
  join public.letters l on l.id = luv.letter_id
  where luv.user_id = auth.uid()
    and luv.hidden_at is not null
    and luv.restored_at is null
    and luv.permanently_removed_from_view_at is null
    and luv.hidden_at >= now() - interval '30 days'
    and (l.sender_id = auth.uid() or l.recipient_id = auth.uid())
    and not (
      l.recipient_id = auth.uid()
      and l.delivery_status = 'withdrawn'
    )
    and not public.are_users_blocked(l.sender_id, l.recipient_id)
    and public.is_account_active(l.sender_id)
    and public.is_account_active(l.recipient_id);
$$;

revoke all on function public.get_recently_removed_letters() from public;
grant execute on function public.get_recently_removed_letters() to authenticated;
