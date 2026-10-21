-- Extend the existing public soft-launch window by 48 hours, approved by Tyson.
-- Expires 00:00 Friday 23 October 2026 Australia/Melbourne.
-- Retains existing scopes and steward policies; daily history stays read-only.
begin;
alter policy items_launch_access on public.items
  using (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00')
  with check (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00');
alter policy sales_launch_access on public.sales
  using (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00')
  with check (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00');
alter policy movements_launch_access on public.movements
  using (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00')
  with check (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00');
alter policy customers_launch_access on public.customers
  using (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00')
  with check (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00');
alter policy daily_history_launch_read on public.daily_history
  using (CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-10-22 13:00:00+00');
commit;
