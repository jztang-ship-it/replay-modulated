-- supabase/migrations/003_inbox.sql
-- Inbox + feedback two-way comms channel.
-- Spec: docs/superpowers/specs/2026-04-26-inbox-header-design.md

-- =============================================================================
-- inbox_messages: team → user channel
-- Welcome / big_win / bonus_pool / promo / survey
-- =============================================================================

create table if not exists public.inbox_messages (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  message_type  text        not null check (message_type in (
                              'welcome', 'big_win', 'bonus_pool', 'promo', 'survey'
                            )),
  payload       jsonb       not null,
  read_at       timestamptz null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_inbox_messages_user_created
  on public.inbox_messages (user_id, created_at desc);

alter table public.inbox_messages enable row level security;

create policy "inbox: users select own"
  on public.inbox_messages for select
  using (user_id = auth.uid());

create policy "inbox: users update own"
  on public.inbox_messages for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Client may only insert event-driven types. Promos/surveys come from service role.
create policy "inbox: users insert own client-allowed types"
  on public.inbox_messages for insert
  with check (
    user_id = auth.uid()
    and message_type in ('welcome', 'big_win', 'bonus_pool')
  );

-- =============================================================================
-- feedback_submissions: user → team channel
-- Multi-choice survey + optional free text. Latest per user is the canonical answer.
-- =============================================================================

create table if not exists public.feedback_submissions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  answers            jsonb       not null,
  submission_number  int         not null,
  metadata           jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  unique (user_id, submission_number)
);

create index if not exists idx_feedback_submissions_user_created
  on public.feedback_submissions (user_id, created_at desc);

alter table public.feedback_submissions enable row level security;

create policy "feedback: users insert own"
  on public.feedback_submissions for insert
  with check (user_id = auth.uid());

-- No SELECT/UPDATE/DELETE for users — admin-only via service role.

-- =============================================================================
-- grant_coins(p_amount, p_reason) — SECURITY DEFINER RPC
-- Caps + reason whitelist prevent client-side coin grant abuse.
-- =============================================================================

create or replace function public.grant_coins(p_amount int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_reason not in ('feedback_v1') then
    raise exception 'invalid reason: %', p_reason;
  end if;
  if p_amount <= 0 or p_amount > 500 then
    raise exception 'invalid amount: %', p_amount;
  end if;

  update public.player_state
    set balance = balance + p_amount,
        updated_at = now()
    where id = auth.uid();

  if not found then
    raise exception 'player_state row not found for user %', auth.uid();
  end if;
end;
$$;

revoke all on function public.grant_coins(int, text) from public;
grant execute on function public.grant_coins(int, text) to authenticated;
