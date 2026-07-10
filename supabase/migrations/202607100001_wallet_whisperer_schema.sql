-- Wallet Whisperer V1 schema
-- Core principle: AI creates drafts; only the user confirms real transactions.

create extension if not exists "pgcrypto";

create schema if not exists private;
revoke all on schema private from public;

create type public.transaction_kind as enum ('expense', 'income', 'transfer');
create type public.transaction_status as enum ('draft', 'confirmed', 'ignored');
create type public.transaction_source as enum (
  'manual',
  'paste',
  'forwarded_email',
  'screenshot',
  'notification',
  'recurring',
  'demo_seed'
);
create type public.transaction_necessity as enum ('flexible', 'needed', 'fixed', 'unknown');
create type public.payment_method as enum ('cash', 'card', 'wallet', 'bank_transfer', 'unknown');
create type public.report_mood as enum ('encouraging', 'neutral', 'caution');
create type public.notification_status as enum ('pending', 'sent', 'dismissed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_currency text not null default 'NPR',
  close_day_time time not null default '21:30',
  timezone text not null default 'Asia/Katmandu',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_default_currency_format check (default_currency ~ '^[A-Z]{3}$')
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null,
  currency text not null default 'NPR',
  photo_path text,
  target_date date,
  current_saved_amount numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_target_amount_positive check (target_amount > 0),
  constraint goals_current_saved_nonnegative check (current_saved_amount >= 0),
  constraint goals_currency_format check (currency ~ '^[A-Z]{3}$')
);

create unique index goals_one_active_per_user_idx
  on public.goals(user_id)
  where is_active;

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'NPR',
  cadence text not null default 'monthly',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_sources_amount_nonnegative check (amount >= 0),
  constraint income_sources_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  amount numeric(14,2) not null,
  currency text not null default 'NPR',
  category text not null default 'Bills',
  payment_method public.payment_method not null default 'unknown',
  due_day smallint,
  cadence text not null default 'monthly',
  next_due_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_expenses_amount_positive check (amount > 0),
  constraint recurring_expenses_due_day_valid check (due_day is null or due_day between 1 and 31),
  constraint recurring_expenses_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.smart_capture_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source public.transaction_source not null,
  raw_text text not null,
  raw_subject text,
  source_reference text,
  parsed_amount numeric(14,2),
  parsed_currency text,
  parsed_merchant text,
  parsed_category text,
  parsed_kind public.transaction_kind not null default 'expense',
  parsed_necessity public.transaction_necessity not null default 'unknown',
  parsed_payment_method public.payment_method not null default 'unknown',
  parsed_occurred_at timestamptz,
  confidence numeric(4,3) not null default 0,
  needs_review boolean not null default true,
  ai_notes text,
  status public.transaction_status not null default 'draft',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smart_capture_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint smart_capture_currency_format check (parsed_currency is null or parsed_currency ~ '^[A-Z]{3}$')
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid references public.smart_capture_drafts(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  kind public.transaction_kind not null default 'expense',
  amount numeric(14,2) not null,
  currency text not null default 'NPR',
  merchant text,
  category text not null default 'Uncategorized',
  necessity public.transaction_necessity not null default 'unknown',
  payment_method public.payment_method not null default 'unknown',
  occurred_at timestamptz not null default now(),
  note text,
  is_skipped_opportunity boolean not null default false,
  goal_percent numeric(8,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_positive check (amount > 0),
  constraint transactions_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint transactions_goal_percent_nonnegative check (goal_percent is null or goal_percent >= 0)
);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  report_date date not null,
  currency text not null default 'NPR',
  total_spent numeric(14,2) not null default 0,
  flexible_spent numeric(14,2) not null default 0,
  needed_spent numeric(14,2) not null default 0,
  fixed_spent numeric(14,2) not null default 0,
  protected_amount numeric(14,2) not null default 0,
  draft_count integer not null default 0,
  confirmed_count integer not null default 0,
  goal_delta_percent numeric(8,4) not null default 0,
  insight text not null,
  achievement text not null,
  mood public.report_mood not null default 'neutral',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_reports_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint daily_reports_nonnegative_totals check (
    total_spent >= 0 and flexible_spent >= 0 and needed_spent >= 0 and fixed_spent >= 0 and protected_amount >= 0
  )
);

create unique index daily_reports_user_date_idx on public.daily_reports(user_id, report_date);

