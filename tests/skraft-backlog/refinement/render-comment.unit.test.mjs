import { test } from 'node:test'
import assert from 'node:assert/strict'

import { checkProposal } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/check-proposal.mjs'
import { detectLanguage } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/labels.mjs'
import { issueHash, parseMarker } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/refine-marker.mjs'
import { main, renderComment } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/render-comment.mjs'
import { VERSION } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/version.mjs'
import { frenchIssue, proposal } from './proposal-fixture.mjs'

const checked = (mutate = () => {}) => {
  const input = proposal()
  mutate(input)
  const { problems, proposal: result } = checkProposal(input)
  assert.deepEqual(problems, [])
  return result
}

test('the comment ends with the visible marker of the issue text and the shipped version', () => {
  const comment = renderComment(checked(), { issue: frenchIssue })
  const lines = comment.trimEnd().split('\n')
  assert.deepEqual(parseMarker(lines.at(-1)), { version: VERSION, hash: issueHash(frenchIssue.title, frenchIssue.body) })
  assert.doesNotMatch(comment, /<!--/)
})

test('a criterion title that is not a string still renders', () => {
  const comment = renderComment(checked((p) => { p.acceptanceCriteria[0].title = 42 }), { issue: frenchIssue })
  assert.match(comment, /\*\*AC1\*\* — 42/)
})

