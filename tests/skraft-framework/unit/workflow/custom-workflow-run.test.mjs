import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentCatalog } from '../support/in-memory-host.mjs'
import { agent, finding, lenses, nominal, pipelineHost, refutes, says, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { edit, WITH_SECURITY } from './support.mjs'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'

/** A free family that runs on the frontier tier, beside the tiers and roles of the plugin's defaults. */
const RANKED = { 'gpt-luna': { tier: 'frontier' } }
const repositoryWorkflow = (dot, models = RANKED) => ({ config: { models }, files: { '.skraft/pipeline.skraft.dot': dot } })
const withSecurity = { ...repositoryWorkflow(WITH_SECURITY), catalog: new InMemoryAgentCatalog({ repository: ['acme-security-reviewer'] }) }

test('a repository agent between DESIGN and DISTILL is launched in its place, as a repository agent, whatever the order of the edges', async () => {
  const chain = '  start -> publish_consent -> visuals_consent -> research -> design -> security\n'
  const around = '  security -> design_review_lenses\n'
  const last = '  visuals -> pr_writer -> publish -> exit\n'
  const edgesLast = edit(WITH_SECURITY, [chain, ''], [around, ''], [last, `${last}${around}${chain}`])
  const host = scripted({ ...withSecurity, ...repositoryWorkflow(edgesLast) }, (it) => {
    const [research, design, ...rest] = nominal(it)
    return [research, design, agent({ work: ({ git }) => git.change('docs/security/threat-model.md') })(it), ...rest]
  })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.agentRunner.dispatches.map(({ agent: id, source }) => `${id} ${source}`), [
    'solution-researcher plugin', 'solution-architect plugin', 'acme-security-reviewer repository', 'acceptance-designer plugin', 'software-engineer plugin', 'pr-writer plugin',
  ])
  assert.equal(host.events()[0].workflow, '.skraft/pipeline.skraft.dot')
  assert.deepEqual(host.events().filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
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
    '- Reference no issue in a commit.',
  ].join('\n'))
})

test('in an ejected workflow an agent node runs its agent on the family its model= names, and a review node gives its family to the lenses that name none', async () => {
  const families = edit(BUILT_IN_WORKFLOW,
    ['phase="DELIVER"]', 'phase="DELIVER", model="frontier"]'],
    ['lens="architecture-compliance"]', 'lens="architecture-compliance", model="frontier"]'],
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon, mandatory=true, model="standard"]'])
  const host = scripted(repositoryWorkflow(families), nominal)

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(host.agentRunner.dispatches.map(({ agent: id, model, models }) => `${id} ${model} ${models['claude-code']}`), [
    'solution-researcher researcher sonnet', 'solution-architect planner opus', 'acceptance-designer implementer sonnet', 'software-engineer frontier opus', 'pr-writer economy haiku',
  ])
  assert.deepEqual(host.agentRunner.batches[0].map(({ agent: id, model }) => `${id} ${model}`), ['consistency-lens standard', 'architecture-compliance-lens frontier', 'fitness-lens standard'])
  assert.deepEqual(host.agentRunner.batches[1].map(({ model }) => model), ['reviewer', 'reviewer', 'reviewer', 'reviewer'])
})

test('a family is any kebab-case word with a tier, such as gpt-luna; a review node names the refuter\'s family with refuter=, else it runs one tier above the strongest lens of its group', async () => {
  const families = edit(BUILT_IN_WORKFLOW,
    ['phase="DISTILL"]', 'phase="DISTILL", model="gpt-luna"]'],
    ['lens="consistency"]', 'lens="consistency", model="gpt-luna"]'],
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon, mandatory=true, refuter="gpt-luna"]'])
  const host = scripted(repositoryWorkflow(families), (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])],
    coverage: [says('coverage', 'fail', [finding('F1', 'blocker', 'a criterion has no scenario')])],
  })
  host.agentRunner.behaviours.splice(4, 0, agent({ work: ({ git }) => git.commit("test(checkout): the missing criterion", ["tests/Acceptance/RefundAcceptanceTests.cs"]) })(host))

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual([...new Set(host.agentRunner.dispatches.filter(({ agent: id }) => id === 'acceptance-designer').map(({ model }) => model))], ['gpt-luna'])
  assert.deepEqual(host.agentRunner.batches[0].map(({ model }) => model), ['gpt-luna', 'reviewer', 'reviewer'])
  const checks = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter')
  assert.deepEqual(checks.map(({ label, model }) => `${label.split(' · ')[1]} ${model}`), ['design_review gpt-luna', 'distill_review standard'])

  const refusal = async (attributes) => (await scripted(repositoryWorkflow(edit(BUILT_IN_WORKFLOW, ['agent="solution-researcher", phase="RESEARCH"]', `agent="solution-researcher", phase="RESEARCH", ${attributes}]`])), () => []).init()).reason
  assert.match(await refusal('model="Claude Sonnet 5"'), /node research: model="Claude Sonnet 5" must be a model family, a kebab-case word whose every part starts with a letter, such as reviewer, planner or gpt-codex/)
  assert.match(await refusal('model="claude-sonnet-5.5"'), /must be a model family/)
  assert.match(await refusal('model="gpt-5"'), /must be a model family/)
  assert.match(await refusal('refuter="frontier"'), /node research: attribute refuter is not supported on a box node/)
})

