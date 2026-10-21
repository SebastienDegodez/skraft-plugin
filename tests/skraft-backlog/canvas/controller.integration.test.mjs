// The canvas controller: the actions the panel and the agent share, over the files of a real
// workspace and a fake GitHub. Reviewing and creating are the human's; creating needs a fresh dry
// run of the very same selection.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PREVIEW_TTL_MS, UserError, createController } from '../../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs'
import { backlogDir, handoffDir } from '../../../plugins/skraft-backlog/prd-backlog/canvas/store.mjs'
import { DICTIONARIES } from '../../../plugins/skraft-backlog/prd-backlog/canvas/ui/i18n.mjs'
import { fakeGitHub } from '../prd-backlog/fake-github.mjs'
import { storyMap } from '../prd-backlog/fixtures/backlog-data.mjs'
import { REPO, SLUG, makeWorkspace, writeJson } from './workspace.mjs'

const START = Date.parse('2026-10-20T10:00:00.000Z')

/** A controller over a fresh workspace, a fake GitHub and a clock the test moves. */
const setUp = async (t, { workspace = true, plan = true, github = fakeGitHub() } = {}) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-controller-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const ws = workspace ? await makeWorkspace(cwd, { plan }) : null
  const clock = { now: START }
  const controller = createController({ cwd, gh: github.run, now: () => new Date(clock.now), pollMs: 20 })
  t.after(() => controller.stop())
  await controller.reload()
  const changes = []
  controller.events.on('change', () => changes.push(controller.state.busy))
  const run = (name, input = {}) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
  return { cwd, dir: ws?.dir ?? backlogDir(cwd, SLUG), controller, github, clock, run, changes }
}

/** Expects the action to fail as a request the user can correct. */
const refuses = async (promise, message) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof UserError, `${error.name}: ${error.message}`)
    assert.equal(error.name, 'UserError')
    assert.match(error.message, message)
    return true
  })
}
const posts = (github) => github.calls.filter((c) => c.args.includes('POST'))

test('the controller declares what the agent may do: read, explain, focus and preview, never review or create', async (t) => {
  const { controller } = await setUp(t)
  assert.deepEqual(controller.actions.map((a) => [a.name, a.agent]), [
    ['get_state', true], ['open_backlog', true], ['focus_story', true], ['explain_story', true],
    ['set_repo', false], ['mark_reviewed', false], ['list_corrections', true], ['decide_correction', false], ['answer_question', false],
    ['get_correction_session', true], ['preview_creation', true], ['create_issues', false],
  ])
  for (const action of controller.actions) {
    assert.equal(action.inputSchema.type, 'object', action.name)
    assert.equal(action.inputSchema.additionalProperties, false, action.name)
    assert.ok(action.description.length > 20, action.name)
  }
  assert.equal(PREVIEW_TTL_MS, 15 * 60 * 1000)
})

test('get_state tells where every story stands, with the INVEST letters and DoR items that fail', async (t) => {
  const { run } = await setUp(t)
  const state = await run('get_state')
  assert.equal(state.slug, SLUG)
  assert.equal(state.repo, REPO)
  assert.deepEqual(state.coverage, { fr: 4, covered: 4, deferred: 0 })
  assert.deepEqual(state.mapProblems, [])
  assert.deepEqual(state.counts, { stories: 4, written: 4, refused: 1, held: 1, ready: 2, reviewed: 0, published: 0 })
  assert.deepEqual(state.stories.map((s) => [s.id, s.state, s.review, s.verdict, s.issue]), [
    ['EP-001-S01', 'ready', 'none', 'pass', null], ['EP-001-S02', 'refused', 'none', 'fail', null],
    ['EP-001-S03', 'ready', 'none', 'warn', null], ['EP-002-S01', 'held', 'none', 'fail', null],
  ])
  assert.deepEqual(state.stories[1].failing, ['N', 'V', 'T', 'DoR 2', 'DoR 3', 'DoR 4'])
  assert.deepEqual(state.stories[2].failing, [], 'a warning is not a failure')
  assert.deepEqual(state.stories[3].failing, ['T', 'DoR 7'])
  assert.equal(state.stories[0].title, "Recevoir la décision d'éligibilité")
})

