// The PRD backlog workflow as Copilot runs it: from the PRD to issues on GitHub, with its two
// human pauses, resumable without running an agent twice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runPrdBacklogWorkflow } from '../../../plugins/skraft-backlog/prd-backlog/workflow.mjs'
import { assessBacklog } from '../../../plugins/skraft-backlog/prd-backlog/canvas/assess.mjs'
import { loadBacklog } from '../../../plugins/skraft-backlog/prd-backlog/canvas/store.mjs'
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
    if (result.paused === 'framing-answered') {
      const path = join(backlogDir(cwd), 'framing.json')
      const framing = JSON.parse(await readFile(path, 'utf8'))
      framing.answers.milestones = { text: 'Un jalon par lot : v0.1-eligibilite puis v0.2-justificatifs', at: NOW() }
      await writeFile(path, JSON.stringify(framing), 'utf8')
    }
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

  assert.deepEqual(runs.map((r) => r.result.paused ?? r.result.status), ['framing-answered', 'story-map-approved', 'handoff-reviewed', 'published'])
  assert.equal(result.failed, 0)
  assert.deepEqual(runs[0].calls.map((c) => c.label), ['frame'], 'the slicer frames before it cuts')
  assert.match(runs[0].calls[0].prompt, /do not slice yet[\s\S]*These are already asked; do not repeat them:\n- Comment découper en jalons \?/)
  const sliced = runs[1].calls.find((c) => c.label === 'slice · attempt 1')
  assert.match(sliced.prompt, /Follow each answer:\n- Comment découper en jalons \? → Un jalon par lot : v0\.1-eligibilite puis v0\.2-justificatifs/)
  assert.match(sliced.prompt, /exigences non fonctionnelles \? → Dans les stories qu’elles contraignent \(recommended, not answered\)/)
  runs.splice(0, 1)
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

  const plan = JSON.parse(await readFile(join(backlogDir(cwd), 'plan.json'), 'utf8'))
  assert.equal(plan.repo, 'acme/permis', 'plan.json names the repository it publishes to')
  const published = JSON.parse(await readFile(join(backlogDir(cwd), 'published.json'), 'utf8'))
  const issueOf = (title) => ({ number: number(title), url: `https://github.com/acme/permis/issues/${number(title)}` })
  assert.deepEqual(published, {
    version: 1,
    stories: {
      'EP-001-S01': issueOf("Recevoir la décision d'éligibilité"),
      'EP-001-S02': issueOf('Être refusé avant 18 ans'),
      'EP-001-S03': issueOf('Retrouver sa décision pendant 30 jours'),
      'EP-002-S01': issueOf('Déposer son permis'),
    },
  }, 'published.json records the issue each story became, and no epic')
  const loaded = await loadBacklog(cwd, 'eligibilite')
  assert.ok('raw' in loaded)
  const canvas = assessBacklog(loaded.raw)
  assert.equal(canvas.repo, 'acme/permis')
  assert.equal(canvas.counts.published, 4, 'the backlog canvas reads the stories as published')
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
  const simulated = simulatedContext({ args: { ...ARGS, frame: false }, agents })
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
  assert.match(retry.prompt, /DoR 8: EP-001-S01 is listed without a reason/, 'the map dependency is written in; only its reason is asked')
  assert.doesNotMatch(retry.prompt, /dependencies are \[\]/)
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
  assert.match(result.notReady['EP-002-S01'][0], /attend EP-001-S01, qui est retenue/)
  assert.ok(runs[0].calls.some((c) => c.label === 'EP-001 · planning-invest · attempt 3'))
})

test('a run limited to some epics holds back the stories of the others and their dependents', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { runs } = await runUntil({ cwd, github: fakeGitHub(), args: { ...ARGS, approve: true, epics: ['EP-002'] }, approveHandoff: false })
  assert.ok(!runs[0].calls.some((c) => /EP-001/.test(c.label)), 'EP-001 is not elaborated')
  assert.equal(runs[0].result.status, 'blocked')
  assert.match(runs[0].result.notReady['EP-002-S01'][0], /attend EP-001-S01/)
})

test('the workflow refuses a missing PRD, a PRD without FR ids, and an unknown epic', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const run = (args) => attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulatedContext({ args }))
  assert.match((await run({})).reason, /args\.prd: the path of the PRD is required/)
  assert.equal((await run({ prd: 'docs/prd/absent-sentinel.md' })).reason, 'args.prd: the PRD cannot be read')
  await writeFile(join(cwd, 'docs', 'prd', 'vide-sentinel.md'), '# Vide\n\nAucune exigence.\n')
  assert.equal((await run({ prd: 'docs/prd/vide-sentinel.md' })).reason, 'args.prd: the PRD defines no FR-### requirement')
  const unknown = await run({ ...ARGS, approve: true, epics: ['EP-404-sentinel'] })
  assert.equal(unknown.status, 'refused')
  assert.equal(unknown.reason, 'args.epics: an epic it names is not in the story map')
})

