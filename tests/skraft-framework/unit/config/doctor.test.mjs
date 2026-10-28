import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDoctor } from '../../../../plugins/skraft-framework/engine/application/diagnostics/doctor-usecase.mjs'
import { BUILT_IN_WORKFLOW, InMemoryAgentCatalog, InMemoryCopilotSdk, InMemoryHostSettings, InMemorySourceControl, InMemoryUserSettings, InMemoryWorkflowSource, InMemoryWorkspace, ScriptedMachine } from '../support/in-memory-host.mjs'
import { edit, withLenses } from '../workflow/support.mjs'

const API = { name: 'api', root: 'services/payment-api', stack: 'dotnet', commands: { build: 'dotnet build --nologo', test: 'dotnet test --nologo', mutation: 'dotnet stryker --since:{baseSha}' } }
const WEB = { name: 'web', root: '../payment-web', stack: 'react', mocking: { strategy: 'inprocess' }, commands: { test: 'npx vitest run', e2e: 'npx playwright test' } }
const MICROCKS_WEB = { ...WEB, mocking: { strategy: 'microcks' } }
const FOLDERS = { 'services/payment-api/Payment.sln': '', '../payment-web/package.json': '{}' }

/** runner: the machine that starts the commands, the one that finds them unless told otherwise; config: the rest of skraft-config.json. */
const doctor = ({ components = [API, WEB], config = {}, machine = new ScriptedMachine(), runner = machine, node = 'v22.11.0', files = FOLDERS, sourceControl = new InMemorySourceControl(), user, copilotSdk = new InMemoryCopilotSdk() } = {}) => {
  const workspace = new InMemoryWorkspace({ ...files, ...(components === null ? {} : { 'skraft-config.json': JSON.stringify({ ...config, components }) }) })
  const workflowSource = new InMemoryWorkflowSource()
  return {
    machine,
    workspace,
    doctor: createDoctor({
      workspace, userSettings: new InMemoryUserSettings(user), workflowSource, executables: machine, commandRunner: runner, sourceControl, runtime: { nodeVersion: () => node },
      agentCatalog: new InMemoryAgentCatalog(), hostSettings: new InMemoryHostSettings(), copilotSdk,
    }),
  }
}

/** Without models in any file: Claude Code has the plugin's aliases, Copilot no model at all. */
const BY_DEFAULT = [
  { subject: 'models/claude-code', status: 'ok', detail: "every family the workflow's agents run on has a model on claude-code" },
  { subject: 'models/copilot', status: 'warn', detail: "no model on copilot for researcher (1 dispatch), planner (1 dispatch), reviewer (13 dispatches), standard (4 dispatches), implementer (3 dispatches), economy (1 dispatch); these run on the session's model" },
]

/** Without the Copilot CLI, VS Code runs the pipeline through the agent loop. */
const NO_SDK = {
  subject: 'vscode', status: 'ok',
  detail: 'no Copilot SDK under /home/dev/.copilot/pkg: under VS Code, the Skraft - Orchestrator agent conducts skraft next and skraft record; install the Copilot CLI to run the pipeline through its SDK',
}

const failures = (report) => report.checks.filter((check) => check.status === 'fail').map(({ subject, detail }) => `${subject}: ${detail}`)

