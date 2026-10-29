import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConfiguration } from '../../../../plugins/skraft-framework/engine/application/config/configuration-usecase.mjs'
import { InMemoryAgentCatalog, InMemoryUserSettings, InMemoryWorkflowSource, InMemoryWorkspace } from '../support/in-memory-host.mjs'

const API = Object.freeze({
  name: 'payment-api', root: 'services/payment-api', stack: 'dotnet', paths: { src: ['src'], tests: ['tests'] },
  commands: { build: 'dotnet build --nologo', lint: 'dotnet format --verify-no-changes', test: 'dotnet test --nologo' },
})
const WEB = Object.freeze({ name: 'payment-web', root: '../payment-web', stack: 'react', commands: { test: 'npx vitest run' } })
const TEAM = Object.freeze({ baseBranch: 'develop', tdd: { replay: 'last-red' }, publish: { visuals: false, draft: false }, components: [API, WEB] })
const LOCAL = 'skraft-config.local.json'

/** The Configuration tab's use case on a working copy whose files say what is given. */
const configuration = ({ team = TEAM, local, user, files = {} } = {}) => {
  const workspace = new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify(team), ...(local === undefined ? {} : { [LOCAL]: JSON.stringify(local) }), ...files })
  const use = createConfiguration({ workspace, userSettings: new InMemoryUserSettings(user), workflowSource: new InMemoryWorkflowSource(), agentCatalog: new InMemoryAgentCatalog() })
  return { workspace, view: () => use.view(), save: (edit) => use.save(edit), file: (path) => JSON.parse(workspace.files.get(path)) }
}

/** What one agent of the workflow runs on, on one host, as the view shows it. */
const runsOn = (view, host, agent) => {
  const { family, tier, model, effort, source } = view.models.agents[host].find((row) => row.agent === agent)
  return { family, tier, model, effort, source }
}

test('the view shows each component as its files say, every command as the developer wrote it and none filled in; the consents, the models and the bar no file changes', async () => {
  const view = await configuration({ local: { assign: { agents: { 'solution-architect': 'frontier' } } } }).view()

  assert.equal(view.ok, true)
  assert.deepEqual(view.components, [
    { name: 'payment-api', root: 'services/payment-api', stack: 'dotnet', commands: API.commands, mocking: 'microcks', contractTesting: false },
    { name: 'payment-web', root: '../payment-web', stack: 'react', commands: { test: 'npx vitest run' }, mocking: 'inprocess', contractTesting: false },
  ])
  assert.deepEqual(view.consents, [{ key: 'pullRequest', value: null, state: 'unanswered' }, { key: 'visuals', value: false, state: 'declined' }])
  assert.deepEqual([view.confirmed, view.files], [false, { team: 'skraft-config.json', local: LOCAL }])
  assert.deepEqual({ assign: view.models.assign, models: view.models.models }, { assign: { agents: { 'solution-architect': 'frontier' } }, models: {} })
  assert.deepEqual(runsOn(view, 'claude-code', 'solution-architect'), { family: 'frontier', tier: 'frontier', model: ['opus'], effort: null, source: { family: 'agent', model: 'family', effort: 'host' } })
  assert.deepEqual(runsOn(view, 'copilot', 'solution-researcher'), { family: 'researcher', tier: 'standard', model: null, effort: null, source: { family: 'agent', model: 'host', effort: 'host' } })
  assert.deepEqual(view.thresholds, [{ scope: 'core', bar: 100 }, { scope: 'boundary', bar: 80 }])
  assert.deepEqual(view.choices, {
    stacks: ['dotnet', 'java', 'python', 'typescript', 'javascript', 'react'],
    mocking: ['microcks', 'inprocess'],
    commands: ['build', 'format', 'lint', 'test', 'architecture', 'coverage', 'mutation', 'e2e'],
    hosts: ['claude-code', 'copilot'],
    types: ['phase', 'lens', 'refuter', 'worker'],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    families: ['inherit', 'economy', 'standard', 'frontier', 'premium', 'reviewer', 'researcher', 'implementer', 'planner'],
  })
})