test('the model each agent, lens and check ran on is journaled, null when the host ran its own', async () => {
  const host = scripted({}, (it) => nominal(it).map((behaviour, index) => async (dispatch) => {
    await behaviour(dispatch)
    return { ok: true, text: 'done', model: index === 0 ? null : `claude-${dispatch.model}-5.5` }
  }))
  let fitness = 0
  host.agentRunner.review = async (dispatch) => {
    const failing = dispatch.agent === 'fitness-lens' && (fitness += 1) === 1
    const text = dispatch.agent === 'finding-refuter' ? refutes('confirmed') : failing ? says('fitness', 'fail', [finding('F1', 'high', 'no latency budget')]) : says(dispatch.agent.replace(/-lens$/, ''), 'pass')
    return { ok: true, text, model: dispatch.agent === 'cold-reader-lens' ? null : `claude-${dispatch.model}-5.5` }
  }
  const again = agent()(host)
  host.agentRunner.behaviours.splice(2, 0, async (dispatch) => ({ ...(await again(dispatch) ?? { ok: true, text: 'done' }), model: `claude-${dispatch.model}-5.5` }))

  await host.start()

  assert.deepEqual(host.events().filter((event) => event.type === 'step.recorded' && !event.step.endsWith('review') && event.step !== 'gates' && event.step !== 'mutation' && event.step !== 'adr' && !event.step.startsWith('publish') && !event.step.startsWith('visuals')).map(({ step, model }) => `${step} ${model}`), [
    'research null', 'design claude-planner-5.5', 'design claude-planner-5.5', 'distill claude-implementer-5.5', 'deliver claude-implementer-5.5', 'pr_writer null',
  ])
  const lensModels = host.events().filter((event) => event.type === 'review.lens' && event.step !== 'design_review').map(({ lens, model }) => `${lens} ${model}`)
  assert.ok(lensModels.includes('cold-reader null') && lensModels.includes('coverage claude-reviewer-5.5'), lensModels.join('\n'))
  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ lens, model }) => `${lens} ${model}`), ['fitness claude-standard-5.5'])
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
    reason: '.skraft/pipeline.skraft.dot is invalid: node orphan: agent node needs exactly one outgoing edge, has 0; node orphan is unreachable from start; node orphan never reaches an exit; loop gates -> deliver -> gates has no max_visits',
  })
  assert.deepEqual(host.events(), [])
  assert.equal(await host.tracking.current(), null)
})

test('a repository agent nobody provides refuses the workflow, naming it', async () => {
  const host = pipelineHost(repositoryWorkflow(WITH_SECURITY))

  const outcome = await host.init()

  assert.deepEqual([outcome.code, outcome.reason], ['workflow-invalid', '.skraft/pipeline.skraft.dot is invalid: node security: agent acme-security-reviewer not found in the plugin, .claude/agents/ or .github/agents/'])
})

