-- Assign explicitly recorded Square quantities to Mont Albert. Blank quantities stay untracked.
begin;
update public.items set stock = (stock - 'hawthorn') || '{"mont-albert": 5}'::jsonb where id = '17e90664-a4db-5733-88e5-d5101ae4ea75';
update public.items set stock = (stock - 'hawthorn') || '{"mont-albert": 1}'::jsonb where id = '3fbe7374-7526-568e-9cd3-b89fe4a7fc03';
update public.items set stock = (stock - 'hawthorn') || '{"mont-albert": 2}'::jsonb where id = 'a019e974-6fb5-5aeb-935a-d7fb70d8d8ff';
update public.items set stock = (stock - 'hawthorn') || '{"mont-albert": 2}'::jsonb where id = 'c953c963-174c-5fd7-add3-cf4aae70a92d';
update public.items set stock = (stock - 'hawthorn') || '{"mont-albert": 2}'::jsonb where id = '25f39e2e-d04c-5a95-9bc0-b414f5fd05b2';
update public.items set stock = (stock - 'hawthorn') || '{"mont-albert": 2}'::jsonb where id = '8bb58b78-53bd-568a-8003-a7627fe1ca8c';
commit;
