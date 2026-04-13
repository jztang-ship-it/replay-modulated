-- supabase/migrations/001_player_tables.sql
-- Scaffold tables for player auth, state, and hand audit trail.
-- Balance/streak populated by server-side hand resolution (future project).
-- hand_log written client-side for now, moves to server-only later.

-- Player profile (extends Supabase auth.users)
create table if not exists public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Player',
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);

-- Game state (balance, streak — scaffold now, authoritative later)
create table if not exists public.player_state (
  id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 100000,
  streak integer not null default 0,
  hands_played integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Hand log (write-only audit trail)
create table if not exists public.hand_log (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  roster_ids text[] not null,
  total_fp numeric(6,1) not null,
  tier text not null,
  payout integer not null default 0,
  streak_at_play integer not null default 0,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_hand_log_player on public.hand_log(player_id);
create index if not exists idx_hand_log_created on public.hand_log(created_at);

-- RLS: users can only read their own rows
alter table public.player_profiles enable row level security;
alter table public.player_state enable row level security;
alter table public.hand_log enable row level security;

create policy "Users read own profile" on public.player_profiles
  for select using (auth.uid() = id);

create policy "Users insert own profile" on public.player_profiles
  for insert with check (auth.uid() = id);

create policy "Users update own profile" on public.player_profiles
  for update using (auth.uid() = id);

create policy "Users read own state" on public.player_state
  for select using (auth.uid() = id);

create policy "Users read own hands" on public.hand_log
  for select using (auth.uid() = player_id);

create policy "Users insert own hands" on public.hand_log
  for insert with check (auth.uid() = player_id);