test('a French issue gets French headings, French Gherkin keywords and French typography', () => {
  const comment = renderComment(checked(), { issue: frenchIssue })
  assert.match(comment, /^## 🛠️ Proposition de refinement — à retravailler$/m)
  assert.match(comment, /\*\*Taille\*\* : 5 points, ≈ 1,5 jour d'équipe \(calcul de capacité, pas une prévision\)/)
  assert.match(comment, /\*\*Definition of Ready\*\* : 4\/8/)
  assert.match(comment, /- \*\*Étant donné\*\* Léa, 22 ans/)
  assert.match(comment, /- \*\*Alors\*\* elle est refusée avec le motif « permis suspendu »/)
  assert.match(comment, /_Persona déduit de l'issue — à confirmer\._/)
})

test('what blocks readiness comes first: failing DoR items, then the current criteria defects', () => {
  const comment = renderComment(checked(), { issue: frenchIssue })
  const blocking = comment.indexOf('### Ce qui l\'empêche d\'être prête')
  const defects = comment.indexOf('### Problèmes des critères d\'acceptation actuels')
  const story = comment.indexOf('### Story proposée')
  assert.ok(blocking > 0 && blocking < defects && defects < story)
  assert.match(comment, /- ❌ Definition of Ready 3 — 3 exemples métier ou plus : Aucun exemple/)
  assert.match(comment, /- \*\*« la vérification est rapide »\*\* — vague : Aucun seuil/)
  assert.match(comment, /- \*\*« le serveur renvoie 422 quand le permis est invalide »\*\* — technique, pas métier :/)
})

test('a used document is reviewed against, a candidate is only offered for confirmation', () => {
  const comment = renderComment(checked(), { issue: frenchIssue })
  assert.match(comment, /- Revue faite contre : `docs\/prd\/eligibilite\.md` \(PRD\)/)
  assert.match(comment, /- À confirmer — non utilisé : `docs\/brd\/tarifs-conducteurs\.md` \(BRD\) — mots communs : conducteurs → ajoutez son lien dans l'issue, puis commentez `\/skraft-refine`/)
  assert.match(comment, /\*\*Écarts avec le document\*\*\n\n- Le PRD limite/)
})

test('with no document the comment says none was found under docs/', () => {
  const comment = renderComment(checked((p) => { p.docs = { searched: 'docs', used: [], candidates: [], missing: ['docs/prd/old.md'] } }), { issue: frenchIssue })
  assert.match(comment, /- Aucun PRD ni BRD trouvé sous `docs\/`\./)
  assert.match(comment, /- Lien introuvable : `docs\/prd\/old\.md`/)
})

test('an English issue gets English headings and colons; a ready one says so', () => {
  const issue = { title: 'Check the eligibility of young drivers', body: 'As a driver I want to know if I am eligible before I pay, and the check should be fast.' }
  const comment = renderComment(checked((p) => {
    delete p.language
    p.dor = p.dor.map((item) => ({ item: item.item, pass: true }))
  }), { issue })
  assert.match(comment, /^## ✅ Refinement proposal — ready for design$/m)
  assert.match(comment, /\*\*Size\*\*: 5 points, ≈ 1\.5 team-days/)
  assert.match(comment, /- \*\*Given\*\* /)
  assert.doesNotMatch(comment, /What keeps it from being ready/)
})

test('a size above 8 shows the split instead of capacity days', () => {
  const comment = renderComment(checked((p) => {
    p.size = { points: 13, justification: 'Deux parcours.', split: [{ title: 'Éligibilité', points: 5 }, { title: 'Surprime', points: 8 }] }
    p.dor = p.dor.map((item) => (item.item === 6 ? { item: 6, pass: false, note: 'Trop gros.' } : item))
  }), { issue: frenchIssue })
  assert.match(comment, /\*\*Taille\*\* : 13 points — à découper avant de l'estimer/)
  assert.match(comment, /### Découpage proposé\n\n- Éligibilité — 5 points\n- Surprime — 8 points/)
})

test('a review that did not approve lists its unresolved findings', () => {
  const comment = renderComment(checked((p) => { p.review = { verdict: 'NEEDS_REWORK', attempts: 2, unresolved: ['G4 42: AC3 has two readings'] } }), { issue: frenchIssue })
  assert.match(comment, /Verdict de la revue par lentilles : \*\*NEEDS_REWORK\*\* après 2 tentatives\./)
  assert.match(comment, /- G4 42: AC3 has two readings/)
})

test('pipes in table cells are escaped so the DoR table keeps its columns', () => {
  const comment = renderComment(checked((p) => { p.dor[1].note = 'a | b' }), { issue: frenchIssue })
  assert.match(comment, /\| 2 \| Persona précis \| ❌ \| a \\\| b \|/)
})

test('language detection reads the function words of the issue', () => {
  assert.equal(detectLanguage(`${frenchIssue.title}\n${frenchIssue.body}`), 'fr')
  assert.equal(detectLanguage('As a driver I want the check to be fast and the result to be clear'), 'en')
  assert.equal(detectLanguage('Como conductor quiero que el precio sea claro y que la póliza sea para mí'), 'es')
  assert.equal(detectLanguage('42'), null)
  assert.equal(detectLanguage(''), null)
})

test('a language without its own headings falls back to English headings, keeping its Gherkin keywords', () => {
  const comment = renderComment(checked((p) => { p.language = 'es' }), { issue: frenchIssue })
  assert.match(comment, /Refinement proposal/)
  assert.match(comment, /- \*\*Dado\*\* /)
})

test('main refuses an invalid proposal and writes a valid one', () => {
  const logs = []
  const written = {}
  const files = { 'p.json': JSON.stringify(proposal()), 'i.json': JSON.stringify(frenchIssue), 'bad.json': '{}' }
  const io = { read: (path) => files[path], write: (path, content) => { written[path] = content }, log: (line) => logs.push(line) }
  assert.equal(main(['--proposal', 'bad.json', '--out', 'c.md'], io), 2)
  assert.equal(main(['--proposal', 'p.json'], io), 1)
  assert.equal(main(['--proposal', 'missing.json', '--out', 'c.md'], { ...io, read: () => { throw new Error('ENOENT') } }), 1)
  assert.equal(main(['--proposal', 'p.json', '--issue-file', 'i.json', '--out', 'c.md'], io), 0)
  assert.equal(parseMarker(written['c.md']).hash, issueHash(frenchIssue.title, frenchIssue.body))
  assert.equal(JSON.parse(logs.at(-1)).readiness, 'NEEDS_REFINEMENT')
  assert.equal(main(['--proposal', 'p.json', '--out', 'd.md'], io), 0)
  assert.equal(parseMarker(written['d.md']).hash, issueHash(frenchIssue.title, undefined))
})