test('an unexpected error on the run path ends in an outcome with a fixed reason, and progress.json says so without its text', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const SENTINEL = 'stderr-sentinel-5e1f'
  const crash = scriptedAgents({ 'backlog-slicer': async () => { throw new Error(`gh: ${SENTINEL}`) } })
  const crashed = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulatedContext({ args: { ...ARGS, frame: false }, agents: crash }))
  const UNEXPECTED = 'the run stopped on an unexpected error; run the workflow again to resume it'
  assert.deepEqual(crashed, { status: 'error', code: 'unexpected', slug: 'eligibilite', reason: UNEXPECTED })
  const progress = await readFile(join(backlogDir(cwd), 'progress.json'), 'utf8')
  assert.deepEqual([JSON.parse(progress).run.status, JSON.parse(progress).run.detail], ['error', UNEXPECTED])
  assert.ok(!progress.includes(SENTINEL), 'the exception text stays out of progress.json')

  const throwingGh = () => { throw new Error(SENTINEL) }
  const early = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: throwingGh }), simulatedContext({ args: ARGS }))
  assert.deepEqual(early, { status: 'error', code: 'unexpected', slug: null, reason: UNEXPECTED }, 'before the run has a slug too')

  const cancelled = simulatedContext({ args: { ...ARGS, frame: false }, agents: crash })
  const controller = new AbortController()
  controller.abort()
  cancelled.ctx.signal = controller.signal
  await assert.rejects(runPrdBacklogWorkflow(cancelled.ctx, { cwd, now: NOW, gh: fakeGitHub().run }), new RegExp(SENTINEL), 'a cancelled run is rethrown')
})

test('a progress write that fails is logged with a fixed message and stops neither the run nor the writes after it', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const progress = join(backlogDir(cwd), 'progress.json')
  await mkdir(join(progress, 'in-the-way'), { recursive: true })
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))
  const agents = scriptedAgents({
    'backlog-slicer': async (call) => {
      await rm(progress, { recursive: true, force: true })
      return scriptedAgents()(call)
    },
  })
  const simulated = simulatedContext({ args: { ...ARGS, frame: false }, agents })
  const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(result, { paused: 'story-map-approved' }, 'the run went on to its pause')
  const written = JSON.parse(await readFile(progress, 'utf8'))
  assert.deepEqual([written.run.status, written.run.detail, written.run.phase], ['paused', 'story-map-approved', 'SLICE'], 'the writes after the failure land')
  const failures = simulated.logs.filter((l) => l.startsWith('progress.json'))
  assert.ok(failures.length >= 1)
  assert.deepEqual([...new Set(failures)], ['progress.json could not be written; the canvas shows an older state until the next write'])
  assert.deepEqual(unhandled, [])
})

test('a plan.json write that fails is logged with a fixed message; the reviewed epics still reach the handoff', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const plan = join(backlogDir(cwd), 'plan.json')
  let blocked = false
  const agents = scriptedAgents({
    'planning-invest-lens': async (call) => {
      if (!blocked) {
        blocked = true
        mkdirSync(join(plan, 'in-the-way'), { recursive: true })
      }
      return scriptedAgents()(call)
    },
  })
  const simulated = simulatedContext({ args: { ...ARGS, approve: true, frame: false }, agents })
  const host = simulated.ctx.phase
  simulated.ctx.phase = (title) => {
    if (title === 'HANDOFF') rmSync(plan, { recursive: true, force: true })
    host(title)
  }
  const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  assert.deepEqual(result, { paused: 'handoff-reviewed' })
  const written = JSON.parse(await readFile(plan, 'utf8'))
  assert.ok(written.issues.some((i) => i.id === 'EP-001-S01'), 'the epic reviewed while plan.json was blocked is in the plan')
  assert.ok(simulated.logs.includes('plan.json could not be written; the canvas shows an older plan until the next write'))
})

test('a story file that is not JSON goes back to its writer as such, never with the parser text', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const SENTINEL = 'parser-sentinel-3c9d'
  const agents = scriptedAgents({
    'story-writer': async (call) => {
      if (!call.prompt.includes('Write story EP-001-S01') || call.attempt > 1) return scriptedAgents()(call)
      await writeFile(outputOf(call.prompt), `${SENTINEL} {`, 'utf8')
      return 'written'
    },
  })
  const simulated = simulatedContext({ args: { ...ARGS, approve: true, frame: false }, agents })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  const retry = simulated.calls.find((c) => c.label === 'write EP-001-S01 · attempt 2')
  assert.match(retry?.prompt ?? '', /EP-001-S01\.json cannot be read: not valid JSON/)
  assert.ok(!simulated.calls.some((c) => c.prompt.includes(SENTINEL)), 'the parser text reaches no prompt')
})

