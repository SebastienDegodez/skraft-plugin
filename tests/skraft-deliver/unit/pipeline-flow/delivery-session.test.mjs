import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, pipelineHost } from '../support/pipeline-host.mjs'
import { lightDesigner } from '../support/light-designer.mjs'
import { createDeliveryRun } from '../../../../plugins/skraft-deliver/engine/application/architecture/delivery-run.mjs'
import { createAgentLoop } from '../../../../plugins/skraft-deliver/engine/drivers/cli/agent-loop.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-deliver/engine/application/pipeline/run-pipeline-usecase.mjs'
import { createDecide } from '../../../../plugins/skraft-deliver/engine/application/decisions/decide-usecase.mjs'
import { createHash, createHmac } from 'node:crypto'

const session = (options = {}) => {
  const host = pipelineHost({ slug: 'issue-42', ...options })
  const branches = []
  // The brief's fingerprint is a SHA-256 of the issue body, as on a developer machine.
  const hasher = { sha256: async (text) => createHash('sha256').update(text).digest('hex'), hmacSha256: async (key, text) => createHmac('sha256', key).update(text).digest('hex') }
  const deps = { ...host.deps, hasher, architectureForge: { read: async () => ({ ok: true, issue: {
    number: 42, title: 'Checkout', body: 'AC-1: receipt visible.', story: true, forge: 'github', repository: 'shop/checkout',
  } }) }, architectureRepository: {
    branch: async (request) => { branches.push(request); return { ok: true } },
    snapshot: async () => ({ ok: true, sha: 'merged-sha', paths: [] }), unmerged: async () => ({ ok: true, found: false }), concurrent: async () => ({ ok: true, branches: [] }),
  } }
  const run = createDeliveryRun(deps)
  return { host, deps, branches, run }
}

test('no architecture starts with a light design before DISTILL, never RESEARCH, and resumes pending work', async () => {
  const { host, deps, branches, run } = session()
  const started = await run.start({ issue: 42 })
  assert.equal(started.status, 'ready', started.reason)
  assert.match(started.notice, /No architecture brief found for this story\. A light design writes one before DISTILL\./)
  const loop = createAgentLoop({ adapters: deps, log: () => {}, then: { next: 'next', record: 'record', review: () => 'review' } })
  const step = await loop.next()
  assert.equal(step.status, 'dispatch', step.reason)
  assert.deepEqual(step.dispatches.map(({ agent }) => agent), ['deliver-light-designer'])
  assert.equal((await run.prepare()).status, 'ready')
  assert.equal((await loop.next()).code, 'not-recorded')
  assert.deepEqual(branches, [{ name: 'deliver/issue-42', existing: false }])
  assert.equal(host.events().some(({ phase }) => phase === 'RESEARCH'), false)
})

test('delivery retains human scenario approval, TDD, gates and final review before its local PR', async () => {
  const { host, deps, run } = session({ scenarioReviews: [null, { answer: 'APPROVED' }] })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(lightDesigner()(host), agent()(host), agent()(host))
  const first = await createRunPipeline(deps).run()
  assert.equal(first.status, 'waiting', first.reason)
  assert.equal(host.agentRunner.dispatches.some(({ agent }) => agent === 'deliver-software-engineer'), false)
  const finished = await createRunPipeline(deps).run()
  assert.equal(finished.status, 'done', finished.reason)
  assert.ok(host.agentRunner.dispatches.some(({ agent }) => agent === 'deliver-software-engineer'))
  const lenses = host.agentRunner.reviewed().map(({ agent }) => agent)
  assert.ok(lenses.includes('deliver-test-integrity-lens'), lenses.join(', '))
  // the gates run through skraft_deliver_repl; the DELIVER review's quality-gates lens judges them from the signed trace
  assert.ok(lenses.includes('deliver-quality-gates-lens'), lenses.join(', '))
  // Each lens reads the architecture context the delivery bound, here its light design.
  const lensBriefs = host.agentRunner.reviewed().filter(({ agent: id }) => id.endsWith('-lens'))
  assert.ok(lensBriefs.every(({ prompt }) => /architecture\/context\.json/.test(prompt) && /mode=light/.test(prompt)), lensBriefs.map(({ agent: id }) => id).join(', '))
  assert.ok(host.events().some(({ type, step, outcome }) => type === 'step.recorded' && step === 'publish' && outcome === 'local'))
})

