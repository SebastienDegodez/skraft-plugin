// Creating issues from the canvas: the reviewed stories asked for, closed on what they wait on,
// become a sub-plan of plan.json that the workflow's publisher runs — a dry run first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assessBacklog } from '../../../plugins/skraft-backlog/prd-backlog/canvas/assess.mjs'
import { reviewedStories, runSelection, selectionKey, selectionOf, subPlanOf } from '../../../plugins/skraft-backlog/prd-backlog/canvas/creation.mjs'
import { loadBacklog } from '../../../plugins/skraft-backlog/prd-backlog/canvas/store.mjs'
import { fakeGitHub } from '../prd-backlog/fake-github.mjs'
import { REPO, SLUG, makeWorkspace } from './workspace.mjs'

/** A story as the assessment gives it, reduced to what the selection reads. */
const story = (id, { epic = id.slice(0, 6), state = 'ready', review = 'reviewed', after = [], fingerprint = `sha-${id}` } = {}) => ({ id, epic, state, review, after, fingerprint })
const assessmentOf = (...stories) => ({ stories })

test('a selection closes on every story the stories asked for wait on, in build order', () => {
  const assessment = assessmentOf(
    story('EP-001-S01'), story('EP-001-S02', { after: ['EP-001-S01'] }), story('EP-001-S03', { after: ['EP-001-S02', 'EP-001-S01'] }),
    story('EP-002-S01', { after: ['EP-001-S01'] }),
  )
  assert.deepEqual(selectionOf(assessment, ['EP-002-S01', 'EP-001-S03']), {
    stories: ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01'], existing: [], epics: ['EP-001', 'EP-002'], missing: [],
  })
  assert.deepEqual(selectionOf(assessment, ['EP-001-S01', 'EP-001-S01']).stories, ['EP-001-S01'], 'a story asked twice is created once')
})

test('a published story the selection waits on is existing, not created again', () => {
  const assessment = assessmentOf(story('EP-001-S01', { state: 'published' }), story('EP-001-S03', { after: ['EP-001-S01'] }))
  assert.deepEqual(selectionOf(assessment, ['EP-001-S03']), { stories: ['EP-001-S03'], existing: ['EP-001-S01'], epics: ['EP-001'], missing: [] })
  assert.deepEqual(selectionOf(assessment, ['EP-001-S01']), { stories: [], existing: ['EP-001-S01'], epics: [], missing: [] })
})

test('a story that cannot be created is missing, with its reason and the story that needed it', () => {
  const assessment = assessmentOf(
    story('EP-001-S01', { state: 'held' }), story('EP-001-S02', { review: 'none', after: ['EP-001-S01'] }),
    story('EP-001-S03', { review: 'stale', after: ['EP-404-S01'] }), story('EP-002-S01', { after: ['EP-001-S02', 'EP-001-S03'] }),
  )
  const selection = selectionOf(assessment, ['EP-002-S01', 'EP-999-S01'])
  assert.deepEqual(selection.missing, [
    { id: 'EP-001-S02', reason: 'not-reviewed', via: 'EP-002-S01' },
    { id: 'EP-001-S03', reason: 'review-stale', via: 'EP-002-S01' },
    { id: 'EP-999-S01', reason: 'unknown', via: null },
  ])
  assert.deepEqual(selection.stories, ['EP-002-S01'])
  assert.deepEqual(selectionOf(assessment, ['EP-001-S01']).missing, [{ id: 'EP-001-S01', reason: 'not-ready', via: null }])
  for (const state of ['refused', 'written', 'unwritten']) {
    assert.deepEqual(selectionOf(assessmentOf(story('EP-001-S01', { state })), ['EP-001-S01']).missing, [{ id: 'EP-001-S01', reason: 'not-ready', via: null }], state)
  }
})

test('the reviewed stories are the ready ones a human reviewed, as their files read now', () => {
  const assessment = assessmentOf(story('A'), story('B', { review: 'stale' }), story('C', { review: 'none' }), story('D', { state: 'published' }), story('E', { state: 'held' }), story('F'))
  assert.deepEqual(reviewedStories(assessment), ['A', 'F'])
})

