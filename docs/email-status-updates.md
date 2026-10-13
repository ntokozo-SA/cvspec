# Email status updates (phase 5 plan)

Status: planned, not built. Phases 1 to 4 (drafted answers, cover letters, South African
coverage, apply queue) have shipped; this document plans the optional fifth phase.

## Goal

Keep the job tracker up to date without manual status changes. When an employer emails an
application confirmation, rejection, interview invitation or offer, CVSpec suggests the matching
status change on the job ("Acme replied: interview invitation. Move to Interviewing?"). The user
accepts or dismisses each suggestion. Nothing changes on its own.

## Constraints

- Opt-in, off by default, and can be switched off at any time. Switching it off deletes every
  stored email event and stops accepting mail.
- CVSpec never stores email bodies, subjects or attachments. It stores only the classification
  result: application id, event type, sender domain and date.
- A status changes only after the user confirms it in the app.
- POPIA: rejection and interview emails can mention ID numbers, health or equity information.
  Message text is read in memory to classify it and then discarded. It is never logged and never
  written to the database or to object storage.
- Storage costs stay flat: one small row per recognised email, with old rows pruned.

## Two ways in

### Option A: per-user forwarding address (recommended first)

Each user gets a private address such as `u-7f3k9q2m@in.cvspec.app`. They add a Gmail (or
Outlook) filter that forwards job-related mail to it, for example mail from
`greenhouse.io OR lever.co OR myworkday.com OR smartrecruiters.com OR successfactors.com OR
workable.com`, or with "application" in the subject.

- Inbound mail uses Cloudflare Email Routing with an Email Worker, which is free at our volume.
  Amazon SES inbound with an S3 or Lambda action works too, but costs more and stores the raw
  message in S3 unless configured carefully.
- The Worker reads the headers and the first ~4 KB of plain text, classifies the message (see
  below), and POSTs only `{ token, senderDomain, receivedAt, type, matchHints }` to
  `POST /api/email/inbound`. Requests are signed with an HMAC shared secret. The raw message
  never leaves the Worker.
- Gmail forwarding verification: Gmail sends a confirmation email to the forwarding address
  before it starts forwarding. The Worker recognises `forwarding-noreply@google.com`, extracts
  the confirmation code and stores it briefly (10 minutes, keyed to the token) so the setup
  screen can show "Your Gmail confirmation code is 123456789". This is the only exception to
  "store nothing from the message", and the code is deleted once shown or when it expires.
- Pros: no Google verification, works with any mail provider, and the user chooses exactly
  what is forwarded.
- Cons: the setup takes about five steps, and filters miss employers who email from their own
  domain.

### Option B: Gmail read-only via Google sign-in

The user connects Gmail with OAuth (`gmail.readonly` or, preferably, `gmail.metadata` plus
targeted `messages.get`). A scheduled job then polls for new messages from known ATS domains and
from the companies of saved jobs.

- `gmail.readonly` is a restricted scope. It needs Google's OAuth verification and an annual
  CASA (Cloud Application Security Assessment) at Tier 2 or higher, which is a recurring cost
  and several weeks of lead time.
- Refresh tokens must be encrypted at rest, and the data is a high-value target, which raises
  the security bar for the whole server.
- Pros: one-click setup, and it can catch employers on their own domains.
- Cons: cost, review time, Gmail only, and a much larger privacy surface.

Recommendation: ship Option A first. Revisit Option B only if the forwarding setup turns out to
be the main reason people don't use the feature.

## Classification

Run on the Worker (Option A) or on the server (Option B), in memory only.

1. Rules first. These cover the common ATS templates (Greenhouse, Lever, Workday,
   SmartRecruiters, SuccessFactors, Workable), for example "Thank you for applying" maps to
   `confirmation`, "we will not be moving forward" or "unfortunately" maps to `rejection`, and
   "schedule", "interview" or a calendar link maps to `interview`.
2. If no rule matches, fall back to a small OpenAI call over the sender, subject and a trimmed
   ~1,500 characters of text with personal data patterns (SA ID numbers, phone numbers) removed.
   It returns `{ type, company, jobTitle, confidence }`. These calls count against the existing
   AI budget (`aiBudget`) under a separate per-user limit, such as 50 a day.
3. Types: `confirmation`, `rejection`, `interview`, `offer`, `other`. Drop `other` and anything
   with low confidence without storing it.

## Matching to an application

Score each of the user's applications in `saved`, `applied` or `interviewing` and pick the best
match above a threshold:

