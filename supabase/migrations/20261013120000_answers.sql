-- Answers to custom application questions: a reusable bank on the profile, and the answers the
-- candidate kept for each job. Text only. ID numbers and employment-equity, health, criminal and
-- other special personal information are never stored (the API rejects them).

create table if not exists public.saved_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null check (
    category in (
      'salary',
      'notice_period',
      'start_date',
      'relocation',
      'work_authorization',
      'motivation',
      'referral_source',
      'other'
    )
  ),
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_answers_user_idx on public.saved_answers (user_id, category);

alter table public.saved_answers enable row level security;

create policy "saved_answers_owner_all"
  on public.saved_answers
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.application_answers (
  application_id uuid references public.applications(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  question_key text not null check (char_length(question_key) between 1 and 200),
  question_label text not null check (char_length(question_label) between 1 and 300),
  answer text not null check (char_length(answer) <= 4000),
  source text not null check (source in ('bank', 'ai', 'user')),
  updated_at timestamptz not null default now(),
  primary key (application_id, question_key)
);

create index if not exists application_answers_user_idx on public.application_answers (user_id);

alter table public.application_answers enable row level security;

create policy "application_answers_owner_all"
  on public.application_answers
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
