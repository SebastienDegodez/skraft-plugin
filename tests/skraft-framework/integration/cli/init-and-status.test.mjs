import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli, USAGE } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { actsAs, simulatedContext } from '../copilot-workflow/simulated-host.mjs'
import { NOMINAL, SLUG, blocked, briefOf, commit, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { journal } from '../support/workspace.mjs'
import { ISSUE, issueFile, repositoryOnForge } from '../support/issue-forge.mjs'
import { fillsItsOutputs, scriptedModHost, stops } from '../claude-mod/support/scripted-mod-host.mjs'

const pluginRoot = fileURLToPath(new URL('../../../../plugins/skraft-framework/', import.meta.url))
const cli = join(pluginRoot, 'engine', 'drivers', 'cli', 'skraft.mjs')

const workingCopy = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-cli-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  t.after(() => rmSync(`${dir}-home`, { recursive: true, force: true }))
  return dir
}

const inProcess = async (cwd, args) => {
  const lines = { out: [], err: [] }
  const code = await runCli(args, {
    pluginVersion: () => '9.9.9',
    workingCopyName: () => 'shop',
    adapters: () => createNodeAdapters({ cwd, pluginRoot, home: `${cwd}-home` }),
    confirm: async () => true,
  }, { out: (line) => lines.out.push(line), err: (line) => lines.err.push(line) })
  return { code, ...lines }
}

const tracking = (cwd, ...parts) => join(cwd, '.copilot-tracking', 'skraft-plans', ...parts)
const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH']

test('skraft init makes the slug the active pipeline and opens its journal with the story it was given, its issue read from the forge; a number the forge has no issue of starts nothing', async (t) => {
  const cwd = workingCopy(t)
  const payout = { number: 120, title: 'Pay out', url: 'https://github.example.com/acme/payment/issues/120', body: 'Pay the merchant.' }
  repositoryOnForge(t, cwd, { issues: [ISSUE, payout] })
  const started = (slug) => JSON.parse(readFileSync(tracking(cwd, slug, 'events.jsonl'), 'utf8').split('\n')[0])

  const run = await inProcess(cwd, ['init', 'checkout', '--issue', '42', '--title', 'Pay by card'])

  assert.deepEqual(run, { code: 0, out: ['checkout is the active pipeline'], err: [] })
  assert.equal(readFileSync(tracking(cwd, '.active-slug'), 'utf8'), 'checkout\n')
  const { type, slug, story, prev, artifacts, at } = started('checkout')
  assert.deepEqual([type, slug, story, prev, artifacts], ['run.started', 'checkout', { issue: 42, title: 'Pay by card' }, null, [issueFile(at.slice(0, 10))]])
  assert.equal(readFileSync(tracking(cwd, 'checkout', ...artifacts[0].split('/')), 'utf8'), `# Issue #42: ${ISSUE.title}\n\n${ISSUE.url}\n\n${ISSUE.body}\n`)

  await inProcess(cwd, ['init', 'refund', '--title', 'Refund a card'])
  await inProcess(cwd, ['init', 'payout', '--issue', '120'])
  assert.deepEqual(await inProcess(cwd, ['init', 'chargeback', '--issue', '121']), { code: 1, out: [], err: ["the forge has no issue #121; start the run with the number of the story's issue"] })
  await inProcess(cwd, ['init', 'settle'])
  assert.deepEqual(['refund', 'payout', 'settle'].map((name) => started(name).story), [{ issue: null, title: 'Refund a card' }, { issue: 120, title: null }, null])
  assert.deepEqual(started('payout').artifacts, [issueFile(started('payout').at.slice(0, 10), 120)])
  assert.equal(existsSync(tracking(cwd, 'chargeback', 'events.jsonl')), false)
})

test('skraft init on a working copy with no remote starts the run from its issue anyway, says the body was not read, and journals why', async (t) => {
  const cwd = workingCopy(t)
  const reason = 'the working copy has no Git remote whose URL names a host and a repository'

  const run = await inProcess(cwd, ['init', 'checkout', '--issue', '42', '--title', 'Pay by card'])

  assert.deepEqual(run, { code: 0, out: [`checkout is the active pipeline; the body of issue #42 was not read (${reason}): its agents get its number and title only`], err: [] })
  const [started] = journal(cwd, 'checkout')
  assert.deepEqual([started.story, started.artifacts, started.issueUnread], [{ issue: 42, title: 'Pay by card' }, [], reason])
})

