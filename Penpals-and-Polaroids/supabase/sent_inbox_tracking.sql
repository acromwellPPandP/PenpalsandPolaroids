-- Sent and Inbox tracking access helpers for Penpals & Polaroids.
-- Run this after supabase/delivery.sql.

create or replace function public.mark_letter_opened(letter_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.letters
  set read_at = coalesce(read_at, now())
  where id = letter_uuid
    and recipient_id = auth.uid()
    and delivery_status = 'delivered'
    and delivered_at is not null
    and delivered_at <= now()
    and public.can_view_letter_contents(id, auth.uid());
end;
$$;

revoke all on function public.mark_letter_opened(uuid) from public;
grant execute on function public.mark_letter_opened(uuid) to authenticated;

-- Limit direct letter updates to the existing opened/read marker.
-- The RLS policy from delivery.sql still requires the caller to be the delivered recipient.
revoke update on public.letters from authenticated;
grant update (read_at) on public.letters to authenticated;
