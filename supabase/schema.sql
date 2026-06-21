-- ============================================================
-- Budget App – Supabase Schema (self-contained)
-- Includes shared household tables + all budget tables.
-- Safe to run if households tables already exist (uses IF NOT EXISTS).
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── Shared household tables ───────────────────────────────────
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'My Household',
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create table if not exists household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text,
  role         text not null default 'member',
  joined_at    timestamptz default now(),
  unique (household_id, user_id)
);

create table if not exists household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  code         text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  used_by      uuid references auth.users(id) on delete set null,
  used_at      timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz default now()
);

alter table households        enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;

create policy "members can view their household"
  on households for select
  using (id in (select household_id from household_members where user_id = auth.uid()));

create policy "members can update their household"
  on households for update
  using (id in (select household_id from household_members where user_id = auth.uid()));

create policy "members can view membership"
  on household_members for select
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

create policy "members can insert themselves"
  on household_members for insert
  with check (user_id = auth.uid());

create policy "members can delete themselves"
  on household_members for delete
  using (user_id = auth.uid());

create policy "members can view invites"
  on household_invites for select
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

create policy "members can create invites"
  on household_invites for insert
  with check (household_id in (select household_id from household_members where user_id = auth.uid()));

create policy "anyone can claim an invite"
  on household_invites for update
  using (true);

-- ── Pantry item_history table (read-only cross-app) ──────────
-- Only needed if popepantry is NOT sharing this Supabase project.
-- If popepantry already created item_history, this is a no-op.
create table if not exists item_history (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  item_name    text,
  store        text,
  price        numeric,
  quantity     numeric default 1,
  unit         text,
  bought_at    timestamptz default now(),
  created_at   timestamptz default now()
);

alter table item_history enable row level security;

create policy "household members can view item_history"
  on item_history for select
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

-- ── Budget months ─────────────────────────────────────────────
-- One row per household + calendar month (e.g. "2026-06")
create table if not exists budget_months (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  month_key       text not null,          -- "YYYY-MM"
  estimated_income numeric default 0,
  use_actual_income boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (household_id, month_key)
);

-- ── Budget line items (fixed / variable expenses) ─────────────
create table if not exists budget_items (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  month_key       text not null,
  category        text not null check (category in ('fixed', 'variable')),
  label           text not null,
  amount          numeric not null default 0,
  template_id     uuid,                   -- references scheduled_templates if linked
  created_at      timestamptz default now()
);

-- ── Financial accounts ────────────────────────────────────────
create table if not exists financial_accounts (
  id                              uuid primary key default gen_random_uuid(),
  household_id                    uuid not null references households(id) on delete cascade,
  name                            text not null,
  type                            text default 'checking',  -- checking, savings, credit
  starting_balance                numeric default 0,
  current_balance                 numeric,
  current_balance_as_of           text,                     -- ISO date
  last_statement_key              text,
  last_confirmed_ending_balance   numeric,
  statement_balances              jsonb default '{}',
  created_at                      timestamptz default now()
);

-- ── Transactions ──────────────────────────────────────────────
create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  account_id      uuid references financial_accounts(id) on delete set null,
  month_key       text not null,          -- "YYYY-MM" for fast monthly queries
  date            text not null,          -- "YYYY-MM-DD"
  description     text not null,
  amount          numeric not null,
  category        text,
  flow_type       text,                   -- income | expense | transfer | ignore
  source          text default 'manual',  -- manual | csv | pdf | pantry
  pantry_history_id uuid,                 -- links to item_history.id from pantry app
  created_at      timestamptz default now()
);

-- ── Savings goals ─────────────────────────────────────────────
create table if not exists goals (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  name            text not null,
  target_amount   numeric not null default 0,
  current_amount  numeric not null default 0,
  target_date     text,                   -- ISO date string
  icon            text,
  color           text,
  monthly_plan    numeric default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Goal contributions ────────────────────────────────────────
create table if not exists goal_contributions (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid not null references goals(id) on delete cascade,
  household_id    uuid not null,
  amount          numeric not null,
  note            text,
  date            text not null,          -- "YYYY-MM-DD"
  created_at      timestamptz default now()
);

-- ── Scheduled recurring bill templates ───────────────────────
create table if not exists scheduled_templates (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  label           text not null,
  amount          numeric not null default 0,
  kind            text default 'expense', -- expense | income
  source          text,                   -- budget-fixed | budget-variable | manual
  start_date      text not null,          -- "YYYY-MM-DD"
  cadence         text default 'monthly', -- once | weekly | biweekly | monthly | yearly
  day_of_month    integer,
  account_id      uuid,
  created_at      timestamptz default now()
);

-- ── Schedule checks (paid/unpaid per occurrence) ──────────────
create table if not exists schedule_checks (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references scheduled_templates(id) on delete cascade,
  household_id    uuid not null,
  due_date        text not null,          -- "YYYY-MM-DD"
  paid            boolean default false,
  paid_at         timestamptz,
  unique (template_id, due_date)
);

-- ── Statement import log ──────────────────────────────────────
create table if not exists statement_imports (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null,
  account_id      uuid references financial_accounts(id) on delete set null,
  statement_key   text,                   -- "YYYY-MM-DD_YYYY-MM-DD"
  starting_balance numeric,
  ending_balance   numeric,
  transaction_sum  numeric,
  balance_source   text default 'user',   -- user | csv
  start_iso        text,
  end_iso          text,
  created_at       timestamptz default now()
);

-- ── Row-level security ────────────────────────────────────────
alter table budget_months        enable row level security;
alter table budget_items         enable row level security;
alter table financial_accounts   enable row level security;
alter table transactions         enable row level security;
alter table goals                enable row level security;
alter table goal_contributions   enable row level security;
alter table scheduled_templates  enable row level security;
alter table schedule_checks      enable row level security;
alter table statement_imports    enable row level security;

-- Helper: check if the current user belongs to a given household
create or replace function is_household_member(hid uuid)
returns boolean
language sql security definer
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- RLS policies (same pattern for every budget table)
do $$
declare
  t text;
begin
  foreach t in array array[
    'budget_months','budget_items','financial_accounts','transactions',
    'goals','goal_contributions','scheduled_templates','schedule_checks',
    'statement_imports'
  ]
  loop
    execute format(
      'create policy "household members only" on %I
         using (is_household_member(household_id))
         with check (is_household_member(household_id))',
      t
    );
  end loop;
end
$$;

-- ── Indexes for common queries ────────────────────────────────
create index if not exists idx_transactions_household_month on transactions(household_id, month_key);
create index if not exists idx_budget_items_household_month on budget_items(household_id, month_key);
create index if not exists idx_goals_household on goals(household_id);
create index if not exists idx_scheduled_templates_household on scheduled_templates(household_id);
create index if not exists idx_schedule_checks_template on schedule_checks(template_id);
