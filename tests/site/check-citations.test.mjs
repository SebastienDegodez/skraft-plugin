import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { checkCitations } from '../../scripts/check-citations.mjs';

test('passes when all citations exist in bibliography', async () => {
  const result = await checkCitations({
    citationsPath: 'tests/site/fixtures/citations.yml',
    pagesGlob: 'tests/site/fixtures/good-page.md',
  });
  assert.equal(result.errors.length, 0);
});

test('fails when a quote references unknown author', async () => {
  const result = await checkCitations({
    citationsPath: 'tests/site/fixtures/citations.yml',
    pagesGlob: 'tests/site/fixtures/bad-page.md',
  });
  const unknownErrors = result.errors.filter(e => e.message.match(/unknown citation/i));
  assert.ok(unknownErrors.length > 0, 'Should have at least one unknown citation error');
});

test('a link to the citations page must name a key of the bibliography, in every page glob given', async () => {
  const result = await checkCitations({
    citationsPath: 'tests/site/fixtures/citations.yml',
    pagesGlob: [
      'tests/site/fixtures/cite-links/docs/**/*.md*',
      'tests/site/fixtures/cite-links/i18n/fr/docusaurus-plugin-content-docs/current/**/*.md*',
    ],
  });
  assert.deepEqual(result.errors, [{
    file: join('tests', 'site', 'fixtures', 'cite-links', 'i18n', 'fr', 'docusaurus-plugin-content-docs', 'current', 'explanation', 'page.mdx'),
    line: 9,
    message: 'Unknown citation key: martin-clean-architecture-2017',
  }]);
});

test('fails when quote exceeds 25 words', async () => {
  const result = await checkCitations({
    citationsPath: 'tests/site/fixtures/citations.yml',
    pagesGlob: 'tests/site/fixtures/bad-page.md',
  });
  const lengthErrors = result.errors.filter(e => e.message.match(/exceeds 25 words/i));
  assert.ok(lengthErrors.length > 0, 'Should have at least one length error');
});