test('without a backlog every reading action is a request to run the workflow first', async (t) => {
  const { run, controller } = await setUp(t, { workspace: false })
  assert.equal(controller.state.slug, null)
  await refuses(run('get_state'), /no backlog in this workspace: run the skraft-prd-backlog workflow first/)
  await refuses(run('focus_story', { id: 'EP-001-S01' }), /no backlog in this workspace/)
  await refuses(run('preview_creation'), /no backlog in this workspace/)
  assert.deepEqual(controller.snapshot(), { backlogs: [], slug: null, error: null, focus: null, busy: null, repo: null, assessment: null, preview: null, result: null })
})

test('a backlog whose map cannot be read is reported with the reason', async (t) => {
  const { run, dir, controller } = await setUp(t)
  await writeFile(join(dir, 'story-map.json'), '{ broken', 'utf8')
  assert.equal(await controller.poll(), true)
  assert.match(controller.state.error, /story-map\.json is missing or cannot be read/)
  await refuses(run('get_state'), /story-map\.json is missing or cannot be read/)
})

test('open_backlog shows another backlog of the workspace and forgets the focus, the dry run and the repository', async (t) => {
  const { run, cwd, controller } = await setUp(t)
  const other = storyMap()
  other.epics = other.epics.slice(1)
  await writeJson(join(backlogDir(cwd, 'autre-prd'), 'story-map.json'), other)
  await controller.poll()
  await run('focus_story', { id: 'EP-001-S01' })
  await run('set_repo', { repo: 'acme/other' })
  await refuses(run('open_backlog', { slug: 'absent-prd' }), /absent-prd is no backlog of this workspace/)
  await refuses(run('open_backlog', { slug: '../x' }), /is no backlog of this workspace/)
  const summary = await run('open_backlog', { slug: 'autre-prd' })
  assert.equal(summary.slug, 'autre-prd')
  assert.deepEqual(summary.stories.map((s) => [s.id, s.state]), [['EP-002-S01', 'unwritten']])
  assert.equal(summary.repo, null)
  assert.deepEqual([controller.state.focus, controller.state.preview, controller.state.repo], [null, null, null])
  assert.deepEqual(controller.snapshot().backlogs.sort(), ['autre-prd', SLUG].sort())
})

test('focus_story opens a known story; unknown or malformed ids are refused', async (t) => {
  const { run, controller, changes } = await setUp(t)
  assert.deepEqual(await run('focus_story', { id: 'EP-001-S03' }), { focus: 'EP-001-S03' })
  assert.equal(controller.snapshot().focus, 'EP-001-S03')
  assert.equal(changes.length, 1, 'the panel is told')
  await refuses(run('focus_story', { id: 'EP-404-S01' }), /unknown stories: EP-404-S01/)
  await refuses(run('focus_story', { id: 42 }), /ids must list story ids/)
  await refuses(run('mark_reviewed', { ids: [] }), /ids must list story ids/)
  await refuses(run('mark_reviewed', { ids: 'EP-001-S01' }), /ids must list story ids/)
})

test('a focused story that leaves the map is no longer focused', async (t) => {
  const { run, dir, controller } = await setUp(t)
  await run('focus_story', { id: 'EP-001-S03' })
  const map = storyMap()
  map.epics[0].stories.pop()
  await writeJson(join(dir, 'story-map.json'), map)
  await controller.poll()
  assert.equal(controller.state.focus, null)
})

test('explain_story tells, in the PRD language, each failing letter and item with what was found, why and how to fix it', async (t) => {
  const { run } = await setUp(t)
  const explained = await run('explain_story', { id: 'EP-001-S02' })
  assert.equal(explained.id, 'EP-001-S02')
  assert.equal(explained.state, DICTIONARIES.fr.states.refused)
  assert.equal(explained.review, DICTIONARIES.fr.reviews.none)
  assert.deepEqual(explained.invest.map((l) => l.line), ['N', 'V', 'T'])
  assert.deepEqual(explained.dor.map((l) => l.line), ['DoR 2', 'DoR 3', 'DoR 4'])
  const technical = explained.invest[0]
  assert.equal(technical.status, 'fail')
  assert.equal(technical.evidence[0].source, DICTIONARIES.fr.sources.check)
  assert.ok(technical.evidence[0].why.includes('HTTP 403'), technical.evidence[0].why)
  assert.deepEqual(explained.antipatterns, ['Vague Persona', 'No Examples', 'Technical AC'])
  await refuses(run('explain_story', { id: 'nope' }), /unknown stories: nope/)
})

