# Resume Builder & Portfolio
**Jai Jayesh Shah** | Master's Student in Computer Engineering @ USC

## About Me
I am a Computer Engineering graduate student at **USC**, specializing in **Computer Networks, Systems Architecture, and AI Agents**. With a background in Electronics and IoT from **VIT University**, I bridge the gap between hardware and software. I have professional experience as a **Backend Developer at Accenture** and currently serve as a TA/Course Producer at USC.

---

## Automated Resume Builder System
This repository hosts a custom-built, automated resume generation system designed to create tailored, 1-page resumes for specific job descriptions while maintaining strict content integrity and formatting standards.

### System Architecture

#### 1. Data Layer (`Data/`)
The single source of truth. All content is stored in modular Markdown files, decoupled from formatting:
- `education.md`: Degrees, GPAs, and Coursework.
- `projects.md`: Technical projects (Software, Hardware, Automation).
- `workex.md`: Professional experience (Accenture, USC, etc.).
- `skills.md`: Comprehensive skill list categorized by domain.
- `research.md` & `extracurricular.md`: Publications and leadership roles.

#### 2. Template Layer (`Templates/`)
LaTeX templates serve as **structural wireframes** only. They contain no hardcoded personal data.
- **Structure**: Defines layout, fonts, and section ordering.
- **Flexibility**: Different wireframes for Software (General) vs. Hardware roles.
- **Integrity**: Templates are never modified with data; new files are created for each generation.

#### 3. Generation Logic
The system follows a strict set of rules (`generation_rules.md`) to generate targeted resumes:
- **Targeted Generation**: Selects only the most relevant Skills, Projects, and Experience for a given Job Description (e.g., Apple Performance Engineer).
- **One-Page Constraint**: Dynamic content selection ensures the resume fills exactly one page without overcrowding.
- **Wireframe Injection**: Populates the selected wireframe with fresh data from the Data Layer.
- **Automated Compilation**: Generates the final PDF automatically.

### Workflow Example
1.  **Input**: "Generate a resume for a Backend Role at Google."
2.  **Selection**: System picks "Java, Python, Cloud" from `skills.md` and relevant Backend projects.
3.  **Construction**: Creates `Google.tex` using the software wireframe.
4.  **Output**: Compiles and saves `Google.pdf` in the `Generated/` directory.

---
*This approach ensures that every resume is hyper-customized, consistent, and generated in seconds.*