test('a destination GitHub cannot read blocks the publication with a fixed reason, never the text gh wrote', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const github = fakeGitHub()
  const SENTINEL = 'stderr-sentinel-77ab'
  const gh = (args, input) => (args.at(-1) === 'repos/acme/permis' ? { status: 1, stdout: `{"message":"${SENTINEL}"}`, stderr: `gh: ${SENTINEL} (HTTP 502)` } : github.run(args, input))
  const { result } = await runUntil({ cwd, github: { run: gh }, args: { ...ARGS, approve: true } })
  assert.deepEqual([result.status, result.code, result.reason], ['blocked', 'publish-blocked', 'destination binding: acme/permis cannot be read (HTTP 502)'])
  const progress = await readFile(join(backlogDir(cwd), 'progress.json'), 'utf8')
  assert.ok(!progress.includes(SENTINEL))
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
  assert.equal(JSON.parse(await readFile(join(backlogDir(cwd), 'plan.json'), 'utf8')).repo, 'acme/permis')
  await assert.rejects(readFile(join(backlogDir(cwd), 'published.json'), 'utf8'), { code: 'ENOENT' }, 'a dry run records no published issue')
})

test('agents are called by their plugin id with no model; an argument that names an agent or a model is refused before anything runs', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const simulated = simulatedContext({ args: { ...ARGS, frame: false } })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  assert.deepEqual([simulated.calls[0].agent, simulated.calls[0].model], ['skraft-backlog:backlog-slicer', undefined])
  const resumed = simulatedContext({ args: simulated.ctx.args, journal: simulated.journal, resumed: new Set(['story-map-approved']) })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), resumed)
  const writer = resumed.calls.find((c) => c.agent === 'skraft-backlog:story-writer')
  assert.equal(writer.model, undefined)
  assert.ok(resumed.calls.some((c) => c.agent === 'skraft-backlog:planning-dor-lens'))

  for (const extra of [{ agentIds: { 'backlog-slicer': 'mine:backlog-slicer' } }, { models: { 'story-writer': 'some-model' } }, { 'unknown-key-sentinel': true }]) {
    const refused = simulatedContext({ args: { ...ARGS, frame: false, ...extra } })
    const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), refused)
    assert.deepEqual(result, { status: 'refused', code: 'invalid-args', reason: 'the workflow takes only prd, slug, repo, epics, approve, dryRun, corrections and frame; nothing was started' })
    assert.deepEqual([refused.calls, refused.phases], [[], []], 'nothing ran')
  }
})

// ── What the code fixes, what reaches an agent, and what stops the run ──────────────────────────

const plannedOf = (id) => storyMap().epics.flatMap((e) => e.stories.map((s) => ({ ...s, epic: e.id }))).find((s) => s.id === id)
const writerAs = (shape) => async ({ prompt, attempt: n }) => {
  const id = /Write story (\S+)/.exec(prompt)[1]
  const file = shape(storyFile(plannedOf(id)), id, n, prompt)
  await writeJson(outputOf(prompt), file)
  return 'written'
}

test('a story map with bare milestones and no tracer flag is fixed by the workflow, not sent back to the slicer', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'backlog-slicer': async ({ prompt }) => {
      const map = storyMap()
      map.milestones = ['M1', 'M2']
      for (const epic of map.epics) for (const story of epic.stories) delete story.tracer
      await writeJson(outputOf(prompt), map)
      return 'written'
    },
  })
  const simulated = simulatedContext({ args: { ...ARGS, frame: false }, agents })
  const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  assert.deepEqual(result, { paused: 'story-map-approved' })
  assert.deepEqual(simulated.calls.map((c) => c.label), ['slice · attempt 1'])
  const written = JSON.parse(await readFile(join(backlogDir(cwd), 'story-map.json'), 'utf8'))
  assert.deepEqual(written.milestones, [{ id: 'M1', title: 'M1' }, { id: 'M2', title: 'M2' }])
  assert.deepEqual(written.epics.map((e) => e.stories[0].tracer), [true, true])
  assert.ok(simulated.logs.some((l) => /story map normalized: 4 fix\(es\)/.test(l)), simulated.logs.join('\n'))
})

