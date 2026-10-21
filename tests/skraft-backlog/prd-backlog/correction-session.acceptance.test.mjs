// The correction session: a story too big is held, never sent back to its writer; the human picks
// a correction and answers a question in the canvas; the workflow applies only what was accepted
// and reviews only the stories it touched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { runPrdBacklogWorkflow } from '../../../plugins/skraft-backlog/prd-backlog/workflow.mjs'
import { createController } from '../../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs'
import { fakeGitHub } from './fake-github.mjs'
import { attempt, outputOf, scriptedAgents, simulatedContext, workingCopy, writeJson } from './simulated-ctx.mjs'
import { storyFile } from './fixtures/backlog-data.mjs'

const NOW = () => '2026-10-21T12:00:00Z'
const ARGS = { prd: 'docs/prd/eligibilite.md', repo: 'acme/permis', approve: true }
const backlogDir = (cwd) => join(cwd, '.copilot-tracking', 'skraft-plans', 'eligibilite', 'backlog')
const readBacklog = async (cwd, name) => JSON.parse(await readFile(join(backlogDir(cwd), name), 'utf8'))

/**
 * A writer that reads the story map on disk (a split adds stories the fixture does not know):
 * EP-001-S03 comes back with 6 criteria and 3 points until a correction rewrites it; EP-001-S02
 * asks one open question.
 */
const writer = async ({ prompt }) => {
  const id = /Write story (\S+)/.exec(prompt)[1]
  const output = outputOf(prompt)
  const map = JSON.parse(await readFile(join(dirname(dirname(output)), 'story-map.json'), 'utf8'))
  const planned = map.epics.flatMap((e) => e.stories.map((s) => ({ ...s, epic: e.id }))).find((s) => s.id === id)
  const file = storyFile({ ...planned, effort: Math.min(planned.effort, 3) })
  if (id === 'EP-001-S03' && !/split from/.test(prompt)) {
    file.effort.points = 3
    file.acceptanceCriteria = Array.from({ length: 6 }, (_, i) => ({ ...file.acceptanceCriteria[i % 3], id: `AC-0${i + 1}`, covers: i === 0 ? planned.covers : [] }))
    file.tasks = [{ text: 'Conserver la décision', acceptanceCriteria: file.acceptanceCriteria.map((c) => c.id) }]
  }
  if (id === 'EP-001-S02') file.openQuestions = ['Le motif du refus cite-t-il la date des 18 ans ?']
  const answer = /Q1: .* → (.*)/.exec(prompt)?.[1]
  if (answer) file.description = `${file.description} ${answer}`
  await writeJson(output, file)
  return `${id} written`
}

const slicer = async ({ prompt, label }) => {
  if (!label.startsWith('split')) return scriptedAgents()({ prompt, label, agent: 'x:backlog-slicer', attempt: 1 })
  await writeJson(outputOf(prompt), { stories: [
    { title: 'Retrouver sa décision', persona: 'conducteur déclaré éligible', description: 'La décision reste consultable.', covers: ['FR-003'], effort: 2 },
    { title: 'Être averti de la fin des 30 jours', persona: 'conducteur déclaré éligible', description: 'Le conducteur sait quand sa décision expire.', covers: ['FR-003'], effort: 2 },
  ] })
  return '2 stories'
}

const run = async (cwd, args, agents) => {
  const simulated = simulatedContext({ args, agents })
  const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  return { result, calls: simulated.calls.map((c) => c.label), prompts: simulated.calls }
}

