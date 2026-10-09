// The refinement flow as an agent runs it: the scripts from the skill folder, on files, in order.
// Once the rendered comment is on the issue, the next run of the marker check finds the work done.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decide } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/refine-marker.mjs'
import { VERSION } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/version.mjs'
import { frenchIssue, proposal } from './proposal-fixture.mjs'

const skill = fileURLToPath(new URL('../../../plugins/skraft-backlog/skills/refinement-proposal/', import.meta.url))
const node = (args, cwd) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })

test('resolve the documents, check the proposal, render the comment, then the issue counts as refined', () => {
  const repo = mkdtempSync(join(tmpdir(), 'skraft-refine-'))
  try {
    mkdirSync(join(repo, 'docs/prd'), { recursive: true })
    mkdirSync(join(repo, 'docs/brd'), { recursive: true })
    writeFileSync(join(repo, 'docs/prd/eligibilite.md'), '# Éligibilité des conducteurs\n')
    writeFileSync(join(repo, 'docs/brd/tarifs-conducteurs.md'), '# Tarifs des jeunes conducteurs\n')
    const work = join(repo, '.copilot-tracking/skraft-refine/42')
    mkdirSync(work, { recursive: true })
    writeFileSync(join(work, 'issue.json'), JSON.stringify(frenchIssue))

    // 1. Documents: the linked PRD is used, the related BRD only offered.
    const docs = node([join(skill, 'scripts/resolve-docs.mjs'), '--issue-file', join(work, 'issue.json'), '--root', repo], repo)
    assert.equal(docs.status, 0, docs.stderr)
    const resolved = JSON.parse(docs.stdout)
    assert.deepEqual(resolved.used.map((doc) => doc.path), ['docs/prd/eligibilite.md'])
    assert.deepEqual(resolved.candidates.map((doc) => doc.path), ['docs/brd/tarifs-conducteurs.md'])

    // 2. A proposal with a defect is refused with the list of problems.
    const draft = { ...proposal(), docs: { ...resolved, gaps: ['Le PRD limite l\'historique de sinistres à 3 ans.'] } }
    writeFileSync(join(work, 'proposal.json'), JSON.stringify({ ...draft, examples: draft.examples.slice(0, 2) }))
    const refused = node([join(skill, 'scripts/check-proposal.mjs'), '--proposal', join(work, 'proposal.json')], repo)
    assert.equal(refused.status, 2)
    assert.match(refused.stdout, /at least 3 domain examples/)

    // 3. The fixed proposal passes and renders.
    writeFileSync(join(work, 'proposal.json'), JSON.stringify(draft))
    assert.equal(node([join(skill, 'scripts/check-proposal.mjs'), '--proposal', join(work, 'proposal.json')], repo).status, 0)
    const rendered = node([join(skill, 'scripts/render-comment.mjs'), '--proposal', join(work, 'proposal.json'), '--issue-file', join(work, 'issue.json'), '--out', join(work, 'comment.md')], repo)
    assert.equal(rendered.status, 0, rendered.stdout)
    const comment = readFileSync(join(work, 'comment.md'), 'utf8')
    assert.match(comment, /^## 🛠️ Proposition de refinement — à retravailler/)
    assert.match(comment, /\n<sub>skraft-refine v=\S+ hash=[0-9a-f]{16}<\/sub>\n$/)
    assert.doesNotMatch(comment, /<!--/, 'gh-aw strips HTML comments from what it posts: the marker must not be one')

    // 4. Posted by a member, the comment makes the next run skip; an edit to the issue does not.
    const posted = [{ id: 1, body: comment, author_association: 'MEMBER', user: { type: 'User' } }]
    assert.equal(decide({ issue: frenchIssue, comments: posted, version: VERSION }).todo, false)
    assert.equal(decide({ issue: { ...frenchIssue, body: `${frenchIssue.body}\nSeuil : 2 secondes.` }, comments: posted, version: VERSION }).todo, true)

    // 5. The hash subcommand agrees with the marker, so a person can check it by hand.
    writeFileSync(join(work, 'body.txt'), frenchIssue.body)
    const hash = execFileSync(process.execPath, [join(skill, 'scripts/refine-marker.mjs'), 'hash', '--title', frenchIssue.title, '--body-file', join(work, 'body.txt')], { encoding: 'utf8' }).trim()
    assert.ok(comment.endsWith(`<sub>skraft-refine v=${VERSION} hash=${hash}</sub>\n`))
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