test('a writer that lists dependencies as { id } and omits the map fields is not sent back: the workflow writes them', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'story-writer': writerAs((file) => {
      for (const field of ['id', 'epic']) delete file[field]
      file.dependencies = file.dependencies.map(({ story, reason }) => ({ id: story, reason }))
      return file
    }),
  })
  const { runs, result } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true } })
  assert.equal(result.status, 'published')
  assert.ok(!runs[0].calls.some((c) => /^write .* · attempt 2$/.test(c.label)), 'no writer is dispatched twice')
  const story = JSON.parse(await readFile(join(backlogDir(cwd), 'stories', 'EP-002-S01.json'), 'utf8'))
  assert.deepEqual(story.dependencies, [{ story: 'EP-001-S01', reason: 'la décision doit exister' }])
  assert.deepEqual([story.id, story.epic, story.milestone, story.moscow, story.after], ['EP-002-S01', 'EP-002', 'M2', 'must', ['EP-001-S01']])
  const brief = runs[0].calls.find((c) => c.label === 'write EP-001-S02 · attempt 1').prompt
  assert.match(brief, /Each entry of `dependencies` reads exactly \{ "story": "EP-001-S01", "reason": "what this story needs from it" \}/)
  assert.match(brief, /Its directory exists; write no other file, no test or probe file/)
})

test('a story the review keeps refusing is held alone: the other stories of its epic are published', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'planning-invest-lens': async ({ prompt }) => (/epic EP-001/.test(prompt)
      ? 'lens: planning-invest\nverdict: fail\ndefects:\n  - id: D1\n    gate: G1\n    severity: blocker\n    story: "EP-001-S03"\n    location: "EP-001-S03"\n    description: "Valuable: keeping a decision 30 days shows nothing to the driver"\n    suggestion: "show the decision again"'
      : 'lens: planning-invest\nverdict: pass\ndefects: []'),
  })
  const github = fakeGitHub()
  const { result, runs } = await runUntil({ cwd, github, agents, args: { ...ARGS, approve: true } })
  assert.equal(result.status, 'published')
  assert.deepEqual(Object.keys(result.notReady), ['EP-001-S03'])
  assert.match(result.notReady['EP-001-S03'][0], /Valuable: keeping a decision 30 days/)
  assert.equal(github.state.issues.length, 5)
  const second = runs[0].calls.find((c) => c.label === 'EP-001 · planning-invest · attempt 2')
  assert.match(second.prompt, /Judge only EP-001-S03; the other stories of the file passed and are context/)
  const review = JSON.parse(await readFile(join(backlogDir(cwd), 'reviews', 'EP-001', 'discuss-review-1.json'), 'utf8'))
  assert.deepEqual(review.stories, { 'EP-001-S01': 'APPROVED', 'EP-001-S02': 'APPROVED', 'EP-001-S03': 'REJECTED' })
})

test('a story refused by every check does not stop the review of the others of its epic', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({ 'story-writer': writerAs((file, id) => (id === 'EP-001-S03' ? { ...file, examples: [] } : file)) })
  const { result, runs } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true } })
  assert.equal(result.status, 'published')
  assert.deepEqual(Object.keys(result.notReady), ['EP-001-S03'])
  assert.match(result.notReady['EP-001-S03'][0], /^0 exemple du domaine, il en faut au moins 3/, 'the human reads the check in the PRD language')
  const labels = runs[0].calls.map((c) => c.label)
  assert.deepEqual(labels.filter((l) => l.startsWith('write EP-001-S03')), ['write EP-001-S03 · attempt 1', 'write EP-001-S03 · attempt 2', 'write EP-001-S03 · attempt 3'])
  assert.ok(labels.includes('EP-001 · planning-invest · attempt 1'))
})

test('a "not Independent" finding on a dependency the map plans is dismissed: no rework, the epic passes', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'planning-invest-lens': async ({ prompt }) => (/epic EP-002/.test(prompt)
      ? 'lens: planning-invest\nverdict: fail\ndefects:\n  - id: D1\n    gate: G1\n    severity: high\n    story: "EP-002-S01"\n    location: "EP-002-S01"\n    description: "Fails the Independent criterion because it depends on EP-001-S01 and cannot ship without that story landing first."\n    suggestion: "use a fixture"'
      : 'lens: planning-invest\nverdict: pass\ndefects: []'),
  })
  const { result, runs } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true } })
  assert.equal(result.status, 'published')
  assert.ok(!runs[0].calls.some((c) => c.label === 'write EP-002-S01 · attempt 2'))
  assert.ok(!runs[0].calls.some((c) => c.label === 'EP-002 · planning-invest · attempt 2'))
  const review = JSON.parse(await readFile(join(backlogDir(cwd), 'reviews', 'EP-002', 'discuss-review-1.json'), 'utf8'))
  assert.equal(review.verdict, 'APPROVED')
  assert.deepEqual(review.dismissed.map((d) => [d.story, d.reason]), [['EP-002-S01', 'EP-001-S01 declared and ordered in the approved story map']])
  const stories = await readFile(join(backlogDir(cwd), 'plans', 'stories-EP-002.md'), 'utf8')
  assert.match(stories, /- dépendances : planifiées dans la carte approuvée, construites avant — EP-001-S01 \(EP-001, M1\)/)
})

