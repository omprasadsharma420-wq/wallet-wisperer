-- Inbound email sender verification.
-- The inbound-email webhook only accepts drafts when the email's "from" address
-- matches a forwarding address the user registered on their own profile.

alter table public.profiles
  add column inbound_from_email text;

alter table public.profiles
  add constraint profiles_inbound_from_email_format
  check (inbound_from_email is null or inbound_from_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

create unique index profiles_inbound_from_email_idx
  on public.profiles (lower(inbound_from_email))
  where inbound_from_email is not null;
