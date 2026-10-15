import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { createRunGate } from '../../../../plugins/skraft-framework/engine/application/run-gate.mjs'
import {
  FakeHasher, FixedClock, InMemorySourceControl, InMemoryTracking, InMemoryWorkspace, ScriptedMachine,
} from '../support/in-memory-host.mjs'

const API = { name: 'api', root: 'services/payment-api', stack: 'dotnet', mocking: { strategy: 'inprocess' }, commands: { build: 'dotnet build --nologo', test: 'dotnet test --nologo', mutation: 'dotnet stryker --since:{baseSha}' } }
const WEB = { name: 'web', root: '../payment-web', stack: 'react', mocking: { strategy: 'inprocess' }, commands: { lint: 'npx eslint .', test: 'npx vitest run' } }

/**
 * A working copy with the API, and the front in a neighbour repository. `changed` lists what
 * the story changed since each base, relative to the component's root.
 */
const hostWith = async ({ components = [API, WEB], changed = {}, machine = new ScriptedMachine(), clock = new FixedClock('2026-10-15T08:00:00.000Z') } = {}) => {
  const tracking = new InMemoryTracking()
  const sourceControl = new InMemorySourceControl({
    '.': { top: '.', mergeBases: { main: 'a1' } },
    'services/payment-api': { top: '.', mergeBases: { main: 'a1' }, changed: 'api' in changed ? changed.api : [] },
    '../payment-web': { top: '../payment-web', mergeBases: { main: 'w1' }, changed: changed.web ?? [] },
  })
  const deps = {
    journal: tracking, activePipeline: tracking, files: tracking,
    workspace: new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify({ components }) }),
    sourceControl, commandRunner: machine, clock, hasher: new FakeHasher(),
  }
  const initialised = await createInit(deps).init({ slug: 'checkout' })
  assert.equal(initialised.ok, true, initialised.reason)
  return { tracking, machine, sourceControl, gate: (scope) => createRunGate(deps).run({ scope }) }
}

const gatesRan = (tracking) => tracking.journal('checkout').filter((event) => event.type === 'gate.ran')

test('a story that only touches the front runs only the front gates during the loop, and every gate at the close', async () => {
  const { tracking, machine, sourceControl, gate } = await hostWith({ changed: { web: ['src/cart/Cart.tsx'] } })

  const loop = await gate('touched')

  assert.deepEqual([loop.status, loop.components], ['passed', ['web']])
  assert.deepEqual(machine.lines(), ['../payment-web $ npx eslint .', '../payment-web $ npx vitest run'])
  assert.deepEqual(sourceControl.diffs, [{ dir: 'services/payment-api', sha: 'a1' }, { dir: '../payment-web', sha: 'w1' }])

  machine.runs = []
  const closure = await gate('all')

  assert.deepEqual([closure.status, closure.components], ['passed', ['api', 'web']])
  assert.deepEqual(machine.lines(), [
    'services/payment-api $ dotnet build --nologo',
    'services/payment-api $ dotnet test --nologo',
    'services/payment-api $ dotnet stryker --since:a1',
    '../payment-web $ npx eslint .',
    '../payment-web $ npx vitest run',
  ])
  assert.deepEqual(gatesRan(tracking).map(({ component, gate: name, scope, status }) => `${scope} ${component}/${name} ${status}`), [
    'touched web/lint pass', 'touched web/test pass',
    'all api/build pass', 'all api/test pass', 'all api/mutation pass', 'all web/lint pass', 'all web/test pass',
  ])
})

test('nothing changed since the bases: no gate runs in the loop', async () => {
  const { machine, gate } = await hostWith()

  const outcome = await gate('touched')

  assert.deepEqual([outcome.status, outcome.components, outcome.reason], ['passed', [], 'no component changed since its base; no gate to run'])
  assert.deepEqual(machine.runs, [])
})

