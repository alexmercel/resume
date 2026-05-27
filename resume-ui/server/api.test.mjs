import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUserTemplateDocumentKey,
  calculateMatchedKeywords,
  documentHasMeaningfulContent,
  extractTechnicalKeywordsFromTextForTesting,
  extractApplicationInfoFromJd,
  filterTechnicalKeywordsForTesting,
  normalizeTemplateType,
  parseUserTemplateDocumentKey
} from './api.js';

test('documentHasMeaningfulContent treats seeded placeholders as empty', () => {
  assert.equal(documentHasMeaningfulContent('profile.md', ''), false);
  assert.equal(
    documentHasMeaningfulContent(
      'profile.md',
      '# Personal Profile\n\n- **Name:** \n- **Location:** \n- **Phone:** \n- **Email:** \n- **LinkedIn:** \n- **GitHub:** \n- **Portfolio:** \n'
    ),
    false
  );
  assert.equal(documentHasMeaningfulContent('projects.md', '# Projects\n'), false);
  assert.equal(documentHasMeaningfulContent('research.md', '# Research\n'), false);
  assert.equal(documentHasMeaningfulContent('certification.md', '# Certifications & Awards\n'), false);
  assert.equal(documentHasMeaningfulContent('extracurricular.md', '# Extracurricular & Workshops\n'), false);
});

test('documentHasMeaningfulContent recognizes user-entered content', () => {
  assert.equal(
    documentHasMeaningfulContent(
      'workex.md',
      '# Experience\n\n## OpenAI | San Francisco, CA\n**Software Engineer**\n*2024 -- Present*\n- Shipped production features.\n'
    ),
    true
  );
  assert.equal(
    documentHasMeaningfulContent(
      'research.md',
      '# Research\n\n## Distributed Systems Lab\n*2025*\n- Published benchmarking results for resilient service orchestration.\n'
    ),
    true
  );
});

test('normalizeTemplateType defaults to shared wireframes unless generic is requested', () => {
  assert.equal(normalizeTemplateType('wireframes'), 'wireframes');
  assert.equal(normalizeTemplateType('generic'), 'generic');
  assert.equal(normalizeTemplateType('anything-else'), 'wireframes');
  assert.equal(normalizeTemplateType(''), 'wireframes');
});

test('extractApplicationInfoFromJd pulls company and role from a job description', () => {
  assert.deepEqual(
    extractApplicationInfoFromJd(
      'OpenAI is hiring a Senior Backend Engineer to join OpenAI in San Francisco.'
    ),
    {
      company: 'OpenAI',
      role: 'Senior Backend Engineer'
    }
  );
});

test('extractApplicationInfoFromJd falls back cleanly when explicit fields are absent', () => {
  assert.deepEqual(
    extractApplicationInfoFromJd(
      'Build distributed systems for high-scale AI products.',
      'Generated_Resume',
      'template1'
    ),
    {
      company: 'Generated Resume',
      role: 'template1'
    }
  );
});

test('template document keys are namespaced and reversible', () => {
  const key = buildUserTemplateDocumentKey('wireframes', 'template1.tex');
  assert.equal(key, 'template:wireframes:template1.tex');
  assert.deepEqual(parseUserTemplateDocumentKey(key), {
    type: 'wireframes',
    fileName: 'template1.tex'
  });
});

test('non-template document keys are ignored by template parser', () => {
  assert.equal(parseUserTemplateDocumentKey('projects.md'), null);
  assert.equal(parseUserTemplateDocumentKey('template:other:file.tex'), null);
});

test('technical keyword filtering removes generic words and preserves real technologies', () => {
  assert.deepEqual(
    filterTechnicalKeywordsForTesting([
      'Python',
      'fast-paced environment',
      'Docker',
      'problem solving',
      'Distributed Systems',
      'stakeholder management',
      'GitHub Actions'
    ]),
    ['Python', 'Docker', 'Distributed Systems', 'GitHub Actions']
  );
});

test('technical keyword extraction harvests technologies and architecture concepts from a JD', () => {
  const extracted = extractTechnicalKeywordsFromTextForTesting(
    'Build distributed systems in Python and C++ using PostgreSQL, Docker, GitHub Actions, ETL workflows, Tableau dashboards, REST APIs, and RAG-powered LLM applications.'
  );

  assert.deepEqual(
    extracted,
    [
      'Python',
      'C++',
      'PostgreSQL',
      'Tableau',
      'LLMs',
      'RAG',
      'ETL',
      'REST APIs',
      'Distributed Systems',
      'Docker',
      'GitHub Actions'
    ]
  );
});

test('matched keyword scoring respects aliases and ignores unrelated generic phrases', () => {
  const matched = calculateMatchedKeywords(
    ['Postgres', 'GitHub Actions', 'ownership', 'RAG', 'Distributed Systems'],
    'Built Distributed Systems services in Python with PostgreSQL, GitHub Actions CI/CD, and Retrieval-Augmented Generation workflows.'
  );

  assert.deepEqual(matched, ['PostgreSQL', 'GitHub Actions', 'RAG', 'Distributed Systems']);
});
