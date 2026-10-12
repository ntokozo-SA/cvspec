-- Assisted apply: remember which recommendations were chosen per application (the tailored
-- DOCX is rebuilt on demand, never stored) and keep contact details for filling forms

alter table public.applications
  add column if not exists tailored_comparison_id uuid references public.comparisons(id) on delete set null,
  add column if not exists tailored_recommendations integer[];

create table if not exists public.applicant_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  location text,
  linkedin_url text,
  website_url text,
  updated_at timestamptz default now()
);

alter table public.applicant_profiles enable row level security;

create policy "applicant_profiles_owner_all"
  on public.applicant_profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
