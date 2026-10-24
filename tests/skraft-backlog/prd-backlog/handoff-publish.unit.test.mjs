// The handoff a human reviews and the publisher that executes it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { holdBackDependents, isReviewed, planOperations, planProblems, renderHandoffFiles } from '../../../plugins/skraft-backlog/prd-backlog/handoff.mjs'
import { createGitHub, publish } from '../../../plugins/skraft-backlog/prd-backlog/publish.mjs'
import { fakeGitHub } from './fake-github.mjs'
import { storyFile, storyMap } from './fixtures/backlog-data.mjs'

const backlogOf = ({ notReady = new Map() } = {}) => {
  const map = storyMap()
  const stories = map.epics.flatMap((e) => e.stories.map((s) => ({ ...s, epic: e.id })))
  const held = holdBackDependents(map, notReady)
  return {
    slug: 'eligibilite', prd: 'docs/prd/eligibilite.md', repo: 'acme/permis', language: /** @type {const} */ ('fr'),
    prdUrl: 'https://github.com/acme/permis/blob/main/docs/prd/eligibilite.md', map,
    files: new Map(stories.map((s) => [s.id, storyFile(s)])),
    ready: new Set(stories.map((s) => s.id).filter((id) => !held.has(id))), notReady: held,
  }
}

test('the plan creates epics, then stories in build order, then links once both ends exist', () => {
  const plan = planOperations(backlogOf())
  assert.deepEqual(plan.issues.map((i) => `${i.ref} ${i.id}`), ['IS001 EP-001', 'IS002 EP-002', 'IS003 EP-001-S01', 'IS004 EP-001-S02', 'IS005 EP-001-S03', 'IS006 EP-002-S01'])
  assert.deepEqual(plan.links.map((l) => `${l.type} ${l.from} ${l.to}`), [
    'sub-issue EP-001 EP-001-S01', 'sub-issue EP-001 EP-001-S02', 'blocked-by EP-001-S02 EP-001-S01',
    'sub-issue EP-001 EP-001-S03', 'blocked-by EP-001-S03 EP-001-S01', 'sub-issue EP-002 EP-002-S01', 'blocked-by EP-002-S01 EP-001-S01',
  ])
  const story = plan.issues.find((i) => i.id === 'EP-002-S01')
  assert.match(story.body, /- Parent: \{\{TEMP-2\}\}/)
  assert.match(story.body, /- Bloquée par: \{\{TEMP-3\}\} \(EP-001-S01\)/)
  assert.deepEqual(plan.milestones.map((m) => m.id), ['M1', 'M2'])
  assert.deepEqual(planProblems(plan), [])
})

test('a held-back story holds back every story that waits on it, directly or not', () => {
  const backlog = backlogOf({ notReady: new Map([['EP-001-S01', ['the review refused it']]]) })
  assert.deepEqual([...backlog.notReady.keys()].sort(), ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01'])
  assert.deepEqual(planOperations(backlog).issues, [])
})

test('a body that would leak a local path is a plan problem', () => {
  const backlog = backlogOf()
  backlog.files.get('EP-001-S02').technicalNotes = ['see .copilot-tracking/skraft-plans/x']
  assert.deepEqual(planProblems(planOperations(backlog)), ['EP-001-S02: the body carries a local .copilot-tracking path'])
})

test('the handoff ends on an unchecked review box that only a checked box satisfies', () => {
  const files = renderHandoffFiles(planOperations(backlogOf()), backlogOf(), { now: '2026-10-19T12:00:00Z' })
  assert.deepEqual(Object.keys(files).sort(), ['artifact-analysis.md', 'handoff.md', 'issues-plan.md', 'planning-log.md'])
  for (const text of Object.values(files)) assert.ok(text.startsWith('<!-- markdownlint-disable-file -->\n<!-- markdown-table-prettify-ignore-start -->'))
  assert.equal(isReviewed(files['handoff.md']), false)
  assert.equal(isReviewed(files['handoff.md'].replace('> - [ ] Reviewed', '> - [x] Reviewed')), true)
  assert.equal(isReviewed('- [x] Reviewed by the bot'), false)
  assert.match(files['issues-plan.md'], /\* IS006 - blocked_by: \{\{TEMP-3\}\}/)
})

test('publishing resolves each {{TEMP-N}} to the issue number and links by issue id', async () => {
  const github = fakeGitHub()
  const report = await publish({ plan: planOperations(backlogOf()), repo: 'acme/permis', github: createGitHub(github.run) })
  assert.equal(report.failed, 0)
  assert.equal(report.mapping['{{TEMP-1}}'], '#101')
  const story = github.state.issues.find((i) => i.title.endsWith('Déposer son permis'))
  assert.match(story.body, /- Parent: #102/)
  assert.match(story.body, /- Bloquée par: #103 \(EP-001-S01\)/)
  const subIssue = github.calls.find((c) => c.args.includes('repos/acme/permis/issues/101/sub_issues'))
  assert.deepEqual(JSON.parse(subIssue.input), { sub_issue_id: 9103 })
})

test('a link GitHub already holds is the state asked for; a failing create is reported, not thrown', async () => {
  const github = fakeGitHub()
  const plan = planOperations(backlogOf())
  await publish({ plan, repo: 'acme/permis', github: createGitHub(github.run) })
  const again = await publish({ plan, repo: 'acme/permis', github: createGitHub(github.run) })
  assert.equal(again.failed, 0)
  assert.ok(again.operations.filter((o) => o.ref.startsWith('IS00') && Number(o.ref.slice(2)) <= 6).every((o) => o.status === 'existing'))
  const broken = fakeGitHub({ failing: /^POST repos\/acme\/permis\/issues$/ })
  const report = await publish({ plan, repo: 'acme/permis', github: createGitHub(broken.run) })
  assert.equal(report.failed, 2, 'the two epics are refused by GitHub')
  assert.equal(report.skipped, 11, 'their stories name a {{TEMP-N}} that never resolved, and no link has both ends')
  assert.match(report.operations.find((o) => o.ref === 'IS003').detail, /a \{\{TEMP-N\}\} could not be resolved/)
})

test('a body that would leak a local path never reaches GitHub, even from a plan nobody checked', async () => {
  const backlog = backlogOf()
  backlog.files.get('EP-002-S01').technicalNotes = ['see .copilot-tracking/skraft-plans/x']
  const github = fakeGitHub()
  const report = await publish({ plan: planOperations(backlog), repo: 'acme/permis', github: createGitHub(github.run) })
  assert.match(report.operations.find((o) => o.ref === 'IS006').detail, /the body carries a local \.copilot-tracking path/)
  assert.ok(!github.state.issues.some((i) => i.body.includes('.copilot-tracking')))
})

test('an issue carrying our marker in another repository stops the publication', async () => {
  const github = fakeGitHub({ issues: [{ number: 7, id: 7007, title: 'x', body: '<!-- skraft-backlog:item=EP-001 -->', labels: ['skraft-backlog'], repository_url: 'https://api.github.com/repos/evil/permis' }] })
  await assert.rejects(publish({ plan: planOperations(backlogOf()), repo: 'acme/permis', github: createGitHub(github.run) }), /destination binding: EP-001 is #7 of another repository/)
})
