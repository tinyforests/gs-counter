-- G&S Counter: private authentication-email outbox and narrowly scoped worker API.
begin;
create schema if not exists counter_mail;
revoke all on schema counter_mail from public, anon, authenticated;
create table if not exists counter_mail.config (
  singleton boolean primary key default true check (singleton),
  mailer_token_hash text not null check (mailer_token_hash ~ '^[a-f0-9]{64}$')
);
create table if not exists counter_mail.outbox (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  action text not null,
  token_hash text,
  state text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  lease uuid,
  leased_until timestamptz,
  sent_at timestamptz
);
alter table counter_mail.config enable row level security;
alter table counter_mail.outbox enable row level security;
revoke all on all tables in schema counter_mail from public, anon, authenticated;
create index if not exists counter_mail_pending on counter_mail.outbox(next_attempt_at) where state = 'pending';

create or replace function public.counter_send_email(event jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  recipient text := lower(event #>> '{user,email}');
  action_type text := event #>> '{email_data,email_action_type}';
  auth_hash text := event #>> '{email_data,token_hash}';
begin
  if not exists (select 1 from public.stewards s where s.email = recipient) then
    return jsonb_build_object('error', jsonb_build_object('http_code',403,'message','This email is not on the counter steward list.'));
  end if;
  if action_type is null or action_type not in ('signup','magiclink','recovery','invite') then
    return jsonb_build_object('error', jsonb_build_object('http_code',400,'message','This email action is not supported by the counter mailer.'));
  end if;
  if auth_hash is null or auth_hash !~ '^[a-fA-F0-9]+$' then
    return jsonb_build_object('error', jsonb_build_object('http_code',400,'message','Missing sign-in token.'));
  end if;
  if not exists (select 1 from counter_mail.config) then
    return jsonb_build_object('error', jsonb_build_object('http_code',503,'message','The counter email sender is not configured yet.'));
  end if;
  -- Keep only the newest unsent link for each account and action.
  update counter_mail.outbox set state='superseded', token_hash=null, lease=null
    where email=recipient and action=action_type and state='pending';
  insert into counter_mail.outbox(email,action,token_hash) values(recipient,action_type,auth_hash);
  return '{}'::jsonb;
end $$;
revoke all on function public.counter_send_email(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.counter_send_email(jsonb) to supabase_auth_admin;

create or replace function counter_mail.check_token(p_token text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_token is null or length(p_token) < 32 or not exists (
    select 1 from counter_mail.config where mailer_token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
  ) then raise exception 'Invalid mailer credential' using errcode='28000'; end if;
end $$;
revoke all on function counter_mail.check_token(text) from public, anon, authenticated;

create or replace function public.counter_claim_mail(p_mailer_token text, p_limit integer default 10)
returns table(id uuid, lease uuid, email text, action text, token_hash text)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform counter_mail.check_token(p_mailer_token);
  update counter_mail.outbox q set state='expired', token_hash=null, lease=null
    where q.state='pending' and (q.expires_at <= now() or q.attempts >= 5);
  return query with batch as (
    select q.id from counter_mail.outbox q where q.state='pending'
      and q.next_attempt_at <= now() and (q.leased_until is null or q.leased_until < now())
      and exists(select 1 from public.stewards s where s.email=q.email)
      order by q.created_at limit greatest(0,least(coalesce(p_limit,10),10)) for update skip locked
  ) update counter_mail.outbox q set lease=gen_random_uuid(), leased_until=now()+interval '2 minutes', attempts=q.attempts+1
    from batch where q.id=batch.id returning q.id,q.lease,q.email,q.action,q.token_hash;
end $$;
revoke all on function public.counter_claim_mail(text,integer) from public, anon, authenticated;
grant execute on function public.counter_claim_mail(text,integer) to anon;

create or replace function public.counter_finish_mail(p_mailer_token text,p_id uuid,p_lease uuid,p_sent boolean)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare affected integer;
begin
  perform counter_mail.check_token(p_mailer_token);
  update counter_mail.outbox q set
    state=case when p_sent then 'sent' else 'pending' end,
    token_hash=case when p_sent then null else q.token_hash end,
    sent_at=case when p_sent then now() else null end,
    lease=null, leased_until=null, next_attempt_at=now()+interval '1 minute'
    where q.id=p_id and q.lease=p_lease and q.state='pending';
  get diagnostics affected = row_count;
  return affected=1;
end $$;
revoke all on function public.counter_finish_mail(text,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.counter_finish_mail(text,uuid,uuid,boolean) to anon;
commit;
-- After the owner runs Apps Script setupMailer, store ONLY its logged SHA-256 hash:
-- insert into counter_mail.config(singleton,mailer_token_hash) values(true,'HASH_FROM_SETUP_LOG')
-- on conflict(singleton) do update set mailer_token_hash=excluded.mailer_token_hash;
-- Enable public.counter_send_email as the Supabase Send Email hook only after configuration.
