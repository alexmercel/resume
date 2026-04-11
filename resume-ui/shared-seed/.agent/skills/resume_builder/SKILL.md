---
name: Resume Builder
description: Comprehensive skill for generating targeted 1-page LaTeX resumes based on a Job Description, managing content in the Data/ directory, and generating PDFs.
---

# Resume Builder Skill

This skill empowers the AI agent to generate tailored 1-page resumes for specific job descriptions based on the existing single source of truth (`Data/` directory).

## Core Principles
1. **Never Change Data Content**: Never alter the body text of Projects, Experience, Research, or Extracurriculars. Pull exactly what is written in the respective `.md` files in `Data/`.
2. **Template Integrity**: The LaTeX templates inside `Templates/` are strictly wireframes. Never populate these directly or overwrite them. Create a NEW `.tex` file in `Tex_Files/` (e.g., `Tex_Files/Company_Name.tex`) by copying a template and inserting the data.
3. **One-Page Strict Limit**: The resulting resume must be exactly 1 page. Adjust the number of projects, bullets, or skills selected based on relevance to ensure it fills the page without spilling over. If space remains, utilize it to include more projects, certifications, or coursework.

## Execution Workflow
When the user or frontend UI prompts you to generate a resume:
1. **Analyze Job Description**: Parse the provided Job Description to identify key requirements (e.g., specific languages, domain knowledge like "Backend" or "Hardware").
2. **Filter Data**: Select the most relevant skills from `Data/skills.md`, the most relevant projects from `Data/projects.md`, and relevant coursework/education from `Data/education.md`.
3. **Draft the Resume**: Read the required Template (e.g., `Templates/General/Software_Gen.tex`). Replace the data placeholders with the selected Markdown data formatted into LaTeX.
4. **Compile PDF**: Save the output to `Tex_Files/[Company].tex` and run `pdflatex` to output to `PDFs/[Company].pdf`. Save logs to `Build_Logs/[Company].log`.
5. **Suggest Skills**: If the application requires skills the user does not currently list, suggest them proactively. If the user approves, add them to the resume.

You are acting as the execution backend for the `resume-ui` web interface.
