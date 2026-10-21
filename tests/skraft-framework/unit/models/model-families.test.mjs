import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDoctor } from '../../../../plugins/skraft-framework/engine/application/diagnostics/doctor-usecase.mjs'
import { agent, finding, lenses, nominal, says, scripted, refutes, SLUG } from '../support/pipeline-host.mjs'
import { BUILT_IN_WORKFLOW, InMemorySourceControl, InMemoryUserSettings, InMemoryWorkflowSource, InMemoryWorkspace, ScriptedMachine } from '../support/in-memory-host.mjs'
import { edit, host as workflowHost } from '../workflow/support.mjs'
import { answerYaml } from '../support/answer-yaml.mjs'

const LOCAL = 'skraft-config.local.json'

/** The software engineer's TDD cycle, its red commit adding a gateway mock and a contract test, so that every lens of deliver_review runs. */
const deliverTouchingMocksAndContracts = (host) => agent({
  work: ({ git }) => {
    git.commit(`test(${SLUG}): Checkout pays by card`, ['tests/CheckoutTests.cs', 'tests/GatewayMock.cs', 'tests/PaymentContractTests.cs'])
    git.commit(`feat(${SLUG}): Checkout pays by card`, ['src/Checkout.cs'])
    git.commit(`refactor(${SLUG}): name the card payment`, ['src/Checkout.cs'])
  },
})(host)

/** The nominal run, with every lens of the three review nodes dispatched. */
const everyLens = (host) => [...nominal(host).slice(0, 3), deliverTouchingMocksAndContracts(host)]

/** One finding per review node, each refuted so that the review approves: consistency, coverage, then the lens named for deliver_review. */
const findingIn = ({ design = 'consistency', distill = 'coverage', deliver = 'cold-reader' } = {}) => lenses({
  [design]: [says(design, 'fail', [finding('F1', 'high', 'the ADR contradicts the context map')])],
  [distill]: [says(distill, 'fail', [finding('F1', 'high', 'a rule has no scenario')])],
  [deliver]: [says(deliver, 'fail', [finding('F1', 'high', 'the name says nothing')])],
  refuter: [refutes('refuted'), refutes('refuted'), refutes('refuted')],
})

/**
 * A run to its end on these configuration layers. config: skraft-config.json beside its
 * components; local: skraft-config.local.json; user: ~/.skraft/config.json.
 * @param {{ config?: object, local?: object, user?: object, files?: Record<string, string>, review?: Function, workflow?: string }} [layers]
 *   workflow: the plugin's own workflow, the shipped one by default
 */
const runOn = async ({ config = {}, local, user, files = {}, review = findingIn(), workflow } = {}) => {
  const host = scripted({ config, workflow, user: user === undefined ? undefined : JSON.stringify(user), files: { ...files, ...(local === undefined ? {} : { [LOCAL]: JSON.stringify(local) }) } }, everyLens)
  host.agentRunner.review = review
  const outcome = await host.start()
  assert.equal(outcome.status, 'done', outcome.reason)
  return host
}

/** A host's cell: its models, tried in order, and its effort; `-` for what the dispatch leaves to the host. */
const cell = (dispatch, host) => `${dispatch.models?.[host]?.join(' → ') ?? '-'} · ${dispatch.effort?.[host] ?? '-'}`

/** What a dispatch says about its model: the agent, the family, Claude Code's, Copilot's. */
const row = (dispatch) => [dispatch.agent, dispatch.model ?? 'host', cell(dispatch, 'claude-code'), cell(dispatch, 'copilot')]

/** Every dispatch of the run, in order: the agents of the phases, then the lenses and refuters batch after batch. */
const dispatches = (host) => [...host.agentRunner.dispatches, ...host.agentRunner.reviewed()]

/** The row of each agent; the refuter's rows in order under `finding-refuter`. */
const rows = (host) => {
  const found = dispatches(host).map(row)
  const refuters = found.filter(([agentId]) => agentId === 'finding-refuter')
  return { ...Object.fromEntries(found.filter(([agentId]) => agentId !== 'finding-refuter').map((entry) => [entry[0], entry.slice(1)])), 'finding-refuter': refuters.map((entry) => entry.slice(1)) }
}

