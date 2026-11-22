import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDoctor } from '../../../../plugins/skraft-framework/engine/application/diagnostics/doctor-usecase.mjs'
import { BUILT_IN_WORKFLOW, GITHUB_REMOTE, InMemoryAgentCatalog, InMemoryCodeHost, InMemoryCopilotSdk, InMemoryHostSettings, InMemoryPullRequests, InMemorySourceControl, InMemoryTracking, InMemoryUserSettings, InMemoryWorkflowSource, InMemoryWorkspace, ScriptedMachine } from '../support/in-memory-host.mjs'
import { edit, withLenses } from '../workflow/support.mjs'

const API = { name: 'api', root: 'services/payment-api', stack: 'dotnet', bdd: false, commands: { build: 'dotnet build --nologo', test: 'dotnet test --nologo --logger trx', mutation: 'dotnet stryker --since:{baseSha}' } }
const WEB = { name: 'web', root: '../payment-web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, commands: { test: 'npx vitest run --reporter=junit', e2e: 'npx playwright test' } }
const MICROCKS_WEB = { ...WEB, mocking: { strategy: 'microcks' } }
const FOLDERS = { 'services/payment-api/Payment.sln': '', '../payment-web/package.json': '{}' }

/** runner: the machine that starts the commands, the one that finds them unless told otherwise; config: the rest of skraft-config.json. */
const doctor = ({ components = [API, WEB], config = {}, machine = new ScriptedMachine(), runner = machine, node = 'v22.11.0', files = FOLDERS, sourceControl = new InMemorySourceControl(), user, copilotSdk = new InMemoryCopilotSdk(), codeHost = new InMemoryCodeHost(), mutationRuns = new InMemoryTracking({ root: '/work/.copilot-tracking/skraft-mutation' }) } = {}) => {
  const workspace = new InMemoryWorkspace({ ...files, ...(components === null ? {} : { 'skraft-config.json': JSON.stringify({ ...config, components }) }) })
  const workflowSource = new InMemoryWorkflowSource()
  return {
    machine,
    workspace,
    doctor: createDoctor({
      workspace, userSettings: new InMemoryUserSettings(user), workflowSource, executables: machine, commandRunner: runner, sourceControl, runtime: { nodeVersion: () => node },
      agentCatalog: new InMemoryAgentCatalog(), hostSettings: new InMemoryHostSettings(), copilotSdk,
      forges: { github: { codeHost, pullRequests: new InMemoryPullRequests() } }, mutationRun: { journal: mutationRuns },
    }),
  }
}

/** Without models in any file: Claude Code has the plugin's aliases, Copilot no model at all. */
const BY_DEFAULT = [
  { subject: 'models/claude-code', status: 'ok', detail: "every family the workflow's agents run on has a model on claude-code" },
  { subject: 'models/copilot', status: 'warn', detail: "no model on copilot for researcher (1 dispatch), planner (1 dispatch), reviewer (13 dispatches), standard (3 dispatches), implementer (2 dispatches), economy (1 dispatch); these run on the session's model" },
]

/** The infrastructure lines of API and of WEB mocking with Microcks, and the runtime that answers. */
const MICROCKS = 'Microcks uber native image via Testcontainers, one container per test session'
const INFRASTRUCTURE = [
  'api (dotnet) entry point: in-process (targeted), real (walking skeleton) — WebApplicationFactory; source plugin',
  'api (dotnet) internal gateway: in-memory (targeted), testcontainers (walking skeleton) — Testcontainers; source plugin',
  `api (dotnet) external gateway: microcks (targeted), microcks (walking skeleton) — ${MICROCKS}; source plugin`,
  'api (dotnet) clock: fake (targeted), fake (walking skeleton); source plugin',
  'web (react) entry point: in-process (targeted) — Testing Library; source plugin',
  `web (react) front to back: microcks (targeted), microcks (e2e) — ${MICROCKS}; Playwright + Microcks; source skraft-config.json (mocking.strategy)`,
  'web (react) clock: fake (targeted); source plugin',
].map((detail) => ({ subject: 'infrastructure', status: 'ok', detail }))
const DOCKER = { subject: 'container-runtime', status: 'ok', detail: 'docker answers docker info' }

/** Without the Copilot CLI, VS Code runs the pipeline through the agent loop. */
const NO_SDK = {
  subject: 'vscode', status: 'ok',
  detail: 'no Copilot SDK under /home/dev/.copilot/pkg: under VS Code, the Skraft - Orchestrator agent conducts skraft next and skraft record; install the Copilot CLI to run the pipeline through its SDK',
}

test('doctor names where each runner reads a component\'s scenarios, fails on a folder that is no folder, says so when nothing is meant to, and fails when nobody decided', async () => {
  const pair = { runner: 'reqnroll', features: 'Features', steps: 'Steps' }
  const bddOf = async (files) => {
    const { doctor: check } = doctor({ components: [{ ...API, bdd: [pair] }], files: { ...FOLDERS, ...files } })
    const report = await check.check()
    return report.checks.filter(({ subject }) => subject === 'api/bdd')
  }

  assert.deepEqual(await bddOf({ 'services/payment-api/Features/pay.feature': '', 'services/payment-api/Steps/PaySteps.cs': '' }), [
    { subject: 'api/bdd', status: 'ok', detail: 'reqnroll: Features → Steps' },
  ])
  assert.deepEqual(await bddOf({ 'services/payment-api/Features/pay.feature': '' }), [
    { subject: 'api/bdd', status: 'fail', detail: 'reqnroll: Steps is no folder of the working copy' },
  ])
  assert.deepEqual(await bddOf({}), [
    { subject: 'api/bdd', status: 'fail', detail: 'reqnroll: Features and Steps are no folders of the working copy' },
  ])
  const unbound = doctor({ components: [{ ...API, bdd: [{ features: 'Features' }] }], files: { ...FOLDERS, 'services/payment-api/Features/pay.feature': '' } })
  assert.deepEqual((await unbound.doctor.check()).checks.filter(({ subject }) => subject === 'api/bdd'), [
    { subject: 'api/bdd', status: 'ok', detail: 'Features, bound to nothing' },
  ])
  const nowhere = doctor({ components: [{ ...API, bdd: [{ features: 'Features' }] }] })
  assert.deepEqual((await nowhere.doctor.check()).checks.filter(({ subject }) => subject === 'api/bdd'), [
    { subject: 'api/bdd', status: 'fail', detail: 'Features is no folder of the working copy' },
  ], 'a pair that binds nothing still names a folder, and a folder that names nothing holds no scenario')
  const declined = doctor({ components: [{ ...API, bdd: false }] })
  assert.deepEqual((await declined.doctor.check()).checks.filter(({ subject }) => subject === 'api/bdd'), [])

  const { bdd, ...undecided } = API
  for (const component of [undecided, { ...API, bdd: true }]) {
    const report = await doctor({ components: [component] }).doctor.check()
    assert.deepEqual(report.checks.filter(({ subject }) => subject === 'api/bdd'), [{
      subject: 'api/bdd',
      status: 'fail',
      detail: 'the component does not say whether it describes its behaviour in Gherkin; run /skraft-init, or write "bdd" in skraft-config.json',
    }])
    assert.equal(report.ok, false, 'a component nobody decided for is a failure: no run would start')
  }
})

const failures = (report) => report.checks.filter((check) => check.status === 'fail').map(({ subject, detail }) => `${subject}: ${detail}`)

test('the forge is reachable: doctor passes and lists every command of a component without starting one, and shows the infrastructure of each component\'s tests', async () => {
  const { machine, doctor: check } = doctor({ components: [API, MICROCKS_WEB] })

  const report = await check.check()

  assert.deepEqual({ ok: report.ok, checks: report.checks }, {
    ok: true,
    checks: [
      { subject: 'node', status: 'ok', detail: 'Node v22.11.0' },
      { subject: 'config', status: 'ok', detail: '2 components: api, web' },
      { subject: 'forge', status: 'ok', detail: 'github, deduced from the Git remote' },
      { subject: 'screenshots', status: 'ok', detail: 'attached to the pull request by the forge\'s client' },
      { subject: 'api/build', status: 'ok', detail: 'dotnet build --nologo (listed; skraft_repl starts it, never skraft)' },
      { subject: 'api/test', status: 'ok', detail: 'dotnet test --nologo --logger trx (listed; skraft_repl starts it, never skraft)' },
      { subject: 'api/mutation', status: 'ok', detail: 'dotnet stryker --since:{baseSha} (listed; skraft_repl starts it, never skraft)' },
      { subject: 'web/test', status: 'ok', detail: 'npx vitest run --reporter=junit (listed; skraft_repl starts it, never skraft)' },
      { subject: 'web/e2e', status: 'ok', detail: 'npx playwright test (listed; skraft_repl starts it, never skraft)' },
      ...INFRASTRUCTURE,
      ...BY_DEFAULT,
      NO_SDK,
    ],
  })
  assert.deepEqual(machine.lines(), [])
})
test('doctor says how VS Code runs the pipeline: through the Copilot SDK the Copilot CLI ships, else the agent loop, configuration or not', async () => {
  const sdk = '/home/dev/.copilot/pkg/darwin-arm64/1.0.102-1/copilot-sdk'
  const found = new InMemoryCopilotSdk({ found: true, version: '1.0.102-1', sdk, cli: '/home/dev/.copilot/pkg/darwin-arm64/1.0.102-1/index.js' })

  const withSdk = await doctor({ copilotSdk: found }).doctor.check()
  const unconfigured = await doctor({ components: null }).doctor.check()

  assert.deepEqual(withSdk.checks.at(-1), {
    subject: 'vscode', status: 'ok',
    detail: `Copilot SDK 1.0.102-1 (${sdk}): under VS Code, run the pipeline through it with engine/drivers/copilot-sdk/skraft-run.mjs`,
  })
  assert.deepEqual(unconfigured.checks.map(({ subject, status }) => `${subject} ${status}`), ['node ok', 'config fail', 'vscode ok'])
  assert.deepEqual(unconfigured.checks.at(-1), NO_SDK)
})

const AZURE = 'https://dev.azure.com/acme/shop/_git/shop'
const UNREACHABLE = 'skraft cannot reach the forge azure-devops yet (forge in skraft-config.json, else the host of the Git remote, chooses it)'
const SIGNED_OUT = 'gh is not signed in to github.com; run gh auth login --hostname github.com'

/** The doctor's verdict and its forge line, on a working copy whose remote and configuration are given. */
const forgeOn = async ({ remote = GITHUB_REMOTE, config = {}, codeHost } = {}) => {
  const report = await doctor({ config, sourceControl: new InMemorySourceControl({}, { remote }), codeHost }).doctor.check()
  return [report.ok, report.checks.find(({ subject }) => subject === 'forge')]
}

test('doctor names the forge a run uses and what chose it, and warns of what this machine misses to reach it, never failing', async () => {
  assert.deepEqual(await forgeOn({ remote: AZURE, config: { forge: 'github' } }), [true, { subject: 'forge', status: 'ok', detail: 'github, named in the configuration' }])
  assert.deepEqual(await forgeOn({ remote: AZURE }), [true, { subject: 'forge', status: 'warn', detail: `azure-devops, deduced from the Git remote: ${UNREACHABLE}` }])
  assert.deepEqual(await forgeOn({ config: { forge: 'azure-devops' } }), [true, { subject: 'forge', status: 'warn', detail: `azure-devops, named in the configuration: ${UNREACHABLE}` }])
  assert.deepEqual(await forgeOn({ codeHost: new InMemoryCodeHost({ unavailable: SIGNED_OUT }) }), [true, { subject: 'forge', status: 'warn', detail: `github, deduced from the Git remote: ${SIGNED_OUT}` }])
})

/** The doctor's verdict and its screenshots line, for a working copy with a front end. */
const screenshotsOn = async (codeHost, components = [API, MICROCKS_WEB]) => {
  const report = await doctor({ components, codeHost }).doctor.check()
  return [report.ok, report.checks.filter(({ subject }) => subject === 'screenshots')]
}

test('doctor says how a front end\'s screenshots reach the pull request, and warns, never failing, when the forge\'s client cannot show them', async () => {
  const NO_ATTACH = 'gh pr create takes no --attach: update gh, or the pull request is opened without its screenshots'
  assert.deepEqual(await screenshotsOn(new InMemoryCodeHost({ screenshotsBlocked: NO_ATTACH })), [true, [{ subject: 'screenshots', status: 'warn', detail: NO_ATTACH }]])
  assert.deepEqual(await screenshotsOn(new InMemoryCodeHost({ attachesFiles: false })), [true, [{ subject: 'screenshots', status: 'ok', detail: 'committed on the working branch and linked at their commit' }]])
  assert.deepEqual(await screenshotsOn(new InMemoryCodeHost(), [API]), [true, []])
  assert.deepEqual(await screenshotsOn(new InMemoryCodeHost({ unavailable: SIGNED_OUT })), [true, []])
})

test('doctor never looks a command\'s program up: with no program installed, every command that parses passes', async () => {
  const { machine, doctor: check } = doctor({ machine: new ScriptedMachine({ installed: [] }) })

  const report = await check.check()

  assert.deepEqual(failures(report), [])
  assert.deepEqual(machine.lines(), [])
})
test('the families an ejected workflow names count, and those with no model for a host are a warning, not a failure', async () => {
  const workflow = edit(withLenses(BUILT_IN_WORKFLOW, 'design_review', ['consistency@gpt-luna', 'architecture-compliance', 'fitness@planner']),
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon, mandatory=true, refuter="kimi"]'],
    ['distill_review [shape=tripleoctagon, mandatory=true]', 'distill_review [shape=tripleoctagon, mandatory=true, model="frontier"]'])
  const files = { ...FOLDERS, '.skraft/pipeline.skraft.dot': workflow }
  const models = (mapped) => ({ models: { 'gpt-luna': { tier: 'standard', copilot: { model: 'b' } }, kimi: { tier: 'economy' }, ...mapped } })
  const copilot = { copilot: { model: 'b' } }
  const modelChecks = async (config) => (await doctor({ components: [API, WEB], files, config }).doctor.check()).checks.filter(({ subject }) => subject.startsWith('models'))

  assert.deepEqual(await modelChecks(models({ frontier: { 'claude-code': null } })), [
    { subject: 'models/claude-code', status: 'warn', detail: "no model on claude-code for planner (2 dispatches), frontier (5 dispatches); these run on the agent file's model" },
    { subject: 'models/copilot', status: 'warn', detail: "no model on copilot for researcher (1 dispatch), planner (2 dispatches), reviewer (7 dispatches), kimi (1 dispatch), implementer (2 dispatches), frontier (5 dispatches), standard (1 dispatch), economy (1 dispatch); these run on the session's model" },
  ])
  const mapped = await doctor({ components: [API, WEB], files, config: models({ economy: copilot, standard: copilot, frontier: copilot }) }).doctor.check()
  assert.equal(mapped.ok, true)
  assert.deepEqual(mapped.assignments.copilot.filter(({ step }) => step === 'design_review').map(({ agent, family, source }) => `${agent} ${family} ${source.family}`), [
    'consistency-lens gpt-luna workflow', 'architecture-compliance-lens reviewer type', 'fitness-lens planner workflow', 'finding-refuter kimi workflow',
  ])
  assert.deepEqual(mapped.checks.filter(({ subject }) => subject.startsWith('models')).map(({ status }) => status), ['ok', 'ok'])
  const unreadable = await doctor({ components: [API, WEB], files: { ...FOLDERS, '.skraft/pipeline.skraft.dot': 'digraph {}' }, config: models({}) }).doctor.check()
  assert.deepEqual(unreadable.checks.filter(({ subject }) => subject.startsWith('models')), [])
})
test('a component asking for skills found nowhere is a warning naming them after its commands, never a failure: Java has no mocking or contract testing skill, JavaScript no mocking skill, TypeScript no contract testing skill', async () => {
  const orders = { name: 'orders', root: 'orders', stack: 'java', bdd: false, contractTesting: true, commands: { test: 'mvn test' } }
  const admin = { name: 'admin', root: 'admin', stack: 'javascript', bdd: false, commands: { test: 'npm test' } }
  const shop = { name: 'shop', root: 'shop', stack: 'typescript', bdd: false, contractTesting: true, commands: { test: 'npx vitest run --reporter=junit' } }
  const files = { ...FOLDERS, 'orders/pom.xml': '', 'admin/package.json': '{}', 'shop/package.json': '{}' }
  const { doctor: check } = doctor({ components: [API, orders, admin, shop], files })

  const report = await check.check()

  assert.equal(report.ok, true)
  assert.deepEqual(report.checks.filter(({ subject }) => !['infrastructure', 'container-runtime', 'vscode'].includes(subject) && !subject.startsWith('models')).slice(3).map(({ subject, status }) => `${subject} ${status}`), [
    'api/build ok', 'api/test ok', 'api/mutation ok',
    'orders/test ok', 'orders warn',
    'admin/test ok', 'admin warn',
    'shop/test ok', 'shop warn',
  ])
  assert.deepEqual(report.checks.filter(({ status, subject }) => status === 'warn' && !subject.startsWith('models')), [
    { subject: 'orders', status: 'warn', detail: 'skills found nowhere, in the plugin or the working copy: mocking-microcks-java, contract-testing-java; mocking-strategy-roster and contract-testing say which recipe its tests use instead, or that they stop' },
    { subject: 'admin', status: 'warn', detail: 'skills found nowhere, in the plugin or the working copy: mocking-microcks-javascript; mocking-strategy-roster and contract-testing say which recipe its tests use instead, or that they stop' },
    { subject: 'shop', status: 'warn', detail: 'skills found nowhere, in the plugin or the working copy: contract-testing-typescript; mocking-strategy-roster and contract-testing say which recipe its tests use instead, or that they stop' },
  ])
})

