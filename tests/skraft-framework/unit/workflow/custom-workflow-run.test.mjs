import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentCatalog } from '../support/in-memory-host.mjs'
import { agent, nominal, pipelineHost, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { edit, WITH_SECURITY } from './support.mjs'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'

const repositoryWorkflow = (dot) => ({ config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': dot } })
const withSecurity = { ...repositoryWorkflow(WITH_SECURITY), catalog: new InMemoryAgentCatalog({ repository: ['acme-security-reviewer'] }) }

test('a repository agent between DESIGN and DISTILL is launched in its place, as a repository agent, whatever the order of the edges', async () => {
  const chain = '  start -> research -> design -> design_review\n'
  const around = '  design_review -> security [label="APPROVED"]\n  security -> distill\n'
  const last = '  deliver_review -> exit    [label="APPROVED"]\n'
  const edgesLast = edit(WITH_SECURITY, [chain, ''], [around, ''], [last, `${last}${around}${chain}`])
  const host = scripted({ ...withSecurity, ...repositoryWorkflow(edgesLast) }, (it) => {
    const [research, design, ...rest] = nominal(it)
    return [research, design, agent({ work: ({ git }) => git.change('docs/security/threat-model.md') })(it), ...rest]
  })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.agentRunner.dispatches.map(({ agent: id, source }) => `${id} ${source}`), [
    'solution-researcher plugin', 'solution-architect plugin', 'acme-security-reviewer repository', 'acceptance-designer plugin', 'software-engineer plugin',
  ])
  assert.equal(host.events()[0].workflow, 'skraft-workflow.dot')
  assert.deepEqual(host.events().filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  const security = host.agentRunner.dispatches[2]
  assert.equal(security.label, `skraft ${SLUG} · security · attempt 1`)
  assert.equal(security.prompt, [
    '## Skraft dispatch: acme-security-reviewer (DESIGN)',
    '- Story: none',
    `- Feature scope: ${SLUG}`,
    '- Attempt: 1 of 2',
    '- Read first:',
    `- ${TRACKING}/research/2026-10-11/${SLUG}-research.md`,
    `- ${TRACKING}/details/2026-10-11/context-map.md`,
    '- Fill each output in place; keep the path, create no other copy:',
    `- ${TRACKING}/security/2026-10-11/${SLUG}-review.md`,
    `- ${TRACKING}/notes.md`,
    `- Write your result as JSON to ${TRACKING}/results/security-1-1.json: {"status": "done" | "blocked", "summary": "<what you did, or why you cannot go on>"}`,
    '- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:',
    `- .copilot-tracking/skraft-plans/${SLUG}`,
    '- docs/security',
    '- src',
  ].join('\n'))
})

test('an agent node runs its agent on the model family the node names, and a review node gives its family to the lenses that name none', async () => {
  const families = edit(BUILT_IN_WORKFLOW,
    ['phase="RESEARCH", model="sonnet"]', 'phase="RESEARCH", model="haiku"]'],
    ['design_review [shape=component, lenses="consistency,architecture-compliance,fitness"]', 'design_review [shape=component, lenses="consistency,architecture-compliance@opus,fitness", model="sonnet"]'])
  const host = scripted(repositoryWorkflow(families), nominal)

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(host.agentRunner.dispatches.map(({ agent: id, model }) => `${id} ${model}`), [
    'solution-researcher haiku', 'solution-architect opus', 'acceptance-designer sonnet', 'software-engineer sonnet',
  ])
  assert.deepEqual(host.agentRunner.batches[0].map(({ agent: id, model }) => `${id} ${model}`), ['consistency-lens sonnet', 'architecture-compliance-lens opus', 'fitness-lens sonnet'])
  assert.deepEqual(host.agentRunner.batches[1].map(({ model }) => model), ['haiku', 'haiku', 'haiku', 'haiku'])

  const unnamed = edit(BUILT_IN_WORKFLOW, ['design   [shape=box, agent="solution-architect", phase="DESIGN", model="opus"]', 'design   [shape=box, agent="solution-architect", phase="DESIGN"]'])
  const own = scripted(repositoryWorkflow(unnamed), (it) => nominal(it).slice(0, 2))
  own.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'stop here' }))
  await own.start()
  assert.deepEqual(own.agentRunner.dispatches.map(({ agent: id, model }) => `${id} ${model}`), ['solution-researcher sonnet', 'solution-architect undefined', 'acceptance-designer sonnet'])
})

