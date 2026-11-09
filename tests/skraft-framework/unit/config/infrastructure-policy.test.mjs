import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDoctor } from '../../../../plugins/skraft-framework/engine/application/diagnostics/doctor-usecase.mjs'
import { InMemoryCopilotSdk, ScriptedMachine, inMemoryDeps } from '../support/in-memory-host.mjs'

const MICROCKS = 'Microcks uber native image via Testcontainers, one container per test session'

/** The doctor's report on skraft-config.json listing `components`; local and user: the developer's own files. */
const doctorOn = async (components, { local, user, machine = new ScriptedMachine() } = {}) => {
  const deps = inMemoryDeps({
    config: JSON.stringify({ components }), local: local === undefined ? undefined : JSON.stringify(local), user: user === undefined ? undefined : JSON.stringify(user),
    executables: machine, commandRunner: machine, runtime: { nodeVersion: () => 'v22.11.0' }, copilotSdk: new InMemoryCopilotSdk(),
  })
  return createDoctor(deps).check()
}

/** The infrastructure lines of the doctor's report. */
const policyOf = async (components) => (await doctorOn(components)).checks.filter(({ subject }) => subject === 'infrastructure').map(({ status, detail }) => `${status} ${detail}`)

/** Why the doctor refuses the configuration. */
const refusalOf = async (components, layers) => (await doctorOn(components, layers)).checks.find(({ subject }) => subject === 'config').detail

const component = (name, stack, more = {}) => ({ name, root: name, stack, bdd: false, commands: { test: 'x' }, ...more })

test('doctor shows the plugin\'s policy of each stack row by row: a back end mocks what it calls with Microcks, a React front end with MSW, each row with its tool and where it comes from, then where its tests write JUnit XML', async () => {
  const lines = await policyOf([component('api', 'dotnet'), component('web', 'react')])

  assert.deepEqual(lines, [
    'ok api (dotnet) entry point: in-process (targeted), real (walking skeleton) — WebApplicationFactory; source plugin',
    'ok api (dotnet) internal gateway: in-memory (targeted), testcontainers (walking skeleton) — Testcontainers; source plugin',
    `ok api (dotnet) external gateway: microcks (targeted), microcks (walking skeleton) — ${MICROCKS}; source plugin`,
    'ok api (dotnet) clock: fake (targeted), fake (walking skeleton); source plugin',
    'ok api (dotnet) JUnit reports: **/TestResults/*.trx, **/TestResults/*.xml',
    'ok web (react) entry point: in-process (targeted) — Testing Library; source plugin',
    'ok web (react) front to back: msw (targeted), microcks (e2e) — MSW; Playwright + Microcks; source plugin',
    'ok web (react) clock: fake (targeted); source plugin',
    'ok web (react) JUnit reports: reports/junit.xml',
  ])
})

test('each stack hosts its entry point in the test process with its own tool and reads JUnit XML where its runner writes it; every back end but none of the front ends mocks with Microcks unless told otherwise', async () => {
  const stacks = ['java', 'python', 'typescript', 'javascript']
  const lines = await policyOf(stacks.map((stack) => component(stack, stack)))

  const of = (stack, row) => lines.find((line) => line.startsWith(`ok ${stack} (${stack}) ${row}:`))
  assert.deepEqual(stacks.map((stack) => of(stack, 'entry point')), [
    'ok java (java) entry point: in-process (targeted), real (walking skeleton) — MockMvc / @SpringBootTest; source plugin',
    'ok python (python) entry point: in-process (targeted), real (walking skeleton) — FastAPI TestClient; source plugin',
    'ok typescript (typescript) entry point: in-process (targeted), real (walking skeleton) — app.inject / supertest; source plugin',
    'ok javascript (javascript) entry point: in-process (targeted), real (walking skeleton) — app.inject / supertest; source plugin',
  ])
  assert.deepEqual(stacks.map((stack) => of(stack, 'JUnit reports')), [
    'ok java (java) JUnit reports: **/target/surefire-reports/TEST-*.xml, **/build/test-results/test/*.xml',
    'ok python (python) JUnit reports: reports/junit.xml',
    'ok typescript (typescript) JUnit reports: reports/junit.xml',
    'ok javascript (javascript) JUnit reports: reports/junit.xml',
  ])
  assert.deepEqual(stacks.map((stack) => of(stack, 'external gateway')), stacks.map((stack) => `ok ${stack} (${stack}) external gateway: microcks (targeted), microcks (walking skeleton) — ${MICROCKS}; source plugin`))
})

