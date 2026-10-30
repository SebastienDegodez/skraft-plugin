import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { createRunGate } from '../../../../plugins/skraft-framework/engine/application/gates/run-gate-usecase.mjs'
import { FixedClock, InMemorySourceControl, InMemoryTracking, ScriptedMachine, inMemoryDeps } from '../support/in-memory-host.mjs'
import { mutants, strykerReport, strykerWritesItsReports } from '../support/mutation-reports.mjs'

const API = { name: 'api', root: 'services/payment-api', stack: 'dotnet', mocking: { strategy: 'inprocess' }, commands: { build: 'dotnet build --nologo', test: 'dotnet test --nologo', mutation: 'dotnet stryker --since:{baseSha}' } }
const WEB = { name: 'web', root: '../payment-web', stack: 'react', mocking: { strategy: 'inprocess' }, commands: { lint: 'npx eslint .', test: 'npx vitest run' } }

/** The run checkout started over `components`; `given` replaces any in-memory dependency. */
const started = async ({ components, ...given }) => {
  const deps = inMemoryDeps({ config: JSON.stringify({ components }), ...given })
  strykerWritesItsReports(deps)
  const initialised = await createInit(deps).init({ slug: 'checkout' })
  assert.equal(initialised.ok, true, initialised.reason)
  return { tracking: deps.journal, machine: deps.commandRunner, sourceControl: deps.sourceControl, workspace: deps.workspace, gate: (scope) => createRunGate(deps).run({ scope }) }
}

/**
 * A working copy with the API, and the front in a neighbour repository. `changed` lists what
 * the story changed since each base, relative to the component's root.
 */
const hostWith = ({ components = [API, WEB], changed = {}, machine = new ScriptedMachine(), ...given } = {}) => started({
  components,
  commandRunner: machine,
  sourceControl: new InMemorySourceControl({
    '.': { top: '.', mergeBases: { main: 'a1' } },
    'services/payment-api': { top: '.', mergeBases: { main: 'a1' }, changed: 'api' in changed ? changed.api : [] },
    '../payment-web': { top: '../payment-web', mergeBases: { main: 'w1' }, changed: changed.web ?? [] },
  }),
  ...given,
})

const gatesRan = (tracking) => tracking.journal('checkout').filter((event) => event.type === 'gate.ran')