test('too big is held for a correction; the accepted split and the draft answer are applied; only the touched stories are reviewed', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({ 'story-writer': writer, 'backlog-slicer': slicer })

  const first = await run(cwd, ARGS, agents)
  assert.deepEqual(first.calls.filter((l) => l.startsWith('write EP-001-S03')), ['write EP-001-S03 · attempt 1'], 'no writer retry: only a correction lifts too big')
  const plan = await readBacklog(cwd, 'plan.json')
  assert.deepEqual(plan.notReady['EP-001-S03'], ['6 critères : au-delà de 5, la story est trop grosse (story géante).'])
  const snapshot = await readBacklog(cwd, 'corrections.json')
  assert.deepEqual(snapshot.stories['EP-001-S03'].findings.map((f) => f.id), ['size'])
  assert.equal(snapshot.session, null)

  const controller = createController({ cwd, gh: fakeGitHub().run, now: () => new Date(NOW()) })
  t.after(() => controller.stop())
  await controller.reload()
  const act = (name, input) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
  const listed = await act('list_corrections', { ids: ['EP-001-S03', 'EP-001-S02'] })
  const options = listed.stories.find((s) => s.id === 'EP-001-S03').findings[0].options
  const happy = options.find((o) => o.kind === 'split-happy-path')
  assert.deepEqual([happy.status, happy.impact.parts.map((p) => p.points)], ['proposed', [2, 2]])
  assert.deepEqual(listed.stories.find((s) => s.id === 'EP-001-S02').questions.map((q) => [q.id, q.status]), [['Q1', 'open']])
  assert.deepEqual(await act('get_correction_session', {}).then((s) => s.ready), false)
  await assert.rejects(act('decide_correction', { id: 'EP-001-S03|size|nope', decision: 'accepted' }), /is no correction proposed now/)
  await act('decide_correction', { id: happy.id, decision: 'accepted', comment: 'le rappel des 30 jours à part' })
  await act('answer_question', { story: 'EP-001-S02', question: 'Q1', text: 'Oui, avec la date exacte.' })
  await assert.rejects(act('answer_question', { story: 'EP-001-S02', question: 'Q9', text: 'x' }), /has no open question Q9/)
  const session = await act('get_correction_session', {})
  assert.deepEqual([session.ready, session.accepted.map((a) => a.kind), session.answers], [true, ['split-happy-path'], [{ story: 'EP-001-S02', question: 'Q1' }]])

  const second = await run(cwd, { ...ARGS, approve: undefined, corrections: true }, agents)
  assert.equal(second.result.paused, 'handoff-reviewed', 'no story-map pause: the human accepted the split')
  assert.deepEqual(second.calls.filter((l) => /^(split|write)/.test(l)).sort(),
    ['split EP-001-S03 · attempt 1', 'write EP-001-S02 · attempt 1', 'write EP-001-S03 · attempt 1', 'write EP-001-S04 · attempt 1'])
  assert.match(second.prompts.find((c) => c.label === 'split EP-001-S03 · attempt 1').prompt, /exactly 2 stories[\s\S]*The product owner adds: le rappel des 30 jours à part/)
  assert.match(second.prompts.find((c) => c.label === 'write EP-001-S02 · attempt 1').prompt, /Q1: Le motif du refus cite-t-il la date des 18 ans \? → Oui, avec la date exacte\./)
  assert.ok(!second.calls.some((l) => l.startsWith('EP-002 ·')), 'an untouched epic is not reviewed')
  assert.match(second.prompts.find((c) => c.label === 'EP-001 · planning-dor · attempt 1').prompt, /Judge only EP-001-S02, EP-001-S03, EP-001-S04/)

  const map = await readBacklog(cwd, 'story-map.json')
  assert.deepEqual(map.epics[0].stories.map((s) => [s.id, s.after, s.covers]), [
    ['EP-001-S01', [], ['FR-001', 'NFR-001']], ['EP-001-S02', ['EP-001-S01'], ['FR-002']],
    ['EP-001-S03', ['EP-001-S01'], ['FR-003']], ['EP-001-S04', ['EP-001-S01', 'EP-001-S03'], ['FR-003']],
  ])
  const corrections = await readBacklog(cwd, 'corrections.json')
  assert.deepEqual([corrections.decisions[happy.id].status, corrections.session.status, corrections.session.touched.sort()],
    ['applied', 'done', ['EP-001-S02', 'EP-001-S03', 'EP-001-S04']])
  assert.deepEqual(corrections.session.verdicts, { 'EP-001-S03': 'APPROVED', 'EP-001-S04': 'APPROVED', 'EP-001-S02': 'APPROVED' })
  const s02 = await readBacklog(cwd, 'stories/EP-001-S02.json')
  assert.deepEqual(s02.openQuestions, [{ id: 'Q1', question: 'Le motif du refus cite-t-il la date des 18 ans ?', answer: 'Oui, avec la date exacte.', answeredAt: '2026-10-21T12:00:00.000Z' }])
  const ready = await readBacklog(cwd, 'plan.json')
  assert.deepEqual(Object.keys(ready.notReady), [], 'every story is ready')
  await controller.reload()
  assert.equal((await act('list_corrections', { ids: ['EP-001-S02'] })).stories[0].questions[0].status, 'resolved')

  const again = await run(cwd, { ...ARGS, corrections: true }, agents)
  assert.ok(!again.calls.some((l) => /^(split|write|EP-)/.test(l)), 'a resumed session applies nothing twice')
})

