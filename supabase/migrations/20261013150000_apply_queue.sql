-- Apply queue: an ordered list of saved jobs the user works through one at a time in the
-- extension. Also records the application form URL and whether the board's own form is used.

alter table public.applications
  add column if not exists queue_position smallint check (queue_position between 1 and 20),
  add column if not exists queued_at timestamptz,
  add column if not exists apply_url text check (char_length(apply_url) <= 2000),
  add column if not exists built_in_apply boolean;

create index if not exists applications_user_queue_idx
  on public.applications (user_id, queue_position)
  where queue_position is not null;
