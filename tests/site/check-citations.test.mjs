import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('fails when quote exceeds 25 words', async () => {
  const result = await checkCitations({
    citationsPath: 'tests/site/fixtures/citations.yml',
    pagesGlob: 'tests/site/fixtures/bad-page.md',
  });
  const lengthErrors = result.errors.filter(e => e.message.match(/exceeds 25 words/i));
  assert.ok(lengthErrors.length > 0, 'Should have at least one length error');
});
