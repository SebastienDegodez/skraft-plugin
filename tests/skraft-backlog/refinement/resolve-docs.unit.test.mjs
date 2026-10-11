import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { documentKind, linkedPaths, listDocuments, main, resolveDocs, words } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/resolve-docs.mjs'

const docs = [
  { path: 'docs/prd/eligibility.md', head: '# Eligibility for young drivers' },
  { path: 'docs/brd/pricing-young-drivers.md', head: '# Pricing' },
  { path: 'docs/requirements/claims.md', head: '---\ntype: brd\n---\n# Claims handling' },
  { path: 'docs/adr/adr-001.md', head: '# Use PostgreSQL' },
]

test('a document is a PRD or a BRD by its path or its first lines', () => {
  assert.equal(documentKind('docs/prd/x.md'), 'PRD')
  assert.equal(documentKind('docs/product-requirements.md'), 'PRD')
  assert.equal(documentKind('docs/BRD-2026.md'), 'BRD')
  assert.equal(documentKind('docs/requirements/claims.md', '---\ntype: brd\n---'), 'BRD')
  assert.equal(documentKind('docs/spec.md', '# Product Requirements Document'), 'PRD')
  assert.equal(documentKind('docs/vision.md', '# Exigences métier de la souscription'), 'BRD')
  assert.equal(documentKind('docs/adr/adr-001.md', '# Use PostgreSQL'), null)
  assert.equal(documentKind('docs/improve/notes.md'), null)
})

test('the issue links a document by relative path or by GitHub blob URL', () => {
  const text = 'See docs/prd/eligibility.md and ./docs/brd/pricing-young-drivers.md, also https://github.com/a/b/blob/main/docs/requirements/claims.md#rules and (docs/missing.md)'
  assert.deepEqual(linkedPaths(text), ['docs/prd/eligibility.md', 'docs/brd/pricing-young-drivers.md', 'docs/requirements/claims.md', 'docs/missing.md'])
  assert.deepEqual(linkedPaths('mydocs/prd/x.md and docs/prd/x.txt'), [])
})

test('only a linked document is used; a missing link is reported', () => {
  const result = resolveDocs({ title: 'Young drivers', body: 'Rules: docs/prd/eligibility.md, docs/brd/gone.md' }, docs)
  assert.deepEqual(result.used, [{ path: 'docs/prd/eligibility.md', kind: 'PRD', via: 'linked from the issue' }])
  assert.deepEqual(result.missing, ['docs/brd/gone.md'])
  assert.equal(result.none, false)
})

test('an unlinked PRD or BRD that shares words with the title is a candidate, never used', () => {
  const result = resolveDocs({ title: 'Eligibility check for young drivers', body: 'no link' }, docs)
  assert.deepEqual(result.used, [])
  assert.deepEqual(result.candidates.map((doc) => doc.path), ['docs/prd/eligibility.md', 'docs/brd/pricing-young-drivers.md'])
  assert.deepEqual(result.candidates[0].matched, ['eligibility', 'young', 'drivers'])
})

test('a linked document is not listed again as a candidate, and an ADR is never a candidate', () => {
  const result = resolveDocs({ title: 'Young drivers PostgreSQL', body: 'docs/brd/pricing-young-drivers.md' }, docs)
  assert.ok(!result.candidates.some((doc) => doc.path === 'docs/brd/pricing-young-drivers.md'))
  assert.ok(!result.candidates.some((doc) => doc.path.includes('adr')))
})

test('nothing related means none, which the comment states', () => {
  assert.deepEqual(resolveDocs({ title: 'Dark mode', body: '' }, docs), { searched: 'docs', used: [], candidates: [], missing: [], none: true })
  assert.deepEqual(resolveDocs({ title: 'x' }, []).none, true)
})

test('title words drop short words, stopwords and accents', () => {
  assert.deepEqual(words('Vérifier l\'éligibilité des jeunes conducteurs pour la souscription'), ['verifier', 'eligibilite', 'jeunes', 'conducteurs', 'souscription'])
})

test('the CLI lists Markdown under the docs folder and prints the resolution', () => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-docs-'))
  try {
    mkdirSync(join(root, 'docs/prd'), { recursive: true })
    mkdirSync(join(root, 'docs/.hidden'), { recursive: true })
    writeFileSync(join(root, 'docs/prd/eligibility.md'), '# Eligibility')
    writeFileSync(join(root, 'docs/.hidden/prd-secret.md'), '# Secret')
    writeFileSync(join(root, 'docs/readme.txt'), 'not markdown')
    writeFileSync(join(root, 'issue.json'), JSON.stringify({ title: 'Eligibility', body: 'see docs/prd/eligibility.md' }))
    assert.deepEqual(listDocuments(root, 'docs').map((doc) => doc.path), ['docs/prd/eligibility.md'])
    assert.deepEqual(listDocuments(root, 'nowhere'), [])
    const logs = []
    assert.equal(main(['--issue-file', 'issue.json'], { cwd: root, log: (line) => logs.push(line), error: () => {} }), 0)
    assert.equal(JSON.parse(logs[0]).used[0].path, 'docs/prd/eligibility.md')
    assert.equal(main([], { cwd: root, error: () => {} }), 2)
    assert.equal(main(['--issue-file'], { cwd: root, error: () => {} }), 2)
    assert.equal(main(['--issue-file', 'absent.json'], { cwd: root, error: () => {} }), 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
