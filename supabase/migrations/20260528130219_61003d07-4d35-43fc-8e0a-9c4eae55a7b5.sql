-- 1) New helper used by AI edge functions to decide whether to allow a call.
create or replace function public.can_use_ai(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = _uid
      and (p.school_sponsored = true or p.credits_balance > 0)
  );
$$;

-- 2) Replace handle_new_user to also grant signup bonus + ledger row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _bonus int := 200;
begin
  insert into public.profiles (id, email, full_name, credits_balance)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), _bonus);

  insert into public.credit_transactions (user_id, delta, reason, metadata)
  values (new.id, _bonus, 'signup_bonus', jsonb_build_object('note', 'Welcome bonus'));

  return new;
end;
$$;

-- 3) Backfill: any existing profile with balance 0 and no signup_bonus row gets 200.
with eligible as (
  select p.id from public.profiles p
  where p.credits_balance = 0
    and not exists (
      select 1 from public.credit_transactions t
      where t.user_id = p.id and t.reason = 'signup_bonus'
    )
)
update public.profiles
set credits_balance = 200, updated_at = now()
where id in (select id from eligible);

insert into public.credit_transactions (user_id, delta, reason, metadata)
select p.id, 200, 'signup_bonus', jsonb_build_object('note', 'Welcome bonus (backfill)')
from public.profiles p
where p.credits_balance = 200
  and not exists (
    select 1 from public.credit_transactions t
    where t.user_id = p.id and t.reason = 'signup_bonus'
  );