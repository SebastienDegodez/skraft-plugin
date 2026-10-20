import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, finding, lenses, nominal, says, scripted } from '../support/pipeline-host.mjs'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'

/** Three families, weakest first, each named for the hosts the developer uses. */
const MODELS = {
  haiku: { 'claude-code': 'haiku', copilot: ['copilot-small-2', 'copilot-small-1'] },
  sonnet: { 'claude-code': 'claude-sonnet-test', copilot: 'copilot-medium' },
  opus: { copilot: 'copilot-large' },
}

const designating = (dot, config) => ({ config: { ...config, workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': dot } })

/** What a dispatch says about the model it runs on, a field it leaves out staying out. */
const modelOf = (dispatch) => [dispatch.agent, ...['model', 'models'].filter((key) => Object.hasOwn(dispatch, key)).map((key) => dispatch[key])]

test('a family named in skraft-config.json reaches every dispatch with its model names per host; a family it does not name reaches it alone', async () => {
  const workflow = edit(BUILT_IN_WORKFLOW, ['phase="RESEARCH", model="sonnet"]', 'phase="RESEARCH", model="gpt-luna"]'])
  const host = scripted(designating(workflow, { models: MODELS }), nominal)

  assert.equal((await host.start()).status, 'done')

  const sonnet = { 'claude-code': ['claude-sonnet-test'], copilot: ['copilot-medium'] }
  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => Object.keys(dispatch).filter((key) => key.startsWith('model'))), [['model'], ['model', 'models'], ['model', 'models'], ['model', 'models']])
  assert.deepEqual(host.agentRunner.dispatches.map(modelOf), [
    ['solution-researcher', 'gpt-luna'],
    ['solution-architect', 'opus', { copilot: ['copilot-large'] }],
    ['acceptance-designer', 'sonnet', sonnet],
    ['software-engineer', 'sonnet', sonnet],
  ])
  const haiku = { 'claude-code': ['haiku'], copilot: ['copilot-small-2', 'copilot-small-1'] }
  assert.deepEqual(host.agentRunner.batches[0].map(modelOf), [['consistency-lens', 'haiku', haiku], ['architecture-compliance-lens', 'haiku', haiku], ['fitness-lens', 'haiku', haiku]])
})

test('without models in skraft-config.json, a lens naming no family and its node none runs with no model, nor does the refuter of its findings', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])] })

  assert.equal((await host.start()).status, 'done')

  const reviewed = host.agentRunner.reviewed()
  assert.deepEqual(reviewed.slice(0, 4).map(modelOf), [['consistency-lens'], ['architecture-compliance-lens'], ['fitness-lens'], ['finding-refuter']])
  assert.deepEqual(host.agentRunner.dispatches.map(modelOf).slice(0, 2), [['solution-researcher', 'sonnet'], ['solution-architect', 'opus']])
})

/**
 * The family of each lens of design_review and of the refuter of each finding they report,
 * when consistency, architecture-compliance and fitness each report one; together: the first two
 * at the same line with the same severity, so that one refuter checks both.
 * @param {string} specs design_review's attributes @param {object} config @param {{ together?: boolean }} [options]
 */
const reviewFamilies = async (specs, config, { together = false } = {}) => {
  const workflow = edit(BUILT_IN_WORKFLOW, ['lenses="consistency,architecture-compliance,fitness"', specs])
  const host = scripted(designating(workflow, config), (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', together ? 'high' : 'blocker', 'the ADR contradicts the context map')])],
    'architecture-compliance': [says('architecture-compliance', 'fail', [finding('F1', 'high', 'the domain imports the database driver', { location: together ? 'src/Checkout.cs:12' : 'src/Checkout.cs:40' })])],
    fitness: [says('fitness', 'fail', [finding('F1', 'high', 'no latency budget', { location: 'src/Checkout.cs:41' })])],
  })
  assert.equal((await host.start()).status, 'done')
  const [lensed, refuted] = host.agentRunner.batches
  return { lenses: lensed.map(({ model }) => model ?? 'none'), refuter: refuted.map(({ model, models }) => `${model ?? 'none'} ${JSON.stringify(models ?? null)}`) }
}

