# Resume Builder Studio

Resume Builder Studio is a local React + Vite app for generating tailored resumes and cover letters from:

- your markdown data files in `Data/`
- LaTeX wireframe templates in `Templates/`
- a pasted job description
- a Gemini API key and model you configure in the app

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
- review a checklist of created files and saved configuration

After setup, you can continue editing everything inside the app.

## Main Tabs

### Profile & AI

Use this tab to:

- edit `Data/profile.md`
- save your Gemini API key locally
- choose the Gemini model used by the app
- test the API key with a sample request

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
- view keyword extraction, matched keywords, and ATS-style score feedback

Generator state persists while you switch tabs and only resets on a full browser refresh.

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

Make sure `pdflatex` is installed and available on your machine. The app generates a `.tex` file first and then compiles it to PDF locally.

### A new user cloned the repo and sees old personal content

That means generated/runtime files were previously tracked in git history or still exist locally on that machine. The app now ignores those paths going forward, but existing tracked artifacts need to be removed from version control separately.

### History is empty but PDFs exist locally

History now scans local PDFs and cover letters directly. If the files are in `PDFs/` and `Cover_Letters/`, they should appear even without metadata JSON.

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