test('the key of a selection changes with the repository, a file of the selection, and what already exists', () => {
  const assessment = assessmentOf(story('EP-001-S01'), story('EP-001-S03', { after: ['EP-001-S01'] }), story('EP-002-S01'))
  const selection = selectionOf(assessment, ['EP-001-S03'])
  const key = selectionKey(assessment, selection, REPO)
  assert.equal(selectionKey(assessmentOf(story('EP-001-S01'), story('EP-001-S03', { after: ['EP-001-S01'] }), story('EP-002-S01', { fingerprint: 'other' })), selection, REPO), key, 'a story outside the selection does not count')
  assert.notEqual(selectionKey(assessment, selection, 'acme/other'), key)
  const edited = assessmentOf(story('EP-001-S01', { fingerprint: 'edited' }), story('EP-001-S03', { after: ['EP-001-S01'] }), story('EP-002-S01'))
  assert.notEqual(selectionKey(edited, selection, REPO), key)
  assert.notEqual(selectionKey(assessment, { ...selection, existing: ['EP-001-S01'] }, REPO), key)
  assert.deepEqual(JSON.parse(key), { repo: REPO, stories: [['EP-001-S01', 'sha-EP-001-S01'], ['EP-001-S03', 'sha-EP-001-S03']], existing: [] })
})

const PLAN = {
  labels: [{ name: 'skraft-backlog' }],
  milestones: [{ id: 'M1', title: 'v0.1' }, { id: 'M2', title: 'v0.2' }],
  issues: [
    { id: 'EP-001', kind: 'epic', milestone: null }, { id: 'EP-001-S01', kind: 'story', milestone: 'M1' },
    { id: 'EP-001-S03', kind: 'story', milestone: 'M1' }, { id: 'EP-002', kind: 'epic', milestone: null }, { id: 'EP-002-S01', kind: 'story', milestone: 'M2' },
  ],
  links: [
    { type: 'sub-issue', from: 'EP-001', to: 'EP-001-S01' }, { type: 'sub-issue', from: 'EP-001', to: 'EP-001-S03' },
    { type: 'blocked-by', from: 'EP-001-S03', to: 'EP-001-S01' }, { type: 'sub-issue', from: 'EP-002', to: 'EP-002-S01' },
    { type: 'blocked-by', from: 'EP-002-S01', to: 'EP-001-S01' },
  ],
  notReady: {},
}

test('the sub-plan holds the selection, its epics, what it waits on, and the links the selection makes', () => {
  const { plan, problems } = subPlanOf(PLAN, { stories: ['EP-001-S03'], existing: ['EP-001-S01'], epics: ['EP-001'], missing: [] })
  assert.deepEqual(problems, [])
  assert.deepEqual(plan.issues.map((i) => i.id), ['EP-001', 'EP-001-S01', 'EP-001-S03'])
  assert.deepEqual(plan.milestones.map((m) => m.id), ['M1'])
  assert.deepEqual(plan.links, [{ type: 'sub-issue', from: 'EP-001', to: 'EP-001-S03' }, { type: 'blocked-by', from: 'EP-001-S03', to: 'EP-001-S01' }], 'the existing story is not linked again to its epic')
  assert.equal(plan.labels, PLAN.labels)
  assert.deepEqual(plan.notReady, new Map())
})

test('a story of the selection that plan.json does not hold is a problem of the sub-plan', () => {
  const { plan, problems } = subPlanOf(PLAN, { stories: ['EP-001-S02', 'EP-002-S01'], existing: [], epics: ['EP-001', 'EP-002'], missing: [] })
  assert.deepEqual(problems, ["EP-001-S02 is not in plan.json: run the workflow's handoff again"])
  assert.deepEqual(plan.links, [{ type: 'sub-issue', from: 'EP-002', to: 'EP-002-S01' }], 'a link to an issue outside the sub-plan is dropped')
})

/** The workspace of the fixture, with the given stories marked reviewed as they read now. */
const workspace = async (t, { reviewed = ['EP-001-S01', 'EP-001-S03'], plan = true } = {}) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-creation-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await makeWorkspace(cwd, { plan })
  const { raw } = /** @type {any} */ (await loadBacklog(cwd, SLUG))
  raw.reviewed = Object.fromEntries(reviewed.map((id) => [id, { at: '2026-10-20T10:00:00Z', fingerprint: raw.fingerprints.get(id) }]))
  return { cwd, raw, assessment: assessBacklog(raw) }
}