const LENSES = [
  'consistency-lens', 'architecture-compliance-lens', 'fitness-lens',
  'coverage-lens', 'business-alignment-lens', 'testability-lens', 'boundary-enforcement-lens',
  'test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens', 'mock-fidelity-lens', 'contract-fidelity-lens',
]

/** The example of the design document: the team's exception and the developer's local file. */
const TEAM = { assign: { agents: { 'fitness-lens': 'implementer' } } }
const DEVELOPER = {
  $schema: './plugins/skraft-framework/schemas/skraft-config.local.schema.json',
  models: {
    economy: { 'claude-code': { model: 'haiku', effort: 'low' }, copilot: { model: 'gpt-5.5', effort: 'low' } },
    standard: { 'claude-code': { model: 'sonnet', effort: 'medium' }, copilot: { model: 'gpt-5.5', effort: 'high' } },
    frontier: { 'claude-code': { model: 'opus', effort: 'high' }, copilot: { model: 'gpt-6.0', effort: 'xhigh' } },
    implementer: { copilot: { model: ['gpt-6.0', 'gpt-5.5'] } },
    'gpt-codex': { tier: 'standard', copilot: { model: 'gpt-5.5-codex', effort: 'medium' } },
    'deep-review': { tier: 'frontier', 'claude-code': { model: 'opus', effort: 'max' }, copilot: { model: 'gpt-6.0', effort: 'xhigh' } },
  },
  assign: {
    types: { lens: 'economy' },
    agents: {
      'software-engineer': 'gpt-codex',
      'cold-reader-lens': 'deep-review',
      'architecture-boundaries-lens': { 'claude-code': { effort: 'high' }, copilot: { effort: 'high' } },
      'solution-architect': { family: 'planner', 'claude-code': { effort: 'max' } },
      'fitness-lens': null,
    },
  },
}

test('the plugin defaults, a team exception and a developer file resolve each agent to its family, then each host to its model and effort', async () => {
  const host = await runOn({ config: TEAM, local: DEVELOPER })

  const economy = ['economy', 'haiku · low', 'gpt-5.5 · low']
  const standardRefuter = ['standard', 'sonnet · medium', 'gpt-5.5 · high']
  assert.deepEqual(rows(host), {
    'solution-researcher': ['researcher', 'sonnet · medium', 'gpt-5.5 · high'],
    'solution-architect': ['planner', 'opus · max', 'gpt-6.0 · xhigh'],
    'acceptance-designer': ['implementer', 'sonnet · medium', 'gpt-6.0 → gpt-5.5 · high'],
    'software-engineer': ['gpt-codex', 'sonnet · medium', 'gpt-5.5-codex · medium'],
    'consistency-lens': economy,
    'architecture-compliance-lens': economy,
    'fitness-lens': economy,
    'coverage-lens': economy,
    'business-alignment-lens': economy,
    'testability-lens': economy,
    'boundary-enforcement-lens': economy,
    'test-integrity-lens': economy,
    'architecture-boundaries-lens': ['economy', 'haiku · high', 'gpt-5.5 · high'],
    'cold-reader-lens': ['deep-review', 'opus · max', 'gpt-6.0 · xhigh'],
    'mock-fidelity-lens': economy,
    'contract-fidelity-lens': economy,
    'finding-refuter': [standardRefuter, standardRefuter, ['frontier', 'opus · high', 'gpt-6.0 · xhigh']],
  })
})

test('without models or assign in any file, Claude Code gets the plugin aliases of each tier and Copilot gets neither a model nor an effort', async () => {
  const host = await runOn()

  assert.deepEqual(dispatches(host).map((dispatch) => [dispatch.agent, dispatch.model, dispatch.models, Object.hasOwn(dispatch, 'effort')]).filter((entry, index, all) => all.findIndex((other) => other[0] === entry[0]) === index), [
    ['solution-researcher', 'researcher', { 'claude-code': ['sonnet'] }, false],
    ['solution-architect', 'planner', { 'claude-code': ['opus'] }, false],
    ['acceptance-designer', 'implementer', { 'claude-code': ['sonnet'] }, false],
    ['software-engineer', 'implementer', { 'claude-code': ['sonnet'] }, false],
    ...LENSES.slice(0, 3).map((lens) => [lens, 'reviewer', { 'claude-code': ['haiku'] }, false]),
    ['finding-refuter', 'standard', { 'claude-code': ['sonnet'] }, false],
    ...LENSES.slice(3).map((lens) => [lens, 'reviewer', { 'claude-code': ['haiku'] }, false]),
  ])
})

