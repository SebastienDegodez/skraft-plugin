import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDoctor } from '../../../../plugins/skraft-framework/engine/application/doctor.mjs'
import { InMemorySourceControl, InMemoryWorkspace, ScriptedMachine } from '../support/in-memory-host.mjs'

const API = { name: 'api', root: 'services/payment-api', stack: 'dotnet', commands: { build: 'dotnet build --nologo', test: 'dotnet test --nologo', mutation: 'dotnet stryker --since:{baseSha}' } }
const WEB = { name: 'web', root: '../payment-web', stack: 'react', mocking: { strategy: 'inprocess' }, commands: { test: 'npx vitest run', e2e: 'npx playwright test' } }
const { mocking: _inprocess, ...MICROCKS_WEB } = WEB
const FOLDERS ={ 'services/payment-api/Payment.sln': '', '../payment-web/package.json': '{}' }

const doctor = ({ components = [API, WEB], machine = new ScriptedMachine(), node = 'v22.11.0', files = FOLDERS, sourceControl = new InMemorySourceControl() } = {}) => {
  const workspace = new InMemoryWorkspace({ ...files, ...(components === null ? {} : { 'skraft-config.json': JSON.stringify({ components }) }) })
  return { machine, doctor: createDoctor({ workspace, executables: machine, commandRunner: machine, sourceControl, runtime: { nodeVersion: () => node } }) }
}

const failures = (report) => report.checks.filter((check) => check.status === 'fail').map(({ subject, detail }) => `${subject}: ${detail}`)

test('every program found and Docker answering: doctor passes without running any command but docker info', async () => {
  const { machine, doctor: check } = doctor({ components: [API, MICROCKS_WEB] })

  const report = await check.check()

  assert.deepEqual(report, {
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
    ],
  })
  assert.deepEqual(machine.lines(), ['. $ docker info'])
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

test('a Microcks component without Docker is reported; with only in-process mocks Docker is not asked', async () => {
  const down = doctor({ components: [API, { ...WEB, mocking: {} }], machine: new ScriptedMachine({ exits: { '. $ docker info': 1 } }) })
  assert.deepEqual(failures(await down.doctor.check()), [
    'docker: Docker does not answer, and Microcks, the mocking of api, web, needs it; start Docker, or set "mocking": { "strategy": "inprocess" } on the component',
  ])

  const inprocess = doctor({ components: [{ ...API, mocking: { strategy: 'inprocess', library: 'WireMock.Net' } }, WEB], machine: new ScriptedMachine({ installed: ['dotnet', 'npx'] }) })
  const report = await inprocess.doctor.check()
  assert.equal(report.ok, true)
  assert.deepEqual(inprocess.machine.runs, [])
})

test('--run starts every command once from its component root, with the base, and names the one that fails', async () => {
  const machine = new ScriptedMachine({ exits: { '../payment-web $ npx playwright test': 1 } })
  const sourceControl = new InMemorySourceControl({
    '.': { top: '.', mergeBases: { main: 'a1' } },
    'services/payment-api': { top: '.', mergeBases: { main: 'a1' } },
    '../payment-web': { top: '../payment-web', mergeBases: { main: 'w1' } },
  })
  const { doctor: check } = doctor({ machine, sourceControl })

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
    { subject: 'api/mutation', status: 'ok', detail: 'dotnet stryker --since:{baseSha} passed' },
    { subject: 'web/test', status: 'ok', detail: 'npx vitest run passed' },
    { subject: 'web/e2e', status: 'fail', detail: 'npx playwright test exited 1' },
    { subject: 'docker', status: 'ok', detail: 'Docker answers (Microcks: api)' },
  ])
})

test('--run names a command found on the machine that cannot be started, with the host\'s error', async () => {
  const workspace = new InMemoryWorkspace({ ...FOLDERS, 'skraft-config.json': JSON.stringify({ components: [WEB] }) })
  const check = createDoctor({
    workspace, executables: new ScriptedMachine(), commandRunner: new ScriptedMachine({ installed: [] }),
    sourceControl: new InMemorySourceControl(), runtime: { nodeVersion: () => 'v22.11.0' },
  })

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
  assert.deepEqual(failures(await flagged.doctor.check({ run: true, base: '--independent' }))[0], 'base: --base must be a git ref, got "--independent"')
})
