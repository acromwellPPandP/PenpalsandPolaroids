create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "Users can read their blocks" on public.blocks;
drop policy if exists "Users can create their blocks" on public.blocks;
drop policy if exists "Users can remove their blocks" on public.blocks;

create policy "Users can read their blocks"
  on public.blocks
  for select
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

create policy "Users can create their blocks"
  on public.blocks
  for insert
  with check (auth.uid() = blocker_id);

create policy "Users can remove their blocks"
  on public.blocks
  for delete
  using (auth.uid() = blocker_id);