test('a story that only touches the front runs only the front gates during the loop, and every gate at the close; the mutation report an earlier run left in the API touches nothing', async () => {
  const { tracking, machine, sourceControl, gate } = await hostWith({ changed: { web: ['src/cart/Cart.tsx'], api: ['StrykerOutput/reports/mutation-report.json'] } })

  const loop = await gate('touched')

  assert.deepEqual([loop.status, loop.components, loop.failure, loop.reason], ['passed', ['web'], null, '2 gates passed on web'])
  assert.deepEqual(machine.lines(), ['../payment-web $ npx eslint .', '../payment-web $ npx vitest run'])
  assert.deepEqual(sourceControl.diffs, [{ dir: 'services/payment-api', sha: 'a1' }, { dir: '../payment-web', sha: 'w1' }])

  machine.runs = []
  const closure = await gate('all')

  assert.deepEqual([closure.status, closure.components, closure.failure, closure.reason], ['passed', ['api', 'web'], null, '5 gates passed on api, web'])
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

test('nothing changed since the bases but what StrykerJS left, its report and its incremental file: no gate runs in the loop, the scope gates take unless told otherwise', async () => {
  const strykerJsLeft = ['reports/mutation/mutation.json', 'reports/stryker-incremental.json']
  const { machine, gate } = await hostWith({ changed: { web: strykerJsLeft } })

  const outcome = await gate()

  assert.deepEqual([outcome.status, outcome.scope, outcome.components, outcome.reason], ['passed', 'touched', [], 'no component changed since its base; no gate to run'])
  assert.deepEqual(machine.runs, [])
  for (const stack of ['typescript', 'javascript']) {
    const other = await hostWith({ components: [API, { ...WEB, stack }], changed: { web: strykerJsLeft } })
    assert.deepEqual((await other.gate()).components, [], stack)
  }
  const dotnet = await hostWith({ changed: { api: ['reports/stryker-incremental.json'] } })
  assert.deepEqual((await dotnet.gate()).components, ['api'], 'a file named so is a change of a component StrykerJS does not mutate')
})

/** One repository at the working copy; `changed` lists what changed since `a1` by component root. */
const hostOver = async (components, changed) => {
  const { sourceControl, gate } = await started({
    components,
    sourceControl: new InMemorySourceControl(Object.fromEntries(
      [['.', []], ...Object.entries(changed)].map(([dir, files]) => [dir, { top: '.', mergeBases: { main: 'a1' }, changed: files }]),
    )),
  })
  return { sourceControl, touched: async () => (await gate('touched')).components }
}

test('a file under a component nested in another one touches only the nested component', async () => {
  const { touched } = await hostOver([{ ...API, root: '.' }, { ...WEB, root: 'web' }], {
    '.': ['web/src/App.tsx', 'web', '.copilot-tracking/skraft-plans/checkout/research.md'],
    web: ['src/App.tsx'],
  })

  assert.deepEqual(await touched(), ['web'])
})

test('a component nested deeper in another one still owns its files, and the outer one is touched by its own', async () => {
  const { sourceControl, touched } = await hostOver([{ ...API, root: 'apps' }, { ...WEB, root: 'apps/web' }], {
    apps: ['web/src/App.tsx'],
    'apps/web': ['src/App.tsx'],
  })

  assert.deepEqual(await touched(), ['web'])

  sourceControl.folders.apps.changed.push('Program.cs')
  assert.deepEqual(await touched(), ['api', 'web'])
})

test('components that share a root are all touched by a file changed there', async () => {
  const { touched } = await hostOver([{ ...API, root: 'services/payment-api' }, { ...WEB, name: 'docs', root: 'services/payment-api' }], {
    'services/payment-api': ['src/Payment.cs'],
  })

  assert.deepEqual(await touched(), ['api', 'docs'])
})

test('a command the developer wrote is the one that runs, with the base of its own repository', async () => {
  const api = { ...API, commands: { test: 'dotnet test --filter "Category!=Slow|Category=Fast" --nologo \'\' --logger \'trx;LogFileName="run.trx"\'', mutation: 'dotnet stryker --since:{baseSha} --threshold-break 80' } }
  const { tracking, machine, gate } = await hostWith({ components: [api, { ...WEB, commands: { mutation: 'npx stryker run --since {baseSha}' } }] })

  await gate('all')

  assert.deepEqual(machine.runs, [
    { argv: ['dotnet', 'test', '--filter', 'Category!=Slow|Category=Fast', '--nologo', '', '--logger', 'trx;LogFileName="run.trx"'], cwd: 'services/payment-api' },
    { argv: ['dotnet', 'stryker', '--since:a1', '--threshold-break', '80'], cwd: 'services/payment-api' },
    { argv: ['npx', 'stryker', 'run', '--since', 'w1'], cwd: '../payment-web' },
  ])
  const firstLine = async (evidence) => (await tracking.read('checkout', evidence)).split('\n')[0]
  assert.deepEqual([await firstLine('gates/api/test-1.log'), await firstLine('gates/api/mutation-1.log'), await firstLine('gates/web/mutation-1.log')], [
    '$ dotnet test --filter "Category!=Slow|Category=Fast" --nologo "" --logger \'trx;LogFileName="run.trx"\'',
    '$ dotnet stryker --since:a1 --threshold-break 80',
    '$ npx stryker run --since w1',
  ])
  assert.deepEqual(gatesRan(tracking).map(({ command }) => command), [api.commands.test, api.commands.mutation, 'npx stryker run --since {baseSha}'])
})

const PY = { name: 'py', root: 'services/py', stack: 'python', mocking: { strategy: 'inprocess' }, commands: { build: 'python -m compileall -q src', test: 'python -m pytest -q' } }

test('python runs from the component\'s virtual environment, whichever OS made it', async () => {
  const posix = await hostWith({ components: [PY], machine: new ScriptedMachine({ installed: ['git', 'python', 'services/py/.venv/bin/python'] }) })
  const windows = await hostWith({ components: [{ ...PY, commands: { test: 'python -m pytest -q' } }], machine: new ScriptedMachine({ installed: ['git', 'python', 'services/py/.venv/Scripts/python.exe'] }) })

  const [madeOnPosix, madeOnWindows] = [await posix.gate('all'), await windows.gate('all')]

  assert.deepEqual([madeOnPosix.status, madeOnWindows.status], ['passed', 'passed'])
  assert.deepEqual(posix.machine.lines(), ['services/py $ .venv/bin/python -m compileall -q src', 'services/py $ .venv/bin/python -m pytest -q'])
  assert.deepEqual(windows.machine.lines(), ['services/py $ .venv/bin/python -m pytest -q', 'services/py $ .venv/Scripts/python.exe -m pytest -q'])
})

test('without a virtual environment python is taken from the PATH, then python3; another program is never replaced', async () => {
  const python3 = await hostWith({ components: [PY, WEB], machine: new ScriptedMachine({ installed: ['git', 'npx', 'python3'] }) })
  const none = await hostWith({ components: [PY], machine: new ScriptedMachine({ installed: ['git'] }) })

  const found = await python3.gate('all')
  const missing = await none.gate('all')

  assert.equal(found.status, 'passed')
  const tries = (args) => ['.venv/bin/python', '.venv/Scripts/python.exe', 'python', 'python3'].map((program) => `services/py $ ${program} ${args}`)
  assert.deepEqual(python3.machine.lines(), [
    ...tries('-m compileall -q src'), ...tries('-m pytest -q'),
    '../payment-web $ npx eslint .', '../payment-web $ npx vitest run',
  ])
  assert.deepEqual([missing.failure, missing.reason], [
    'environment',
    'py/build: command not found: python; looked for .venv/bin/python, .venv/Scripts/python.exe, python, python3; install it or change the command in skraft-config.json',
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

test('a command missing from the machine makes its gate fail as environment, naming the program, even when another gate fails deterministically', async () => {
  const { tracking, gate } = await hostWith({ machine: new ScriptedMachine({ installed: ['git', 'npx'], exits: { '../payment-web $ npx vitest run': 1 } }) })

  const outcome = await gate('all')

  assert.deepEqual([outcome.status, outcome.failure], ['failed', 'environment'])
  assert.equal(outcome.reason, 'api/build: command not found: dotnet; install it or change the command in skraft-config.json; web/test: exited 1')
  assert.deepEqual(gatesRan(tracking).map(({ component, gate: name, status, failure, exitCode }) => [component, name, status, failure, exitCode]), [
    ['api', 'build', 'fail', 'environment', null],
    ['web', 'lint', 'pass', null, 0],
    ['web', 'test', 'fail', 'deterministic', 1],
  ])
})

test('a shell that cannot find the program (exit 127 or 9009) is an environment failure too', async () => {
  const machine = new ScriptedMachine({ exits: { '../payment-web $ npx eslint .': 127, 'services/payment-api $ dotnet build --nologo': 9009 } })
  const { gate } = await hostWith({ machine })

  const outcome = await gate('all')

  assert.deepEqual(outcome.gates.map(({ component, gate: name, failure }) => [component, name, failure]), [['api', 'build', 'environment'], ['web', 'lint', 'environment']])
})

test('a command line with shell syntax or an unclosed quote is not started and fails as environment', async () => {
  const { tracking, machine, gate } = await hostWith({ components: [
    { ...API, commands: { test: 'dotnet test --filter "Category=Fast' } },
    { ...WEB, commands: { test: 'npm ci && npx vitest run' } },
  ] })

  const outcome = await gate('all')

  assert.deepEqual([outcome.failure, outcome.reason], ['environment', [
    'api/test: command "dotnet test --filter \\"Category=Fast" has an unclosed " quote',
    'web/test: command "npm ci && npx vitest run" uses shell syntax (&&); put the steps in a script and call the script',
  ].join('; ')])
  assert.deepEqual(machine.runs, [])
  assert.equal(
    await tracking.read('checkout', 'gates/web/test-1.log'),
    '$ npm ci && npx vitest run\ncwd: ../payment-web\nresult: fail (environment): command "npm ci && npx vitest run" uses shell syntax (&&); put the steps in a script and call the script\n',
  )
})

test('the gates of a Microcks component run their tests without the engine looking for a container; a test that needs one fails like any test', async () => {
  const microcks = { ...API, mocking: { strategy: 'microcks' }, commands: { build: API.commands.build, test: API.commands.test, architecture: 'dotnet test --filter Architecture' } }
  const machine = new ScriptedMachine({ installed: ['git', 'dotnet', 'npx'], exits: { 'services/payment-api $ dotnet test --nologo': 1 } })
  const { tracking, gate } = await hostWith({ machine, components: [microcks, { ...WEB, mocking: { strategy: 'microcks' } }] })

  const outcome = await gate('all')

  assert.deepEqual(outcome.gates.map(({ component, gate: name, status, failure }) => [component, name, status, failure]), [
    ['api', 'build', 'pass', null],
    ['api', 'test', 'fail', 'deterministic'],
    ['web', 'lint', 'pass', null],
    ['web', 'test', 'pass', null],
  ])
  assert.deepEqual(machine.lines(), ['services/payment-api $ dotnet build --nologo', 'services/payment-api $ dotnet test --nologo', '../payment-web $ npx eslint .', '../payment-web $ npx vitest run'])
  assert.match(await tracking.read('checkout', 'gates/api/test-1.log'), /^\$ dotnet test --nologo\ncwd: services\/payment-api\nresult: fail \(deterministic\)/)
})

test('gates need an active, initialised pipeline and components to run', async () => {
  const tracking = new InMemoryTracking()
  const gates = (config) => createRunGate(inMemoryDeps({ tracking, config }))

  const none = await gates().run()
  assert.deepEqual([none.status, none.code, none.components, none.gates, none.failure], ['refused', 'no-active-pipeline', [], [], null])

  await createInit(inMemoryDeps({ tracking })).init({ slug: 'checkout' })
  const empty = await gates().run({ scope: 'all' })
  assert.deepEqual([empty.status, empty.code, empty.reason], ['refused', 'no-components', 'skraft-config.json lists no component; run skraft init to detect them'])

  const broken = await gates('[').run()
  assert.deepEqual([broken.status, broken.code], ['refused', 'config-invalid'])

  tracking.rewriteJournal('checkout', (lines) => [lines[0].replace('"prev":null', '"prev":"0"')])
  const tampered = await gates(JSON.stringify({ components: [WEB] })).run()
  assert.deepEqual([tampered.status, tampered.slug, tampered.code, tampered.components, tampered.gates], ['blocked', 'checkout', 'journal-tampered', [], []])
})

test('a component outside Git always counts as touched, a {baseSha} command there cannot run, and its mutation report is judged whole', async () => {
  const front = { name: 'front', root: '../../legacy/web', stack: 'react', mocking: { strategy: 'inprocess' }, commands: { mutation: 'npx stryker run' } }
  const { machine, gate, workspace } = await started({ components: [{ ...API, root: '../../legacy/./api/' }, front] })
  const report = strykerReport({ 'src/Old.tsx': [[3, 'Arithmetic', '+', 'Survived']], '/elsewhere/Checkout.Domain/Old.cs': [[4, 'Equality', null, 'NoCoverage']] })
  machine.meanwhile['../../legacy/web $ npx stryker run'] = () => workspace.write('../../legacy/web/reports/mutation/mutation.json', report)

  const outcome = await gate('touched')

  assert.deepEqual(outcome.components, ['api', 'front'])
  assert.deepEqual(machine.lines(), ['../../legacy/api $ dotnet build --nologo', '../../legacy/api $ dotnet test --nologo', '../../legacy/web $ npx stryker run'])
  assert.equal(outcome.reason, 'api/mutation: command "dotnet stryker --since:{baseSha}" uses {baseSha} but the run has no base for this repository; front/mutation: exited 0, boundary 0% < 80%, 2 mutants survive')
  assert.deepEqual(outcome.gates.at(-1).survivors, [
    { file: '../../legacy/web/src/Old.tsx', line: 3, mutator: 'Arithmetic', replacement: '+', covered: true },
    { file: '/elsewhere/Checkout.Domain/Old.cs', line: 4, mutator: 'Equality', replacement: null, covered: false },
  ])
})

test('Stryker.NET\'s absolute paths are read under each component\'s root, a neighbour repository\'s too, whatever the case of the drive letter', async () => {
  const api = { name: 'api', root: 'services/payment-application', stack: 'dotnet', mocking: { strategy: 'inprocess' }, commands: { mutation: 'dotnet stryker' } }
  const back = { name: 'back', root: '../payment-back', stack: 'dotnet', mocking: { strategy: 'inprocess' }, commands: { mutation: 'dotnet stryker' } }
  const { machine, gate, workspace } = await started({
    components: [api, back],
    tracking: new InMemoryTracking({ root: 'C:\\my-application\\.copilot-tracking\\skraft-plans' }),
    sourceControl: new InMemorySourceControl({
      '.': { top: '.', mergeBases: { main: 'a1' } },
      'services/payment-application': { top: '.', mergeBases: { main: 'a1' }, changed: ['src/Pay.cs'] },
      '../payment-back': { top: '../payment-back', mergeBases: { main: 'b1' }, changed: ['src/Refund.cs'] },
    }),
  })
  machine.meanwhile['services/payment-application $ dotnet stryker'] = () => workspace.write('services/payment-application/StrykerOutput/reports/mutation-report.json', strykerReport({
    'c:\\my-application\\services\\payment-application\\src\\Pay.cs': [[9, 'Equality', '!=', 'Survived'], ...mutants(3, 'Killed')],
  }))
  machine.meanwhile['../payment-back $ dotnet stryker'] = () => workspace.write('../payment-back/StrykerOutput/reports/mutation-report.json', strykerReport({
    'C:\\payment-back\\src\\Refund.cs': [[7, 'Arithmetic', '-', 'Survived']],
  }))

  const outcome = await gate('all')

  assert.equal(outcome.reason, 'api/mutation: exited 0, boundary 75% < 80%, 1 mutant survives; back/mutation: exited 0, boundary 0% < 80%, 1 mutant survives')
  assert.deepEqual(outcome.gates.map(({ survivors }) => survivors.map(({ file, line }) => `${file}:${line}`)), [['services/payment-application/src/Pay.cs:9'], ['../payment-back/src/Refund.cs:7']])
})

test('each gate journals how long its command took, and each run of a gate keeps its own evidence', async () => {
  const clock = new FixedClock('2026-10-15T08:00:00.000Z')
  const machine = new ScriptedMachine({ clock, takesMs: 1500 })
  const { tracking, gate } = await hostWith({ components: [WEB, { ...API, commands: { test: 'dotnet test --nologo' } }], machine, clock })

  await gate('all')
  machine.exits['../payment-web $ npx vitest run'] = 1
  await gate('all')

  assert.deepEqual(gatesRan(tracking).map(({ gate: name, status, durationMs, evidence }) => [name, status, durationMs, evidence]), [
    ['lint', 'pass', 1500, 'gates/web/lint-1.log'],
    ['test', 'pass', 1500, 'gates/web/test-1.log'],
    ['test', 'pass', 1500, 'gates/api/test-1.log'],
    ['lint', 'pass', 1500, 'gates/web/lint-2.log'],
    ['test', 'fail', 1500, 'gates/web/test-2.log'],
    ['test', 'pass', 1500, 'gates/api/test-2.log'],
  ])
  assert.match(await tracking.read('checkout', 'gates/web/test-1.log'), /^result: pass: /m)
  assert.match(await tracking.read('checkout', 'gates/web/test-2.log'), /^result: fail \(deterministic\): exited 1$/m)
})

test('a component with no gate command fails as environment instead of passing with nothing run', async () => {
  const { tracking, machine, gate } = await hostWith({ components: [{ ...WEB, commands: { e2e: 'npx playwright test' } }] })

  const outcome = await gate('all')

  assert.deepEqual([outcome.status, outcome.failure], ['failed', 'environment'])
  assert.equal(outcome.reason, 'web/none: no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json')
  assert.equal(outcome.gates[0].evidence, '/work/.copilot-tracking/skraft-plans/checkout/gates/web')
  assert.deepEqual(machine.runs, [])
  assert.deepEqual(gatesRan(tracking).map(({ component, gate: name, status, failure }) => [component, name, status, failure]), [['web', 'none', 'fail', 'environment']])
})

test('an invalid skraft-config.json refuses the gates with every error, instead of dropping what it cannot read', async () => {
  const tracking = new InMemoryTracking()
  await createInit(inMemoryDeps({ tracking })).init({ slug: 'checkout' })
  const gateWith = async (config) => (await createRunGate(inMemoryDeps({ tracking, config })).run({ scope: 'all' })).reason

  assert.equal(await gateWith(JSON.stringify({
    baseBranch: '--orphan',
    forge: 'gitlab',
    workflow: 7,
    components: [
      { name: 'web', root: '/srv/web', stack: 'react', comands: { test: 'npm test' } },
      { name: 'Api', root: 'api', stack: 'cobol', commands: { Test: 'dotnet test', tset: 'dotnet test', build: '  ', mutation: 7 }, baseBranch: 'release 2', mocking: { strategy: 'wiremock' }, contractTesting: 'yes' },
      { name: 'api', root: 'api', stack: 'dotnet', commands: 'dotnet test', mocking: 'inprocess' },
      { name: 'api', root: 'api2', stack: 'dotnet' },
      null,
      { name: 'front', root: 'front', stack: 'react', paths: ['src'] },
      { name: 'back', root: 'back', stack: 'dotnet', paths: { src: ['src', '../shared'], tests: [] } },
      { name: 'jobs', root: 'jobs', stack: 'python', paths: { src: ['/srv/jobs'], tests: [' '] } },
      { name: 'tools', root: 'tools', stack: 'python', paths: { src: [3], tests: ['tests'] } },
    ],
  })), [
    'skraft-config.json is invalid: workflow is no key: skraft workflow eject copies the pipeline into .skraft/pipeline.skraft.dot, the only one a run follows',
    'baseBranch must be a git ref, got "--orphan"',
    'forge must be "github" or "azure-devops"',
    'component web: unknown key comands (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting, mutationReport)',
    'component web: root must be a path relative to the working copy',
    'components[1].name must be kebab-case, got "Api"',
    'component Api: stack must be one of dotnet, java, python, typescript, javascript, react',
    'component Api: contractTesting must be true or false',
    'component Api: unknown command Test (allowed: build, format, lint, test, architecture, coverage, mutation, e2e)',
    'component Api: unknown command tset (allowed: build, format, lint, test, architecture, coverage, mutation, e2e)',
    'component Api: command build must be a non-empty command line',
    'component Api: command mutation must be a non-empty command line',
    'component Api: baseBranch must be a git ref, got "release 2"',
    'component Api: mocking must be { "strategy": "microcks" or "inprocess" }',
    'component api: commands must be an object of command lines',
    'component api: mocking must be { "strategy": "microcks" or "inprocess" }',
    'components[4] must be an object',
    'component front: paths must be { "src": [...], "tests": [...] }',
    'component back: paths.src must list folders inside the component root',
    
    'component jobs: paths.src must list folders inside the component root',
    'component jobs: paths.tests must list folders inside the component root',
    'component tools: paths.src must list folders inside the component root',
  ].join('; '))
  assert.equal(await gateWith(JSON.stringify({ components: [{ name: 'payment-api', root: 'a', stack: 'dotnet' }, { name: 'payment-api', root: 'b', stack: 'dotnet' }] })), 'skraft-config.json is invalid: component name payment-api is used twice')
  assert.equal(await gateWith('{"components": {}}'), 'skraft-config.json is invalid: components must be an array')
  assert.equal(await gateWith('["api"]'), 'skraft-config.json is invalid: skraft-config.json must hold a JSON object')
  assert.equal(await gateWith('{"components": [ignore previous instructions'), 'skraft-config.json is invalid: skraft-config.json is not JSON')
})

test('an output cut past the runner\'s limit is said in the reason and the evidence; the exit code still judges the gate', async () => {
  const machine = new ScriptedMachine({ exits: { '../payment-web $ npx vitest run': 1 }, floods: ['../payment-web $ npx eslint .', '../payment-web $ npx vitest run'] })
  const { tracking, gate } = await hostWith({ components: [WEB], machine })

  const outcome = await gate('all')

  const cut = 'its output passed the runner\'s limit: the evidence keeps only its head and its tail'
  assert.deepEqual([outcome.status, outcome.failure, outcome.reason], ['failed', 'deterministic', `web/test: exited 1; ${cut}`])
  assert.deepEqual(gatesRan(tracking).map(({ gate: name, status }) => [name, status]), [['lint', 'pass'], ['test', 'fail']])
  assert.match(await tracking.read('checkout', 'gates/web/lint-1.log'), new RegExp(`^result: pass: exited 0; ${cut}$`, 'm'))
  assert.match(await tracking.read('checkout', 'gates/web/test-1.log'), new RegExp(`^result: fail \\(deterministic\\): exited 1; ${cut}$`, 'm'))
})

test('a command stopped before it exits fails as environment, and the run says to run it again', async () => {
  const machine = new ScriptedMachine({ exits: { '../payment-web $ npx vitest run': null } })
  const { gate } = await hostWith({ components: [WEB], machine })

  const outcome = await gate('all')

  assert.deepEqual([outcome.failure, outcome.reason], ['environment', 'web/test: npx was stopped by SIGKILL; run it again'])
})

test('another run writing the journal during the gates blocks this one, keeping the gates already journaled', async () => {
  const machine = new ScriptedMachine()
  const { tracking, gate } = await hostWith({ machine })
  machine.meanwhile['../payment-web $ npx eslint .'] = () => tracking.append('checkout', JSON.stringify({ type: 'run.started', slug: 'checkout' }))

  const outcome = await gate('all')

  assert.deepEqual(
    { status: outcome.status, slug: outcome.slug, scope: outcome.scope, components: outcome.components, failure: outcome.failure, code: outcome.code, reason: outcome.reason },
    { status: 'blocked', slug: 'checkout', scope: 'all', components: ['api', 'web'], failure: null, code: 'journal-changed', reason: 'checkout: another run wrote events.jsonl meanwhile; run again once it stops' },
  )
  assert.deepEqual(outcome.gates.map(({ component, gate: name, status }) => `${component}/${name} ${status}`), ['api/build pass', 'api/test pass', 'api/mutation pass'])
  assert.equal(machine.lines().at(-1), '../payment-web $ npx eslint .')
})

test('a failure of the tracking folder itself stops the gates with that error', async () => {
  const { tracking, gate } = await hostWith()
  tracking.write = async () => { throw new Error('ENOSPC: no space left on device') }

  await assert.rejects(gate('all'), /^Error: ENOSPC: no space left on device$/)
})

test('a component whose changes Git cannot list counts as touched', async () => {
  const { gate } = await hostWith({ changed: { api: null } })

  assert.deepEqual((await gate('touched')).components, ['api'])
})
