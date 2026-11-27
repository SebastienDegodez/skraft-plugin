// skraft-prd-slicer: the GitHub Agentic Workflow that slices the PRD of an issue. Its script
// decides what an event asks, finds the PRD, reads the product owner's answers and renders the
// comments; the dynamic workflow does the slicing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LABEL, findPrd, gate, markerOf, parseAnswers, renderProposal, renderQuestions, slugOf, stepOf }
  from '../../../plugins/skraft-backlog/workflows/shared/skraft-prd-slicer.mjs'

const root = fileURLToPath(new URL('../../../plugins/skraft-backlog/', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')
const version = JSON.parse(read('plugin.json')).version
const workflow = read('workflows/skraft-prd-slicer.md')
const frontmatter = workflow.split('---\n')[1]
const labelled = { number: 7, state: 'open', labels: [{ name: LABEL }] }
const member = { author_association: 'MEMBER', user: { type: 'User' } }

test('the label starts the slicing; a team comment on the open labelled issue answers, `/skraft accept` accepts', () => {
  assert.deepEqual(gate({ eventName: 'issues', payload: { action: 'labeled', label: { name: LABEL }, issue: labelled } }), { run: true, issue: '7', action: 'start' })
  assert.deepEqual(gate({ eventName: 'issue_comment', payload: { issue: labelled, comment: { ...member, body: '1B 2A' } } }), { run: true, issue: '7', action: 'answer' })
  assert.deepEqual(gate({ eventName: 'issue_comment', payload: { issue: labelled, comment: { ...member, body: '/skraft accept' } } }), { run: true, issue: '7', action: 'accept' })
  assert.deepEqual(gate({ eventName: 'workflow_dispatch', issue: '9', action: 'answer' }), { run: true, issue: '9', action: 'answer' })
})

test('another label, an outsider, a bot, a closed or unlabelled issue, a pull request: nothing runs', () => {
  const refused = [
    gate({ eventName: 'issues', payload: { action: 'labeled', label: { name: 'bug' }, issue: labelled } }),
    gate({ eventName: 'issue_comment', payload: { issue: labelled, comment: { author_association: 'NONE', user: { type: 'User' }, body: '/skraft accept' } } }),
    gate({ eventName: 'issue_comment', payload: { issue: labelled, comment: { author_association: 'MEMBER', user: { type: 'Bot' }, body: 'x' } } }),
    gate({ eventName: 'issue_comment', payload: { issue: { ...labelled, state: 'closed' }, comment: { ...member, body: 'x' } } }),
    gate({ eventName: 'issue_comment', payload: { issue: { ...labelled, labels: [] }, comment: { ...member, body: 'x' } } }),
    gate({ eventName: 'issue_comment', payload: { issue: { ...labelled, pull_request: {} }, comment: { ...member, body: 'x' } } }),
  ]
  assert.ok(refused.every((r) => r.run === false))
})

test('answers in the short form, mixed with prose: each letter picks its option, the prose stays as context', () => {
  const questions = [
    { id: 'epics', options: ['Une seule', 'Par capacité'] },
    { id: 'milestones', options: ['MVP', 'Un seul', 'Par parcours'] },
  ]
  const { answers, prose } = parseAnswers('1B, Q2: c\nLe service documents doit rester à part.', questions)
  assert.deepEqual(answers, { epics: 'Par capacité', milestones: 'Par parcours' })
  assert.equal(prose, 'Le service documents doit rester à part.')
  assert.deepEqual(parseAnswers('3A et 1Z', questions).answers, {}, 'a question or an option that does not exist answers nothing')
})

test('the PRD: a file the issue names, else the only PRD, else the closest to confirm, else the issue body', () => {
  const files = [
    { path: 'docs/prd/eligibilite.md', text: '# Éligibilité au permis\n' },
    { path: 'docs/prd/justificatifs-prd.md', text: '---\nprd_id: "PRD-JUST"\n---\n# Justificatifs\n' },
    { path: 'README.md', text: '# Demo' },
  ]
  assert.deepEqual(findPrd({ title: 'x', body: 'Voir eligibilite.md', comments: [], files }), { path: 'docs/prd/eligibilite.md', confirm: [] })
  assert.deepEqual(findPrd({ title: 'x', body: 'PRD-JUST à découper', comments: [], files }), { path: 'docs/prd/justificatifs-prd.md', confirm: [] })
  assert.deepEqual(findPrd({ title: 'x', body: '', comments: [], files: files.slice(1) }), { path: 'docs/prd/justificatifs-prd.md', confirm: [] })
  const twoPrds = [{ path: 'docs/a-prd.md', text: '# Paiement en ligne' }, { path: 'docs/b-prd.md', text: '# Justificatifs du permis' }]
  assert.deepEqual(findPrd({ title: 'Découper les justificatifs du permis', body: '', comments: [], files: twoPrds }),
    { path: 'docs/b-prd.md', confirm: ['docs/b-prd.md', 'docs/a-prd.md'] })
  assert.deepEqual(findPrd({ title: 'x', body: 'FR-001: Le client commande.', comments: [], files: [] }), { body: 'FR-001: Le client commande.' })
  assert.equal(findPrd({ title: 'x', body: 'Rien ici', comments: [], files: [] }), null)
})

test('every question in one comment, options lettered, the recommendation marked; a proposal ends with how to accept', () => {
  const comment = renderQuestions([{ id: 'epics', question: 'Comment découper ?', why: 'Pourquoi.', options: ['Une seule', 'Par capacité'], recommended: 1 }], { language: 'fr' })
  assert.match(comment, /^### Questions avant le découpage[\s\S]*\*\*1\. Comment découper \?\*\*\n> Pourquoi\.\n- A\) Une seule\n- B\) Par capacité ★/)
  assert.ok(comment.endsWith(markerOf('questions')))
  const proposal = renderProposal({ epics: [{ id: 'EP-001', title: 'Éligibilité', outcome: 'décider', stories: [{ id: 'EP-001-S01', title: 'Recevoir la décision', effort: 2, milestone: 'v0.1', after: [] }] }],
    milestones: [{ title: 'v0.1' }], deferred: [{ id: 'FR-009', reason: 'plus tard' }], decisions: ['Une épic par capacité'] }, { language: 'fr' })
  assert.match(proposal, /\*\*EP-001 — Éligibilité\*\* : décider\n- EP-001-S01 Recevoir la décision \(2\) · v0\.1/)
  assert.match(proposal, /\*\*Décisions\*\*\n- Une épic par capacité/)
  assert.match(proposal, /Commentez `\/skraft accept`/)
  assert.equal(stepOf([{ body: proposal }, { body: 'merci' }]), 'proposal')
  assert.equal(slugOf(7), 'prd-issue-7')
})

test('the workflow: label and comment triggers, reaction, read-only agent, writes through safe outputs, skills pinned to this release', () => {
  for (const pattern of [/issues:\n\s+types: \[labeled\]/, /issue_comment:\n\s+types: \[created\]/, /reaction: eyes/, /^permissions:\n\s+contents: read\n\s+issues: read$/m]) {
    assert.match(frontmatter, pattern)
  }
  const packages = [...frontmatter.matchAll(/- SebastienDegodez\/skraft-plugin\/plugins\/skraft-backlog\/skills\/([\w-]+)#v(\S+)$/gm)]
  for (const needed of ['backlog-slicing', 'sprint-planning', 'issue-refinement', 'story-elaboration']) {
    assert.ok(packages.some(([, skill]) => skill === needed), needed)
  }
  for (const [, skill, pin] of packages) {
    assert.ok(existsSync(join(root, 'skills', skill, 'SKILL.md')), skill)
    assert.equal(pin, version)
  }
  assert.ok([...frontmatter.matchAll(/ref: v(\S+)/g)].every(([, pin]) => pin === version), 'the checked-out release is this one')
  assert.match(frontmatter, /jobs:\n\s+skraft-prd-slicer:[\s\S]*permissions:\n\s+contents: write\n\s+issues: write/)
  assert.doesNotMatch(frontmatter, /slash_command|label_command/)
  const manifest = read('aw.yml')
  assert.match(manifest, /- workflows\/skraft-prd-slicer\.md/)
  assert.match(manifest, /name: skraft:prd-slicer/)
})