test('a repository agent leaving its outputs empty and writing outside its declared paths is refused for both, and stops at its own max_attempts', async () => {
  const host = scripted(withSecurity, (it) => {
    const [research, design] = nominal(it)
    const outside = agent({ fill: false, work: ({ git }) => git.change('tests/Hack.cs') })
    return [research, design, outside(it), outside(it)]
  })

  const outcome = await host.start()

  assert.deepEqual([outcome.code, outcome.reason], [
    'missing-outputs',
    `acme-security-reviewer failed the same way on attempts 1 and 2: missing outputs: ${TRACKING}/security/2026-10-11/${SLUG}-review.md, ${TRACKING}/notes.md; out of write scope: tests/Hack.cs`,
  ])
})

test('a repository agent that declares no outputs is asked for its result only', async () => {
  const resultOnly = edit(WITH_SECURITY, ['outputs="security/{date}/{slug}-review.md, notes.md", ', ''])
  const host = scripted({ ...withSecurity, ...repositoryWorkflow(resultOnly) }, (it) => {
    const [research, design] = nominal(it)
    return [research, design, agent()(it), () => ({ ok: false, unavailable: true, text: '' })]
  })

  await host.start()

  const security = host.events().filter((event) => event.step === 'security')
  assert.deepEqual(security.map(({ type, outputs, outcome }) => [type, outputs, outcome]), [['step.started', [], undefined], ['step.recorded', undefined, 'done']])
  assert.ok(!host.agentRunner.dispatches[2].prompt.includes('- Fill each output'), host.agentRunner.dispatches[2].prompt)
})

test('a workflow that cannot run is refused at init, with every reason, and nothing is journaled', async () => {
  const broken = edit(BUILT_IN_WORKFLOW, ['  gates -> deliver [label="FAIL", max_visits=3]', '  gates -> deliver [label="FAIL"]'], ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  orphan   [shape=box, agent="solution-researcher"]'])
  const host = pipelineHost(repositoryWorkflow(broken))

  const outcome = await host.init()

  assert.deepEqual(outcome, {
    ok: false, slug: SLUG, created: false, code: 'workflow-invalid',
    reason: 'skraft-workflow.dot is invalid: node orphan: agent node needs exactly one outgoing edge, has 0; node orphan is unreachable from start; node orphan never reaches an exit; loop gates -> deliver -> gates has no max_visits',
  })
  assert.deepEqual(host.events(), [])
  assert.equal(await host.tracking.current(), null)
})

test('a repository agent nobody provides refuses the workflow, naming it', async () => {
  const host = pipelineHost(repositoryWorkflow(WITH_SECURITY))

  const outcome = await host.init()

  assert.deepEqual([outcome.code, outcome.reason], ['workflow-invalid', 'skraft-workflow.dot is invalid: node security: agent acme-security-reviewer not found in the plugin, .claude/agents/ or .github/agents/'])
})

test('the locked gates removed without unlock are refused; kept with unlock they are skipped, journaled with the reason', async () => {
  const removed = edit(BUILT_IN_WORKFLOW,
    ['  gates    [shape=parallelogram, gate="build,format,lint,test,architecture,coverage,mutation", goal_gate=true, locked=true, phase="DELIVER"]\n', ''],
    ['deliver -> gates\n', 'deliver -> deliver_review\n'],
    ['  gates -> deliver [label="FAIL", max_visits=3]\n  gates -> deliver_review [label="PASS"]\n', ''])
  const refused = pipelineHost(repositoryWorkflow(removed))
  assert.deepEqual([(await refused.init()).code, (await refused.init()).reason], ['workflow-invalid', 'skraft-workflow.dot is invalid: locked node gates is missing; keep it with unlock="<reason>" to skip it'])

  const unlocked = edit(BUILT_IN_WORKFLOW, ['locked=true, phase="DELIVER"', 'locked=true, unlock="the team runs the gates in its own CI", phase="DELIVER"'])
  const host = scripted(repositoryWorkflow(unlocked), nominal)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.events()[0].unlocked, [{ node: 'gates', reason: 'the team runs the gates in its own CI' }])
  assert.deepEqual(host.machine.runs, [])
  const gates = host.events().filter((event) => event.step === 'gates')
  assert.deepEqual(gates.map(({ type, outcome: result, code, failures, reason, next, gates: names }) => [type, result, code, failures, reason, next, names?.length]), [
    ['step.started', undefined, undefined, undefined, undefined, undefined, 7],
    ['step.recorded', 'skipped', null, [], 'unlocked: the team runs the gates in its own CI', 'deliver_review', undefined],
  ])
  assert.ok(host.progress.lines.includes(`${SLUG}: gates skipped, unlocked: the team runs the gates in its own CI`))
})

