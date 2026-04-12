import test from 'node:test';
import assert from 'node:assert/strict';

import {
  documentHasMeaningfulContent,
  extractApplicationInfoFromJd,
  normalizeTemplateType
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
});

test('documentHasMeaningfulContent recognizes user-entered content', () => {
  assert.equal(
    documentHasMeaningfulContent(
      'workex.md',
      '# Experience\n\n## OpenAI | San Francisco, CA\n**Software Engineer**\n*2024 -- Present*\n- Shipped production features.\n'
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
