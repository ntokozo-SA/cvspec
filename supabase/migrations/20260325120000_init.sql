-- CV Specs schema + RLS
-- Apply via Supabase SQL editor or `supabase db push`

create extension if not exists "pgcrypto";

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  file_name text not null,
  storage_path text not null,
  parsed_json jsonb,
  parsed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.job_specs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source_type text check (source_type in ('link', 'document', 'text')) not null,
  source_url text,
  storage_path text,
  raw_text text,
  parsed_json jsonb,
  created_at timestamptz default now()
);

create table if not exists public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  resume_id uuid references public.resumes(id) on delete cascade not null,
  job_spec_id uuid references public.job_specs(id) on delete cascade not null,
  match_score numeric not null,
  matched_skills jsonb,
  missing_skills jsonb,
  recommendations jsonb,
  created_at timestamptz default now()
);

alter table public.resumes enable row level security;
alter table public.job_specs enable row level security;
alter table public.comparisons enable row level security;

create policy "resumes_owner_all"
  on public.resumes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "job_specs_owner_all"
  on public.job_specs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "comparisons_owner_all"
  on public.comparisons
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('job-specs', 'job-specs', false)
on conflict (id) do nothing;