test('a skipped gate still takes its edge, and stops the run once that edge reached its max_visits', async () => {
  const looped = edit(BUILT_IN_WORKFLOW,
    ['locked=true, phase="DELIVER"', 'locked=true, unlock="the team runs the gates in its own CI", phase="DELIVER"'],
    ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  check    [shape=parallelogram, gate="test", phase="DELIVER"]'],
    ['  gates -> deliver_review [label="PASS"]', '  gates -> check   [label="PASS", max_visits=1]\n  check -> deliver [label="FAIL"]\n  check -> deliver_review [label="PASS"]'])
  const host = scripted(repositoryWorkflow(looped), (it) => [...nominal(it), agent()(it)])
  host.machine.exits['. $ dotnet test'] = 1

  const outcome = await host.start()

  const reason = 'gates -> check was already taken 1 times, its max_visits'
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'loop-ceiling', reason })
  assert.deepEqual(host.events().filter((event) => event.type === 'step.recorded' && event.step === 'gates').map(({ visit, outcome: result, code, next, reason: why }) => [visit, result, code, next, why]), [
    [1, 'skipped', null, 'check', 'unlocked: the team runs the gates in its own CI'],
    [2, 'skipped', 'loop-ceiling', null, reason],
  ])
})

test('a workflow that became invalid stops the run; one whose node of the run is gone stops it as changed', async () => {
  const host = scripted(withSecurity, (it) => [agent()(it), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])
  await host.start()
  await host.deps.workspace.write('skraft-workflow.dot', 'digraph {')

  const invalid = await host.run()
  assert.deepEqual([invalid.status, invalid.code, invalid.reason], ['blocked', 'workflow-invalid', 'skraft-workflow.dot is invalid: line 1: missing } at the end of the graph'])

  await host.deps.workspace.write('skraft-workflow.dot', BUILT_IN_WORKFLOW)
  const changed = await host.run()
  assert.deepEqual(changed, { status: 'blocked', slug: SLUG, phase: null, code: 'workflow-changed', reason: 'the workflow has no node security any more; restore the workflow the run started with' })

})

test('a run whose last step, or the node it led to, left the workflow stops as changed', async () => {
  const WITHOUT_SECURITY = edit(WITH_SECURITY, ['design_review -> security [label="APPROVED"]\n  security -> distill', 'design_review -> distill [label="APPROVED"]'], ['  security [shape=box, agent="acme-security-reviewer", outputs="security/{date}/{slug}-review.md, notes.md", writes="docs/security/, src/", max_attempts=2]', ''])
  const stopsEntering = (host, phase) => {
    const shown = host.progress.phase.bind(host.progress)
    host.progress.phase = (name) => {
      if (name === phase) throw new Error(`host interrupted before ${phase}`)
      shown(name)
    }
  }

  const left = scripted(withSecurity, (it) => [agent()(it), agent()(it), agent()(it)])
  stopsEntering(left, 'DISTILL')
  await assert.rejects(left.start(), /host interrupted before DISTILL/)
  await left.deps.workspace.write('skraft-workflow.dot', WITHOUT_SECURITY)
  assert.deepEqual(await left.run(), { status: 'blocked', slug: SLUG, phase: null, code: 'workflow-changed', reason: 'the workflow has no node security any more; restore the workflow the run started with' })

  const target = scripted(withSecurity, (it) => [agent()(it), agent()(it)])
  const append = target.tracking.append.bind(target.tracking)
  target.tracking.append = async (slug, line) => {
    if (line.includes('"type":"step.started"') && line.includes('"step":"security"')) throw new Error('host interrupted before security')
    return append(slug, line)
  }
  await assert.rejects(target.start(), /host interrupted before security/)
  await target.deps.workspace.write('skraft-workflow.dot', WITHOUT_SECURITY)
  assert.deepEqual(await target.run(), { status: 'blocked', slug: SLUG, phase: null, code: 'workflow-changed', reason: 'the workflow has no node security any more; restore the workflow the run started with' })
  assert.equal(target.events().filter((event) => event.type === 'step.recorded').at(-1).next, 'security')
})

test('a skipped gate interrupted before it was recorded is not started twice', async () => {
  const unlocked = edit(BUILT_IN_WORKFLOW, ['locked=true, phase="DELIVER"', 'locked=true, unlock="the team runs the gates in its own CI", phase="DELIVER"'])
  const host = scripted(repositoryWorkflow(unlocked), nominal)
  const append = host.tracking.append.bind(host.tracking)
  let crashes = 1
  host.tracking.append = async (slug, line) => {
    if (line.includes('"outcome":"skipped"') && crashes-- > 0) throw new Error('host interrupted')
    return append(slug, line)
  }
  await assert.rejects(host.start(), /host interrupted/)

  assert.equal((await host.run()).status, 'done')
  assert.equal(host.events().filter((event) => event.type === 'step.started' && event.step === 'gates').length, 1)
})
