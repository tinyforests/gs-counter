-- Temporary launch access approved by Tyson, 19 October 2026.
-- Ends at 00:00 21 October Australia/Melbourne (13:00 UTC 20 October).
-- Existing steward policies remain in place after the public policies expire.
begin;
do $$
declare t text;
begin
  foreach t in array array['items','sales','movements'] loop
    execute format('drop policy if exists %I_open_read on public.%I', t, t);
    execute format('drop policy if exists %I_open_write on public.%I', t, t);
    execute format('drop policy if exists %I_launch_access on public.%I', t, t);
    execute format('create policy %I_launch_access on public.%I for all to anon, authenticated using (CURRENT_TIMESTAMP < TIMESTAMPTZ ''2026-10-20 13:00:00+00'') with check (CURRENT_TIMESTAMP < TIMESTAMPTZ ''2026-10-20 13:00:00+00'')', t, t);
  end loop;
end $$;
commit;
