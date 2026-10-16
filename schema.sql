-- G&S Counter — database schema.
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run twice.

-- ---------------------------------------------------------------- stewards
-- The allow list. Only emails in here can read or write anything.
create table if not exists public.stewards (
  email      text primary key,
  name       text,
  role       text not null default 'steward',   -- 'steward' or 'admin'
  created_at timestamptz not null default now()
);

-- EDIT THIS before running: your own email first, then each steward.
insert into public.stewards (email, name, role) values
  ('tyson@gardenerandson.com', 'Tyson', 'admin')
on conflict (email) do nothing;

-- true when the person calling is on the allow list
create or replace function public.is_steward() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stewards s
    where s.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ------------------------------------------------------------------- items
create table if not exists public.items (
  id         uuid primary key,
  name       text not null,
  sku        text,
  price      numeric(10,2) not null default 0,
  low_at     numeric(10,2) not null default 0,
  stock      jsonb not null default '{}'::jsonb,   -- { "mont-albert": 12, "hawthorn": 3 }
  archived   boolean not null default false,
  created_ms bigint,
  created_at timestamptz not null default now()
);
create unique index if not exists items_sku_key on public.items (sku) where sku is not null;

-- ------------------------------------------------------------------- sales
create table if not exists public.sales (
  id            uuid primary key,
  created_ms    bigint not null,
  day           text,
  studio        text not null,
  customer_name text not null default 'Walk-in',
  phone         text,
  email         text,
  lines         jsonb not null default '[]'::jsonb,
  item_count    integer not null default 0,
  total         numeric(10,2) not null default 0,
  method        text not null,
  note          text,
  steward_id    uuid,
  voided        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists sales_created_idx on public.sales (created_ms desc);
create index if not exists sales_studio_idx  on public.sales (studio, created_ms desc);

-- --------------------------------------------------------------- movements
create table if not exists public.movements (
  id          uuid primary key,
  at_ms       bigint not null,
  studio      text,
  by_steward  uuid,
  type        text not null,            -- received | adjust | stocktake
  item_id     uuid,
  name        text,
  qty         numeric(10,2),
  before_qty  numeric(10,2),
  after_qty   numeric(10,2),
  note        text,
  changed     integer,
  net_units   numeric(10,2),
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists movements_at_idx on public.movements (at_ms desc);

-- ----------------------------------------------------- row-level security
alter table public.stewards  enable row level security;
alter table public.items     enable row level security;
alter table public.sales     enable row level security;
alter table public.movements enable row level security;

-- stewards can see the allow list (so the app can check itself) but not change it;
-- add or remove stewards here in the SQL editor.
drop policy if exists stewards_read on public.stewards;
create policy stewards_read on public.stewards for select to authenticated using (public.is_steward());

do $$
declare t text;
begin
  foreach t in array array['items','sales','movements'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (public.is_steward())', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.is_steward()) with check (public.is_steward())', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------- realtime
-- so an open iPad updates when another device records a sale
do $$
declare t text;
begin
  foreach t in array array['items','sales','movements'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
