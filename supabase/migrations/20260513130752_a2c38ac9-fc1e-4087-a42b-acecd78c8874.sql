
create table public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  author_id uuid not null default auth.uid(),
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback_replies enable row level security;

create policy feedback_replies_all_super_admin on public.feedback_replies
  for all to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

create policy feedback_replies_select_owner on public.feedback_replies
  for select to authenticated
  using (exists (select 1 from public.feedback f where f.id = feedback_id and f.user_id = auth.uid()));

create index feedback_replies_feedback_id_idx on public.feedback_replies(feedback_id);