- The sender domain matches the company's domain, or a known ATS domain whose posting URL
  (`source_url` or `apply_url`) contains the same company slug (for example
  `boards.greenhouse.io/acme`).
- The company name or job title (from the classifier's `matchHints`) is similar to the
  application's `company` and `title`.
- More recent applications score higher.

If nothing scores above the threshold, store the event with `application_id = null`. The user
can then attach it to a job by hand from an "Unmatched replies" list, or dismiss it.

## Data model

```sql
create table public.email_inbound_addresses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,              -- random, 12+ chars; the local part of the address
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  type text not null check (type in ('confirmation', 'rejection', 'interview', 'offer')),
  sender_domain text not null check (char_length(sender_domain) <= 253),
  received_at timestamptz not null,
  decision text not null default 'pending' check (decision in ('pending', 'accepted', 'dismissed')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_events_user_pending_idx
  on public.email_events (user_id, created_at desc) where decision = 'pending';
```

- RLS is enabled with owner-only policies, matching the other tables. The server still filters
  by `user_id` on every query.
- Repeat deliveries: ignore an event with the same `(user_id, application_id, type,
  sender_domain)` within 24 hours.
- Retention: a daily job deletes decided events after 90 days and pending events after 30 days.
- Turning the feature off deletes the user's `email_inbound_addresses` row and all of their
  `email_events`. Mail sent to an unknown or disabled token is dropped at the Worker.

## Server

- `POST /api/email/inbound`: Worker only, HMAC-verified, rate limited per token. It resolves
  the token to a user, runs matching, inserts the event and returns 202.
- `GET /api/email/settings`, `POST /api/email/settings` (enable, which creates the token), and
  `DELETE /api/email/settings` (disable and delete everything).
- `GET /api/email/forwarding-code` returns the short-lived Gmail confirmation code, if any.
- `GET /api/email/events?decision=pending`.
- `POST /api/email/events/:id/accept`: sets the application's status from the type
  (`confirmation` maps to `applied`, `interview` to `interviewing`, `offer` to `offer`,
  `rejection` to `rejected`) through the same update path as the tracker. This also clears
  `queue_position`.
- `POST /api/email/events/:id/dismiss` and `POST /api/email/events/:id/assign { applicationId }`.

## Client

- Profile page gets an "Email updates" section with a toggle, the forwarding address with a copy
  button, step-by-step Gmail filter instructions with a prefilled filter query, the
  confirmation-code display, and "Turn off and delete email data".
- The job tracker shows a banner with pending suggestions and Accept or Dismiss on each.
  Matched rows show an "Email: interview invitation, 12 Oct" chip until the suggestion is decided.
- An "Unmatched replies" list lets the user pick the job a reply belongs to.

## Extension

No extension changes are needed. If the popup later shows pending suggestions, the Chrome Web
Store data-use disclosure must add "personal communications" (classification only), and the
popup must read the data from the server rather than from mail.

## Privacy and disclosures

- Privacy page: what is read (forwarded mail, in memory only), what is stored (type, sender
  domain, date and the matched job), what is sent to OpenAI (a trimmed, redacted excerpt only when
  the rules don't match), retention (30 or 90 days), and how to switch it off and delete it.
- Option B adds the Google API Services User Data Policy "Limited Use" statement, and the app
  cannot launch the option until Google verification and CASA are complete.
- The data processing records list Cloudflare (or AWS) as a processor of mail in transit.

## Tests

- Classifier fixtures cover real-world templates from each ATS: confirmation, rejection,
  interview and offer, plus noise such as newsletters, job alerts and Gmail forwarding
  verification.
- Matching tests cover the same company on different ATS domains, two jobs at one company,
  and the unmatched path.
- Route tests cover HMAC rejection, unknown or disabled tokens, duplicate suppression, that
  accept changes status only through the confirmation route, and that turning the feature off
  deletes everything.
- A guard test checks that no inbound path writes the body or subject to the database or to
  logs.

## Rollout

1. Build Option A behind a feature flag for internal accounts. Measure match precision on real
   forwarded mail before widening.
2. Ship the privacy page update before general availability.
3. Decide on Option B after about two months, based on how many users finish the forwarding
   setup and how many replies go unmatched.

## Open questions

- Domain for inbound mail (`in.cvspec.app` or a subdomain of the main domain) and its MX/SPF
  setup.
- Whether an `applied` job should move to `applied` on a `confirmation` (a no-op today) or only
  record the date.
- Whether to offer automatic acceptance for `confirmation` events only, with the user's opt-in.
  This plan assumes no: every change is confirmed.
