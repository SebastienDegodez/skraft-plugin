// The PRD backlog workflow as Copilot runs it: from the PRD to issues on GitHub, with its two
// human pauses, resumable without running an agent twice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { runPrdBacklogWorkflow } from '../../../plugins/skraft-backlog/prd-backlog/workflow.mjs'
import { fakeGitHub } from './fake-github.mjs'
import { attempt, outputOf, scriptedAgents, simulatedContext, workingCopy, writeJson } from './simulated-ctx.mjs'
import { storyFile, storyMap } from './fixtures/backlog-data.mjs'

const NOW = () => '2026-10-19T12:00:00Z'
const ARGS = { prd: 'docs/prd/eligibilite.md', repo: 'acme/permis' }
const handoffPath = (cwd) => join(cwd, '.copilot-tracking', 'github-issues', 'prds', 'eligibilite', 'handoff.md')
const backlogDir = (cwd) => join(cwd, '.copilot-tracking', 'skraft-plans', 'eligibilite', 'backlog')

/** Runs attempt after attempt as a human would: resume after each pause, checking the box when asked. */
const runUntil = async ({ cwd, github, agents, args = ARGS, approveHandoff = true, journal = new Map() }) => {
  const resumed = new Set()
  const runs = []
  for (;;) {
    const simulated = simulatedContext({ args, agents, journal, resumed })
    const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: github.run }), simulated)
    runs.push({ result, calls: simulated.calls, logs: simulated.logs })
    if (!('paused' in result)) return { result, runs }
    if (result.paused === 'handoff-reviewed' && approveHandoff) {
      const handoff = await readFile(handoffPath(cwd), 'utf8')
      await writeFile(handoffPath(cwd), handoff.replace('> - [ ] Reviewed and validated', '> - [x] Reviewed and validated'))
    }
    resumed.add(result.paused)
    if (runs.length > 5) throw new Error('the workflow does not settle')
  }
}