test('the locked gates removed without unlock are refused; kept with unlock they are skipped, journaled with the reason', async () => {
  const removed = edit(BUILT_IN_WORKFLOW,
    ['  gates    [shape=parallelogram, gate="build,format,lint,test,architecture,coverage", goal_gate=true, locked=true, phase="DELIVER"]\n', ''],
    ['deliver -> gates\n', 'deliver -> mutation\n'],
    ['  gates -> deliver [label="FAIL", max_visits=3]\n  gates -> mutation [label="PASS"]\n', ''],
    ['  mutation_review -> gates [label="APPROVED"]\n', '  mutation_review -> mutation [label="APPROVED"]\n'])
  const refused = pipelineHost(repositoryWorkflow(removed))
  assert.deepEqual([(await refused.init()).code, (await refused.init()).reason], ['workflow-invalid', '.skraft/pipeline.skraft.dot is invalid: locked node gates is missing; keep it with unlock="<reason>" to skip it'])

  const unlocked = edit(BUILT_IN_WORKFLOW,
    ['locked=true, phase="DELIVER"', 'locked=true, unlock="the team runs the gates in its own CI", phase="DELIVER"'],
    ['gate="mutation", goal_gate=true, locked=true', 'gate="mutation", goal_gate=true, locked=true, unlock="the team runs mutation in its own CI"'])
  const host = scripted(repositoryWorkflow(unlocked), nominal)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.events()[0].unlocked, [{ node: 'gates', reason: 'the team runs the gates in its own CI' }, { node: 'mutation', reason: 'the team runs mutation in its own CI' }])
  assert.deepEqual(host.machine.runs, [])
  const gates = host.events().filter((event) => event.step === 'gates' || event.step === 'mutation')
  assert.deepEqual(gates.map(({ type, outcome: result, code, failures, reason, next, gates: names }) => [type, result, code, failures, reason, next, names?.length]), [
    ['step.started', undefined, undefined, undefined, undefined, undefined, 6],
    ['step.recorded', 'skipped', null, [], 'unlocked: the team runs the gates in its own CI', 'mutation', undefined],
    ['step.started', undefined, undefined, undefined, undefined, undefined, 1],
    ['step.recorded', 'skipped', null, [], 'unlocked: the team runs mutation in its own CI', 'deliver_review', undefined],
  ])
  assert.ok(host.progress.lines.includes(`${SLUG}: gates skipped, unlocked: the team runs the gates in its own CI`))
  assert.ok(host.progress.lines.includes(`${SLUG}: mutation skipped, unlocked: the team runs mutation in its own CI`))
})

test('a skipped gate still takes its edge, and stops the run once that edge reached its max_visits', async () => {
  const looped = edit(BUILT_IN_WORKFLOW,
    ['locked=true, phase="DELIVER"', 'locked=true, unlock="the team runs the gates in its own CI", phase="DELIVER"'],
    ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  check    [shape=parallelogram, gate="test", phase="DELIVER"]'],
    ['  gates -> mutation [label="PASS"]', '  gates -> check   [label="PASS", max_visits=1]\n  check -> deliver [label="FAIL"]\n  check -> mutation [label="PASS"]'])
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
  await host.deps.workspace.write('.skraft/pipeline.skraft.dot', 'digraph {')

  const invalid = await host.run()
  assert.deepEqual([invalid.status, invalid.code, invalid.reason], ['blocked', 'workflow-invalid', '.skraft/pipeline.skraft.dot is invalid: line 1: missing } at the end of the graph'])

  await host.deps.workspace.write('.skraft/pipeline.skraft.dot', BUILT_IN_WORKFLOW)
  const changed = await host.run()
  assert.deepEqual(changed, { status: 'blocked', slug: SLUG, phase: null, code: 'workflow-changed', reason: 'the workflow has no node security any more; restore the workflow the run started with' })

})

test('a run whose last step, or the node it led to, left the workflow stops as changed', async () => {
  const WITHOUT_SECURITY = edit(WITH_SECURITY, ['research -> design -> security\n  security -> design_review_lenses', 'research -> design -> design_review_lenses'], ['  security [shape=box, agent="acme-security-reviewer", outputs="security/{date}/{slug}-review.md, notes.md", writes="docs/security/, src/", max_attempts=2]', ''])
  const stopsStarting = (host, step) => {
    const append = host.tracking.append.bind(host.tracking)
    host.tracking.append = async (slug, line) => {
      if (line.includes('"type":"step.started"') && line.includes(`"step":"${step}"`)) throw new Error(`host interrupted before ${step}`)
      return append(slug, line)
    }
  }

  const left = scripted(withSecurity, (it) => [agent()(it), agent()(it), agent()(it)])
  stopsStarting(left, 'design_review')
  await assert.rejects(left.start(), /host interrupted before design_review/)
  await left.deps.workspace.write('.skraft/pipeline.skraft.dot', WITHOUT_SECURITY)
  assert.deepEqual(await left.run(), { status: 'blocked', slug: SLUG, phase: null, code: 'workflow-changed', reason: 'the workflow has no node security any more; restore the workflow the run started with' })

  const target = scripted(withSecurity, (it) => [agent()(it), agent()(it)])
  stopsStarting(target, 'security')
  await assert.rejects(target.start(), /host interrupted before security/)
  await target.deps.workspace.write('.skraft/pipeline.skraft.dot', WITHOUT_SECURITY)
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