test('the creation is refused without plan.json, without a repository, with a missing story, or with nothing to create', async (t) => {
  const github = fakeGitHub()
  const unplanned = await workspace(t, { plan: false })
  const run = (w, ids, repo = REPO) => runSelection({ raw: w.raw, assessment: w.assessment, ids, repo, gh: github.run, dryRun: true })
  assert.deepEqual(await run(unplanned, ['EP-001-S01']), { status: 'refused', reason: 'no plan.json yet: the workflow has not reached its handoff', selection: selectionOf(unplanned.assessment, ['EP-001-S01']) })
  const planned = await workspace(t, { reviewed: ['EP-001-S03'] })
  assert.equal((await run(planned, ['EP-001-S03'], null)).reason, 'no repository to publish to')
  const missing = await run(planned, ['EP-001-S03', 'EP-002-S01'])
  assert.equal(missing.reason, '2 story(ies) cannot be created')
  assert.deepEqual(missing.selection.missing, [{ id: 'EP-001-S01', reason: 'not-reviewed', via: 'EP-001-S03' }, { id: 'EP-002-S01', reason: 'not-ready', via: null }])
  assert.equal((await run(planned, [])).reason, 'nothing to create')
  assert.deepEqual(github.calls, [], 'a refusal reaches no GitHub API')
})

test('a selection plan.json does not hold is refused with the problem', async (t) => {
  const w = await workspace(t)
  w.raw.plan = { ...w.raw.plan, issues: w.raw.plan.issues.filter((i) => i.id !== 'EP-001-S01') }
  const github = fakeGitHub()
  const outcome = await runSelection({ raw: w.raw, assessment: w.assessment, ids: ['EP-001-S03'], repo: REPO, gh: github.run, dryRun: true })
  assert.deepEqual([outcome.status, outcome.reason], ['refused', "EP-001-S01 is not in plan.json: run the workflow's handoff again"])
  assert.deepEqual(github.calls, [])
})

test('a dry run simulates the creation of the selection and writes nothing', async (t) => {
  const w = await workspace(t)
  const github = fakeGitHub()
  const outcome = await runSelection({ raw: w.raw, assessment: w.assessment, ids: ['EP-001-S03'], repo: REPO, gh: github.run, dryRun: true })
  assert.equal(outcome.status, 'simulated')
  assert.deepEqual(outcome.selection, { stories: ['EP-001-S01', 'EP-001-S03'], existing: [], epics: ['EP-001'], missing: [] })
  assert.deepEqual(outcome.report.operations.map((o) => o.status), ['dry-run', 'dry-run', 'dry-run', 'dry-run', 'dry-run', 'dry-run'])
  assert.deepEqual(outcome.published, {})
  assert.equal(outcome.key, selectionKey(w.assessment, outcome.selection, REPO))
  assert.equal(github.state.issues.length, 0)
  assert.ok(!github.calls.some((c) => c.args.includes('POST')))
})

test('a creation makes the epic and the stories, links them, and names the issue each story became', async (t) => {
  const w = await workspace(t)
  const github = fakeGitHub()
  const outcome = await runSelection({ raw: w.raw, assessment: w.assessment, ids: ['EP-001-S03'], repo: REPO, gh: github.run, dryRun: false })
  assert.equal(outcome.status, 'published')
  assert.deepEqual(github.state.issues.map((i) => i.number), [101, 102, 103])
  assert.deepEqual(outcome.published, {
    'EP-001-S01': { number: 102, url: 'https://github.com/acme/permis/issues/102' },
    'EP-001-S03': { number: 103, url: 'https://github.com/acme/permis/issues/103' },
  })
  assert.deepEqual(github.state.subIssues, [{ parent: 101, child: 102 }, { parent: 101, child: 103 }])
  assert.deepEqual(github.state.blockedBy, [{ issue: 103, blocker: 102 }])
})

test('a creation GitHub refuses is blocked, and names no issue it did not get', async (t) => {
  const w = await workspace(t)
  const github = fakeGitHub({ failing: /^POST repos\/acme\/permis\/issues$/ })
  const outcome = await runSelection({ raw: w.raw, assessment: w.assessment, ids: ['EP-001-S01'], repo: REPO, gh: github.run, dryRun: false })
  assert.equal(outcome.status, 'blocked')
  assert.ok(outcome.report.failed > 0)
  assert.deepEqual(outcome.published, {})
  assert.equal(github.state.issues.length, 0)
})