test('mocking.strategy sets the external gateway of a back end and the front-to-back row of a front end, both ways', async () => {
  const lines = await policyOf([component('jobs', 'python', { mocking: { strategy: 'inprocess' } }), component('web', 'react', { mocking: { strategy: 'microcks' } })])

  assert.deepEqual(lines.filter((line) => /external gateway|front to back/.test(line)), [
    'ok jobs (python) external gateway: in-process (targeted), in-process (walking skeleton) — FastAPI TestClient; source skraft-config.json (mocking.strategy)',
    `ok web (react) front to back: microcks (targeted), microcks (e2e) — ${MICROCKS}; Playwright + Microcks; source skraft-config.json (mocking.strategy)`,
  ])
})

test('a row a component overrides in skraft-config.json says so, keeps the plugin\'s mechanism for a stage it leaves out, and names each tool once', async () => {
  const lines = await policyOf([
    component('jobs', 'python', { infrastructure: { clock: { walkingSkeleton: 'real', targeted: 'real' }, internalGateway: { walkingSkeleton: 'in-memory' } } }),
    component('web', 'react', { infrastructure: { frontToBack: { e2e: 'msw' }, entryPoint: { targeted: 'real' } } }),
  ])

  assert.deepEqual(lines.filter((line) => !line.includes('JUnit')), [
    'ok jobs (python) entry point: in-process (targeted), real (walking skeleton) — FastAPI TestClient; source plugin',
    'ok jobs (python) internal gateway: in-memory (targeted), in-memory (walking skeleton); source skraft-config.json',
    `ok jobs (python) external gateway: microcks (targeted), microcks (walking skeleton) — ${MICROCKS}; source plugin`,
    'ok jobs (python) clock: real (targeted), real (walking skeleton); source skraft-config.json',
    'ok web (react) entry point: real (targeted); source skraft-config.json',
    'ok web (react) front to back: msw (targeted), msw (e2e) — MSW; source skraft-config.json',
    'ok web (react) clock: fake (targeted); source plugin',
  ])
})

test('a component names where its tests write JUnit XML, inside its root, normalised; a list that is empty, not a list, or names a file outside the root is refused', async () => {
  const lines = await policyOf([component('api', 'dotnet', { testReports: ['./reports/unit.xml', 'tests\\Api.Tests\\TestResults\\*.xml'] })])
  assert.equal(lines.at(-1), 'ok api (dotnet) JUnit reports: reports/unit.xml, tests/Api.Tests/TestResults/*.xml')

  for (const testReports of [[], 'reports/junit.xml', ['/srv/reports/junit.xml'], ['C:reports.xml'], ['../reports/junit.xml'], ['reports/../junit.xml'], ['reports\\..\\junit.xml'], ['reports/junit.xml', '..'], [' '], [3], null]) {
    assert.equal(await refusalOf([component('api', 'dotnet', { testReports })]), 'skraft-config.json is invalid: component api: testReports must list the JUnit XML files its tests write, as paths or patterns inside the component root', JSON.stringify(testReports))
  }
})

test('a test command that writes no JUnit report where the engine reads it is a warning naming the option to add; a command that writes one, or whose runner the doctor cannot tell, is not', async () => {
  const warnings = async (components) => (await doctorOn(components)).checks.filter(({ subject, status }) => subject === 'infrastructure' && status === 'warn').map(({ detail }) => detail)
  const why = 'or the engine refuses every red of an acceptance test as writing no report, unless a configuration file of the runner already writes one'

  assert.deepEqual(await warnings([
    component('api', 'dotnet', { commands: { test: 'dotnet test --nologo' } }),
    component('jobs', 'python', { commands: { test: 'python -m pytest -q' } }),
    component('web', 'react', { commands: { test: 'npx vitest run' } }),
    component('cli', 'javascript', { commands: { test: 'npx jest' } }),
  ]), [
    `api (dotnet) test command "dotnet test --nologo" writes no JUnit report where testReports looks: add --logger trx, ${why}`,
    `jobs (python) test command "python -m pytest -q" writes no JUnit report where testReports looks: add --junitxml=reports/junit.xml, ${why}`,
    `web (react) test command "npx vitest run" writes no JUnit report where testReports looks: add --reporter=default --reporter=junit --outputFile.junit=reports/junit.xml, ${why}`,
    `cli (javascript) test command "npx jest" writes no JUnit report where testReports looks: add the jest-junit reporter (--reporters=default --reporters=jest-junit), ${why}`,
  ])
  assert.deepEqual(await warnings([
    component('api', 'dotnet', { commands: { test: 'dotnet test --logger "junit;LogFilePath=TestResults/junit.xml"' } }),
    component('jobs', 'python', { commands: { test: 'python -m pytest --junitxml=reports/junit.xml' } }),
    component('web', 'react', { commands: { test: 'npm test' } }),
    component('svc', 'java', { commands: { test: 'mvn -B test' } }),
  ]), [])
})

