import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, finding, lenses, nominal, refutes, says, scripted, SLUG } from '../support/pipeline-host.mjs'

const LOCAL = 'skraft-config.local.json'

/** A run of the nominal story to its end, its agents started by `agentHost`, on the developer's local file. */
const runOn = async (agentHost, { local, review = lenses({}) } = {}) => {
  const host = scripted({ files: local === undefined ? {} : { [LOCAL]: JSON.stringify(local) } }, nominal)
  host.agentRunner.host = agentHost
  host.agentRunner.review = review
  const outcome = await host.start()
  assert.equal(outcome.status, 'done', outcome.reason)
  return host
}

/** The log lines that say what an agent runs on. */
const modelLines = (host) => host.progress.lines.filter((line) => line.startsWith(`${SLUG}: `) && line.includes(' — '))

test('under Copilot with no Copilot model configured, the log says the host chooses the model of each agent it starts, lenses and refuter included, and each start names the host', async () => {
  const host = await runOn('copilot', {
    review: lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'high', 'the ADR contradicts the context map')])], refuter: [refutes('refuted')] }),
  })

  assert.deepEqual(modelLines(host), [
    `${SLUG}: solution-researcher, attempt 1 — researcher · standard · model chosen by the host`,
    `${SLUG}: solution-architect, attempt 1 — planner · frontier · model chosen by the host`,
    `${SLUG}: design_review (consistency, architecture-compliance, fitness) — reviewer · economy · model chosen by the host`,
    `${SLUG}: design_review refutes consistency F1 — standard · model chosen by the host`,
    `${SLUG}: acceptance-designer, attempt 1 — implementer · standard · model chosen by the host`,
    `${SLUG}: distill_review (coverage, business-alignment, testability, boundary-enforcement) — reviewer · economy · model chosen by the host`,
    `${SLUG}: software-engineer, attempt 1 — implementer · standard · model chosen by the host`,
    `${SLUG}: deliver_review (test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity) — reviewer · economy · model chosen by the host`,
    `${SLUG}: pr-writer, attempt 1 — economy · model chosen by the host`,
  ])
  const starts = host.events().filter((event) => event.type === 'step.started' && (event.agent !== undefined || event.lenses !== undefined))
  assert.deepEqual([...new Set(starts.map((event) => event.host))], ['copilot'])
})

test('under Claude Code, the log names the models of each agent in the order the host tries them and its effort, each group of lenses on its own models, and an inherited agent left to the host', async () => {
  const host = await runOn('claude-code', {
    local: {
      models: { standard: { 'claude-code': { model: 'sonnet', effort: 'medium' } }, planner: { 'claude-code': { model: ['opus', 'sonnet'] } } },
      assign: { agents: { 'fitness-lens': 'frontier', 'pr-writer': 'inherit' } },
    },
    review: lenses({ fitness: [says('fitness', 'fail', [finding('F1', 'high', 'nothing asks for the cache')])], refuter: [refutes('refuted')] }),
  })

  const lines = modelLines(host)
  assert.deepEqual(lines.slice(0, 4), [
    `${SLUG}: solution-researcher, attempt 1 — researcher · standard · sonnet · effort medium`,
    `${SLUG}: solution-architect, attempt 1 — planner · frontier · opus → sonnet`,
    `${SLUG}: design_review (consistency, architecture-compliance, fitness) — consistency-lens, architecture-compliance-lens: reviewer · economy · haiku; fitness-lens: frontier · opus`,
    `${SLUG}: design_review refutes fitness F1 — frontier · opus`,
  ])
  assert.equal(lines.at(-1), `${SLUG}: pr-writer, attempt 1 — model chosen by the host`)
})

test('the view lists what each agent started runs on under the host that started it, then the model the host says it ran on once the agent answered', async () => {
  const local = { models: { researcher: { copilot: { model: ['gpt-5.5', 'gpt-6.0'], effort: 'high' } } } }
  const seen = []
  const host = scripted({ files: { [LOCAL]: JSON.stringify(local) } }, (it) => [
    async (dispatch) => {
      seen.push((await it.view()).agents)
      await agent()(it)(dispatch)
      return { ok: true, text: 'done', model: 'gpt-6.0' }
    },
    ...nominal(it).slice(1),
  ])
  host.agentRunner.host = 'copilot'
  assert.equal((await host.start()).status, 'done')

  const researching = { step: 'research', agent: 'solution-researcher', family: 'researcher', tier: 'standard', host: 'copilot', models: ['gpt-5.5', 'gpt-6.0'], effort: 'high' }
  assert.deepEqual(seen, [[researching]])
  const lens = (agentId) => ({ step: 'design_review', agent: agentId, family: 'reviewer', tier: 'economy', host: 'copilot', models: null, effort: null })
  assert.deepEqual((await host.view()).agents.slice(0, 5), [
    { ...researching, models: ['gpt-6.0'] },
    { step: 'design', agent: 'solution-architect', family: 'planner', tier: 'frontier', host: 'copilot', models: null, effort: null },
    lens('consistency-lens'), lens('architecture-compliance-lens'), lens('fitness-lens'),
  ])
})