test('a saved edit changes only what the person changed in skraft-config.json: a command written, one removed, the mocking, a consent with the version of its question; every other key stays', async () => {
  const host = configuration()
  const unchanged = { name: 'payment-web', root: '../payment-web', stack: 'react', commands: { test: 'npx vitest run' }, mocking: 'inprocess', contractTesting: false }
  assert.deepEqual(await host.save({ components: [unchanged], consents: { visuals: false } }), { ok: true, reason: 'nothing changed' })

  const saved = await host.save({
    components: [{ name: 'payment-api', commands: { build: 'dotnet build --nologo', lint: '  ', test: 'dotnet test --nologo --no-build' }, mocking: 'inprocess', contractTesting: true }, unchanged],
    consents: { pullRequest: true, visuals: false },
  })

  assert.deepEqual(saved, { ok: true, reason: 'skraft-config.json saved' })
  assert.deepEqual(host.file('skraft-config.json'), {
    ...TEAM,
    publish: { visuals: false, draft: false, pullRequest: true, questionVersions: { pullRequest: 2 } },
    components: [{ ...API, commands: { build: 'dotnet build --nologo', test: 'dotnet test --nologo --no-build' }, mocking: { strategy: 'inprocess' }, contractTesting: true }, WEB],
  })
  assert.equal(host.workspace.files.has(LOCAL), false)

  assert.deepEqual(await host.save({ consents: { pullRequest: null } }), { ok: true, reason: 'skraft-config.json saved' })
  assert.deepEqual(host.file('skraft-config.json').publish, TEAM.publish)
})

test('the models the person chooses go into their own skraft-config.local.json, which .gitignore lists; the view then shows what each agent runs on', async () => {
  const host = configuration({ local: { configurationConfirmed: true } })

  const saved = await host.save({
    assign: { agents: { 'solution-architect': 'frontier' }, types: { lens: 'economy' } },
    models: { frontier: { copilot: { model: ['gpt-5.5'], effort: 'high' } } },
  })

  assert.deepEqual(saved, { ok: true, reason: 'skraft-config.local.json saved' })
  assert.deepEqual(host.file(LOCAL), {
    configurationConfirmed: true,
    assign: { agents: { 'solution-architect': 'frontier' }, types: { lens: 'economy' } },
    models: { frontier: { copilot: { model: ['gpt-5.5'], effort: 'high' } } },
  })
  assert.equal(host.workspace.files.get('.gitignore'), `${LOCAL}\n`)
  assert.deepEqual(host.file('skraft-config.json'), TEAM)
  const view = await host.view()
  assert.deepEqual(runsOn(view, 'copilot', 'solution-architect'), { family: 'frontier', tier: 'frontier', model: ['gpt-5.5'], effort: 'high', source: { family: 'agent', model: 'family', effort: 'family' } })
  assert.equal(view.confirmed, true)

  assert.deepEqual(await host.save({ assign: {}, models: null }), { ok: true, reason: 'skraft-config.local.json saved' })
  assert.deepEqual(host.file(LOCAL), { configurationConfirmed: true })
})

test('an edit the configuration would refuse writes nothing, with why; so does an edit of a component no file lists, or a key no edit takes', async () => {
  const refusals = [
    [{ components: [{ name: 'payment-api', stack: 'cobol' }], consents: { pullRequest: true } }, 'skraft-config.json is invalid: component payment-api: stack must be one of dotnet, java, python, typescript, javascript, react'],
    [{ assign: { agents: { 'solution-architect': 'gpt-5.5' } } }, 'skraft-config.local.json is invalid: assign.agents.solution-architect must be a model family, inherit, or { "family": ..., "<host>": { "effort": ... } }'],
    [{ components: [{ name: 'checkout' }] }, 'the edit names a component skraft-config.json does not list; skraft init adds components'],
    [{ components: [{ name: 'payment-api', paths: { src: ['x'] } }] }, 'a component edit takes name, root, stack, commands, mocking and contractTesting only'],
    [{ workflow: 'mine' }, 'a configuration edit takes components, consents, assign and models only'],
    [{ consents: { reviewComment: true } }, 'consents takes pullRequest and visuals, each true, false or null'],
  ]
  for (const [edit, reason] of refusals) {
    const host = configuration()

    assert.deepEqual(await host.save(edit), { ok: false, reason })
    assert.deepEqual(host.file('skraft-config.json'), TEAM)
    assert.equal(host.workspace.files.has(LOCAL), false)
  }
})

test('a configuration the files make invalid is shown with why, and no edit is saved over it', async () => {
  const host = configuration({ team: { components: [{ ...API, stack: 'cobol' }] } })

  const reason = 'skraft-config.json is invalid: component payment-api: stack must be one of dotnet, java, python, typescript, javascript, react'
  assert.deepEqual(await host.view(), { ok: false, reason })
  assert.deepEqual(await host.save({ consents: { pullRequest: true } }), { ok: false, reason })

  const unreadable = await configuration({ files: { '.skraft/pipeline.skraft.dot': 'digraph broken {' } }).view()
  assert.deepEqual([unreadable.ok, unreadable.components.length, unreadable.models.agents], [true, 2, null])
})
