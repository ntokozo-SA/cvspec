-- Job applications captured from external boards (Chrome extension) + pipeline status

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  job_spec_id uuid references public.job_specs(id) on delete cascade not null,
  comparison_id uuid references public.comparisons(id) on delete set null,
  resume_id uuid references public.resumes(id) on delete set null,
  title text,
  company text,
  location text,
  board text check (board in ('linkedin', 'indeed', 'glassdoor', 'other')) not null,
  source_url text not null,
  status text check (status in ('saved', 'applied', 'interviewing', 'offer', 'rejected'))
    not null default 'saved',
  status_updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, source_url)
);

create index if not exists applications_user_status_idx
  on public.applications (user_id, status);

alter table public.applications enable row level security;

create policy "applications_owner_all"
  on public.applications
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