test('set_repo takes owner/repo only, drops the dry run, and outlives the canvas in review.json', async (t) => {
  const { run, controller, cwd, dir } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01'] })
  await run('preview_creation')
  assert.ok(controller.state.preview)
  for (const repo of ['acme', 'https://github.com/acme/permis', 'acme/permis/x', 42]) await refuses(run('set_repo', { repo }), /repo must read owner\/repo/)
  assert.deepEqual(await run('set_repo', { repo: 'acme/permis-2' }), { repo: 'acme/permis-2' })
  assert.equal(controller.snapshot().repo, 'acme/permis-2')
  assert.equal(controller.state.preview, null)
  const review = JSON.parse(await readFile(join(dir, 'review.json'), 'utf8'))
  assert.equal(review.repo, 'acme/permis-2')
  assert.deepEqual(Object.keys(review.stories), ['EP-001-S01'], 'the reviews are kept')
  await run('mark_reviewed', { ids: ['EP-001-S01'], reviewed: false })
  assert.equal(JSON.parse(await readFile(join(dir, 'review.json'), 'utf8')).repo, 'acme/permis-2', 'a review change keeps the repository')
  const reopened = createController({ cwd, gh: fakeGitHub().run, now: () => new Date(START) })
  t.after(() => reopened.stop())
  await reopened.reload()
  assert.equal(reopened.snapshot().repo, 'acme/permis-2', 'a new canvas creates in the repository the human chose')
})

test('only ready stories can be marked reviewed; the mark records the file as read and can be withdrawn', async (t) => {
  const { run, dir, controller } = await setUp(t)
  await refuses(run('mark_reviewed', { ids: ['EP-001-S01', 'EP-001-S02', 'EP-002-S01'] }), /only ready stories can be reviewed: EP-001-S02 is refused, EP-002-S01 is held/)
  assert.equal(controller.state.busy, null, 'a refused review frees the controller')
  const marked = await run('mark_reviewed', { ids: ['EP-001-S01', 'EP-001-S03'] })
  assert.deepEqual(marked, { reviewed: ['EP-001-S01', 'EP-001-S03'], counts: { stories: 4, written: 4, refused: 1, held: 1, ready: 2, reviewed: 2, published: 0 } })
  const file = JSON.parse(await readFile(join(dir, 'review.json'), 'utf8'))
  assert.deepEqual(file.stories['EP-001-S01'], { at: '2026-10-20T10:00:00.000Z', fingerprint: controller.state.assessment.stories[0].fingerprint })
  assert.equal(await controller.poll(), false, 'the controller has already read what it wrote')
  await run('mark_reviewed', { ids: ['EP-001-S03'], reviewed: false })
  assert.deepEqual(controller.state.assessment.stories.map((s) => s.review), ['reviewed', 'none', 'none', 'none'])
  await run('mark_reviewed', { ids: ['EP-002-S01'], reviewed: false })
  assert.equal(controller.state.assessment.counts.reviewed, 1, 'withdrawing a review of a story that is not ready is allowed')
})

test('a story edited after its review reads stale', async (t) => {
  const { run, dir, controller } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01'] })
  const path = join(dir, 'stories', 'EP-001-S01.json')
  await writeFile(path, (await readFile(path, 'utf8')).replace('Afficher la décision', 'Afficher la décision motivée'), 'utf8')
  assert.equal(await controller.poll(), true)
  assert.equal(controller.state.assessment.stories[0].review, 'stale')
})

