-- Allow applications captured from the additional job boards the Chrome extension supports

alter table public.applications drop constraint if exists applications_board_check;

alter table public.applications
  add constraint applications_board_check check (
    board in (
      'linkedin',
      'indeed',
      'glassdoor',
      'ziprecruiter',
      'google_jobs',
      'careerbuilder',
      'monster',
      'simplyhired',
      'talention',
      'flexjobs',
      'weworkremotely',
      'remoteco',
      'dice',
      'wellfound',
      'hired',
      'builtin',
      'handshake',
      'snagajob',
      'upwork',
      'fiverr',
      'idealist',
      'peoplecurated',
      'other'
    )
  );