test('a file under a component nested in another one touches only the nested component', async () => {
  const root = { ...API, name: 'api', root: '.' }
  const front = { ...WEB, root: 'web' }
  const tracking = new InMemoryTracking()
  const machine = new ScriptedMachine()
  const deps = {
    journal: tracking, activePipeline: tracking, files: tracking,
    workspace: new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify({ components: [root, front] }) }),
    sourceControl: new InMemorySourceControl({ '.': { top: '.', mergeBases: { main: 'a1' }, changed: ['web/src/App.tsx', '.copilot-tracking/skraft-plans/checkout/research.md'] }, web: { top: '.', mergeBases: { main: 'a1' }, changed: ['src/App.tsx'] } }),
    commandRunner: machine, clock: new FixedClock('2026-10-15T08:00:00.000Z'), hasher: new FakeHasher(),
  }
  await createInit(deps).init({ slug: 'checkout' })

  const outcome = await createRunGate(deps).run({ scope: 'touched' })

  assert.deepEqual(outcome.components, ['web'])
})

test('a command the developer wrote is the one that runs, with the base of its own repository', async () => {
  const api = { ...API, commands: { test: 'dotnet test --filter "Category!=Slow" --nologo', mutation: 'dotnet stryker --since:{baseSha} --threshold-break 80' } }
  const { machine, gate } = await hostWith({ components: [api, { ...WEB, commands: { mutation: 'npx stryker run --since {baseSha}' } }] })

  await gate('all')

  assert.deepEqual(machine.runs, [
    { argv: ['dotnet', 'test', '--filter', 'Category!=Slow', '--nologo'], cwd: 'services/payment-api' },
    { argv: ['dotnet', 'stryker', '--since:a1', '--threshold-break', '80'], cwd: 'services/payment-api' },
    { argv: ['npx', 'stryker', 'run', '--since', 'w1'], cwd: '../payment-web' },
  ])
})

test('a failing test is deterministic: the evidence holds the output and the component stops there', async () => {
  const machine = new ScriptedMachine({ exits: { 'services/payment-api $ dotnet test --nologo': 1 } })
  const { tracking, gate } = await hostWith({ machine })

  const outcome = await gate('all')

  assert.deepEqual([outcome.status, outcome.failure, outcome.reason], ['failed', 'deterministic', 'api/test: exited 1'])
  assert.deepEqual(machine.lines(), [
    'services/payment-api $ dotnet build --nologo', 'services/payment-api $ dotnet test --nologo',
    '../payment-web $ npx eslint .', '../payment-web $ npx vitest run',
  ])
  const failed = gatesRan(tracking).find((event) => event.status === 'fail')
  assert.deepEqual(
    { component: failed.component, gate: failed.gate, failure: failed.failure, exitCode: failed.exitCode, evidence: failed.evidence, command: failed.command },
    { component: 'api', gate: 'test', failure: 'deterministic', exitCode: 1, evidence: 'gates/api/test-1.log', command: 'dotnet test --nologo' },
  )
  assert.equal(
    await tracking.read('checkout', 'gates/api/test-1.log'),
    '$ dotnet test --nologo\ncwd: services/payment-api\nresult: fail (deterministic): exited 1\n--- stdout\ndotnet test --nologo output\n\n--- stderr\nit failed\n\n',
  )
  assert.equal(outcome.gates.find((result) => result.status === 'fail').evidence, '/work/.copilot-tracking/skraft-plans/checkout/gates/api/test-1.log')
})

test('a command missing from the machine makes its gate fail as environment, naming the program', async () => {
  const { tracking, gate } = await hostWith({ machine: new ScriptedMachine({ installed: ['git', 'npx'] }) })

  const outcome = await gate('all')

  assert.deepEqual([outcome.status, outcome.failure], ['failed', 'environment'])
  assert.equal(outcome.reason, 'api/build: command not found: dotnet; install it or change the command in skraft-config.json')
  assert.deepEqual(gatesRan(tracking).map(({ component, gate: name, status, failure, exitCode }) => [component, name, status, failure, exitCode]), [
    ['api', 'build', 'fail', 'environment', null],
    ['web', 'lint', 'pass', null, 0],
    ['web', 'test', 'pass', null, 0],
  ])
})

