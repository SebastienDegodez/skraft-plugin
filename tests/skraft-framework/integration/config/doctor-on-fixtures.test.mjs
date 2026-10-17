import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, linkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FIXTURES, commitAll, copyFixture, envWithPath, git, readJson, skraft, stubPrograms, tempFolder, toolFolders } from '../support/workspace.mjs'

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

test('python runs from the virtual environment of the component, laid out the way this OS makes one', async (t) => {
  const cwd = copyFixture(FIXTURES['payment-fastapi'], join(tempFolder(t), 'payment-fastapi'))
  // Node stands for the interpreter: `python --version` answers with Node's version.
  const venv = process.platform === 'win32' ? join(cwd, '.venv', 'Scripts', 'python.exe') : join(cwd, '.venv', 'bin', 'python')
  mkdirSync(dirname(venv), { recursive: true })
  try { linkSync(process.execPath, venv) } catch { copyFileSync(process.execPath, venv) }
  const env = envWithPath(toolFolders())
  assert.equal((await skraft(cwd, ['init'], { env })).status, 0)
  const path = join(cwd, 'skraft-config.json')
  const config = readJson(path)
  config.components[0].commands = { test: 'python --version' }
  config.components[0].mocking = { strategy: 'inprocess' }
  writeFileSync(path, JSON.stringify(config, null, 2))
  commitAll(cwd)
  assert.equal((await skraft(cwd, ['init', 'checkout'], { env })).status, 0)

  const doctor = await skraft(cwd, ['doctor'], { env })
  const gate = await skraft(cwd, ['gate', '--all'], { env })

  assert.equal(doctor.status, 0, doctor.stdout)
  assert.equal(doctor.stdout.split(/\r?\n/)[2], `ok    payment-fastapi/test: python → ${venv}`)
  assert.equal(gate.status, 0, gate.stdout)
  const evidence = readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', 'checkout', 'gates', 'payment-fastapi', 'test-1.log'), 'utf8')
  assert.match(evidence, new RegExp(`--- stdout\\n${process.version.replaceAll('.', '\\.')}\\n`))
})

test('doctor --run starts each command once against the base it is given, main by default', async (t) => {
  const cwd = join(tempFolder(t), 'payment')
  mkdirSync(cwd)
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ components: [
    { name: 'payment', root: '.', stack: 'javascript', mocking: { strategy: 'inprocess' }, commands: { test: 'node --version {baseSha}' } },
  ] }))
  const mainSha = commitAll(cwd)
  git(cwd, 'checkout', '-q', '-b', 'develop')
  git(cwd, 'commit', '-q', '--allow-empty', '-m', 'develop')
  const developSha = git(cwd, 'rev-parse', 'HEAD')
  const env = envWithPath(toolFolders())

  const onMain = await skraft(cwd, ['doctor', '--run', '--json'], { env })
  const onDevelop = await skraft(cwd, ['doctor', '--base', 'develop', '--run'], { env })
  const dry = await skraft(cwd, ['doctor', '--base', 'develop', '--json'], { env })

  assert.equal(onMain.status, 0, onMain.stdout)
  assert.deepEqual(JSON.parse(onMain.stdout).checks[2], { subject: 'payment/test', status: 'ok', detail: `node --version ${mainSha} passed` })
  assert.equal(onDevelop.status, 0, onDevelop.stdout)
  assert.equal(onDevelop.stdout.split(/\r?\n/)[2], `ok    payment/test: node --version ${developSha} passed`)
  assert.match(JSON.parse(dry.stdout).checks[2].detail, /^node → /)
})