test('an infrastructure row is refused, naming the component, when it is no row of its stack, the external gateway mocking.strategy sets, no object, a stage the row has not or a mechanism no row runs on', async () => {
  const refusals = [
    ['dotnet', ['entryPoint'], 'infrastructure must be an object of rows (allowed: entryPoint, internalGateway, clock)'],
    ['dotnet', null, 'infrastructure must be an object of rows (allowed: entryPoint, internalGateway, clock)'],
    ['react', 'msw', 'infrastructure must be an object of rows (allowed: entryPoint, frontToBack, clock)'],
    ['dotnet', { externalGateway: { targeted: 'microcks' } }, 'infrastructure.externalGateway is set by mocking.strategy; write "mocking": { "strategy": ... } instead'],
    ['react', { externalGateway: { targeted: 'msw' } }, 'infrastructure.externalGateway is set by mocking.strategy; write "mocking": { "strategy": ... } instead'],
    ['dotnet', { database: { targeted: 'in-memory' } }, 'unknown infrastructure row database (allowed: entryPoint, internalGateway, clock)'],
    ['dotnet', { frontToBack: { targeted: 'msw' } }, 'unknown infrastructure row frontToBack (allowed: entryPoint, internalGateway, clock)'],
    ['react', { internalGateway: { targeted: 'in-memory' } }, 'unknown infrastructure row internalGateway (allowed: entryPoint, frontToBack, clock)'],
    ['dotnet', { internalGateway: 'in-memory' }, 'infrastructure.internalGateway must be an object of targeted, walkingSkeleton'],
    ['react', { frontToBack: ['msw'] }, 'infrastructure.frontToBack must be an object of targeted, e2e'],
    ['dotnet', { entryPoint: { e2e: 'real' } }, 'infrastructure.entryPoint: unknown field e2e (allowed: targeted, walkingSkeleton)'],
    ['react', { entryPoint: { walkingSkeleton: 'real' } }, 'infrastructure.entryPoint: unknown field walkingSkeleton (allowed: targeted)'],
    ['react', { frontToBack: { walkingSkeleton: 'microcks' } }, 'infrastructure.frontToBack: unknown field walkingSkeleton (allowed: targeted, e2e)'],
    ['dotnet', { clock: { targeted: 'wiremock' } }, 'infrastructure.clock.targeted must be one of in-process, real, in-memory, testcontainers, microcks, fake, msw'],
    ['react', { frontToBack: { e2e: 'inprocess' } }, 'infrastructure.frontToBack.e2e must be one of in-process, real, in-memory, testcontainers, microcks, fake, msw'],
  ]
  for (const [stack, infrastructure, error] of refusals) {
    assert.equal(await refusalOf([component('api', stack, { infrastructure })]), `skraft-config.json is invalid: component api: ${error}`, JSON.stringify(infrastructure))
  }
  assert.equal(
    await refusalOf([component('api', 'dotnet', { infrastructure: { clock: { targeted: 'wiremock', walkingSkeleton: 'real', e2e: 'fake' }, cache: {} } })]),
    'skraft-config.json is invalid: component api: infrastructure.clock.targeted must be one of in-process, real, in-memory, testcontainers, microcks, fake, msw; component api: infrastructure.clock: unknown field e2e (allowed: targeted, walkingSkeleton); component api: unknown infrastructure row cache (allowed: entryPoint, internalGateway, clock)',
  )
})

test('only the team\'s skraft-config.json overrides a component\'s infrastructure: the developer\'s own files are refused it', async () => {
  const api = component('api', 'dotnet', { infrastructure: { internalGateway: { walkingSkeleton: 'in-memory' } } })

  assert.equal(await refusalOf([component('api', 'dotnet')], { local: { components: [api] } }), 'skraft-config.local.json is invalid: components belongs in skraft-config.json, never in skraft-config.local.json')
  assert.equal(await refusalOf([component('api', 'dotnet')], { user: { components: [api] } }), '~/.skraft/config.json is invalid: components belongs in skraft-config.json, never in ~/.skraft/config.json')
})
