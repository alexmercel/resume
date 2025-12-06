---
trigger: always_on
---

# Resume Generation Instructions

Follow these rules strictly whenever generating a new resume:

1.  **Regeneration Policy**: Do NOT regenerate `template1.tex` or any existing resume with updated data unless explicitly asked to do so.
2.  **Coursework**: Include *only* coursework relevant to the specific job description or resume type (e.g., Hardware vs. Software).
3.  **Skills Selection**: Pick top skills relevant to the role. Do not include the exhaustive list from the pool.
4.  **Page Limit**: Resumes must be **strictly limited to 1 page** unless the user explicitly asks for more.
5.  **Project/Experience Selection**:
    *   Pick only relevant projects and work experience.
    *   Decide the quantity based on relevance to the role.
    *   Include only the top few relevant items; do not list everything.
6.  **Additional Sections**:
    *   Include **Certifications & Awards** if relevant and space permits.
    *   Include **Research** if relevant to the role and space permits.
7.  **Content Integrity**: **CRITICAL**: Do NOT change the text content of Projects, Work Experience, Research, Certifications, or Extracurriculars. Use the text exactly as it appears in the source Markdown files.
8.  **Maximize Space**: Always complete the 1 page limit. If there is space left, fill it with more skills, projects, certifications, awards, research, extracurriculars, etc. Never leave any space blank.
9.  **Template Precision**: Always make sure to use the latest version of the resume template.
10. **Skill Suggestions**: Suggest a few skills which are not from my data but are asked for in the job description, which would be good to have for the company and somewhat relate to my skills. Present these as a prompt to the user, and ONLY if confirmed, add them.
11. **PDF Generation**: Whenever asked to generate a new resume, always also create the PDF file.
12. **Template Integrity**: The template file must be strictly a wireframe containing NO personal data. Always populate ALL content (Education, Experience, Projects, Skills, etc.) fresh from the `Data/` directory for every generation.
13. **File Naming**: Name the generated PDF and source .tex file using the Company Name (e.g., `Apple.pdf`) if a company is specified. If no company is specified, use a descriptive name based on the role or type (e.g., `Hardware.pdf`).
14. **File Modifications**: Only modify files in the current workspace.
