# Resume Builder Studio

Resume Builder Studio is a React + Vite app for generating tailored resumes and cover letters from:

- your markdown data files in `Data/`
- LaTeX wireframe templates in `Templates/`
- a pasted job description
- a provider + model you configure in the app
- curated opportunity feeds from public GitHub job boards

The app now supports two modes:

- legacy local mode: file-backed data with no auth
- production mode: Supabase Auth + Postgres for user data, encrypted per-user provider keys, and user-scoped generated artifacts
- Vercel mode: Supabase for text + metadata, Vercel Blob for PDFs, and a remote LaTeX compile service
- optional worker mode: a dedicated LaTeX worker compiles PDFs from a queued job table

When Supabase is not configured, the app stays in legacy local mode so existing behavior does not break.

## Requirements

- Node.js 18+ recommended
- `npm`
- For inline compilation: a working LaTeX installation with `pdflatex`
- At least one provider API key, either:
  - configured per user in the app, or
  - configured server-side via env vars for Google, OpenAI, or Anthropic
- For multi-user production mode:
  - Supabase project
  - Supabase URL
  - Supabase anon key
  - Supabase service role key
  - `APP_ENCRYPTION_KEY` for encrypting stored provider keys

## Run The App

1. Open a terminal in the repo root:

```bash
cd "/path/to/resume"
```

2. Install frontend dependencies:

```bash
cd resume-ui
npm install
```

3. Start the app in development:

```bash
npm run dev
```

For a production-style local run:

```bash
npm run build
npm run start
```

4. Open the local Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

## First-Time Setup

When the app detects missing or empty required data files, it automatically shows an onboarding screen.

The onboarding flow lets you:

- choose a provider
- optionally paste a provider API key
- choose a model discovered from that provider
- upload an existing resume
- parse that resume into the app's markdown format
- complete the LaTeX setup wizard with OS-specific installer guidance
- run a LaTeX readiness check against the packages used by the app templates
- review a checklist of created files and saved configuration

After setup, you can continue editing everything inside the app.

## Main Tabs

### Profile & AI

Use this tab to:

- edit `Data/profile.md`
- choose your active provider
- securely store a per-user provider key or rely on a server-managed key
- choose the model used by the app
- test the provider connection with a sample request
- view LaTeX / PDF engine status

In legacy local mode, settings are stored locally in:

```text
resume-ui/user-settings.json
```

In production mode, user settings and profile/data documents are stored in Supabase instead.

### AI Generator

Use this tab to:

- paste a target job description
- choose a base wireframe template
- generate a tailored resume PDF
- generate a cover letter
- copy the generated cover letter text
- export the cover letter as a plain text `.txt`
- run a humanization pass on the cover letter
- view keyword extraction, matched keywords, and ATS-style score feedback

Generator state persists while you switch tabs and only resets on a full browser refresh.

The generator only shows a PDF after a fresh generation in the current browser session. Old local PDFs do not prefill the `AI Resume` card anymore.

### Data Management

Use this tab to edit your core content files:

- `Data/projects.md`
- `Data/workex.md`
- `Data/education.md`
- `Data/skills.md`

`profile.md` is edited from `Profile & AI`, not from this tab.

### Wireframe Templates

Use this tab to:

- edit LaTeX wireframe templates
- preview compiled templates
- create new templates

### Generic Resumes

Use this tab to manage generic reusable LaTeX resume templates.

### History & Edit

Use this tab to:

- browse generated resume PDFs
- browse saved cover letters
- review original job descriptions
- edit generated `.tex` files
- recompile PDFs

History now recognizes existing local PDFs and cover letters even when full metadata is missing.

### Apply Tracker

Use this tab to:

- track daily application momentum based on generated resumes
- view summary metrics like today count, 7-day total, and 5+/day streak
- interact with a visual graph of recent activity

The tracker is read-only. It is automatically driven by successful resume generations and does not support manual logging.

### Opportunities

Use this tab to:

- browse curated internship and new-grad opportunities aggregated from public GitHub job boards
- filter by search, role type, source, and posted date window
- refresh the feed manually when you want newer data
- open the direct apply link for a role

The opportunities tab loads from a local cache when opened and only refreshes when you click `Refresh Sources`.

## How Generation Works

The app now uses only these inputs when generating a resume:

- the pasted job description
- the selected LaTeX template
- the current markdown data in `Data/`

It is explicitly configured to ignore:

- old PDFs
- old generated `.tex` files
- old history entries
- previous candidates
- previous runs

Also, resume generation does **not** rewrite your source markdown files. Your `Data/*.md` files are only changed when you explicitly save from the in-app editors.

## Important Folders

- `Data/`: your local source-of-truth markdown data
- `Templates/`: LaTeX wireframes and generic templates
- `PDFs/`: generated resume PDFs
- `Cover_Letters/`: generated cover letter text files
- `Tex_Files/`: generated and editable LaTeX outputs
- `Build_Logs/`: compilation artifacts and logs
- `resume-ui/`: React frontend and local API layer
- `resume-ui/opportunities-cache.json`: cached opportunity feed data
- `Runtime_Data/users/<userId>/`: user-scoped artifacts in authenticated mode

## Storage Model

With Supabase enabled, editable user data is stored in Postgres:

- `public.user_documents`: `profile.md`, `projects.md`, `workex.md`, `education.md`, `skills.md`
- `public.user_settings`: provider/model/apply settings
- `public.user_provider_keys`: encrypted per-user provider keys
- `public.application_records`: application tracker rows
- `public.generation_history`: generation metadata and cover letter content
- `public.generation_jobs`: queued LaTeX compilation jobs

Generated artifacts are stored in one of two ways:

- local / worker deployments:
  - PDFs
  - `.tex` files
  - `.txt` cover letters
- Vercel deployments:
  - `generation_history.tex_content` stores editable TeX source as text
  - `generation_history.cover_letter_content` stores cover letters as text
  - Vercel Blob stores PDF binaries
  - `generation_history.pdf_blob_path` / `pdf_blob_url` store PDF metadata

In authenticated local/worker mode, filesystem artifacts are stored under `Runtime_Data/users/<userId>/...`.

## Production Setup

1. Copy [resume-ui/.env.example](/Users/jaishah/Documents/Coding/Resume%20-%20Latex/resume/resume-ui/.env.example:1) to `resume-ui/.env.local`.
2. Fill in:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ENCRYPTION_KEY`
3. Apply the Supabase schema in [resume-ui/supabase/schema.sql](/Users/jaishah/Documents/Coding/Resume%20-%20Latex/resume/resume-ui/supabase/schema.sql:1).
4. Optionally set server-managed provider keys:
   - `GOOGLE_AI_API_KEY`
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
5. Choose one PDF compilation/storage strategy:
   - Vercel mode:
     - set `BLOB_READ_WRITE_TOKEN`
     - set `LATEX_COMPILER_MODE=remote`
     - optionally override `LATEX_REMOTE_BASE_URL` and `LATEX_REMOTE_COMMAND`
   - self-hosted worker mode:
     - set `LATEX_QUEUE_MODE=worker`
     - start the worker with `npm run start:worker`
6. Start the app. When all Supabase vars are present, the UI switches into authenticated multi-user mode automatically.

## Vercel Deployment

Set the Vercel project root to `resume-ui`.

For a Vercel deployment, configure:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ENCRYPTION_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `LATEX_COMPILER_MODE=remote`
- optionally:
  - `LATEX_REMOTE_BASE_URL`
  - `LATEX_REMOTE_COMMAND`
  - `GOOGLE_AI_API_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`

The repo includes:

- [resume-ui/api/[...path].mjs](/Users/jaishah/Documents/Coding/Resume%20-%20Latex/resume/resume-ui/api/%5B...path%5D.mjs:1): Vercel Function entrypoint that reuses the API handler
- [resume-ui/vercel.json](/Users/jaishah/Documents/Coding/Resume%20-%20Latex/resume/resume-ui/vercel.json:1): function config for the API routes

This mode keeps PDFs out of Supabase and avoids a persistent LaTeX worker on Vercel.

## Docker Deployment

The repo now includes a split production scaffold:

- [resume-ui/Dockerfile.web](/Users/jaishah/Documents/Coding/Resume%20-%20Latex/resume/resume-ui/Dockerfile.web:1): web app and API service
- [resume-ui/Dockerfile.worker](/Users/jaishah/Documents/Coding/Resume%20-%20Latex/resume/resume-ui/Dockerfile.worker:1): dedicated LaTeX worker with TeX packages installed
- [docker-compose.yml](/Users/jaishah/Documents/Coding/Resume%20-%20Latex/resume/docker-compose.yml:1): two-service stack for the web app and worker

To run the split stack:

```bash
docker compose up --build
```

In this setup:

- the `web` service handles auth, data, AI calls, and queueing
- the `latex-worker` service polls `public.generation_jobs`
- PDF compilation is offloaded from the request path
- both services share `Runtime_Data` for generated artifacts

## Privacy / Git Behavior

The repository is configured so these local/runtime files are ignored by git:

- `Data/*.md`
- `PDFs/*.pdf`
- `Cover_Letters/*.txt`
- generated files in `Tex_Files/`
- `Build_Logs/*`
- `resume-ui/user-settings.json`
- `Runtime_Data/*`
- `.env` and `.env.*`

This keeps personal content and API settings from being committed by default.

## Troubleshooting

### The app says no API key is configured

Open `Profile & AI`, choose the provider you want to use, save a per-user key or configure a server-managed env key, and test the connection.

### Resume generation succeeds but no preview appears

Make sure `pdflatex` is installed and available on your machine. Use the onboarding LaTeX setup wizard or the status block in `Profile & AI`, then run the readiness check. The app generates a `.tex` file first and then compiles it to PDF locally.

### A new user cloned the repo and sees old personal content

That means generated/runtime files were previously tracked in git history or still exist locally on that machine. The app now ignores those paths going forward, but existing tracked artifacts need to be removed from version control separately.

### History is empty but PDFs exist locally

History now scans local PDFs and cover letters directly. If the files are in `PDFs/` and `Cover_Letters/`, they should appear even without metadata JSON.

### Opportunities tab shows no roles

The tab reads from the local cache first. If no cache exists yet, open the tab and click `Refresh Sources` to pull the latest opportunities from the configured GitHub feeds.

## Development Notes

Frontend app:

```bash
cd resume-ui
npm run dev
```

Production build check:

```bash
cd resume-ui
npm run build
```