test('a dependency the map lacks holds the story with an after proposal for the map, without a writer', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'planning-dor-lens': async ({ prompt }) => (/epic EP-001/.test(prompt)
      ? 'lens: planning-dor\nverdict: fail\ndefects:\n  - id: D1\n    gate: G8\n    severity: high\n    story: "EP-001-S03"\n    location: "EP-001-S03 — Missing Dependencies"\n    description: "La story consomme le motif de refus produit par EP-001-S02, mais cette dépendance n\'est pas déclarée."\n    suggestion: "Déclarer EP-001-S02"'
      : 'lens: planning-dor\nverdict: pass\ndefects: []'),
  })
  const { result, runs } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true } })
  assert.equal(result.status, 'published')
  assert.match(result.notReady['EP-001-S03'][0], /^SLICE : planning-dor constate que EP-001-S03 s'appuie sur EP-001-S02, que son `after` n'ordonne pas — ajouter EP-001-S02 à son `after` dans story-map\.json/)
  assert.ok(!runs[0].calls.some((c) => c.label === 'write EP-001-S03 · attempt 2'), 'the writer cannot change the map')
  const proposals = JSON.parse(await readFile(join(backlogDir(cwd), 'slice-proposals.json'), 'utf8'))
  assert.deepEqual(proposals.proposals.map((p) => [p.story, p.after, p.proposed]), [['EP-001-S03', ['EP-001-S01'], ['EP-001-S01', 'EP-001-S02']]])
})

test('stories/ is a directory before the writers start, and the files no step plans are removed', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await writeJson(join(backlogDir(cwd), 'story-map.json'), storyMap())
  await writeFile(join(backlogDir(cwd), 'stories'), '', 'utf8')
  await writeFile(join(backlogDir(cwd), 'dirtest'), '', 'utf8')
  const agents = scriptedAgents({
    'story-writer': async (call) => {
      const id = /Write story (\S+)/.exec(call.prompt)[1]
      await writeFile(join(backlogDir(cwd), 'stories', `probe-${id}.json`), '{', 'utf8')
      await writeJson(join(backlogDir(cwd), `${id}.json`), {})
      await writeJson(outputOf(call.prompt), storyFile(plannedOf(id)))
      return 'written'
    },
  })
  const simulated = simulatedContext({ args: { ...ARGS, approve: true }, agents })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  const { readdir } = await import('node:fs/promises')
  assert.deepEqual((await readdir(join(backlogDir(cwd), 'stories'))).sort(), ['EP-001-S01.json', 'EP-001-S02.json', 'EP-001-S03.json', 'EP-002-S01.json'])
  const root = (await readdir(backlogDir(cwd))).sort()
  assert.deepEqual(root.filter((n) => !n.includes('.stray-')), ['corrections.json', 'inventory.json', 'plan.json', 'plans', 'progress.json', 'reviews', 'stories', 'story-map.json', 'story-map.md'])
  assert.deepEqual(root.filter((n) => n.includes('.stray-')).map((n) => n.replace(/-[\dT-]+Z$/, '')), ['stories.stray'], 'the file in the way is kept aside, not deleted')
  assert.ok(simulated.logs.some((l) => /stories was a file: moved to .*stories\.stray-.*, created as a directory/.test(l)))
  assert.ok(simulated.logs.some((l) => /removed 8 file\(s\) no step plans: .*probe-EP-001-S01\.json/.test(l)), simulated.logs.join('\n'))
})

test('when one check refuses most first drafts, the run stops before any retry and names the cause', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({ 'story-writer': writerAs((file) => ({ ...file, technicalNotes: [] })) })
  const simulated = simulatedContext({ args: { ...ARGS, approve: true }, agents })
  const result = await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  assert.equal(result.status, 'blocked')
  assert.equal(result.phase, 'ELABORATE')
  assert.match(result.reason, /4 of 4 first drafts fail the same check \(technical-notes-empty\)/)
  assert.match(result.problems[0], /^technical-notes-empty: DoR 7: technicalNotes is empty/)
  assert.deepEqual(simulated.calls.map((c) => c.label).filter((l) => l.startsWith('write')).map((l) => l.split(' · ')[1]), ['attempt 1', 'attempt 1', 'attempt 1', 'attempt 1'])
  assert.ok(!simulated.calls.some((c) => /planning-/.test(c.label)), 'no lens runs')
})