test('a shell that cannot find the program (exit 127 or 9009) is an environment failure too', async () => {
  const machine = new ScriptedMachine({ exits: { '../payment-web $ npx eslint .': 127, 'services/payment-api $ dotnet build --nologo': 9009 } })
  const { gate } = await hostWith({ machine })

  const outcome = await gate('all')

  assert.deepEqual(outcome.gates.map(({ component, gate: name, failure }) => [component, name, failure]), [['api', 'build', 'environment'], ['web', 'lint', 'environment']])
})

test('a command line with shell syntax is not started and fails as environment', async () => {
  const { machine, gate } = await hostWith({ components: [{ ...WEB, commands: { test: 'npm ci && npx vitest run' } }] })

  const outcome = await gate('all')

  assert.deepEqual([outcome.failure, outcome.reason], ['environment', 'web/test: command "npm ci && npx vitest run" uses shell syntax (&&); put the steps in a script and call the script'])
  assert.deepEqual(machine.runs, [])
})

test('a Microcks component without Docker: its test gates fail as environment without running; in-process mocks need no Docker', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ docker info': 1 } })
  const { machine: ran, gate } = await hostWith({ machine, components: [{ ...API, mocking: undefined }, WEB] })

  const outcome = await gate('all')

  assert.deepEqual(outcome.gates.map(({ component, gate: name, status, failure }) => [component, name, status, failure]), [
    ['api', 'build', 'pass', null],
    ['api', 'test', 'fail', 'environment'],
    ['web', 'lint', 'pass', null],
    ['web', 'test', 'pass', null],
  ])
  assert.match(outcome.reason, /^api\/test: Docker does not answer and api mocks with Microcks; start Docker, or set "mocking": \{ "strategy": "inprocess" \} on the component$/)
  assert.deepEqual(ran.lines(), ['services/payment-api $ dotnet build --nologo', '. $ docker info', '../payment-web $ npx eslint .', '../payment-web $ npx vitest run'])
})

test('gates need an active, initialised pipeline and components to run', async () => {
  const tracking = new InMemoryTracking()
  const base = { journal: tracking, activePipeline: tracking, files: tracking, sourceControl: new InMemorySourceControl(), commandRunner: new ScriptedMachine(), clock: new FixedClock('2026-10-15T08:00:00.000Z'), hasher: new FakeHasher() }

  const none = await createRunGate({ ...base, workspace: new InMemoryWorkspace() }).run()
  assert.deepEqual([none.status, none.code], ['refused', 'no-active-pipeline'])

  await createInit({ ...base, workspace: new InMemoryWorkspace() }).init({ slug: 'checkout' })
  const empty = await createRunGate({ ...base, workspace: new InMemoryWorkspace() }).run({ scope: 'all' })
  assert.deepEqual([empty.status, empty.code, empty.reason], ['refused', 'no-components', 'skraft-config.json lists no component; run skraft init to detect them'])

  const broken = await createRunGate({ ...base, workspace: new InMemoryWorkspace({ 'skraft-config.json': '[' }) }).run()
  assert.deepEqual([broken.status, broken.code], ['refused', 'config-invalid'])
})

test('a component outside Git always counts as touched, and a {baseSha} command there cannot run', async () => {
  const tracking = new InMemoryTracking()
  const machine = new ScriptedMachine()
  const deps = {
    journal: tracking, activePipeline: tracking, files: tracking,
    workspace: new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify({ components: [{ ...API, root: 'api' }] }) }),
    sourceControl: new InMemorySourceControl(), commandRunner: machine, clock: new FixedClock('2026-10-15T08:00:00.000Z'), hasher: new FakeHasher(),
  }
  await createInit(deps).init({ slug: 'checkout' })

  const outcome = await createRunGate(deps).run({ scope: 'touched' })

  assert.deepEqual(outcome.components, ['api'])
  assert.equal(outcome.reason, 'api/mutation: command "dotnet stryker --since:{baseSha}" uses {baseSha} but the run has no base for this repository')
})

