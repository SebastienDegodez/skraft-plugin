import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURES, copyFixture, envWithPath, readJson, skraft, stubPrograms, tempFolder } from '../support/workspace.mjs'

// The toolchains (dotnet, mvn, python, npm, npx) and Docker are stub programs on a PATH of
// their own: doctor must find them where a developer machine would, under Windows as .cmd.
const TOOLCHAINS = ['dotnet', 'mvn', 'python', 'npm', 'npx', 'docker']

const machine = (t, programs = TOOLCHAINS) => envWithPath([stubPrograms(join(tempFolder(t, 'skraft-bin-'), 'bin'), programs)])

const initThenDoctor = async (cwd, env, add = []) => {
  const init = await skraft(cwd, ['init', ...add.flatMap((folder) => ['--add', folder])], { env })
  assert.equal(init.status, 0, init.stderr)
  return { init, doctor: await skraft(cwd, ['doctor'], { env }) }
}

for (const [fixture, stack, commands] of [
  ['payment', 'dotnet', ['build', 'format', 'test', 'mutation']],
  ['payment-spring', 'java', ['build', 'test']],
  ['payment-fastapi', 'python', ['build', 'test']],
  ['react', 'react', ['build', 'lint', 'test']],
]) {
  test(`skraft init then doctor pass on the ${fixture} fixture`, async (t) => {
    const cwd = copyFixture(FIXTURES[fixture], join(tempFolder(t), fixture))

    const { init, doctor } = await initThenDoctor(cwd, machine(t))

    const [component] = readJson(join(cwd, 'skraft-config.json')).components
    assert.deepEqual([component.name, component.root, component.stack], [fixture, '.', stack])
    assert.equal(init.stdout, `skraft-config.json: ${fixture} (${stack}, .)\n`)
    assert.equal(doctor.status, 0, doctor.stdout)
    const lines = doctor.stdout.trim().split(/\r?\n/)
    assert.deepEqual(lines.map((line) => line.split(': ')[0]), [
      'ok    node', 'ok    config', ...commands.map((name) => `ok    ${fixture}/${name}`), 'ok    docker', 'skraft doctor',
    ])
    assert.equal(lines.at(-1), 'skraft doctor: every check passed')
  })
}

test('skraft init then doctor pass on a .NET API with its React front in a neighbour repository', async (t) => {
  const root = tempFolder(t)
  const cwd = copyFixture(FIXTURES.payment, join(root, 'payment-api'))
  copyFixture(FIXTURES.react, join(root, 'payment-web'))

  const { init, doctor } = await initThenDoctor(cwd, machine(t), ['../payment-web'])

  assert.equal(init.stdout, 'skraft-config.json: payment-api (dotnet, .), payment-web (react, ../payment-web)\n')
  assert.equal(doctor.status, 0, doctor.stdout)
  assert.match(doctor.stdout, /^ok {4}payment-web\/test: npm → .*npm(\.cmd)?$/im)
})

test('doctor names the missing command and exits 1; the developer\'s command then wins over the default', async (t) => {
  const cwd = copyFixture(FIXTURES.payment, join(tempFolder(t), 'payment'))
  const env = machine(t, ['dotnet', 'docker'])
  assert.equal((await skraft(cwd, ['init'], { env })).status, 0)
  const config = readJson(join(cwd, 'skraft-config.json'))
  config.components[0].commands.architecture = 'archunit-cli check'
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify(config, null, 2))

  const missing = await skraft(cwd, ['doctor'], { env })

  assert.equal(missing.status, 1)
  assert.match(missing.stdout, /^FAIL {2}payment\/architecture: command not found: archunit-cli \(from \.\); install it or change commands\.architecture in skraft-config\.json$/m)
  assert.equal(missing.stdout.trim().split(/\r?\n/).at(-1), 'skraft doctor: 1 checks failed')

  config.components[0].commands.architecture = 'dotnet test --filter Category=Architecture'
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify(config, null, 2))
  assert.equal((await skraft(cwd, ['doctor'], { env })).status, 0)
})

test('without Docker, doctor fails for the Microcks components, and passes once they mock in process', async (t) => {
  const cwd = copyFixture(FIXTURES['payment-fastapi'], join(tempFolder(t), 'payment-fastapi'))
  const env = machine(t, ['python'])
  assert.equal((await skraft(cwd, ['init'], { env })).status, 0)

  const down = await skraft(cwd, ['doctor', '--json'], { env })

  assert.equal(down.status, 1)
  assert.deepEqual(JSON.parse(down.stdout).checks.filter((check) => check.status === 'fail').map(({ subject }) => subject), ['docker'])

  const path = join(cwd, 'skraft-config.json')
  writeFileSync(path, readFileSync(path, 'utf8').replace('"stack": "python",', '"stack": "python",\n      "mocking": { "strategy": "inprocess", "library": "respx" },'))
  assert.equal((await skraft(cwd, ['doctor'], { env })).status, 0)
})