test('every program found and Docker answering: doctor passes without running any command but docker info', async () => {
  const { machine, doctor: check } = doctor({ components: [API, MICROCKS_WEB] })

  const report = await check.check()

  assert.deepEqual({ ok: report.ok, checks: report.checks }, {
    ok: true,
    checks: [
      { subject: 'node', status: 'ok', detail: 'Node v22.11.0' },
      { subject: 'config', status: 'ok', detail: '2 components: api, web' },
      { subject: 'api/build', status: 'ok', detail: 'dotnet → /usr/local/bin/dotnet' },
      { subject: 'api/test', status: 'ok', detail: 'dotnet → /usr/local/bin/dotnet' },
      { subject: 'api/mutation', status: 'ok', detail: 'dotnet → /usr/local/bin/dotnet' },
      { subject: 'web/test', status: 'ok', detail: 'npx → /usr/local/bin/npx' },
      { subject: 'web/e2e', status: 'ok', detail: 'npx → /usr/local/bin/npx' },
      { subject: 'docker', status: 'ok', detail: 'Docker answers (Microcks: api, web)' },
      ...BY_DEFAULT,
      NO_SDK,
    ],
  })
  assert.deepEqual(machine.lines(), ['. $ docker info'])
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

test('a command not found is named with the component and the command to change', async () => {
  const { doctor: check } = doctor({ machine: new ScriptedMachine({ installed: ['docker', 'npx'] }) })

  const report = await check.check()

  assert.equal(report.ok, false)
  assert.deepEqual(failures(report), [
    'api/build: command not found: dotnet (from services/payment-api); install it or change commands.build in skraft-config.json',
    'api/test: command not found: dotnet (from services/payment-api); install it or change commands.test in skraft-config.json',
    'api/mutation: command not found: dotnet (from services/payment-api); install it or change commands.mutation in skraft-config.json',
  ])
})

test('a Microcks component without Docker is reported, saying Microcks is the default and how to do without it; with only in-process mocks Docker is not asked', async () => {
  const front = { ...WEB, name: 'front', stack: 'typescript', mocking: {} }
  const down = doctor({ components: [API, MICROCKS_WEB, front], machine: new ScriptedMachine({ exits: { '. $ docker info': 1 } }) })
  assert.deepEqual(failures(await down.doctor.check()), [
    'docker: Docker does not answer, and Microcks, the mocking of api, web, needs it; start Docker, or Podman with its docker command, so that docker info answers: Microcks, the default mocking outside JavaScript, TypeScript and React, runs in a container; or set "mocking": { "strategy": "inprocess" } on a component that has nothing to mock or mocks in process',
  ])

  const inprocess = doctor({ components: [{ ...API, mocking: { strategy: 'inprocess', library: 'WireMock.Net' } }, WEB], machine: new ScriptedMachine({ installed: ['dotnet', 'npx'] }) })
  const report = await inprocess.doctor.check()
  assert.equal(report.ok, true)
  assert.deepEqual(inprocess.machine.runs, [])
})

test('--run starts every command once from its component root, with the base, and names the one that fails with the log of its output', async () => {
  const machine = new ScriptedMachine({ exits: { '../payment-web $ npx playwright test': 1 } })
  const sourceControl = new InMemorySourceControl({
    '.': { top: '.', mergeBases: { main: 'a1' } },
    'services/payment-api': { top: '.', mergeBases: { main: 'a1' } },
    '../payment-web': { top: '../payment-web', mergeBases: { main: 'w1' } },
  })
  const { doctor: check, workspace } = doctor({ machine, sourceControl })

  const report = await check.check({ run: true })

  assert.deepEqual(machine.lines(), [
    'services/payment-api $ dotnet build --nologo',
    'services/payment-api $ dotnet test --nologo',
    'services/payment-api $ dotnet stryker --since:a1',
    '../payment-web $ npx vitest run',
    '../payment-web $ npx playwright test',
    '. $ docker info',
  ])
  assert.deepEqual(report.checks.slice(2), [
    { subject: 'api/build', status: 'ok', detail: 'dotnet build --nologo passed' },
    { subject: 'api/test', status: 'ok', detail: 'dotnet test --nologo passed' },
    { subject: 'api/mutation', status: 'ok', detail: 'dotnet stryker --since:a1 passed' },
    { subject: 'web/test', status: 'ok', detail: 'npx vitest run passed' },
    { subject: 'web/e2e', status: 'fail', detail: 'npx playwright test exited 1; its output is in .copilot-tracking/skraft-doctor/web/e2e.log' },
    { subject: 'docker', status: 'ok', detail: 'Docker answers (Microcks: api)' },
    ...BY_DEFAULT,
    NO_SDK,
  ])
  assert.equal(
    await workspace.read('.copilot-tracking/skraft-doctor/web/e2e.log'),
    '$ npx playwright test\ncwd: ../payment-web\nresult: exited 1\n--- stdout\nnpx playwright test output\n\n--- stderr\nit failed\n\n',
  )
  assert.equal(await workspace.read('.copilot-tracking/skraft-doctor/web/test.log'), '$ npx vitest run\ncwd: ../payment-web\nresult: exited 0\n--- stdout\nnpx vitest run output\n\n--- stderr\n\n')
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
    { subject: 'models/copilot', status: 'warn', detail: "no model on copilot for researcher (1 dispatch), planner (2 dispatches), reviewer (7 dispatches), kimi (1 dispatch), implementer (3 dispatches), frontier (5 dispatches), standard (2 dispatches), economy (1 dispatch); these run on the session's model" },
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

test('python is found in the component\'s virtual environment, else as python3, and doctor says where it looked when it is nowhere', async () => {
  const PY = { name: 'py', root: 'services/py', stack: 'python', mocking: { strategy: 'inprocess' }, commands: { test: 'python -m pytest -q' } }
  const files = { 'services/py/pyproject.toml': '' }
  const sourceControl = new InMemorySourceControl({ '.': { top: '.', mergeBases: { main: 'a1' } }, 'services/py': { top: '.', mergeBases: { main: 'a1' } } })
  const venv = doctor({ components: [PY], files, sourceControl, machine: new ScriptedMachine({ installed: ['python', 'services/py/.venv/Scripts/python.exe'] }) })
  const python3 = doctor({ components: [PY], files, machine: new ScriptedMachine({ installed: ['python3'] }) })
  const nowhere = doctor({ components: [PY], files, machine: new ScriptedMachine({ installed: [] }) })

  assert.deepEqual((await venv.doctor.check()).checks[2], { subject: 'py/test', status: 'ok', detail: 'python → /work/services/py/.venv/Scripts/python.exe' })
  assert.deepEqual((await python3.doctor.check()).checks[2], { subject: 'py/test', status: 'ok', detail: 'python → /usr/local/bin/python3' })
  assert.deepEqual(failures(await nowhere.doctor.check()), [
    'py/test: command not found: python (from services/py; looked for .venv/bin/python, .venv/Scripts/python.exe, python, python3); install it or change commands.test in skraft-config.json',
  ])

  const ran = await venv.doctor.check({ run: true })
  assert.deepEqual(ran.checks[2], { subject: 'py/test', status: 'ok', detail: '.venv/Scripts/python.exe -m pytest -q passed' })
  assert.deepEqual(venv.machine.lines(), ['services/py $ .venv/Scripts/python.exe -m pytest -q'])
})

test('--run names a command found on the machine that cannot be started, with the host\'s error', async () => {
  const { doctor: check } = doctor({ components: [WEB], runner: new ScriptedMachine({ installed: [] }) })

  const report = await check.check({ run: true })

  assert.deepEqual(failures(report), ['web/test: command not found: npx', 'web/e2e: command not found: npx'])
})

test('--run without a base cannot start a {baseSha} command and says why', async () => {
  const { doctor: check } = doctor({ components: [API], sourceControl: new InMemorySourceControl({ 'services/payment-api': { top: '.', mergeBases: {} } }) })

  const report = await check.check({ run: true })

  assert.deepEqual(failures(report), [
    'base: component api (.) has no merge base with main; set baseBranch in skraft-config.json or pass --base <ref>',
    'api/mutation: "dotnet stryker --since:{baseSha}" uses {baseSha} but the run has no base for this repository',
  ])
})

test('a component asking for skills found nowhere is a warning naming them after its commands, never a failure: Java has no mocking or contract testing skill, JavaScript no mocking skill, TypeScript no contract testing skill', async () => {
  const orders = { name: 'orders', root: 'orders', stack: 'java', contractTesting: true, commands: { test: 'mvn test' } }
  const admin = { name: 'admin', root: 'admin', stack: 'javascript', commands: { test: 'npm test' } }
  const shop = { name: 'shop', root: 'shop', stack: 'typescript', contractTesting: true, commands: { test: 'npx vitest run' } }
  const files = { ...FOLDERS, 'orders/pom.xml': '', 'admin/package.json': '{}', 'shop/package.json': '{}' }
  const { doctor: check } = doctor({ components: [API, orders, admin, shop], files })

  const report = await check.check()

  assert.equal(report.ok, true)
  assert.deepEqual(report.checks.filter(({ subject }) => !subject.startsWith('models') && subject !== 'vscode').slice(2).map(({ subject, status }) => `${subject} ${status}`), [
    'api/build ok', 'api/test ok', 'api/mutation ok', 'orders/test ok', 'orders warn', 'admin/test ok', 'admin warn', 'shop/test ok', 'shop warn', 'docker ok',
  ])
  assert.deepEqual(report.checks.filter(({ status, subject }) => status === 'warn' && !subject.startsWith('models')), [
    { subject: 'orders', status: 'warn', detail: 'skills found nowhere, in the plugin or the working copy: mocking-microcks-java, contract-testing-java; mocking-strategy-roster and contract-testing say which recipe its tests use instead, or that they stop' },
    { subject: 'admin', status: 'warn', detail: 'skills found nowhere, in the plugin or the working copy: mocking-inprocess-javascript; mocking-strategy-roster and contract-testing say which recipe its tests use instead, or that they stop' },
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

test('a command with shell syntax is reported before any program is looked for', async () => {
  const { doctor: check } = doctor({ components: [{ ...WEB, commands: { test: 'npm test > out.txt' } }] })

  assert.deepEqual(failures(await check.check()), ['web/test: "npm test > out.txt" uses shell syntax (>); put the steps in a script and call the script'])
})

test('a component with no gate command, or a --base that is not a ref, fails the doctor', async () => {
  const { doctor: check } = doctor({ components: [{ ...WEB, commands: { e2e: 'npx playwright test' } }] })
  assert.deepEqual(failures(await check.check()), ['web: no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json'])

  const flagged = doctor({ components: [{ ...API, mocking: { strategy: 'inprocess' } }] })
  assert.deepEqual(failures(await flagged.doctor.check({ run: true, base: '--independent' }))[0], 'base: --base must be a git ref: text with no blank that does not start with -')
})