test('no configuration, an empty one, an invalid one, a missing root or an old Node fail the doctor', async () => {
  assert.deepEqual(failures(await doctor({ components: null }).doctor.check()), ['config: no skraft-config.json; run skraft init to detect the components'])
  assert.deepEqual(failures(await doctor({ components: [] }).doctor.check()), ['config: skraft-config.json lists no component; run skraft init to detect them'])
  assert.deepEqual(failures(await doctor({ components: [{ name: 'api' }] }).doctor.check()), [
    'config: skraft-config.json is invalid: component api: root must be a path relative to the working copy; component api: stack must be one of dotnet, java, python, typescript, javascript, react',
  ])
  assert.deepEqual(failures(await doctor({ files: { '../payment-web/package.json': '{}' }, components: [{ ...API, mocking: { strategy: 'inprocess' } }] }).doctor.check()), ['api: root services/payment-api is not a folder'])
  assert.deepEqual(failures(await doctor({ node: 'v20.18.0' }).doctor.check()), ['node: Node v20.18.0; skraft needs Node 22 or later'])
})
/** The journal of the branch's mutation run: started, then `events`, each written as the engine writes it. */
const mutationJournal = (events, slug = 'feat-checkout') => {
  const runs = new InMemoryTracking({ root: '/work/.copilot-tracking/skraft-mutation' })
  for (const event of [{ type: 'run.started', slug, workflow: 'mutation' }, ...events]) runs.files.set(`${slug}/events.jsonl`, `${runs.files.get(`${slug}/events.jsonl`) ?? ''}${JSON.stringify(event)}\n`)
  return runs
}

/** The doctor's mutation line. */
const mutationLine = async (options) => (await doctor(options).doctor.check()).checks.find(({ subject }) => subject === 'mutation')