test('from the PRD to a published backlog: map, pause, stories, review, handoff, pause, issues', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const github = fakeGitHub()
  const { result, runs } = await runUntil({ cwd, github })

  assert.deepEqual(runs.map((r) => r.result.paused ?? r.result.status), ['story-map-approved', 'handoff-reviewed', 'published'])
  assert.equal(result.failed, 0)
  const firstCalls = runs[0].calls.map((c) => c.label)
  assert.deepEqual(firstCalls, ['slice · attempt 1'], 'only the slicer runs before the story map is approved')
  const storyMapView = await readFile(join(backlogDir(cwd), 'story-map.md'), 'utf8')
  assert.match(storyMapView, /\| 1 \| EP-001-S01 \(tracer\)/)

  const secondCalls = runs[1].calls.map((c) => c.label)
  assert.ok(!secondCalls.includes('slice · attempt 1'), 'the slicer is not run again on resume')
  for (const story of ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01']) assert.ok(secondCalls.includes(`write ${story} · attempt 1`), story)
  for (const lens of ['planning-invest', 'planning-ac-quality', 'planning-coherence', 'planning-dor']) {
    assert.ok(secondCalls.includes(`EP-001 · ${lens} · attempt 1`), lens)
  }
  assert.deepEqual(runs[2].calls, [], 'publishing runs no agent')

  const titles = github.state.issues.map((i) => i.title)
  assert.deepEqual(titles.slice(0, 2), ["feat(ep-001): Contrôle d'éligibilité", 'feat(ep-002): Justificatifs'], 'epics are created first')
  assert.equal(github.state.issues.length, 6)
  const number = (title) => github.state.issues.find((i) => i.title.endsWith(title)).number
  assert.deepEqual(github.state.subIssues.map((l) => [l.parent, l.child]).sort(), [
    [number("Contrôle d'éligibilité"), number("Recevoir la décision d'éligibilité")],
    [number("Contrôle d'éligibilité"), number('Être refusé avant 18 ans')],
    [number("Contrôle d'éligibilité"), number('Retrouver sa décision pendant 30 jours')],
    [number('Justificatifs'), number('Déposer son permis')],
  ].sort())
  assert.equal(github.state.blockedBy.length, 3)
  const story = github.state.issues.find((i) => i.title.endsWith('Déposer son permis'))
  assert.deepEqual(story.labels, ['skraft-backlog', 'type/story', 'status/ready', 'priority/must', 'effort/3'])
  assert.equal(story.milestone, github.state.milestones.find((m) => m.title === 'v0.2-justificatifs').number)
  assert.match(story.body, new RegExp(`Parent: #${number('Justificatifs')}`))
  assert.match(story.body, new RegExp(`Bloquée par: #${number("Recevoir la décision d'éligibilité")} \\(EP-001-S01\\)`))
  assert.match(story.body, /https:\/\/github\.com\/acme\/permis\/blob\/main\/docs\/prd\/eligibilite\.md/)
  for (const issue of github.state.issues) {
    assert.doesNotMatch(issue.body, /\.copilot-tracking|\{\{TEMP-|\bIS\d{3}\b/, issue.title)
    assert.match(issue.body, /<!-- skraft-backlog:item=/)
  }
  assert.ok(['skraft-backlog', 'type/story', 'status/ready', 'effort/3'].every((l) => github.state.labels.includes(l)))
  const logs = await readFile(join(cwd, '.copilot-tracking', 'github-issues', 'prds', 'eligibilite', 'handoff-logs.md'), 'utf8')
  assert.match(logs, /\* \*\*Confirmed destination\*\*: acme\/permis/)
  assert.match(logs, /\* `\{\{TEMP-1\}\}` -> #101/)
})

test('nothing reaches GitHub while the human review box of the handoff is unchecked', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const github = fakeGitHub()
  const { result } = await runUntil({ cwd, github, approveHandoff: false })
  assert.equal(result.status, 'waiting-review')
  assert.match(result.reason, /handoff\.md/)
  assert.equal(github.state.issues.length, 0)
  assert.ok(!github.calls.some((c) => c.args.includes('POST')))
  const handoff = await readFile(handoffPath(cwd), 'utf8')
  assert.match(handoff, /### Create\n\n\* \[ \] IS001 - Create - `\{\{TEMP-1\}\}` - feat\(ep-001\)/)
  assert.match(handoff, /\* \[ \] IS\d{3} - Link - `EP-002-S01` - blocked by `EP-001-S01`/)
})

test('a second run finds the published issues by their marker and creates none', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const github = fakeGitHub()
  await runUntil({ cwd, github })
  const again = fakeGitHub({ issues: github.state.issues, labels: github.state.labels, milestones: github.state.milestones })
  const { result } = await runUntil({ cwd, github: again })
  assert.equal(result.status, 'published')
  assert.equal(again.state.issues.length, 6)
  assert.ok(!again.calls.some((c) => c.args.includes('POST') && c.args.at(-3) === 'repos/acme/permis/issues'))
})

test('approve skips the story-map pause; the handoff pause stays', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { runs } = await runUntil({ cwd, github: fakeGitHub(), args: { ...ARGS, approve: true } })
  assert.deepEqual(runs.map((r) => r.result.paused ?? r.result.status), ['handoff-reviewed', 'published'])
})

test('a refused story map goes back to the slicer with its problems, three times at most', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'backlog-slicer': async ({ prompt }) => {
      const map = storyMap()
      map.epics[1].stories[0].covers = ['FR-003']
      map.epics[0].stories[1].after = ['EP-001-S03']
      map.epics[0].stories[2].after = ['EP-001-S02']
      await writeJson(outputOf(prompt), map)
      return 'written'
    },
  })
  const simulated = simulatedContext({ args: ARGS, agents })
  const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  assert.equal(result.status, 'blocked')
  assert.equal(result.phase, 'SLICE')
  assert.deepEqual(simulated.calls.map((c) => c.label), ['slice · attempt 1', 'slice · attempt 2', 'slice · attempt 3'])
  assert.match(simulated.calls[1].prompt, /FR-004 is covered by no story and not deferred/)
  assert.match(simulated.calls[1].prompt, /EP-002-S01 covers FR-003, which its epic EP-002 does not list in covers/)
  assert.match(simulated.calls[1].prompt, /dependency cycle: EP-001-S02 -> EP-001-S03 -> EP-001-S02/)
  assert.ok(result.problems.some((p) => /cycle/.test(p)))
})

test('a story file that fails the Definition of Ready goes back to its writer with the problems', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'story-writer': async ({ prompt, attempt: n }) => {
      const id = /Write story (\S+)/.exec(prompt)[1]
      const planned = storyMap().epics.flatMap((e) => e.stories.map((s) => ({ ...s, epic: e.id }))).find((s) => s.id === id)
      const file = storyFile(planned)
      if (id === 'EP-001-S02' && n === 1) {
        file.persona = 'utilisateur'
        file.dependencies = []
      }
      await writeJson(outputOf(prompt), file)
      return 'written'
    },
  })
  const { runs } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true } })
  const calls = runs[0].calls
  const retry = calls.find((c) => c.label === 'write EP-001-S02 · attempt 2')
  assert.ok(retry, 'the writer is dispatched again')
  assert.match(retry.prompt, /DoR 2: persona "utilisateur" names no role/)
  assert.match(retry.prompt, /DoR 8: dependencies are \[\], the map plans \[EP-001-S01\]/)
  assert.ok(!calls.some((c) => c.label === 'write EP-001-S01 · attempt 2'), 'a story that passed is not written again')
})