test('each gate journals how long its command took, and each run of a gate keeps its own evidence', async () => {
  const clock = new FixedClock('2026-10-15T08:00:00.000Z')
  const machine = new ScriptedMachine({ clock, takesMs: 1500 })
  const { tracking, gate } = await hostWith({ components: [WEB], machine, clock })

  await gate('all')
  machine.exits['../payment-web $ npx vitest run'] = 1
  await gate('all')

  assert.deepEqual(gatesRan(tracking).map(({ gate: name, status, durationMs, evidence }) => [name, status, durationMs, evidence]), [
    ['lint', 'pass', 1500, 'gates/web/lint-1.log'],
    ['test', 'pass', 1500, 'gates/web/test-1.log'],
    ['lint', 'pass', 1500, 'gates/web/lint-2.log'],
    ['test', 'fail', 1500, 'gates/web/test-2.log'],
  ])
  assert.match(await tracking.read('checkout', 'gates/web/test-1.log'), /^result: pass: /m)
  assert.match(await tracking.read('checkout', 'gates/web/test-2.log'), /^result: fail \(deterministic\): exited 1$/m)
})

test('a component with no gate command fails as environment instead of passing with nothing run', async () => {
  const { tracking, machine, gate } = await hostWith({ components: [{ ...WEB, commands: { e2e: 'npx playwright test' } }] })

  const outcome = await gate('all')

  assert.deepEqual([outcome.status, outcome.failure], ['failed', 'environment'])
  assert.equal(outcome.reason, 'web/none: no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json')
  assert.deepEqual(machine.runs, [])
  assert.deepEqual(gatesRan(tracking).map(({ component, gate: name, status, failure }) => [component, name, status, failure]), [['web', 'none', 'fail', 'environment']])
})

test('a misspelt key in a component refuses the gates instead of dropping its commands', async () => {
  const tracking = new InMemoryTracking()
  const base = { journal: tracking, activePipeline: tracking, files: tracking, sourceControl: new InMemorySourceControl(), commandRunner: new ScriptedMachine(), clock: new FixedClock('2026-10-15T08:00:00.000Z'), hasher: new FakeHasher() }
  await createInit({ ...base, workspace: new InMemoryWorkspace() }).init({ slug: 'checkout' })
  const workspace = new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify({ components: [{ name: 'web', root: '/srv/web', stack: 'react', comands: { test: 'npm test' }, paths: { source: ['src/'] } }] }) })

  const outcome = await createRunGate({ ...base, workspace }).run({ scope: 'all' })

  assert.deepEqual([outcome.status, outcome.code], ['refused', 'config-invalid'])
  assert.equal(outcome.reason, [
    'skraft-config.json is invalid: component web: unknown key comands (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting)',
    'component web: root must be a path relative to the working copy',
    'component web: unknown key paths.source (allowed: src, tests)',
  ].join('; '))
})

test('with Docker up, every Microcks test gate runs and Docker is asked once', async () => {
  const microcks = { ...API, mocking: { strategy: 'microcks' }, commands: { test: 'dotnet test', architecture: 'dotnet test --filter Architecture', coverage: 'dotnet test --collect coverage' } }
  const { machine, gate } = await hostWith({ components: [microcks, { ...WEB, mocking: { strategy: 'microcks' } }] })

  const outcome = await gate('all')

  assert.equal(outcome.status, 'passed')
  assert.deepEqual(machine.lines().filter((line) => line.endsWith('docker info')), ['. $ docker info'])
  assert.equal(machine.lines().length, 6)
})

test('a command stopped before it exits fails as environment, and the run says to run it again', async () => {
  const machine = new ScriptedMachine({ exits: { '../payment-web $ npx vitest run': null } })
  const { gate } = await hostWith({ components: [WEB], machine })

  const outcome = await gate('all')

  assert.deepEqual([outcome.failure, outcome.reason], ['environment', 'web/test: npx was stopped by SIGKILL; run it again'])
})

test('a component whose changes Git cannot list counts as touched', async () => {
  const { gate } = await hostWith({ changed: { api: null } })

  assert.deepEqual((await gate('touched')).components, ['api'])
})
