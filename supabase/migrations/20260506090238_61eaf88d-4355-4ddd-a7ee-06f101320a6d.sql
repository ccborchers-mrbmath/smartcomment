
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- updated_at trigger function
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- classes
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  year_grade text,
  subject text,
  term text,
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.classes enable row level security;
create policy "classes_all_own" on public.classes for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create trigger classes_set_updated_at before update on public.classes
  for each row execute function public.set_updated_at();
create index classes_teacher_id_idx on public.classes(teacher_id);

-- students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0,
  overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.students enable row level security;
create policy "students_all_own" on public.students for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create trigger students_set_updated_at before update on public.students
  for each row execute function public.set_updated_at();
create index students_class_id_idx on public.students(class_id);

-- student_inputs
create type public.input_type as enum ('voice','handwriting','typed','file');
create table public.student_inputs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  type public.input_type not null,
  text text,
  transcript text,
  media_url text,
  media_path text,
  created_at timestamptz not null default now()
);
alter table public.student_inputs enable row level security;
create policy "inputs_all_own" on public.student_inputs for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create index inputs_student_id_idx on public.student_inputs(student_id);

-- style_samples
create table public.style_samples (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  source text,
  created_at timestamptz not null default now()
);
alter table public.style_samples enable row level security;
create policy "style_all_own" on public.style_samples for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create index style_teacher_id_idx on public.style_samples(teacher_id);

-- generated_comments
create table public.generated_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  version int not null default 1,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.generated_comments enable row level security;
create policy "comments_all_own" on public.generated_comments for all
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create trigger comments_set_updated_at before update on public.generated_comments
  for each row execute function public.set_updated_at();
create index comments_student_id_idx on public.generated_comments(student_id);

-- storage buckets (private)
insert into storage.buckets (id, name, public) values
  ('audio-notes','audio-notes', false),
  ('handwriting','handwriting', false),
  ('attachments','attachments', false),
  ('style-uploads','style-uploads', false),
  ('rosters','rosters', false);

-- storage policies: teachers can access only files inside a folder named with their own user id
create policy "audio_own" on storage.objects for all
  using (bucket_id = 'audio-notes' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'audio-notes' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "handwriting_own" on storage.objects for all
  using (bucket_id = 'handwriting' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'handwriting' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachments_own" on storage.objects for all
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "style_uploads_own" on storage.objects for all
  using (bucket_id = 'style-uploads' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'style-uploads' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "rosters_own" on storage.objects for all
  using (bucket_id = 'rosters' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'rosters' and auth.uid()::text = (storage.foldername(name))[1]);