test('preview_creation dry-runs the reviewed stories by default and keeps its key from the agent and the panel', async (t) => {
  const { run, controller, github } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01', 'EP-001-S03'] })
  const preview = await run('preview_creation')
  assert.equal(preview.status, 'simulated')
  assert.equal(preview.key, undefined)
  assert.deepEqual(preview.selection.stories, ['EP-001-S01', 'EP-001-S03'])
  assert.equal(posts(github).length, 0)
  const snapshot = controller.snapshot()
  assert.equal(snapshot.preview.key, undefined)
  assert.deepEqual(snapshot.preview.ids, ['EP-001-S01', 'EP-001-S03'])
  assert.equal(snapshot.preview.at, START)
  assert.equal(snapshot.result, null)
  const asked = await run('preview_creation', { ids: ['EP-001-S02'] })
  assert.equal(asked.status, 'refused')
  assert.deepEqual(asked.selection.missing, [{ id: 'EP-001-S02', reason: 'not-ready', via: null }])
  await refuses(run('preview_creation', { ids: ['EP-404-S01'] }), /unknown stories/)
})

test('create_issues needs a successful dry run first', async (t) => {
  const { run, github } = await setUp(t)
  await refuses(run('create_issues'), /run a dry run of the selection first/)
  await run('preview_creation', { ids: ['EP-001-S01'] })
  await refuses(run('create_issues'), /run a dry run of the selection first/, 'a refused dry run does not count')
  assert.equal(posts(github).length, 0)
})

test('a dry run older than 15 minutes must be run again', async (t) => {
  const { run, clock, github } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01'] })
  await run('preview_creation')
  clock.now = START + PREVIEW_TTL_MS + 1
  await refuses(run('create_issues'), /the dry run is older than 15 minutes: run it again/)
  assert.equal(posts(github).length, 0)
})

test('a story file edited after the dry run refuses the creation before any GitHub write', async (t) => {
  const { run, cwd, dir, controller, github } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01', 'EP-001-S03'] })
  await run('preview_creation')
  const path = join(dir, 'stories', 'EP-001-S03.json')
  await writeFile(path, (await readFile(path, 'utf8')).replace('Afficher', 'Montrer'), 'utf8')
  const calls = github.calls.length
  await refuses(run('create_issues'), /the selection changed since the dry run: run it again/)
  assert.equal(github.calls.length, calls, 'nothing reached GitHub')
  assert.equal(controller.state.preview, null, 'the stale dry run is dropped')
  assert.ok(!(await readdir(handoffDir(cwd, SLUG))).some((name) => name.startsWith('handoff-logs-canvas-')))
  assert.deepEqual(await readdir(dir).then((names) => names.filter((name) => name === 'published.json')), [])
})

test('a selection the watcher saw change since the dry run is refused before any GitHub write', async (t) => {
  const { run, dir, controller, github } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01', 'EP-001-S03'] })
  await run('preview_creation')
  await writeJson(join(dir, 'published.json'), { version: 1, stories: { 'EP-001-S01': { number: 7, url: 'https://github.com/acme/permis/issues/7' } } })
  assert.equal(await controller.poll(), true)
  await refuses(run('create_issues'), /the selection changed since the dry run/)
  assert.equal(posts(github).length, 0)
})

test('create_issues creates the previewed selection, records the issues and writes the execution log', async (t) => {
  const { run, cwd, dir, controller, github, clock } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01', 'EP-001-S03'] })
  await run('preview_creation')
  clock.now = START + 60_000
  const result = await run('create_issues')
  assert.equal(result.status, 'published')
  assert.equal(result.key, undefined)
  assert.deepEqual(result.published, {
    'EP-001-S01': { number: 102, url: 'https://github.com/acme/permis/issues/102' },
    'EP-001-S03': { number: 103, url: 'https://github.com/acme/permis/issues/103' },
  })
  assert.deepEqual(github.state.issues.map((i) => i.title.replace(/^feat\(ep-001\): /, '')), ["Contrôle d'éligibilité", "Recevoir la décision d'éligibilité", 'Retrouver sa décision pendant 30 jours'])
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'published.json'), 'utf8')), { version: 1, stories: result.published })
  const logs = (await readdir(handoffDir(cwd, SLUG))).filter((name) => name.startsWith('handoff-logs-canvas-'))
  assert.deepEqual(logs, ['handoff-logs-canvas-2026-10-20T10-01-00-000Z.md'])
  const log = await readFile(join(handoffDir(cwd, SLUG), logs[0]), 'utf8')
  assert.match(log, /\* \*\*Confirmed destination\*\*: acme\/permis/)
  assert.match(log, /EP-001-S03 → #103/)
  assert.equal(controller.state.preview, null)
  assert.deepEqual(controller.snapshot().result.published, result.published)
  assert.deepEqual(controller.state.assessment.stories.map((s) => s.state), ['published', 'refused', 'published', 'held'])
  assert.equal(controller.state.assessment.counts.published, 2)
  await refuses(run('create_issues'), /run a dry run of the selection first/, 'a dry run serves one creation')
})