test('skraft init refuses a slug that is not kebab-case, or a malformed option, and changes nothing', async (t) => {
  const cwd = workingCopy(t)

  assert.deepEqual(await inProcess(cwd, ['init', 'Check Out']), { code: 1, out: [], err: ['slug must be kebab-case: lowercase letters and digits, joined by single hyphens'] })
  for (const issue of ['x', 'a1', '1a', '0']) assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--issue', issue]), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--title', '--issue']), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--owner', 'me']), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--base']), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--title', 'a', '--title', 'b']), { code: 2, out: [], err: [USAGE] })
  assert.equal(existsSync(tracking(cwd)), false)
})

test('skraft init without a slug refuses an invalid skraft-config.json and leaves it as it was', async (t) => {
  const cwd = workingCopy(t)
  writeFileSync(join(cwd, 'skraft-config.json'), '{"components": {}}')

  assert.deepEqual(await inProcess(cwd, ['init']), { code: 1, out: [], err: ['skraft-config.json is invalid: components must be an array'] })
  assert.equal(readFileSync(join(cwd, 'skraft-config.json'), 'utf8'), '{"components": {}}')
})

test('skraft status prints the view of the active pipeline, as text or JSON', async (t) => {
  const cwd = workingCopy(t)
  assert.deepEqual(await inProcess(cwd, ['status']), {
    code: 0,
    out: ['skraft: idle', ...PHASES.map((phase) => `${phase}  pending`), 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'],
    err: [],
  })

  await inProcess(cwd, ['init', 'checkout'])
  const json = await inProcess(cwd, ['status', '--json'])
  assert.equal(json.code, 0)
  const { graph, ...view } = JSON.parse(json.out.join('\n'))
  assert.deepEqual(view, {
    slug: 'checkout', status: 'running', reason: '', phases: PHASES.map((phase) => ({ phase, state: 'pending' })), current: null, question: null, attempts: 0, costUsd: null, reviews: [], gates: [],
  })
  assert.deepEqual([graph.nodes.length, graph.edges.length, graph.nodes[2]], [17, 23, {
    id: 'research', kind: 'agent', phase: 'RESEARCH', what: 'solution-researcher', state: 'pending', outcome: null, visits: 0, attempts: 0, retries: 0, durationMs: 0, costUsd: null,
  }])
  assert.deepEqual((await inProcess(cwd, ['status'])).out, ['skraft checkout: running', ...PHASES.map((phase) => `${phase}  pending`)])
})

test('skraft report prints the time, cost and retries of each step of the active pipeline, as text or JSON; tampered, it exits 1', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('stop after the research')] } })
  await assert.rejects(runSkraftPipelineWorkflow(simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) }).ctx, { cwd, pluginRoot, home: `${cwd}-home` }), { message: 'paused at design-1' })

  const text = await inProcess(cwd, ['report'])
  assert.equal(text.code, 0)
  assert.deepEqual(text.out.slice(0, 3), [`skraft ${SLUG}: waiting`, '| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |'])
  assert.match(text.out.at(-2), /^\| Total \| \| \| \d+ \| 0 \| \d+ s \| - \| \|$/)
  assert.equal(text.out.at(-1), `design is blocked: solution-architect says it cannot go on; its reason is in ${tracking(cwd, SLUG, 'results', 'design-1-1.json')}. An instruction runs design again on a new pass with it; STOP ends the run.`)
  const json = JSON.parse((await inProcess(cwd, ['report', '--json'])).out.join('\n'))
  assert.deepEqual(json.steps.find((step) => step.step === 'design'), { step: 'design', phase: 'DESIGN', visits: 1, attempts: 1, retries: 0, durationMs: json.steps.find((step) => step.step === 'design').durationMs, costUsd: null, outcome: 'failed' })
  assert.deepEqual(await inProcess(cwd, ['report', '--all']), { code: 2, out: [], err: [USAGE] })

  const events = tracking(cwd, SLUG, 'events.jsonl')
  writeFileSync(events, readFileSync(events, 'utf8').replace('"prev":null', '"prev":"0"'))
  const tampered = await inProcess(cwd, ['report'])
  assert.deepEqual([tampered.code, tampered.out[0]], [1, `skraft ${SLUG}: tampered`])
})