test('a correction session applies nothing without an accepted decision: a refused one changes nothing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({ 'story-writer': writer, 'backlog-slicer': slicer })
  await run(cwd, ARGS, agents)
  const controller = createController({ cwd, gh: fakeGitHub().run, now: () => new Date(NOW()) })
  t.after(() => controller.stop())
  await controller.reload()
  const act = (name, input) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
  const [option] = (await act('list_corrections', { ids: ['EP-001-S03'] })).stories[0].findings[0].options
  await act('decide_correction', { id: option.id, decision: 'refused', comment: 'on garde tel quel' })
  const map = await readFile(join(backlogDir(cwd), 'story-map.json'), 'utf8')
  const { result, calls } = await run(cwd, { ...ARGS, corrections: true }, agents)
  assert.equal(await readFile(join(backlogDir(cwd), 'story-map.json'), 'utf8'), map)
  assert.equal(result.status, 'refused')
  assert.match(result.reason, /no accepted correction and no answer to apply/)
  assert.deepEqual(calls, [])
})

test('a story held before the review is neither shown to the lenses nor judged; their defects on it are discarded and land on no other story', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const blind = async ({ prompt, attempt: n }) => (/epic EP-001/.test(prompt)
    ? `lens: planning-invest\nverdict: fail\ndefects:\n${n === 1 ? '  - id: D1\n    gate: G1\n    severity: high\n    story: "EP-001-S01"\n    location: "EP-001-S01"\n    description: "Testable : la décision ne cite pas le motif"\n    suggestion: "citer le motif"\n' : ''}  - id: D2\n    gate: G1\n    severity: high\n    story: "EP-001-S03"\n    location: "EP-001-S03"\n    description: "Testable : aucun critère d\'acceptation"\n    suggestion: "en ajouter"`
    : 'lens: planning-invest\nverdict: pass\ndefects: []')
  const { result, prompts } = await run(cwd, { ...ARGS, approve: true }, scriptedAgents({ 'story-writer': writer, 'backlog-slicer': slicer, 'planning-invest-lens': blind }))
  assert.equal(result.paused ?? result.status, 'handoff-reviewed')
  const stories = await readFile(join(backlogDir(cwd), 'plans', 'stories-EP-001.md'), 'utf8')
  assert.doesNotMatch(stories, /### EP-001-S03/)
  assert.match(stories, /\| EP-001-S03 \(retenue avant la revue, non jugée\) \|/)
  assert.ok(!prompts.some((c) => /ac-draft-EP-001-S03/.test(c.prompt)), 'no lens receives its draft')
  const plan = await readBacklog(cwd, 'plan.json')
  assert.equal(plan.notReady['EP-001-S01'], undefined, 'S01 passes at round 2: S03’s defect never landed on it')
  const round1 = await readBacklog(cwd, 'reviews/EP-001/discuss-review-1.json')
  assert.deepEqual(round1.lenses['planning-invest'].findings.map((f) => f.story), ['EP-001-S01'])
  assert.deepEqual(plan.notReady['EP-001-S03'], ['6 critères : au-delà de 5, la story est trop grosse (story géante).'])
  const review = round1
  assert.deepEqual(review.discarded.map((d) => [d.story, d.lens]), [['EP-001-S03', 'planning-invest']])
  const corrections = await readBacklog(cwd, 'corrections.json')
  assert.deepEqual(corrections.stories['EP-001-S03'].findings.map((f) => [f.id, f.sources]), [['size', ['check:criteria-too-many']]])
})

