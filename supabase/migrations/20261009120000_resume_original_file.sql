-- PDF resumes are converted to DOCX on upload; keep the original PDF alongside the converted file

alter table public.resumes
  add column if not exists original_file_name text,
  add column if not exists original_storage_path text;