test('the refuter runs one family above the strongest family of the lenses it checks, in the order of skraft-config.json, the last at most', async () => {
  const models = { astra: { copilot: 'astra-1' }, 'gpt-luna': { copilot: 'luna-1' }, sonnet: { 'claude-code': 'sonnet' } }

  assert.deepEqual(await reviewFamilies('lenses="consistency,architecture-compliance@astra,fitness@sonnet"', { models }), {
    lenses: ['astra', 'astra', 'sonnet'],
    refuter: ['gpt-luna {"copilot":["luna-1"]}', 'gpt-luna {"copilot":["luna-1"]}', 'sonnet {"claude-code":["sonnet"]}'],
  })
  assert.deepEqual(await reviewFamilies('lenses="consistency,architecture-compliance@kimi,fitness@gpt-luna", model="gpt-luna"', { models }), {
    lenses: ['gpt-luna', 'kimi', 'gpt-luna'],
    refuter: ['sonnet {"claude-code":["sonnet"]}', 'sonnet {"claude-code":["sonnet"]}', 'sonnet {"claude-code":["sonnet"]}'],
  })
  assert.deepEqual(await reviewFamilies('lenses="consistency,architecture-compliance@gpt-luna,fitness@astra"', { models }, { together: true }), {
    lenses: ['astra', 'gpt-luna', 'astra'],
    refuter: ['sonnet {"claude-code":["sonnet"]}', 'gpt-luna {"copilot":["luna-1"]}'],
  })
})

test('a review node\'s refuter= wins; without models in skraft-config.json the refuter runs on the family a lens it checks names, else on none', async () => {
  assert.deepEqual(await reviewFamilies('lenses="consistency,architecture-compliance@astra,fitness@sonnet", refuter="kimi"', { models: { astra: {}, sonnet: {} } }), {
    lenses: ['astra', 'astra', 'sonnet'],
    refuter: ['kimi null', 'kimi null', 'kimi null'],
  })
  assert.deepEqual(await reviewFamilies('lenses="consistency,architecture-compliance@kimi,fitness@sonnet"', {}), {
    lenses: ['none', 'kimi', 'sonnet'],
    refuter: ['none null', 'kimi null', 'sonnet null'],
  })
  assert.deepEqual(await reviewFamilies('lenses="consistency,architecture-compliance@kimi,fitness@sonnet"', {}, { together: true }), {
    lenses: ['none', 'kimi', 'sonnet'],
    refuter: ['kimi null', 'sonnet null'],
  })
})

test('models in skraft-config.json names model families, each mapped to model names for claude-code and copilot only', async () => {
  const refusal = async (models) => (await scripted({ config: { models } }, () => []).init()).reason

  assert.equal(await refusal({
    'GPT 5': { copilot: 'gpt' },
    sonnet: { 'claude-code': '', copilot: ['copilot-medium', ' '], vscode: 'copilot-medium' },
    opus: 'claude-opus',
    haiku: { copilot: [] },
    kimi: { copilot: 7 },
  }), [
    'skraft-config.json is invalid: models: "GPT 5" must be a model family, a kebab-case word such as sonnet or gpt-luna',
    'models.sonnet.claude-code must be a model name or a non-empty list of model names, the preferred first',
    'models.sonnet.copilot must be a model name or a non-empty list of model names, the preferred first',
    'models.sonnet: unknown host vscode (allowed: claude-code, copilot)',
    'models.opus must be an object of model names by host (claude-code, copilot)',
    'models.haiku.copilot must be a model name or a non-empty list of model names, the preferred first',
    'models.kimi.copilot must be a model name or a non-empty list of model names, the preferred first',
  ].join('; '))
  assert.equal(await refusal(['sonnet']), 'skraft-config.json is invalid: models must be an object of model families, weakest first')
  assert.equal((await scripted({ config: { models: { 'gpt-luna': { copilot: 'luna-1', 'claude-code': ['a', 'b'] }, kimi: {} } } }, () => []).init()).ok, true)
})