test('a type rule applies to the twelve lenses of the three review nodes, and an agent rule overrides one agent only', async () => {
  const host = await runOn({ local: { assign: { types: { lens: 'frontier' }, agents: { 'mock-fidelity-lens': 'economy' } } } })

  const lensRows = dispatches(host).filter(({ agent: id }) => id.endsWith('-lens')).map(row)
  assert.deepEqual(lensRows.map(([id]) => id), LENSES)
  assert.deepEqual(lensRows.filter(([id]) => id !== 'mock-fidelity-lens').map(([, ...rest]) => rest), LENSES.slice(1).map(() => ['frontier', 'opus · -', '- · -']))
  assert.deepEqual(rows(host)['mock-fidelity-lens'], ['economy', 'haiku · -', '- · -'])
  assert.deepEqual(rows(host)['solution-architect'], ['planner', 'opus · -', '- · -'])
})

test('a null in the local file removes the team exception, and the type rule applies to that agent again', async () => {
  const team = { assign: { types: { lens: 'standard' }, agents: { 'fitness-lens': 'frontier', 'cold-reader-lens': 'frontier' } } }

  const kept = rows(await runOn({ config: team }))
  const removed = rows(await runOn({ config: team, local: { assign: { agents: { 'fitness-lens': null } } } }))

  assert.deepEqual([kept['fitness-lens'], kept['cold-reader-lens'], kept['consistency-lens']], [['frontier', 'opus · -', '- · -'], ['frontier', 'opus · -', '- · -'], ['standard', 'sonnet · -', '- · -']])
  assert.deepEqual([removed['fitness-lens'], removed['cold-reader-lens'], removed['consistency-lens']], [['standard', 'sonnet · -', '- · -'], ['frontier', 'opus · -', '- · -'], ['standard', 'sonnet · -', '- · -']])
})

test('inherit leaves the agent to the host: its dispatch carries no family, no model and no effort', async () => {
  const host = await runOn({
    local: {
      models: { standard: { 'claude-code': { effort: 'high' }, copilot: { model: 'gpt-5.5', effort: 'high' } } },
      assign: { agents: { 'software-engineer': 'inherit', 'coverage-lens': { family: 'inherit' } } },
    },
  })

  const inherited = dispatches(host).filter(({ agent: id }) => ['software-engineer', 'coverage-lens'].includes(id))
  assert.deepEqual(inherited.map((dispatch) => [dispatch.agent, Object.keys(dispatch).filter((key) => key.startsWith('model') || key === 'effort')]), [['software-engineer', []], ['coverage-lens', []]])
  assert.deepEqual(rows(host)['acceptance-designer'], ['implementer', 'sonnet · high', 'gpt-5.5 · high'])
})

test('a family with no model for a host runs on its tier\'s; with no model on its tier either, the host gets none', async () => {
  const host = await runOn({
    local: {
      models: {
        frontier: { 'claude-code': { model: null } },
        planner: { copilot: { model: 'copilot-planner' } },
        'gpt-codex': { tier: 'standard', copilot: { model: 'gpt-5.5-codex' } },
        'gpt-review': { tier: 'frontier', 'claude-code': null, copilot: { model: 'gpt-reviewer' } },
        'gpt-idle': { tier: 'frontier' },
      },
      assign: { agents: { 'software-engineer': 'gpt-codex', 'cold-reader-lens': 'gpt-review', 'coverage-lens': 'gpt-idle' } },
    },
  })

  const { 'software-engineer': engineer, 'cold-reader-lens': coldReader, 'solution-architect': architect, 'coverage-lens': coverage } = rows(host)
  assert.deepEqual([engineer, coldReader, architect, coverage], [
    ['gpt-codex', 'sonnet · -', 'gpt-5.5-codex · -'],
    ['gpt-review', '- · -', 'gpt-reviewer · -'],
    ['planner', '- · -', 'copilot-planner · -'],
    ['gpt-idle', '- · -', '- · -'],
  ])
  assert.deepEqual(Object.keys(dispatches(host).find(({ agent: id }) => id === 'coverage-lens')).filter((key) => key.startsWith('model') || key === 'effort'), ['model'])
  const architectDispatch = dispatches(host).find(({ agent: id }) => id === 'solution-architect')
  assert.deepEqual(architectDispatch.models, { copilot: ['copilot-planner'] })
})