test('a new run starts from the story map, the story files that pass and the approvals of unchanged files', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await runUntil({ cwd, github: fakeGitHub(), args: { ...ARGS, approve: true }, approveHandoff: false })
  const again = simulatedContext({ args: { ...ARGS, approve: true } })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), again)
  assert.ok(!again.calls.some((c) => /^(slice|write) /.test(c.label)), again.calls.map((c) => c.label).join('\n'))
  assert.deepEqual(again.calls, [], 'an approved story whose file did not change is not reviewed again')
  const kept = JSON.parse(await readFile(join(backlogDir(cwd), 'reviews', 'EP-001', 'stories.json'), 'utf8'))
  assert.deepEqual(Object.values(kept).map((v) => v.verdict), ['APPROVED', 'APPROVED', 'APPROVED'])
  const story = JSON.parse(await readFile(join(backlogDir(cwd), 'stories', 'EP-001-S02.json'), 'utf8'))
  story.title = 'Être refusé avant 18 ans, motif affiché'
  await writeJson(join(backlogDir(cwd), 'stories', 'EP-001-S02.json'), story)
  const changed = simulatedContext({ args: { ...ARGS, approve: true } })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), changed)
  assert.ok(changed.calls.some((c) => c.label === 'EP-001 · planning-dor · attempt 1'), 'a changed file is reviewed again')
  assert.match(changed.calls.find((c) => c.label === 'EP-001 · planning-dor · attempt 1').prompt, /Judge only EP-001-S02/)
  await readFile(join(backlogDir(cwd), 'reviews', 'EP-001', 'discuss-review-2.json'), 'utf8')
  assert.ok(again.logs.some((l) => /story-map\.json passes the checks: reused/.test(l)))
})

test('a French PRD: briefs ask for French, the lens inputs and the reasons a human reads are in French', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const agents = scriptedAgents({
    'planning-invest-lens': async ({ prompt }) => (/epic EP-001/.test(prompt)
      ? 'lens: planning-invest\nverdict: fail\ndefects:\n  - id: D1\n    gate: G1\n    severity: blocker\n    story: "EP-001-S03"\n    location: "EP-001-S03"\n    description: "Porteuse de valeur : conserver la décision ne montre rien au conducteur"\n    suggestion: "afficher la décision"'
      : 'lens: planning-invest\nverdict: pass\ndefects: []'),
  })
  const { runs, result } = await runUntil({ cwd, github: fakeGitHub(), agents, args: { ...ARGS, approve: true }, approveHandoff: false })
  const calls = runs[0].calls
  for (const label of ['write EP-001-S01 · attempt 1', 'EP-001 · planning-invest · attempt 1', 'EP-001 · planning-dor · attempt 1']) {
    const prompt = calls.find((c) => c.label === label).prompt
    assert.match(prompt, /Write every text a human reads in French, the language of the PRD, even though the skills are in English; never translate ids, YAML or JSON keys/, label)
  }
  assert.match(calls.find((c) => c.label === 'EP-001 · planning-ac-quality · attempt 1').prompt, /Write `description`, `location` and `suggestion` in French/)
  const stories = await readFile(join(backlogDir(cwd), 'plans', 'stories-EP-001.md'), 'utf8')
  for (const text of ['## Synthèse des jalons', '## Plan de sprint', 'Capacité : 7 points.', "- story: En tant que conducteur de moins de 18 ans, je veux être refusé avant 18 ans, afin de je sache où en est ma demande", "- critères d'acceptation: 3", '- dor: vérifiée', '| Story | MoSCoW | Points | Milestone | depends_on |']) {
    assert.ok(stories.includes(text), text)
  }
  assert.doesNotMatch(stories, /Milestone summary|Sprint plan|As a |acceptance criteria|built first/)
  const draft = await readFile(join(backlogDir(cwd), 'plans', 'ac-draft-EP-001-S02.md'), 'utf8')
  assert.match(draft, /\*\*En tant que\*\* conducteur de moins de 18 ans,\n\*\*je veux\*\*/)
  assert.match(draft, /### Critères d'acceptation\n\n\*\*AC-01:\*\* Cas 1 \(depuis EX-1\)\nÉtant donné /)
  assert.doesNotMatch(draft, /\nGiven |\nWhen |\nThen |### Technical Notes/)
  assert.equal(result.status, 'waiting-review')
  const plan = JSON.parse(await readFile(join(backlogDir(cwd), 'plan.json'), 'utf8'))
  assert.deepEqual(plan.notReady['EP-001-S03'], ['Porteuse de valeur : conserver la décision ne montre rien au conducteur'], 'what the canvas shows')
  const log = await readFile(join(cwd, '.copilot-tracking', 'github-issues', 'prds', 'eligibilite', 'artifact-analysis.md'), 'utf8')
  assert.match(log, /\* EP-001-S03: Porteuse de valeur/)
})

test('an English PRD keeps the English lens inputs and reasons', async () => {
  const { renderStoriesFile, say } = await import('../../../plugins/skraft-backlog/prd-backlog/render.mjs')
  const { lensBrief, LENSES } = await import('../../../plugins/skraft-backlog/prd-backlog/briefs.mjs')
  const map = storyMap()
  const text = renderStoriesFile(map.epics[1], map, new Map([['EP-002-S01', storyFile({ ...map.epics[1].stories[0], epic: 'EP-002' })]]), 'en')
  assert.match(text, /## Milestone summary[\s\S]*## Sprint plan[\s\S]*- dependencies: planned in the approved story map, built first — EP-001-S01 \(EP-001, M1\)/)
  assert.equal(say('en', 'heldBehind', { blocker: 'EP-001-S01' }), 'waits on EP-001-S01, which is held back')
  assert.match(lensBrief({ lens: LENSES[0], epic: 'EP-001', stories: 's.md', drafts: [], attempt: 1, language: 'en' }), /Write `description`, `location` and `suggestion` in English/)
})

test('every agent whose brief names an output finds its directory created before it runs', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { stat, rm, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  const checked = []
  const base = scriptedAgents()
  const agents = async (call) => {
    const output = outputOf(call.prompt)
    if (output) {
      assert.ok((await stat(dirname(output))).isDirectory(), `${call.label}: ${dirname(output)} exists`)
      checked.push(call.label)
    }
    return base(call)
  }
  await mkdir(backlogDir(cwd), { recursive: true })
  await writeFile(join(backlogDir(cwd), 'stories'), 'not a directory', 'utf8')
  const simulated = simulatedContext({ args: { ...ARGS, approve: true }, agents })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), simulated)
  assert.ok(checked.includes('slice · attempt 1') && checked.includes('write EP-001-S01 · attempt 1'), checked.join(', '))
  await rm(backlogDir(cwd), { recursive: true, force: true })
})

