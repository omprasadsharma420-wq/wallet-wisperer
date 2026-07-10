-- Optional hackathon demo seed.
-- Replace the UUID below with the authenticated demo user's id before applying, or run manually.

do $$
declare
  demo_user uuid := '00000000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from auth.users where id = demo_user) then
    raise notice 'Skipping demo seed. Create an auth user first, then replace demo_user with that user id.';
    return;
  end if;

  insert into public.profiles(id, display_name, default_currency, close_day_time, timezone)
  values (demo_user, 'Demo User', 'NPR', '21:30', 'Asia/Katmandu')
  on conflict (id) do nothing;

  insert into public.streaks(user_id, current_count, longest_count, freezes_available, last_active_date)
  values (demo_user, 3, 5, 1, current_date - interval '1 day')
  on conflict (user_id) do nothing;

  insert into public.goals(user_id, name, target_amount, currency, current_saved_amount, is_active)
  values (demo_user, 'Pokhara Trip', 25000, 'NPR', 4200, true)
  on conflict do nothing;

  insert into public.smart_capture_drafts(
    user_id, source, raw_text, raw_subject, parsed_amount, parsed_currency,
    parsed_merchant, parsed_category, parsed_kind, parsed_necessity,
    parsed_payment_method, parsed_occurred_at, confidence, ai_notes
  )
  values
    (
      demo_user, 'demo_seed',
      'Paid NPR 250 at Momo Ghar via wallet at 13:20',
      'Wallet payment alert',
      250, 'NPR', 'Momo Ghar', 'Food', 'expense', 'flexible',
      'wallet', now() - interval '8 hours', 0.92,
      'Looks like a flexible food purchase.'
    ),
    (
      demo_user, 'demo_seed',
      'NPR 120 bus fare',
      'Transport',
      120, 'NPR', 'Bus fare', 'Transport', 'expense', 'needed',
      'cash', now() - interval '6 hours', 0.74,
      'Transport is usually needed, but user should confirm.'
    ),
    (
      demo_user, 'demo_seed',
      'Received NPR 5000 from freelance client',
      'Payment received',
      5000, 'NPR', 'Freelance client', 'Freelance', 'income', 'unknown',
      'bank_transfer', now() - interval '2 hours', 0.88,
      'Income detected.'
    );

  insert into public.recurring_expenses(
    user_id, label, amount, currency, category, payment_method, due_day, cadence, next_due_date
  )
  values (
    demo_user, 'Monthly rent', 18000, 'NPR', 'Bills', 'bank_transfer',
    extract(day from current_date)::smallint, 'monthly', current_date
  )
  on conflict do nothing;
end $$;