/** The refuter's answer for a group of findings, each refuted. @param {...string} cited */
const refutedTogether = (...cited) => answerYaml({ checks: cited.map((name) => ({ finding: name, verdict: 'refuted', reason: 'the patch shows otherwise' })) })

test('the refuter runs one tier above the strongest tier of the lenses it checks, frontier at most, and a type rule for refuters fixes its family', async () => {
  const together = () => lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'high', 'the ADR contradicts the context map')])],
    'architecture-compliance': [says('architecture-compliance', 'fail', [finding('F1', 'high', 'the domain imports the driver')])],
    fitness: [says('fitness', 'fail', [finding('F1', 'high', 'no latency budget', { location: 'src/Checkout.cs:80' })])],
    coverage: [says('coverage', 'fail', [finding('F1', 'high', 'a rule has no scenario')])],
    refuter: [refutedTogether('consistency F1', 'architecture-compliance F1'), refutes('refuted'), refutes('refuted')],
  })
  const tiers = { assign: { agents: { 'consistency-lens': 'researcher', 'architecture-compliance-lens': 'economy', 'fitness-lens': 'gpt-review', 'coverage-lens': 'planner' } }, models: { 'gpt-review': { tier: 'economy' } } }

  const escalated = rows(await runOn({ local: tiers, review: together() }))['finding-refuter']
  const fixed = rows(await runOn({ local: { ...tiers, assign: { ...tiers.assign, types: { refuter: 'reviewer' } } }, review: together() }))['finding-refuter']

  assert.deepEqual(escalated.map(([family]) => family), ['frontier', 'standard', 'frontier'])
  assert.deepEqual(fixed.map(([family, claude]) => `${family} ${claude}`), ['reviewer haiku · -', 'reviewer haiku · -', 'reviewer haiku · -'])
})

test('an effort given alone for an agent keeps the family the other rules give it, and reaches only the host it names', async () => {
  const host = await runOn({
    config: { assign: { agents: { 'software-engineer': 'planner' }, types: { worker: { copilot: { effort: null } } } } },
    local: { assign: { agents: { 'software-engineer': { family: null, copilot: { effort: 'xhigh' } }, 'acceptance-designer': { 'claude-code': { effort: 'low' }, copilot: null } }, types: { phase: { copilot: { effort: 'medium' } } } } },
  })

  const { 'software-engineer': engineer, 'acceptance-designer': designer, 'solution-researcher': researcher } = rows(host)
  assert.deepEqual([engineer, designer, researcher], [
    ['implementer', 'sonnet · -', '- · xhigh'],
    ['implementer', 'sonnet · low', '- · medium'],
    ['researcher', 'sonnet · -', '- · medium'],
  ])
  const effortOf = (id) => dispatches(host).find(({ agent: name }) => name === id).effort
  assert.deepEqual([effortOf('software-engineer'), effortOf('acceptance-designer')], [{ copilot: 'xhigh' }, { 'claude-code': 'low', copilot: 'medium' }])
})

test('the four layers apply in order, the developer\'s home file first, and a list in a later layer replaces the list of an earlier one', async () => {
  const host = await runOn({
    user: { models: { implementer: { copilot: { model: ['user-a', 'user-b'], effort: 'low' } }, frontier: { copilot: { model: 'user-frontier' } } }, assign: { types: { lens: 'standard' } } },
    config: { models: { implementer: { copilot: { model: ['team-a', 'team-b'] } } }, assign: { types: { lens: 'frontier' } } },
    local: { models: { implementer: { copilot: { model: ['local-a'] } } } },
  })

  const { 'acceptance-designer': designer, 'consistency-lens': lens } = rows(host)
  assert.deepEqual([designer, lens], [['implementer', 'sonnet · -', 'local-a · low'], ['frontier', 'opus · -', 'user-frontier · -']])
})

