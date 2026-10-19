-- Optional: enable the imported customer lookup for the existing public launch.
-- Applying this exposes customer names, emails, phones and notes until expiry.
-- Run only with the owner's explicit approval. Data is never committed here.
begin;
drop policy if exists customers_launch_access on public.customers;
create policy customers_launch_access on public.customers for all to anon, authenticated
using (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-20 13:00:00+00')
with check (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-20 13:00:00+00');
commit;