const architectureSession = ({ changed = false, status = 'Accepted', options = {} } = {}) => {
  const context = session(options)
  const path = 'docs/architecture/stories/42-checkout.md'
  const adr = 'docs/adr/adr-001-checkout.md'
  const brief = { version: 1, issue: 42, forge: 'github', repository: 'shop/checkout',
    bodySha256: createHash('sha256').update(changed ? 'Earlier criteria.' : 'AC-1: receipt visible.').digest('hex'),
    components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [adr] }], adrs: [adr], documents: [] }
  const documents = new Map([[path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout`],
    [adr, `<!-- markdownlint-disable-file -->\n---\nstatus: ${status}\n---\n\n# Accepted checkout architecture`]])
  context.deps.architectureRepository.snapshot = async () => ({ ok: true, sha: 'merged-sha', paths: [...documents.keys()], read: async (name) => documents.get(name) ?? null })
  return { ...context, documents }
}

test('a merged brief and cited ADR reach the actual DISTILL dispatch and remain bound on resume', async () => {
  const { host, deps, run } = architectureSession()
  assert.equal((await run.start({ issue: 42 })).status, 'ready')
  const loop = createAgentLoop({ adapters: deps, log: () => {}, then: { next: 'next', record: 'record', review: () => 'review' } })
  const handoff = await loop.next()
  assert.equal(handoff.status, 'dispatch', handoff.reason)
  const architecture = host.events().find(({ type }) => type === 'architecture.bound').artifacts
  assert.equal(architecture.length, 3)
  assert.match(await host.tracking.read('issue-42', architecture[1]), /Accepted checkout architecture/)
  const prompt = await host.tracking.read('issue-42', handoff.dispatches[0].brief.slice(host.tracking.location('issue-42', '').length))
  assert.ok(architecture.every((path) => prompt.includes(path)), prompt)
  assert.match(prompt, /never substitute working-copy architecture/)
  const manifest = JSON.parse(await host.tracking.read('issue-42', architecture[2]))
  assert.equal(manifest.mode, 'merged')
  assert.equal(manifest.sha, 'merged-sha')
  assert.deepEqual(manifest.documents.map(({ source }) => source), ['docs/architecture/stories/42-checkout.md', 'docs/adr/adr-001-checkout.md'])
  deps.architectureRepository.snapshot = async () => { throw new Error('Already bound architecture must not be reread.') }
  assert.equal((await run.prepare()).status, 'ready')
})

test('changed architecture requires native KEEP before any DISTILL handoff', async () => {
  const { host, deps, run } = architectureSession({ changed: true })
  const waiting = await run.start({ issue: 42 })
  assert.equal(waiting.status, 'waiting', waiting.reason)
  assert.deepEqual(waiting.question.options, ['KEEP', 'REDESIGN'])
  assert.equal(host.agentRunner.dispatches.length, 0)
  assert.equal((await createDecide(deps).decide({ key: waiting.question.key, answer: 'KEEP' })).ok, true)
  assert.equal((await run.prepare()).status, 'ready')
  assert.equal(host.events().find(({ type }) => type === 'question.answered').by, 'decide')
})

test('REDESIGN pauses the delivery for a design: it accepts no brief, dispatches no worker and asks how to go on', async () => {
  const { host, deps, run } = architectureSession({ changed: true })
  const waiting = await run.start({ issue: 42 })
  await createDecide(deps).decide({ key: waiting.question.key, answer: 'REDESIGN' })
  assert.equal((await run.prepare()).status, 'ready')
  const paused = await createRunPipeline(deps).run()
  assert.equal(paused.code, 'architecture-wait', paused.reason)
  assert.match(paused.reason, /waits for a design: A person asked to design the story again: its issue changed since its brief\./)
  assert.deepEqual(host.human.questions.at(-1).options, ['RESUME', 'CONTINUE', 'STOP'])
  assert.equal(host.events().some(({ type }) => type === 'run.finished' || type === 'architecture.accepted'), false)
  assert.equal(host.agentRunner.dispatches.length, 0)
})

test('a brief whose ADR the merged base does not hold ratified, Proposed, Rejected or Superseded, pauses the delivery for a design before any dispatch', async () => {
  for (const status of ['Proposed', 'Rejected', 'Superseded']) {
    const { host, deps, run } = architectureSession({ status })
    const started = await run.start({ issue: 42 })
    assert.equal(started.status, 'ready', status)
    const paused = await createRunPipeline(deps).run()
    assert.equal(paused.code, 'architecture-wait', status)
    assert.match(paused.reason, /docs\/adr\/adr-001-checkout\.md is not Accepted on the merged base/, status)
    assert.equal(host.agentRunner.dispatches.length, 0, status)
  }
})

test('a delivered story\'s pull request retires its brief from the working branch in one engine commit, the documents it cites kept', async () => {
  const brief = 'docs/architecture/stories/42-checkout.md'
  const { host, deps, run } = architectureSession({ options: { scenarioReviews: [{ answer: 'APPROVED' }], files: { [brief]: '# merged brief\n', 'docs/adr/adr-001-checkout.md': '# adr\n' } } })
  assert.equal((await run.start({ issue: 42 })).status, 'ready')
  host.agentRunner.behaviours.push(agent()(host), agent()(host))
  const finished = await createRunPipeline(deps).run()
  assert.equal(finished.status, 'done', finished.reason)
  const retired = host.git.engineCommits.filter(({ message }) => message.startsWith('docs(issue-42): retire'))
  assert.deepEqual(retired.map(({ paths }) => paths), [[brief]])
  assert.equal(host.workspace.files.has(brief), false)
  assert.ok(host.workspace.files.has('docs/adr/adr-001-checkout.md'))
})

test('a delivery whose component has not decided on Gherkin is refused before any agent, naming the component', async () => {
  const { bdd, ...undecided } = API
  const { host, deps, run } = session({ components: [undecided] })
  await run.start({ issue: 42 })
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.code, 'configuration-incomplete', outcome.reason)
  assert.match(outcome.reason, /api: bdd is unanswered/)
  assert.equal(host.agentRunner.dispatches.length, 0)
})

test('a delivery waiting for a design goes on with a light design when a person answers CONTINUE', async () => {
  const { host, deps, run } = architectureSession({ status: 'Proposed', options: { answers: [{ answer: 'CONTINUE' }], scenarioReviews: [null] } })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(lightDesigner()(host), agent()(host))
  await createRunPipeline(deps).run()
  assert.deepEqual(host.agentRunner.dispatches.slice(0, 2).map(({ agent: id }) => id), ['deliver-light-designer', 'deliver-acceptance-designer'])
  assert.deepEqual(host.events().filter(({ type, step }) => type === 'step.recorded' && ['architecture_mode', 'design_wait'].includes(step)).map(({ step, answer, next }) => [step, answer, next]),
    [['architecture_mode', 'WAIT', 'design_wait'], ['design_wait', 'CONTINUE', 'light_design']])
})