test('skraft report of a working copy with no active pipeline, or of a run that has not started a step, prints no table', async (t) => {
  const cwd = workingCopy(t)
  assert.deepEqual(await inProcess(cwd, ['report']), { code: 0, out: ['skraft: idle', 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'], err: [] })
  await inProcess(cwd, ['init', 'checkout'])
  assert.deepEqual(await inProcess(cwd, ['report']), { code: 0, out: ['skraft checkout: running'], err: [] })
})

test('skraft publish opens the pull request of a completed run only, and says why it does not', async (t) => {
  const cwd = workingCopy(t)
  assert.deepEqual(await inProcess(cwd, ['publish']), { code: 1, out: [], err: ['no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'] })

  await inProcess(cwd, ['init', 'checkout'])
  assert.deepEqual(await inProcess(cwd, ['publish']), { code: 1, out: [], err: ['checkout has not completed; skraft publish opens the pull request of a completed run'] })
  assert.deepEqual(await inProcess(cwd, ['publish', '--draft']), { code: 2, out: [], err: [USAGE] })
})

test('skraft status shows the cost a Claude Code run journaled as approximate', async (t) => {
  const mod = await scriptedModHost({ behaviours: [fillsItsOutputs(), stops()], turnCostUsd: 0.21 })
  t.after(() => mod.cleanup())
  await mod.command('checkout')
  await mod.settled()

  const status = await inProcess(mod.root, ['status'])

  assert.ok(status.out.includes('cost: ~$0.42'), status.out.join('\n'))
})

test('skraft status says the journal is tampered and exits 1', async (t) => {
  const cwd = workingCopy(t)
  await inProcess(cwd, ['init', 'checkout'])
  const journal = tracking(cwd, 'checkout', 'events.jsonl')
  writeFileSync(journal, readFileSync(journal, 'utf8').replace('"prev":null', '"prev":"0"'))

  const run = await inProcess(cwd, ['status'])

  assert.equal(run.code, 1)
  assert.deepEqual(run.out.slice(0, 1), ['skraft checkout: tampered'])
  assert.equal(run.out.at(-1), 'journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug')
})

test('the skraft executable runs init and status from the working directory', (t) => {
  const cwd = workingCopy(t)
  const skraft = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: `${cwd}-home`, USERPROFILE: `${cwd}-home` } })

  const init = skraft('init', 'checkout')
  assert.equal(init.status, 0, init.stderr)
  assert.equal(init.stdout, 'checkout is the active pipeline\n')
  assert.equal(skraft('status').stdout, `skraft checkout: running\n${PHASES.map((phase) => `${phase}  pending\n`).join('')}`)
})

test('skraft init <slug> --from-artifacts skips RESEARCH, and the run then starts with the architect reading the stories', async (t) => {
  const { cwd } = pipelineRepository(t)
  const stories = tracking(cwd, SLUG, 'plans', '2026-10-01', 'stories-v1.md')
  mkdirSync(join(stories, '..'), { recursive: true })
  writeFileSync(stories, '# Stories\n\n- Pay by card\n')

  assert.deepEqual(await inProcess(cwd, ['init', SLUG, '--from-artifacts', '--issue', '42']), { code: 0, out: [`${SLUG} is the active pipeline`], err: [] })
  assert.deepEqual(journal(cwd, SLUG).map(({ type, phase, skipped }) => [type, phase ?? null, skipped ?? null]), [['run.started', null, null], ['phase.closed', 'RESEARCH', 'from-artifacts']])
  assert.deepEqual(journal(cwd, SLUG)[0].artifacts, ['plans/2026-10-01/stories-v1.md'])
  assert.deepEqual((await inProcess(cwd, ['status'])).out, [`skraft ${SLUG}: running`, 'RESEARCH  closed', 'DESIGN  pending', 'DISTILL  pending', 'DELIVER  pending', 'PUBLISH  pending'])

  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('stop after reading the stories')] } })
  const { ctx, calls } = simulatedContext({ otherwise: actsAs(llm) })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot, home: `${cwd}-home` }), { message: 'paused at design-1' })

  assert.deepEqual(calls.map(({ agent, label }) => `${agent} | ${label}`), [`skraft:solution-architect | skraft ${SLUG} · design · attempt 1`])
  const scan = tracking(cwd, SLUG, 'details', new Date().toISOString().slice(0, 10), 'structural-scan.json')
  assert.ok(calls[0].prompt.includes(`- Read first:\n- ${stories}\n- ${scan}\n`), calls[0].prompt)
  assert.deepEqual(briefOf(calls[0].prompt).inputs, [stories, scan])
  assert.ok(calls[0].prompt.includes('- Story: #42'))
})