test('in a workflow the repository ejected, the node\'s model=, a lens\'s @family and refuter= name families that an agent rule, the plugin\'s included, still overrides', async () => {
  const workflow = edit(BUILT_IN_WORKFLOW,
    ['phase="RESEARCH"]', 'phase="RESEARCH", model="frontier"]'],
    ['phase="DESIGN"]', 'phase="DESIGN", model="economy"]'],
    ['lenses="consistency,architecture-compliance,fitness"', 'lenses="consistency@standard,architecture-compliance,fitness", model="frontier", refuter="economy"'])
  const ejected = { workflow: 'skraft-workflow.dot', assign: { agents: { 'solution-architect': 'standard', 'fitness-lens': 'reviewer' } } }

  const fromRepository = rows(await runOn({ config: ejected, files: { 'skraft-workflow.dot': workflow } }))
  const shipped = rows(await runOn({ config: { assign: ejected.assign }, workflow }))

  assert.deepEqual(['solution-researcher', 'solution-architect', 'consistency-lens', 'architecture-compliance-lens', 'fitness-lens'].map((id) => fromRepository[id][0]), ['researcher', 'standard', 'standard', 'frontier', 'reviewer'])
  assert.deepEqual(fromRepository['finding-refuter'].map(([family]) => family), ['economy', 'standard', 'standard'])
  assert.deepEqual(['solution-researcher', 'consistency-lens', 'architecture-compliance-lens'].map((id) => shipped[id][0]), ['researcher', 'reviewer', 'reviewer'])
})

/** Why init refuses the run on these layers. */
const refusal = async ({ config = {}, local, user }) => (await scripted({ config, user: user === undefined ? undefined : JSON.stringify(user), files: local === undefined ? {} : { [LOCAL]: typeof local === 'string' ? local : JSON.stringify(local) } }, () => []).init()).reason

test('a null for models or assign in a later layer removes what the earlier layers set, the plugin\'s defaults included; the refuter still escalates', async () => {
  const noModels = await runOn({ local: { models: null } })
  const noRules = await runOn({ local: { assign: null } })
  const removed = await runOn({
    config: { models: { 'gpt-codex': { tier: 'standard', copilot: { model: 'gpt-5.5-codex' } } }, assign: { agents: { 'software-engineer': 'gpt-codex' } } },
    local: { models: { 'gpt-codex': null }, assign: { types: null, agents: { 'software-engineer': null } } },
  })

  assert.deepEqual(dispatches(noModels).slice(0, 4).map((dispatch) => [dispatch.model, Object.hasOwn(dispatch, 'models'), Object.hasOwn(dispatch, 'effort')]), [['researcher', false, false], ['planner', false, false], ['implementer', false, false], ['implementer', false, false]])
  const [agents, refuters] = [dispatches(noRules).filter(({ agent: id }) => id !== 'finding-refuter'), dispatches(noRules).filter(({ agent: id }) => id === 'finding-refuter')]
  assert.deepEqual(agents.map((dispatch) => Object.keys(dispatch).filter((key) => key.startsWith('model') || key === 'effort')).flat(), [])
  assert.deepEqual(refuters.map(row), [['finding-refuter', 'standard', 'sonnet · -', '- · -'], ['finding-refuter', 'standard', 'sonnet · -', '- · -'], ['finding-refuter', 'standard', 'sonnet · -', '- · -']])
  assert.deepEqual(rows(removed)['software-engineer'], ['implementer', 'sonnet · -', '- · -'])
  assert.deepEqual(rows(removed)['consistency-lens'], ['implementer', 'sonnet · -', '- · -'])
})

test('with the default removed, an agent no rule names is left to the host', async () => {
  const { 'acceptance-designer': designer, 'solution-architect': architect, 'coverage-lens': lens } = rows(await runOn({ local: { assign: { default: null } } }))

  assert.deepEqual([designer, architect, lens], [['host', '- · -', '- · -'], ['planner', 'opus · -', '- · -'], ['reviewer', 'haiku · -', '- · -']])
})