test('while the run works, progress.json and the canvas show each story where it stands; findings on a rewritten file no longer count', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const seen = {}
  const canvasNow = async () => assessBacklog((/** @type {any} */ (await loadBacklog(cwd, 'eligibilite'))).raw)
  const agents = scriptedAgents({
    'story-writer': writerAs((file, id, n) => (n > 1 ? { ...file, description: `${file.description} Motif cité.` } : file)),
    'planning-invest-lens': async ({ prompt, attempt: n }) => {
      if (/epic EP-001/.test(prompt) && n === 2) {
        const canvas = await canvasNow()
        const s03 = canvas.stories.find((s) => s.id === 'EP-001-S03')
        seen.round2 = { run: canvas.run, progress: s03.progress, stale: s03.staleFindings, lens: s03.findings.length }
      }
      return /epic EP-001/.test(prompt) && n === 1
        ? 'lens: planning-invest\nverdict: fail\ndefects:\n  - id: D1\n    gate: G1\n    severity: high\n    story: "EP-001-S03"\n    location: "EP-001-S03"\n    description: "Testable : la décision ne cite pas le motif"\n    suggestion: "citer le motif"'
        : 'lens: planning-invest\nverdict: pass\ndefects: []'
    },
  })
  const wrapped = async (call) => {
    if (call.label === 'write EP-001-S03 · attempt 2') {
      const progress = JSON.parse(await readFile(join(backlogDir(cwd), 'progress.json'), 'utf8'))
      seen.rewrite = { phase: progress.run.phase, status: progress.run.status, s03: progress.stories['EP-001-S03'].step, s01: progress.stories['EP-001-S01'].step }
    }
    return agents(call)
  }
  const first = simulatedContext({ args: { ...ARGS, approve: true }, agents: wrapped })
  await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), first)
  assert.deepEqual(seen.rewrite, { phase: 'REVIEW', status: 'running', s03: 'writing', s01: 'approved' })
  assert.deepEqual(seen.round2.progress.step, 'reviewing')
  assert.equal(seen.round2.run.status, 'running')
  assert.deepEqual([seen.round2.stale, seen.round2.lens], [1, 0], 'the round-1 finding was made on the old file: it no longer counts')
  const progress = JSON.parse(await readFile(join(backlogDir(cwd), 'progress.json'), 'utf8'))
  assert.deepEqual([progress.run.status, progress.run.detail, progress.run.phase], ['paused', 'handoff-reviewed', 'HANDOFF'])
  assert.deepEqual(Object.values(progress.stories).map((s) => s.step), ['approved', 'approved', 'approved', 'approved'])
  const review = JSON.parse(await readFile(join(backlogDir(cwd), 'reviews', 'EP-001', 'discuss-review-1.json'), 'utf8'))
  assert.deepEqual(Object.keys(review.fingerprints).sort(), ['EP-001-S01', 'EP-001-S02', 'EP-001-S03'])
})

