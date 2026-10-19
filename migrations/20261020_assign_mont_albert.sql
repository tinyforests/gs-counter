-- Studio attribution requested by Tyson on 20 October 2026.
-- Historical totals remain separate from individual sale records.
begin;
update public.daily_history set studio='mont-albert' where studio is distinct from 'mont-albert';
update public.sales set studio='mont-albert' where studio is distinct from 'mont-albert';
commit;