test('models names families, each with an optional tier and a model and an effort per host, claude-code and copilot only', async () => {
  assert.equal(await refusal({
    config: {
      models: {
        'gpt-5': { copilot: { model: 'gpt' } },
        inherit: {},
        standard: { tier: 'frontier', 'claude-code': { model: '' }, copilot: { model: ['copilot-medium', ' '], effort: 'extreme' }, vscode: { model: 'copilot-medium' } },
        opus: 'claude-opus',
        haiku: { tier: 'cheap', copilot: { model: [] }, 'claude-code': 'haiku' },
        kimi: { tier: 'economy', copilot: { model: 7, temperature: 1 } },
      },
    },
  }), [
    'skraft-config.json is invalid: models: "gpt-5" must be a model family, a kebab-case word whose every part starts with a letter, such as implementer or gpt-codex (gpt-5.5 is a model, not a family)',
    'models: "inherit" must be a model family, a kebab-case word whose every part starts with a letter, such as implementer or gpt-codex (gpt-5.5 is a model, not a family)',
    'models.standard: a tier takes no tier',
    'models.standard.claude-code.model must be a model name or a non-empty list of model names, tried in order',
    'models.standard.copilot.model must be a model name or a non-empty list of model names, tried in order',
    'models.standard.copilot.effort must be one of low, medium, high, xhigh, max',
    'models.standard: unknown key vscode (allowed: tier, claude-code, copilot)',
    'models.opus must be an object: an optional tier beside one block per host (claude-code, copilot)',
    'models.haiku.tier must be one of economy, standard, frontier',
    'models.haiku.copilot.model must be a model name or a non-empty list of model names, tried in order',
    'models.haiku.claude-code must be an object: { "model": ..., "effort": ... }',
    'models.kimi.copilot.model must be a model name or a non-empty list of model names, tried in order',
    'models.kimi.copilot: unknown key temperature (allowed: model, effort)',
  ].join('; '))
  assert.equal(await refusal({ config: { models: ['sonnet'] } }), 'skraft-config.json is invalid: models must be an object of model families: tiers, roles or free families')
})

test('assign names a family or inherit by default, by type and by agent, an object adding an effort per host but never a model', async () => {
  assert.equal(await refusal({
    local: {
      assign: {
        default: 'gpt-5.5',
        types: { lens: { family: 'Economy', model: 'haiku' }, judge: 'frontier', phase: 7 },
        agents: { 'Cold_Reader': 'frontier', 'fitness-lens.v2': 'frontier', 'cold-reader-lens': { copilot: { model: 'gpt-6.0', effort: 'huge', temperature: 1 }, 'claude-code': 'high', rank: 1 } },
        order: [],
      },
    },
  }), [
    'skraft-config.local.json is invalid: assign: unknown key order (allowed: default, types, agents)',
    'assign.default must be a model family or inherit',
    'assign.types.lens.family must be a model family or inherit',
    'assign.types.lens: a model is chosen in models, by family, never in assign',
    'assign.types: unknown type judge (allowed: phase, lens, refuter, worker)',
    'assign.types.phase must be a model family, inherit, or { "family": ..., "<host>": { "effort": ... } }',
    'assign.agents: "Cold_Reader" must be a kebab-case agent id',
    'assign.agents: "fitness-lens.v2" must be a kebab-case agent id',
    'assign.agents.cold-reader-lens.copilot: a model is chosen in models, by family, never in assign',
    'assign.agents.cold-reader-lens.copilot.effort must be one of low, medium, high, xhigh, max',
    'assign.agents.cold-reader-lens.copilot: unknown key temperature (allowed: effort)',
    'assign.agents.cold-reader-lens.claude-code must be an object: { "effort": ... }',
    'assign.agents.cold-reader-lens: unknown key rank (allowed: family, claude-code, copilot)',
  ].join('; '))
  assert.equal(await refusal({ config: { assign: [] } }), 'skraft-config.json is invalid: assign must be an object: { "default", "types", "agents" }')
  assert.equal(await refusal({ config: { assign: { types: 'frontier', agents: ['frontier'] } } }), 'skraft-config.json is invalid: assign.types must be an object of rules by agent type; assign.agents must be an object of rules by agent id')
})

