# Resume Builder Studio

Resume Builder Studio is a local React + Vite app for generating tailored resumes and cover letters from:

- your markdown data files in `Data/`
- LaTeX wireframe templates in `Templates/`
- a pasted job description
- a Gemini API key and model you configure in the app
- curated opportunity feeds from public GitHub job boards

The app is designed so personal data stays local. Runtime data such as `Data/*.md`, generated PDFs, cover letters, build logs, and local AI settings are ignored by git.

## Requirements

- Node.js 18+ recommended
- `npm`
- A working LaTeX installation with `pdflatex`
- A Google AI Studio / Gemini API key

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

3. Start the app:

```bash
npm run dev
```

4. Open the local Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

## First-Time Setup

When the app detects missing or empty required data files, it automatically shows an onboarding screen.

The onboarding flow lets you:

- paste your Gemini API key
- choose a Gemini model
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
- save your Gemini API key locally
- choose the Gemini model used by the app
- test the API key with a sample request
- view LaTeX / PDF engine status

Your Gemini settings are stored locally in:

```text
resume-ui/user-settings.json
```

This file is gitignored.

### AI Generator

Use this tab to:

- paste a target job description
- choose a base wireframe template
- generate a tailored resume PDF
- generate a cover letter
- copy the generated cover letter text
- export the cover letter as a Word `.doc`
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

## Privacy / Git Behavior

The repository is configured so these local/runtime files are ignored by git:

- `Data/*.md`
- `PDFs/*.pdf`
- `Cover_Letters/*.txt`
- generated files in `Tex_Files/`
- `Build_Logs/*`
- `resume-ui/user-settings.json`
- `.env` and `.env.*`

This keeps personal content and API settings from being committed by default.

## Troubleshooting

### The app says no API key is configured

Open `Profile & AI`, paste your Gemini API key, save it, and test it.

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