test('a creation GitHub refuses comes back blocked and records no issue', async (t) => {
  const { run, dir } = await setUp(t, { github: fakeGitHub({ failing: /^POST repos\/acme\/permis\/issues$/ }) })
  await run('mark_reviewed', { ids: ['EP-001-S01'] })
  await run('preview_creation')
  const result = await run('create_issues')
  assert.equal(result.status, 'blocked')
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'published.json'), 'utf8')).stories, {})
})

test('a creation the publisher refuses after the dry run is a request to correct', async (t) => {
  const { run, dir, github } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01'] })
  await run('preview_creation')
  const plan = JSON.parse(await readFile(join(dir, 'plan.json'), 'utf8'))
  await writeJson(join(dir, 'plan.json'), { ...plan, issues: plan.issues.filter((issue) => issue.id !== 'EP-001') })
  await refuses(run('create_issues'), /EP-001 is not in plan\.json: run the workflow's handoff again/)
  assert.equal(posts(github).length, 0)
})

test('one action runs at a time: a second one is refused while the first runs', async (t) => {
  const { run, controller, changes } = await setUp(t)
  await run('mark_reviewed', { ids: ['EP-001-S01'] })
  changes.length = 0
  const [preview, review] = await Promise.allSettled([run('preview_creation'), run('mark_reviewed', { ids: ['EP-001-S03'] })])
  assert.equal(preview.status, 'fulfilled')
  assert.equal(review.status, 'rejected')
  assert.equal(review.reason.name, 'UserError')
  assert.equal(review.reason.message, 'preview is running')
  assert.equal(controller.state.busy, null)
  assert.deepEqual(changes, ['preview', null], 'the panel sees the action start and end')
})

test('poll reloads and tells the panel only when a file changed', async (t) => {
  const { dir, controller, changes } = await setUp(t)
  assert.equal(await controller.poll(), false)
  assert.equal(changes.length, 0)
  await writeJson(join(dir, 'review.json'), { version: 1, stories: { 'EP-001-S01': { at: 'x', fingerprint: 'old' } } })
  assert.equal(await controller.poll(), true)
  assert.equal(changes.length, 1)
  assert.equal(controller.state.assessment.stories[0].review, 'stale')
  assert.equal(await controller.poll(), false)
})

test('a new backlog in the workspace is seen by poll', async (t) => {
  const { cwd, controller } = await setUp(t, { workspace: false })
  assert.equal(await controller.poll(), false)
  await makeWorkspace(cwd)
  assert.equal(await controller.poll(), true)
  assert.equal(controller.state.slug, SLUG)
  await rm(join(cwd, '.copilot-tracking'), { recursive: true, force: true })
  assert.equal(await controller.poll(), true)
  assert.deepEqual([controller.state.slug, controller.state.assessment, controller.state.signature], [null, null, null])
})

test('watch polls on its own until stopped', async (t) => {
  const { dir, controller } = await setUp(t)
  controller.watch()
  controller.watch()
  // The poll timer is unref'd: a pending timeout keeps the test's event loop alive meanwhile.
  let keepAlive
  const changed = new Promise((resolve) => {
    keepAlive = setTimeout(() => resolve('timeout'), 5000)
    controller.events.once('change', () => resolve('change'))
  })
  await writeJson(join(dir, 'review.json'), { version: 1, stories: {} })
  assert.equal(await changed, 'change')
  clearTimeout(keepAlive)
  controller.stop()
  controller.stop()
  const before = controller.state.signature
  await writeJson(join(dir, 'published.json'), { version: 1, stories: {} })
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(controller.state.signature, before, 'a stopped controller reads nothing')
})
