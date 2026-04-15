---
name: Resume Builder
description: Comprehensive skill for generating targeted 1-page LaTeX resumes based on a Job Description, managing content in the Data/ directory, and generating PDFs.
---

# Resume Builder Skill

This skill empowers the AI agent to generate tailored 1-page resumes for specific job descriptions based on the existing single source of truth (`Data/` directory).

## Core Principles
1. **Never Change Data Content**: Never alter the body text of Projects, Experience, Research, or Extracurriculars. Pull exactly what is written in the respective `.md` files in `Data/`.
2. **Template Integrity**: The LaTeX templates inside `Templates/` are strictly wireframes. Never populate these directly or overwrite them. Create a NEW `.tex` file in `Tex_Files/` (e.g., `Tex_Files/Company_Name.tex`) by copying a template and inserting the data.
3. **One-Page Strict Limit**: The resulting resume should be tightly curated for one page. Adjust the number of roles, projects, skills, coursework, and optional sections based on relevance instead of trying to include everything.

## Execution Workflow
When the user or frontend UI prompts you to generate a resume:
1. **Analyze Job Description**: Parse the provided Job Description to identify key requirements (e.g., specific languages, domain knowledge like "Backend" or "Hardware").
2. **Filter Data**: Education, Work Experience, Projects, and Skills are mandatory in every generated resume. Select the most relevant skills from `Data/skills.md`, 1 or 2 relevant roles from `Data/workex.md`, and always include at least 2 JD-matching projects from `Data/projects.md` (up to 3 if space allows). Include at most 3 relevant coursework items per degree from `Data/education.md`. Include research, certifications, or extracurriculars only when they materially help for the JD.
3. **Draft the Resume**: Read the required Template (e.g., `Templates/Wireframes/template1.tex`). Replace the data placeholders with only the selected Markdown data formatted into LaTeX.
4. **Compile PDF**: Save the output to `Tex_Files/[Company].tex` and run `pdflatex` to output to `PDFs/[Company].pdf`. Save logs to `Build_Logs/[Company].log`.
5. **Suggest Skills**: If the application requires skills the user does not currently list, suggest them proactively. If the user approves, add them to the resume.

You are acting as the execution backend for the `resume-ui` web interface.
