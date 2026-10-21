-- Secure server-side letter posting for Penpals & Polaroids.
-- Run after supabase/safety_phase_1.sql, supabase/safety_phase_2.sql, and supabase/delivery.sql.

create or replace function public.post_letter(
  recipient_uuid uuid,
  letter_body text,
  photo_storage_path text,
  photo_original_name text,
  origin_code text,
  destination_code text,
  posted_timestamp timestamptz,
  estimated_delivery_timestamp timestamptz,
  tracking_ref text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_letter_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to post a letter.';
  end if;

  if auth.uid() = recipient_uuid then
    raise exception 'Choose a real pen pal before sending.';
  end if;

  if not public.is_account_active(auth.uid()) or not public.is_account_active(recipient_uuid) then
    raise exception 'This account is currently unavailable while it is under review.';
  end if;

  if public.are_users_blocked(auth.uid(), recipient_uuid) then
    raise exception 'You cannot send a letter to this Passport.';
  end if;

  insert into public.letters (
    body,
    delivered_at,
    delivery_mode,
    delivery_status,
    delivery_version,
    destination_country_code,
    estimated_delivery_at,
    origin_country_code,
    photo_name,
    photo_path,
    posted_at,
    recipient_id,
    sender_id,
    tracking_reference
  )
  values (
    letter_body,
    null,
    'realistic_mail',
    'posted',
    1,
    destination_code,
    estimated_delivery_timestamp,
    origin_code,
    photo_original_name,
    photo_storage_path,
    posted_timestamp,
    recipient_uuid,
    auth.uid(),
    tracking_ref
  )
  returning id into new_letter_id;

  return new_letter_id;
end;
$$;

revoke all on function public.post_letter(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) from public;

grant execute on function public.post_letter(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) to authenticated;

create or replace function public.post_letter_with_tracking(
  recipient_uuid uuid,
  letter_body text,
  photo_storage_path text,
  photo_original_name text,
  origin_code text,
  destination_code text,
  posted_timestamp timestamptz,
  estimated_delivery_timestamp timestamptz,
  tracking_ref text,
  tracking_events jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_letter_id uuid;
begin
  new_letter_id := public.post_letter(
    recipient_uuid,
    letter_body,
    photo_storage_path,
    photo_original_name,
    origin_code,
    destination_code,
    posted_timestamp,
    estimated_delivery_timestamp,
    tracking_ref
  );

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
    new_letter_id,
    event_rows.status,
    event_rows.event_label,
    event_rows.event_description,
    event_rows.event_country_code,
    event_rows.scheduled_at,
    event_rows.occurred_at
  from jsonb_to_recordset(tracking_events) as event_rows(
    status text,
    event_label text,
    event_description text,
    event_country_code text,
    scheduled_at timestamptz,
    occurred_at timestamptz
  )
  on conflict (letter_id, status) do nothing;

  insert into public.notifications (
    letter_id,
    message,
    recipient_id,
    type
  )
  values
    (
      new_letter_id,
      'Your letter has been posted.',
      auth.uid(),
      'letter_posted'
    ),
    (
      new_letter_id,
      'A sealed letter is travelling your way.',
      recipient_uuid,
      'letter_posted'
    )
  on conflict do nothing;

  return new_letter_id;
end;
$$;

revoke all on function public.post_letter_with_tracking(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  jsonb
) from public;

grant execute on function public.post_letter_with_tracking(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  jsonb
) to authenticated;
