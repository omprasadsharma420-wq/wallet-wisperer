alter table public.smart_capture_drafts
  add column if not exists suggested_recurring boolean not null default false;

create index if not exists smart_capture_drafts_suggested_recurring_idx
  on public.smart_capture_drafts(user_id, suggested_recurring)
  where suggested_recurring;
