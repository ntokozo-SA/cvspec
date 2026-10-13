-- Allow applications captured from the South African job boards (PNet, Careers24,
-- CareerJunction, OfferZen). The extension only reads these sites once the user grants access.

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
      'pnet',
      'careers24',
      'careerjunction',
      'offerzen',
      'other'
    )
  );