test('framing in the canvas: before any story map, the questions are listed and answered, then the slicer cuts with them', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { createController } = await import('../../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs')
  const agents = scriptedAgents({
    'backlog-slicer': async (call) => {
      if (call.label !== 'frame') return scriptedAgents()(call)
      await writeJson(outputOf(call.prompt), { questions: [{ question: 'Le refus avant 18 ans est-il dans le MVP ?', why: 'il change le tracer', options: ['oui', 'non'], recommended: 0 }] })
      return '1 question'
    },
  })
  const first = simulatedContext({ args: ARGS, agents })
  assert.deepEqual(await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), first), { paused: 'framing-answered' })
  assert.deepEqual(first.phases.slice(0, 3), ['INVENTORY', 'SLICE', 'FRAME'])

  const controller = createController({ cwd, gh: fakeGitHub().run, now: () => new Date(NOW()) })
  t.after(() => controller.stop())
  await controller.reload()
  const act = (name, input) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
  const listed = await act('list_framing', {})
  assert.deepEqual(listed.questions.map((q) => [q.id, q.source]), [['milestones', 'prd'], ['nfr', 'prd'], ['slicer-1', 'slicer']])
  assert.equal(listed.open, 3)
  await act('answer_framing', { id: 'slicer-1', text: 'non' })
  await assert.rejects(act('answer_framing', { id: 'nope', text: 'x' }), /nope is no framing question/)
  assert.equal((await act('list_framing', {})).open, 2)

  const resumed = simulatedContext({ args: ARGS, agents, journal: first.journal, resumed: new Set(['framing-answered']) })
  assert.deepEqual(await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: NOW, gh: fakeGitHub().run }), resumed), { paused: 'story-map-approved' })
  assert.deepEqual(resumed.calls.map((c) => c.label), ['slice · attempt 1'], 'the framing agent is not asked twice')
  assert.match(resumed.calls[0].prompt, /- Le refus avant 18 ans est-il dans le MVP \? → non\n/)
  await assert.rejects(readFile(join(backlogDir(cwd), 'framing-questions.json'), 'utf8'), { code: 'ENOENT' })
})

test('epic by epic: once EP-001 is reviewed it can be reviewed and created in the canvas while EP-002 is still in review', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { createController } = await import('../../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs')
  const github = fakeGitHub()
  const seen = {}
  const planHas = async (id) => {
    for (let i = 0; i < 200; i += 1) {
      const plan = await readFile(join(backlogDir(cwd), 'plan.json'), 'utf8').then(JSON.parse).catch(() => null)
      if (plan?.issues.some((issue) => issue.id === id)) return plan
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error(`${id} never reached plan.json`)
  }
  const agents = scriptedAgents({
    'planning-dor-lens': async ({ prompt }) => {
      if (/epic EP-002/.test(prompt) && !seen.created) {
        const plan = await planHas('EP-001-S03')
        seen.heldWhileRunning = plan.notReady['EP-002-S01']
        const controller = createController({ cwd, gh: github.run, now: () => new Date(NOW()) })
        await controller.reload()
        const act = (name, input) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
        await assert.rejects(act('preview_epic', { epic: 'EP-001' }), /no reviewed ready story/)
        await assert.rejects(act('review_epic', { epic: 'EP-404' }), /: epic names no epic of this backlog$/)
        assert.deepEqual((await act('review_epic', { epic: 'EP-001' })).reviewed, ['EP-001-S01', 'EP-001-S02', 'EP-001-S03'])
        const preview = await act('preview_epic', { epic: 'EP-001' })
        assert.equal(preview.status, 'simulated')
        seen.created = await act('create_issues', {})
        controller.stop()
      }
      return 'lens: planning-dor\nverdict: pass\ndefects: []'
    },
  })
  const { result } = await runUntil({ cwd, github, agents, args: { ...ARGS, approve: true } })
  assert.deepEqual(seen.heldWhileRunning, ["son épic est en cours d'élaboration"])
  assert.deepEqual(seen.created.issues.map((i) => i.id), ['EP-001', 'EP-001-S01', 'EP-001-S02', 'EP-001-S03'])
  assert.equal(result.status, 'published')
  assert.equal(github.state.issues.length, 6, 'the final publication creates only EP-002 and its story; nothing twice')
})