test('skraft init --from-artifacts is refused without DISCUSS stories, and on a slug already started', async (t) => {
  const cwd = workingCopy(t)

  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--from-artifacts']), { code: 1, out: [], err: ['checkout has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from'] })
  assert.equal(existsSync(tracking(cwd, '.active-slug')), false)
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--from-artifacts', '--from-artifacts']), { code: 2, out: [], err: [USAGE] })

  await inProcess(cwd, ['init', 'checkout'])
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--from-artifacts']), { code: 1, out: [], err: ['checkout already has a journal; resume it without --from-artifacts'] })
})

test('skraft status names the gate node a waiting run stands on, as the pane does, and how to answer its question', async (t) => {
  const { cwd } = pipelineRepository(t)
  // The engineer leaves a test command the machine reports as not found (exit 127): the gates stop the run, their node open.
  const breaksTheTests = (brief, repository) => {
    NOMINAL['software-engineer'](brief, repository)
    commit(cwd, `chore(${SLUG}): hand the tests to a missing tool`, { 'tests/unit/check.mjs': 'process.exit(127)\n' })
  }
  const llm = scriptedLlm({ cwd, acts: { 'software-engineer': [breaksTheTests] } })
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot, home: `${cwd}-home` }), { message: 'paused at adr-1' })
  assert.deepEqual((await inProcess(cwd, ['status'])).out.slice(-3, -1), ['question: adr-ratification (adr)', 'answer: skraft decide adr-1 RATIFIED|REJECTED (--reason <text> with REJECTED)'])
  assert.deepEqual(await inProcess(cwd, ['decide', 'RATIFIED']), { code: 0, out: [`${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on`], err: [] })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot, home: `${cwd}-home` }), { message: 'paused at gates-1' })

  const status = await inProcess(cwd, ['status'])

  assert.equal(status.code, 0)
  assert.deepEqual(status.out.slice(0, -1), [
    `skraft ${SLUG}: waiting`, 'RESEARCH  closed', 'DESIGN  closed', 'DISTILL  closed', 'DELIVER  open', 'PUBLISH  pending',
    'gates: build, format, lint, test, architecture, coverage (gates)',
    'answer: skraft decide gates-1 RETRY|ABORT',
  ])
  assert.match(status.out.at(-1), /^gates cannot run on this machine: app\/test: exited 127 \(evidence: .+test-1\.log\)\. Fix it, then RETRY; or ABORT the run\.$/)
  assert.deepEqual(JSON.parse((await inProcess(cwd, ['status', '--json'])).out.join('\n')).current, {
    step: 'gates', phase: 'DELIVER', agent: null, gates: ['build', 'format', 'lint', 'test', 'architecture', 'coverage'], question: null, visit: 1, attempt: 1,
  })
  const refused = await inProcess(cwd, ['decide', 'gates-1', 'LATER'])
  assert.deepEqual(refused, { code: 1, out: [], err: ['the answer must be one of RETRY, ABORT'] })
  assert.equal((await inProcess(cwd, ['decide', 'a', 'b', 'c'])).code, 2)
  assert.deepEqual((await inProcess(cwd, ['decide', 'ABORT', '--reason', 'no time'])).code, 0)
})