create table public.streaks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_count integer not null default 0,
  longest_count integer not null default 0,
  freezes_available integer not null default 1,
  last_active_date date,
  updated_at timestamptz not null default now(),
  constraint streaks_counts_nonnegative check (current_count >= 0 and longest_count >= 0 and freezes_available >= 0)
);

create table public.capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source public.transaction_source not null,
  draft_id uuid references public.smart_capture_drafts(id) on delete set null,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  scheduled_for timestamptz,
  status public.notification_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dismissed_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
create trigger income_sources_set_updated_at before update on public.income_sources
  for each row execute function public.set_updated_at();
create trigger recurring_expenses_set_updated_at before update on public.recurring_expenses
  for each row execute function public.set_updated_at();
create trigger smart_capture_drafts_set_updated_at before update on public.smart_capture_drafts
  for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger daily_reports_set_updated_at before update on public.daily_reports
  for each row execute function public.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.streaks(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create index goals_user_id_idx on public.goals(user_id);
create index income_sources_user_id_idx on public.income_sources(user_id);
create index recurring_expenses_user_due_idx on public.recurring_expenses(user_id, next_due_date)
  where is_active;
create index smart_capture_drafts_user_status_created_idx on public.smart_capture_drafts(user_id, status, created_at desc);
create index smart_capture_drafts_source_reference_idx on public.smart_capture_drafts(source_reference)
  where source_reference is not null;
create index transactions_user_occurred_idx on public.transactions(user_id, occurred_at desc);
create unique index transactions_one_per_draft_idx on public.transactions(draft_id)
  where draft_id is not null;
create index transactions_goal_id_idx on public.transactions(goal_id)
  where goal_id is not null;
create index daily_reports_user_date_lookup_idx on public.daily_reports(user_id, report_date desc);
create index capture_events_user_created_idx on public.capture_events(user_id, created_at desc);
create index notification_queue_user_status_scheduled_idx on public.notification_queue(user_id, status, scheduled_for)
  where status = 'pending';

create or replace view public.pending_draft_counts
with (security_invoker = true)
as
select
  user_id,
  date(created_at at time zone 'Asia/Katmandu') as draft_date,
  count(*) filter (where status = 'draft') as pending_count
from public.smart_capture_drafts
group by user_id, date(created_at at time zone 'Asia/Katmandu');

create or replace view public.dashboard_summary
with (security_invoker = true)
as
select
  p.id as user_id,
  p.default_currency as currency,
  coalesce(sum(t.amount) filter (where t.kind = 'expense' and t.occurred_at >= date_trunc('month', now())), 0) as month_expenses,
  coalesce(sum(t.amount) filter (where t.kind = 'income' and t.occurred_at >= date_trunc('month', now())), 0) as month_income,
  coalesce(sum(t.amount) filter (
    where t.kind = 'expense'
      and t.necessity = 'flexible'
      and t.occurred_at >= date_trunc('month', now())
  ), 0) as month_flexible_expenses,
  coalesce(max(g.target_amount), 0) as active_goal_target,
  coalesce(max(g.current_saved_amount), 0) as active_goal_saved
from public.profiles p
left join public.transactions t on t.user_id = p.id
left join public.goals g on g.user_id = p.id and g.is_active = true
group by p.id, p.default_currency;

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.income_sources enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.smart_capture_drafts enable row level security;
alter table public.transactions enable row level security;
alter table public.daily_reports enable row level security;
alter table public.streaks enable row level security;
alter table public.capture_events enable row level security;
alter table public.notification_queue enable row level security;

create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "goals_select_own" on public.goals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "goals_insert_own" on public.goals
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "goals_update_own" on public.goals
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "goals_delete_own" on public.goals
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "income_sources_crud_own" on public.income_sources
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "recurring_expenses_crud_own" on public.recurring_expenses
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "smart_capture_drafts_crud_own" on public.smart_capture_drafts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "transactions_crud_own" on public.transactions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "daily_reports_crud_own" on public.daily_reports
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "streaks_select_own" on public.streaks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "streaks_insert_own" on public.streaks
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "streaks_update_own" on public.streaks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "capture_events_crud_own" on public.capture_events
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notification_queue_crud_own" on public.notification_queue
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('goal-photos', 'goal-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('receipt-uploads', 'receipt-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "goal_photos_read_own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'goal-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "goal_photos_insert_own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'goal-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "goal_photos_update_own" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'goal-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'goal-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "receipt_uploads_read_own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receipt-uploads'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "receipt_uploads_insert_own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receipt-uploads'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.pending_draft_counts to authenticated;
grant select on public.dashboard_summary to authenticated;