test('a medium finding of a lens sends back only the story it names, then the epic is reviewed again', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'planning-dor-lens': async ({ prompt, attempt: n }) => (n === 1 && /epic EP-001/.test(prompt)
      ? 'lens: planning-dor\nverdict: fail\ndefects:\n  - id: D1\n    gate: G8\n    severity: high\n    story: "EP-001-S03"\n    location: "EP-001-S03 Generic Data"\n    description: "the 30-day examples carry no dates"\n    suggestion: "give each example its submission date"'
      : 'lens: planning-dor\nverdict: pass\ndefects: []'),
  })
  const { runs, result } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true } })
  assert.equal(result.status, 'published')
  const labels = runs[0].calls.map((c) => c.label)
  const rewrite = runs[0].calls.find((c) => c.label === 'write EP-001-S03 · attempt 2')
  assert.match(rewrite.prompt, /G8: the 30-day examples carry no dates — give each example its submission date/)
  assert.ok(!labels.includes('write EP-001-S01 · attempt 2'))
  assert.ok(labels.includes('EP-001 · planning-dor · attempt 2'))
  assert.ok(!labels.includes('EP-002 · planning-dor · attempt 2'), 'an approved epic is not reviewed again')
})

test('an epic the review refuses three times is held back with every story that waits on it', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'planning-invest-lens': async ({ prompt }) => (/epic EP-001/.test(prompt)
      ? 'lens: planning-invest\nverdict: fail\ndefects:\n  - id: D1\n    gate: G1\n    severity: blocker\n    story: "EP-001-S01"\n    location: "EP-001-S01"\n    description: "Valuable: the tracer shows nothing to the driver"\n    suggestion: "show the decision"'
      : 'lens: planning-invest\nverdict: pass\ndefects: []'),
  })
  const { result, runs } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true }, approveHandoff: false })
  assert.equal(result.status, 'blocked')
  assert.equal(result.phase, 'REVIEW')
  assert.deepEqual(Object.keys(result.notReady).sort(), ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01'])
  assert.match(result.notReady['EP-002-S01'][0], /waits on EP-001-S01, which is held back/)
  assert.ok(runs[0].calls.some((c) => c.label === 'EP-001 · planning-invest · attempt 3'))
})

test('a run limited to some epics holds back the stories of the others and their dependents', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { runs } = await runUntil({ cwd, github: fakeGitHub(), args: { ...ARGS, approve: true, epics: ['EP-002'] }, approveHandoff: false })
  assert.ok(!runs[0].calls.some((c) => /EP-001/.test(c.label)), 'EP-001 is not elaborated')
  assert.equal(runs[0].result.status, 'blocked')
  assert.match(runs[0].result.notReady['EP-002-S01'][0], /waits on EP-001-S01/)
})

test('the workflow refuses a missing PRD, a PRD without FR ids, and an unknown epic', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const run = (args) => attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulatedContext({ args }))
  assert.match((await run({})).reason, /args\.prd: the path of the PRD is required/)
  assert.match((await run({ prd: 'docs/prd/absent.md' })).reason, /cannot be read/)
  await writeFile(join(cwd, 'docs', 'prd', 'vide.md'), '# Vide\n\nAucune exigence.\n')
  assert.match((await run({ prd: 'docs/prd/vide.md' })).reason, /defines no FR-### requirement/)
  const unknown = await run({ ...ARGS, approve: true, epics: ['EP-404'] })
  assert.equal(unknown.status, 'refused')
  assert.match(unknown.reason, /EP-404 is no epic of the story map/)
})

test('a destination that answers under another name blocks the publication before any write', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const github = fakeGitHub({ answersAs: 'evil/permis' })
  const { result } = await runUntil({ cwd, github, args: { ...ARGS, approve: true } })
  assert.equal(result.status, 'blocked')
  assert.match(result.reason, /destination binding: acme\/permis answers as evil\/permis/)
  assert.equal(github.state.issues.length, 0)
})

test('a dry run simulates every operation and writes handoff-dryrun.md', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const github = fakeGitHub()
  const { result } = await runUntil({ cwd, github, args: { ...ARGS, approve: true, dryRun: true } })
  assert.equal(result.status, 'simulated')
  assert.equal(github.state.issues.length, 0)
  assert.ok(!github.calls.some((c) => c.args.includes('POST')))
  const dry = await readFile(join(cwd, '.copilot-tracking', 'github-issues', 'prds', 'eligibilite', 'handoff-dryrun.md'), 'utf8')
  assert.match(dry, /IS001 - dry-run - EP-001/)
})

test('agents are called by their plugin id unless agentIds names them, with the model asked for', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const simulated = simulatedContext({ args: { ...ARGS, agentIds: { 'backlog-slicer': 'mine:backlog-slicer' }, models: { 'story-writer': 'claude-sonnet-5' } } })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  assert.equal(simulated.calls[0].agent, 'mine:backlog-slicer')
  const resumed = simulatedContext({ args: simulated.ctx.args, journal: simulated.journal, resumed: new Set(['story-map-approved']) })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), resumed)
  const writer = resumed.calls.find((c) => c.agent === 'skraft-backlog:story-writer')
  assert.equal(writer.model, 'claude-sonnet-5')
  assert.ok(resumed.calls.some((c) => c.agent === 'skraft-backlog:planning-dor-lens'))
})