test('corrections/ occupied by a file (run a870cb72): the file is moved aside and the directory exists before the slicer splits', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { stat, writeFile: put } = await import('node:fs/promises')
  const agents = scriptedAgents({ 'story-writer': writer, 'backlog-slicer': slicer })
  await run(cwd, ARGS, agents)
  const controller = createController({ cwd, gh: fakeGitHub().run, now: () => new Date(NOW()) })
  t.after(() => controller.stop())
  await controller.reload()
  const act = (name, input) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
  const happy = (await act('list_corrections', { ids: ['EP-001-S03'] })).stories[0].findings[0].options.find((o) => o.kind === 'split-happy-path')
  await act('decide_correction', { id: happy.id, decision: 'accepted' })

  await put(join(backlogDir(cwd), 'corrections'), '{"stories":[]}', 'utf8')
  const checked = []
  const watching = scriptedAgents({ 'story-writer': writer, 'backlog-slicer': async (call) => {
    if (call.label.startsWith('split')) checked.push((await stat(dirname(outputOf(call.prompt)))).isDirectory())
    return slicer(call)
  } })
  const repaired = await run(cwd, { ...ARGS, corrections: true }, watching)
  assert.deepEqual(checked, [true], 'corrections/ was a file: moved aside, created as a directory before the slicer runs')
  assert.deepEqual(repaired.calls.filter((l) => l.startsWith('split')), ['split EP-001-S03 · attempt 1'])

})

test('an infrastructure failure of a split is not retried: one dispatch, decision kept accepted, cause recorded', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({ 'story-writer': writer, 'backlog-slicer': slicer })
  await run(cwd, ARGS, agents)
  const controller = createController({ cwd, gh: fakeGitHub().run, now: () => new Date(NOW()) })
  t.after(() => controller.stop())
  await controller.reload()
  const act = (name, input) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
  const happy = (await act('list_corrections', { ids: ['EP-001-S03'] })).stories[0].findings[0].options.find((o) => o.kind === 'split-happy-path')
  await act('decide_correction', { id: happy.id, decision: 'accepted' })
  const silent = scriptedAgents({ 'story-writer': writer, 'backlog-slicer': async (call) => (call.label.startsWith('split') ? 'done' : slicer(call)) })
  const { calls } = await run(cwd, { ...ARGS, corrections: true }, silent)
  assert.deepEqual(calls.filter((l) => l.startsWith('split')), ['split EP-001-S03 · attempt 1'], 'ENOENT: no blind retry')
  const corrections = await readBacklog(cwd, 'corrections.json')
  assert.equal(corrections.decisions[happy.id].status, 'accepted')
  assert.match(corrections.decisions[happy.id].error, /^infrastructure \(ENOENT\)/)
  assert.match(corrections.session.failed[happy.id], /infrastructure \(ENOENT\).*stays accepted/)
  await controller.reload()
  assert.equal((await act('get_correction_session', {})).ready, true, 'it can be replayed')
  const replay = await run(cwd, { ...ARGS, corrections: true }, agents)
  assert.deepEqual(replay.calls.filter((l) => l.startsWith('split')), ['split EP-001-S03 · attempt 1'])
  assert.equal((await readBacklog(cwd, 'corrections.json')).decisions[happy.id].status, 'applied')
})
