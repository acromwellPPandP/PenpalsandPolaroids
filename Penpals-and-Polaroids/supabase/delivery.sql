alter table public.letters
  add column if not exists origin_country_code text,
  add column if not exists destination_country_code text,
  add column if not exists posted_at timestamptz,
  add column if not exists estimated_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_status text not null default 'delivered',
  add column if not exists tracking_reference text,
  add column if not exists delivery_mode text not null default 'realistic_mail',
  add column if not exists delivery_version integer not null default 1;

update public.letters
set
  origin_country_code = coalesce(origin_country_code, 'XX'),
  destination_country_code = coalesce(destination_country_code, 'XX'),
  posted_at = coalesce(posted_at, created_at),
  estimated_delivery_at = coalesce(estimated_delivery_at, created_at),
  delivered_at = coalesce(delivered_at, created_at),
  delivery_status = coalesce(delivery_status, 'delivered'),
  tracking_reference = coalesce(
    tracking_reference,
    'PP-LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 6))
  ),
  delivery_mode = coalesce(delivery_mode, 'realistic_mail'),
  delivery_version = coalesce(delivery_version, 1);

alter table public.letters
  alter column origin_country_code set not null,
  alter column destination_country_code set not null,
  alter column posted_at set not null,
  alter column estimated_delivery_at set not null,
  alter column tracking_reference set not null;

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
      'delivery_exception'
    )
  );

alter table public.letters
  drop constraint if exists letters_delivery_mode_check,
  add constraint letters_delivery_mode_check check (delivery_mode = 'realistic_mail');

create unique index if not exists letters_tracking_reference_key
  on public.letters (tracking_reference);

create table if not exists public.letter_tracking_events (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete cascade,
  status text not null,
  event_label text not null,
  event_description text not null,
  event_country_code text,
  scheduled_at timestamptz not null,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  constraint letter_tracking_events_status_check check (
    status in (
      'preparing',
      'posted',
      'processing_origin',
      'departed_origin',
      'international_transit',
      'arrived_destination',
      'out_for_delivery',
      'delivered',
      'delivery_exception'
    )
  )
);

create unique index if not exists letter_tracking_events_letter_status_key
  on public.letter_tracking_events (letter_id, status);

insert into public.letter_tracking_events (
  letter_id,
  status,
  event_label,
  event_description,
  event_country_code,
  scheduled_at,
  occurred_at
)
select
  id,
  'delivered',
  'Delivered',
  'This existing letter was marked as delivered during the virtual delivery migration.',
  destination_country_code,
  delivered_at,
  delivered_at
from public.letters
where delivery_status = 'delivered'
on conflict (letter_id, status) do nothing;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  letter_id uuid references public.letters(id) on delete cascade,
  type text not null,
  message text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in ('letter_delivered', 'letter_posted'))
);

create unique index if not exists notifications_unique_letter_type
  on public.notifications (recipient_id, letter_id, type)
  where letter_id is not null;

alter table public.letter_tracking_events enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_letter_participant(letter_uuid uuid, check_user_id uuid default auth.uid())
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
      and (sender_id = check_user_id or recipient_id = check_user_id)
      and not public.are_users_blocked(sender_id, recipient_id)
      and public.is_account_active(sender_id)
      and public.is_account_active(recipient_id)
  );
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

revoke all on function public.is_letter_participant(uuid, uuid) from public;
revoke all on function public.can_view_letter_contents(uuid, uuid) from public;
grant execute on function public.is_letter_participant(uuid, uuid) to authenticated;
grant execute on function public.can_view_letter_contents(uuid, uuid) to authenticated;

drop policy if exists "Users can read visible letters they sent or received" on public.letters;
drop policy if exists "Users can read delivered letters or their sent letters" on public.letters;
create policy "Users can read delivered letters or their sent letters"
  on public.letters
  for select
  to authenticated
  using (public.can_view_letter_contents(id, auth.uid()));

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
    and delivery_status in ('preparing', 'posted')
    and delivered_at is null
  );

drop policy if exists "Recipients can mark letters read" on public.letters;
create policy "Recipients can mark letters read"
  on public.letters
  for update
  to authenticated
  using (
    auth.uid() = recipient_id
    and public.can_view_letter_contents(id, auth.uid())
  )
  with check (
    auth.uid() = recipient_id
    and public.can_view_letter_contents(id, auth.uid())
  );

drop policy if exists "Participants can read tracking events" on public.letter_tracking_events;
create policy "Participants can read tracking events"
  on public.letter_tracking_events
  for select
  to authenticated
  using (
    public.is_moderator(auth.uid())
    or public.is_letter_participant(letter_id, auth.uid())
  );

drop policy if exists "Senders can create tracking events for their letters" on public.letter_tracking_events;
create policy "Senders can create tracking events for their letters"
  on public.letter_tracking_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.letters
      where public.letters.id = letter_id
        and public.letters.sender_id = auth.uid()
    )
  );

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = recipient_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "Users can create their own posting notifications" on public.notifications;
create policy "Users can create their own posting notifications"
  on public.notifications
  for insert
  to authenticated
  with check (
    auth.uid() = recipient_id
    and type = 'letter_posted'
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
        and public.can_view_letter_contents(public.letters.id, auth.uid())
    )
  );

create or replace function public.get_letter_envelopes()
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
  created_at timestamptz
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
    l.created_at
  from public.letters l
  where (l.sender_id = auth.uid() or l.recipient_id = auth.uid())
    and not public.are_users_blocked(l.sender_id, l.recipient_id)
    and public.is_account_active(l.sender_id)
    and public.is_account_active(l.recipient_id);
$$;

create or replace function public.get_letter_envelope(letter_uuid uuid)
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
  created_at timestamptz
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

revoke all on function public.get_letter_envelopes() from public;
revoke all on function public.get_letter_envelope(uuid) from public;
grant execute on function public.get_letter_envelopes() to authenticated;
grant execute on function public.get_letter_envelope(uuid) to authenticated;

create or replace function public.process_due_deliveries()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  due_event record;
  due_letter record;
begin
  for due_event in
    select id, letter_id, status, scheduled_at
    from public.letter_tracking_events
    where occurred_at is null
      and scheduled_at <= now()
    order by scheduled_at asc
  loop
    update public.letter_tracking_events
    set occurred_at = due_event.scheduled_at
    where id = due_event.id
      and occurred_at is null;

    if due_event.status <> 'delivered' then
      update public.letters
      set delivery_status = due_event.status
      where id = due_event.letter_id
        and delivery_status <> 'delivered';
    end if;
  end loop;

  for due_letter in
    select id, recipient_id, sender_id, estimated_delivery_at
    from public.letters
    where delivered_at is null
      and estimated_delivery_at <= now()
  loop
    update public.letters
    set
      delivered_at = due_letter.estimated_delivery_at,
      delivery_status = 'delivered'
    where id = due_letter.id
      and delivered_at is null;

    update public.letter_tracking_events
    set occurred_at = due_letter.estimated_delivery_at
    where letter_id = due_letter.id
      and status = 'delivered'
      and occurred_at is null;

    insert into public.notifications (
      letter_id,
      message,
      recipient_id,
      type
    )
    values (
      due_letter.id,
      'A letter has arrived in your Scrapbook.',
      due_letter.recipient_id,
      'letter_delivered'
    )
    on conflict (recipient_id, letter_id, type) where letter_id is not null do nothing;
  end loop;
end;
$$;

revoke all on function public.process_due_deliveries() from public;
grant execute on function public.process_due_deliveries() to authenticated;