test('a developer\'s own files hold neither components nor a workflow, no file holds a rank, and each file is named with its own errors', async () => {
  assert.equal(await refusal({
    user: { components: [], rank: ['economy'], tdd: { replay: 'some' } },
    config: { rank: [] },
    local: { workflow: 'mine.dot', models: { 'gpt-codex': { tier: 'standard' } } },
  }), [
    '~/.skraft/config.json is invalid: components belongs in skraft-config.json, never in ~/.skraft/config.json; rank is no key: the tier of each family ranks it (economy < standard < frontier); tdd must be { "replay": "all" or "last-red" }',
    'skraft-config.json is invalid: rank is no key: the tier of each family ranks it (economy < standard < frontier)',
    'skraft-config.local.json is invalid: workflow belongs in skraft-config.json, never in skraft-config.local.json',
  ].join('; '))
  assert.equal(await refusal({ local: '{ "models": ' }), `skraft-config.local.json is invalid: skraft-config.local.json is not JSON: ${jsonError('{ "models": ')}`)
  assert.equal(await refusal({ user: [] }), '~/.skraft/config.json is invalid: ~/.skraft/config.json must hold a JSON object')
})

/** @param {string} text */
const jsonError = (text) => {
  try {
    JSON.parse(text)
  } catch (error) {
    return error.message
  }
  return ''
}

test('a free family needs a tier once the layers are merged: one layer may give the tier another family entry leaves out', async () => {
  assert.equal((await scripted({ config: { models: { 'gpt-codex': { copilot: { model: 'gpt-5.5-codex' } } } }, files: { [LOCAL]: JSON.stringify({ models: { 'gpt-codex': { tier: 'standard' } } }) } }, () => []).init()).ok, true)
  assert.equal(await refusal({
    config: { models: { 'gpt-codex': { tier: 'standard', copilot: { model: 'gpt-5.5-codex' } } }, assign: { default: 'gpt-codex', types: { lens: 'deep-thought' }, agents: { 'software-engineer': 'gpt-codex', 'cold-reader-lens': 'deep-review' } } },
    local: { models: { 'gpt-codex': { tier: null }, 'gpt-luna': {} }, assign: { default: 'gpt-mini' } },
  }), [
    'the merged configuration is invalid: models.gpt-codex is a free family: give it a "tier" (economy, standard, frontier)',
    'models.gpt-luna is a free family: give it a "tier" (economy, standard, frontier)',
    'assign.default names gpt-mini, which no tier ranks: declare it in models with a "tier"',
    'assign.types.lens names deep-thought, which no tier ranks: declare it in models with a "tier"',
    'assign.agents.cold-reader-lens names deep-review, which no tier ranks: declare it in models with a "tier"',
  ].join('; '))
  const { commands } = workflowHost({ files: { 'skraft-config.json': JSON.stringify({ assign: { default: 'gpt-mini' } }) } })
  assert.deepEqual((await commands.check()).errors, ['the merged configuration: assign.default names gpt-mini, which no tier ranks: declare it in models with a "tier"'])
})

test('doctor fails the configuration when a free family has no tier once the layers are merged', async () => {
  const workspace = new InMemoryWorkspace({
    'services/api/Api.sln': '',
    'skraft-config.json': JSON.stringify({ components: [{ name: 'api', root: 'services/api', stack: 'dotnet', commands: { build: 'dotnet build' } }], models: { 'gpt-codex': { copilot: { model: 'gpt-5.5-codex' } } } }),
  })
  const machine = new ScriptedMachine()
  const doctor = createDoctor({ workspace, userSettings: new InMemoryUserSettings(), workflowSource: new InMemoryWorkflowSource(), executables: machine, commandRunner: machine, sourceControl: new InMemorySourceControl(), runtime: { nodeVersion: () => 'v22.11.0' } })

  const report = await doctor.check()

  assert.equal(report.ok, false)
  assert.deepEqual(report.checks.find(({ subject }) => subject === 'config'), {
    subject: 'config', status: 'fail', detail: 'the merged configuration is invalid: models.gpt-codex is a free family: give it a "tier" (economy, standard, frontier)',
  })
})
