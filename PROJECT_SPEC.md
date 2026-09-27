# CV Specs — Project Spec

## Project Overview

**CV Specs** is a Progressive Web App that helps users compare their resume against a specific job posting. The user provides a job spec (via link, uploaded document, or pasted text) and their resume (via upload), and the app returns:

1. A compatibility match percentage
2. A breakdown of matched vs. missing skills/requirements
3. Specific, actionable edit recommendations for the resume, tailored to that job

## Tech Stack

- **Frontend:** React + TypeScript, built as a PWA
- **Backend:** Node.js + Express + TypeScript
- **Database/Auth/Storage:** Supabase
- **Resume parsing:** resumeparser.com API
- **Job spec parsing & recommendations:** OpenAI API

## UI Principles

- No purple gradients, pill-shaped buttons, fake reviews, or fake metrics
- No vague hero text, emoji icons, em dashes, or over-the-top scroll animations
- Brand-first landing; one job per section; specific, useful copy

## Core Tables

- `resumes` — uploaded and parsed resumes
- `job_specs` — job postings from link, document, or text
- `comparisons` — scored match results and recommendations
- `applications` — jobs saved from external boards via the Chrome extension, with pipeline status

RLS: users can only access rows where `user_id = auth.uid()`.

## API

```
POST/GET/DELETE  /api/resumes
POST/GET/DELETE  /api/job-specs
POST/GET         /api/comparisons
GET              /api/comparisons/:id
POST/GET         /api/applications
PATCH/DELETE     /api/applications/:id
POST             /api/applications/:id/analyze
POST             /api/extension/handoff
```

All routes except auth verify the Supabase JWT.
