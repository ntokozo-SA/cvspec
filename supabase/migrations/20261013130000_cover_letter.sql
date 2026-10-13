-- Tailored cover letter per job. Only the text is stored; the DOCX or PDF is built on request
-- and never stored, so storage stays flat.

alter table public.applications
  add column if not exists cover_letter text check (char_length(cover_letter) <= 8000),
  add column if not exists cover_letter_updated_at timestamptz;
