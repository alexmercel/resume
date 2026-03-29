---
trigger: always_on
---

# Resume Generation Instructions

Follow these rules strictly whenever generating a new resume:

1.  **Regeneration Policy**: Do NOT regenerate the template or any existing resume with updated data unless explicitly asked to do so.
2.  **Coursework**: Include *only* coursework relevant to the specific job description or resume type (e.g., Hardware vs. Software).
3.  **Skills Selection**: Pick top skills relevant to the role. Do not include the exhaustive list from the pool.
4.  **Page Limit**: Try to adhere to 1 page if possible, but you are not strictly limited. Let the actual data dictate the length naturally.
5.  **Project/Experience Selection**:
    *   Pick only relevant projects and work experience.
    *   Decide the quantity based on relevance to the role.
    *   Include only the top few relevant items; do not list everything.
6.  **Additional Sections**:
    *   Include **Certifications & Awards** if relevant and space permits.
    *   Include **Research** if relevant to the role and space permits.
7.  **Content Integrity**: **CRITICAL**: Do NOT change the text content of Projects, Work Experience, Research, Certifications, or Extracurriculars unless specifically instructed to adapt JD keywords. Use the text exactly as it appears in the source Markdown files where unchanged.
8.  **Formatting**: Fill out the resume naturally. Do not artificially condense the structure just to save space. Generate all relevant bullet entries fully.
9.  **Template Precision**: Always make sure to use the latest version of the resume template.
10. **Skill Suggestions**: Suggest a few skills which are not from my data but are asked for in the job description, which would be good to have for the company and somewhat relate to my skills. Present these as a prompt to the user, and ONLY if confirmed, add them.
11. **PDF Generation**: Whenever asked to generate a new resume, always also create the PDF file.
12. **Template Integrity**: The template file must be strictly a wireframe containing NO personal data. Always populate ALL content (Education, Experience, Projects, Skills, etc.) fresh from the `Data/` directory for every generation.
13. **File Naming**: Name the generated PDF and source .tex file using the Company Name (e.g., `Apple.pdf`) if a company is specified. If no company is specified, use a descriptive name based on the role or type (e.g., `Hardware.pdf`).
14. **File Modifications**: Only modify files in the current workspace.
15. **Directory Structure**: Always save generated files in the following dedicated folders:
    *   **PDFs**: `PDFs/` (e.g., `PDFs/Apple.pdf`)
    *   **LaTeX Source**: `Tex_Files/` (e.g., `Tex_Files/Apple.tex`)
    *   **Cover Letters**: `Cover_Letters/` (e.g., `Cover_Letters/Apple_Cover_Letter.txt`)
    *   **Helper Files**: `Build_Logs/` (e.g., `Build_Logs/Apple.aux`, `Build_Logs/Apple.log`)
16. **API Output Formatting**: ABSOLUTELY NO STRAY TEXT OR NOTES. Do not output conversational filler like "Here is your resume", "Hope this helps!", or summary notes. Output strictly the filename on line 1 derived from the company name (e.g., "FILENAME: Apple"). 
17. **Raw Code Emulation**: DO NOT wrap the LaTeX code in markdown format blocks (e.g., no ` ```latex...``` `). Output exactly raw text so the automation backend can natively pipe it into pdflatex.

### NEW ATS OPTIMIZATION GUARDRAILS & INSTRUCTIONS
18. **Maximize ATS Matching**: Aggressively incorporate JD terminology while preserving factual accuracy. Analyze the JD and extract ALL technical skills mentioned (Languages, Frameworks, Cloud Tools, Concepts, Libraries).
19. **Aggressive Addition & Ordering (Skills)**: Add every extracted technical skill to the relevant category in the skills section. Move the specific skills found in the JD to the very front of their respective lists in the LaTeX code (e.g., if JD requires "Docker", change `{AWS, Jenkins, Docker}` to `{Docker, AWS, Jenkins}`).
20. **Constraint (Soft/Basic Skills)**: Do NOT add soft skills (e.g., "Communication", "Leadership") to the technical skills list. IGNORE non-technical requirements (e.g., "Driver's License," "Travel," "Citizenship"). IGNORE extremely basic skills (e.g., "Microsoft Word," "Email"). ONLY add technical skills!
21. **Verb Matching**: Scan the JD for specific action verbs (e.g., "Architected," "Engineered," "Deployed," "Orchestrated," "Refactored"). Replace generic verbs in the experience bullet points (e.g., "Worked on", "Built", "Used") with the specific high-impact verbs found in the JD, provided the context fits perfectly.
22. **Keyword & Adjective Injection**: If the JD emphasizes specific adjectives (e.g., "Scalable," "High-Availability," "Fault-Tolerant," "Secure", "Real-time"), insert these adjectives into existing bullet points where factually appropriate.
23. **Metric Preservation**: NEVER alter or remove numbers, percentages, or latency figures (e.g., "20%", "40 minutes", "sub-50ms"). These are immutable facts that must be 100% preserved!
24. **Truthfulness Constraint (STRICT)**: 
    - DO NOT invent new bullet points or projects. You are only allowed to rephrase existing content!
    - DO NOT change the core technology of a project unless it is a direct synonym (e.g., changing "React.js" to "React" is okay; changing "React" to "Angular" is FORBIDDEN).
    - DO NOT upgrade titles artificially (e.g., do not change "Software Engineer" to "Senior Architect" just because the JD uses that term).
25. **LaTeX Integrity Constraint (STRICT)**:
    - DO NOT touch the document preamble, `\documentclass`, or any `\usepackage` commands.
    - ENSURE every opening bracket `{` has a corresponding closing bracket `}`.
    - ESCAPE special characters mathematically if the JD contains them (e.g., change `C#` to `C\#` or `C++` to `C\+\+` if inside a specific command that requires it).
