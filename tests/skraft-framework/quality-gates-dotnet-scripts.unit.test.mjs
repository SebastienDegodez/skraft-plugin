import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SCRIPTS = fileURLToPath(new URL('../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/', import.meta.url))
const CONFIGURE = join(SCRIPTS, 'configure-mutation.sh')
const CORE = join(SCRIPTS, 'mutation-core.sh')
const BOUNDARY = join(SCRIPTS, 'mutation-boundary.sh')
const REPORT_FIXTURE = fileURLToPath(new URL('./quality-gates-dotnet-report.fixture.json', import.meta.url))
const DOTNET_FIXTURE = fileURLToPath(new URL('./quality-gates-dotnet-fake-dotnet.fixture.sh', import.meta.url))

const touch = async (root, relativePath, contents = '') => {
  const path = join(root, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
  return path
}

const touchProject = (root, relativePath) => touch(root, relativePath, '<Project />\n')

const fakeDotnet = async (root) => {
  const bin = join(root, 'bin')
  const path = join(bin, 'dotnet')
  await mkdir(bin, { recursive: true })
  await copyFile(DOTNET_FIXTURE, path)
  await chmod(path, 0o755)
  return bin
}

const run = async (script, args, { cwd, env = {} }) => {
  try {
    const { stdout, stderr } = await execFileAsync('bash', [script, ...args], {
      cwd,
      env: { ...process.env, ...env },
    })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    }
  }
}

const setup = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft-mutation-')))
  const log = join(root, 'dotnet.log')
  const initLog = join(root, 'dotnet-init.log')
  await writeFile(log, '')
  await writeFile(initLog, '')
  const bin = await fakeDotnet(root)
  return {
    root,
    log,
    initLog,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_DOTNET_LOG: log,
      FAKE_DOTNET_INIT_LOG: initLog,
      FAKE_DOTNET_REPORT_FIXTURE: REPORT_FIXTURE,
    },
  }
}

const canonicalSolution = async (root) => {
  await Promise.all([
    touch(root, 'Checkout.sln', ''),
    touchProject(root, 'src/Checkout.Domain/Checkout.Domain.csproj'),
    touchProject(root, 'src/Checkout.Application/Checkout.Application.csproj'),
    touchProject(root, 'src/Checkout.API/Checkout.API.csproj'),
    touchProject(root, 'src/Checkout.Infrastructure/Checkout.Infrastructure.csproj'),
    touchProject(root, 'tests/Checkout.UnitTests/Checkout.UnitTests.csproj'),
    touchProject(root, 'tests/Checkout.IntegrationTests/Checkout.IntegrationTests.csproj'),
  ])
}

const readConfig = async (root, name) => JSON.parse(await readFile(join(root, name), 'utf8'))['stryker-config']

test('canonical scaffold writes two root configs for one whole-solution run per gate', async () => {
  const { root, log, initLog, env } = await setup()
  try {
    await canonicalSolution(root)
    const configured = await run(CONFIGURE, ['--root', root], { cwd: root, env })
    assert.equal(configured.exitCode, 0, configured.stderr)

    const initCalls = (await readFile(initLog, 'utf8')).trim().split('\n')
    assert.equal(initCalls.length, 2)
    assert.ok(initCalls.every((call) => call.startsWith('stryker init --config-file ')))
    assert.match(initCalls[0], /--threshold-high 100 --threshold-low 100 --break-at 100/)
    assert.match(initCalls[1], /--threshold-high 80 --threshold-low 80 --break-at 80/)
    assert.match(initCalls[0], /--solution Checkout\.sln/)
    assert.match(initCalls[0], /--reporter json --reporter cleartext --break-on-initial-test-failure/)
    assert.match(initCalls[0], /--mutate \*\*\/\*\.Domain\/\*\*\/\*\.cs/)
    assert.match(initCalls[1], /--mutate \*\*\/\*\.Infrastructure\/\*\*\/\*\.cs/)

    const coreConfig = await readConfig(root, 'stryker-config-core.json')
    const boundaryConfig = await readConfig(root, 'stryker-config-boundary.json')
    assert.equal(coreConfig.solution, 'Checkout.sln')
    assert.deepEqual(coreConfig.thresholds, { high: 100, low: 100, break: 100 })
    assert.deepEqual(boundaryConfig.thresholds, { high: 80, low: 80, break: 80 })
    assert.deepEqual(coreConfig.mutate.slice(0, 2), ['**/*.Domain/**/*.cs', '**/*.Application/**/*.cs'])
    assert.deepEqual(boundaryConfig.mutate.slice(0, 2), ['**/*.API/**/*.cs', '**/*.Infrastructure/**/*.cs'])
    assert.deepEqual(coreConfig.reporters, ['json', 'cleartext'])
    assert.equal(coreConfig['break-on-initial-test-failure'], true)

    const evidence = join(root, 'evidence')
    const core = await run(CORE, ['--root', root, '--evidence', evidence], { cwd: root, env })
    const boundary = await run(BOUNDARY, ['--root', root, '--evidence', evidence], { cwd: root, env })
    assert.equal(core.exitCode, 0, core.stderr)
    assert.equal(boundary.exitCode, 0, boundary.stderr)
    assert.equal(JSON.parse(core.stdout).expected, 100)
    assert.equal(JSON.parse(boundary.stdout).expected, 80)

    const calls = (await readFile(log, 'utf8')).trim().split('\n').map((line) => line.split('\t'))
    assert.equal(calls.length, 2)
    assert.ok(calls.every(([cwd]) => cwd === root))
    assert.deepEqual(calls.map(([, config]) => config.split('/').at(-1)), [
      'stryker-config-core.json',
      'stryker-config-boundary.json',
    ])

    const coreManifest = JSON.parse(await readFile(join(evidence, 'qg-mutation.json'), 'utf8'))
    const boundaryManifest = JSON.parse(await readFile(join(evidence, 'qg-mutation-boundary.json'), 'utf8'))
    assert.equal(coreManifest.solution, join(root, 'Checkout.sln'))
    assert.equal(boundaryManifest.passed, true)
    await readFile(coreManifest.report, 'utf8')
    await readFile(boundaryManifest.report, 'utf8')
    await readFile(join(evidence, 'qg-mutation.stdout.sha256'), 'utf8')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('explicit source globs scaffold both scopes for a non-standard BFF', async () => {
  const { root, env } = await setup()
  try {
    await Promise.all([
      touch(root, 'Storefront.slnx', ''),
      touchProject(root, 'src/Storefront/Storefront.csproj'),
      touchProject(root, 'tests/Storefront.UnitTests/Storefront.UnitTests.csproj'),
      touchProject(root, 'tests/Storefront.IntegrationTests/Storefront.IntegrationTests.csproj'),
    ])

    const result = await run(CONFIGURE, [
      '--root', root,
      '--core-mutate', '**/Storefront/Core/**/*.cs',
      '--boundary-mutate', '**/Storefront/Adapters/**/*.cs',
    ], { cwd: root, env })

    assert.equal(result.exitCode, 0, result.stderr)
    const core = await readConfig(root, 'stryker-config-core.json')
    const boundary = await readConfig(root, 'stryker-config-boundary.json')
    assert.equal(core.mutate[0], '**/Storefront/Core/**/*.cs')
    assert.equal(boundary.mutate[0], '**/Storefront/Adapters/**/*.cs')
    assert.equal(core.solution, 'Storefront.slnx')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('canonical scaffold refuses incomplete architecture and ambiguous solutions', async () => {
  const { root, env } = await setup()
  try {
    await Promise.all([
      touch(root, 'First.sln', ''),
      touch(root, 'Second.slnx', ''),
      touchProject(root, 'src/Storefront/Storefront.csproj'),
    ])
    const ambiguous = await run(CONFIGURE, ['--root', root], { cwd: root, env })
    assert.equal(ambiguous.exitCode, 2)
    assert.match(ambiguous.stderr, /exactly one.*found 2/i)

    const incomplete = await run(CONFIGURE, ['--root', root, '--solution', 'First.sln'], { cwd: root, env })
    assert.equal(incomplete.exitCode, 2)
    assert.match(incomplete.stderr, /requires a \.Domain project/i)
    assert.match(incomplete.stderr, /explicit globs|BFF/i)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('scaffold is idempotent and preserves customized configs unless forced', async () => {
  const { root, env } = await setup()
  try {
    await canonicalSolution(root)
    const first = await run(CONFIGURE, ['--root', root], { cwd: root, env })
    const second = await run(CONFIGURE, ['--root', root], { cwd: root, env })
    assert.equal(first.exitCode, 0, first.stderr)
    assert.equal(second.exitCode, 0, second.stderr)
    assert.match(second.stdout, /unchanged .*stryker-config-core\.json/)

    const configPath = join(root, 'stryker-config-core.json')
    const config = await readConfig(root, 'stryker-config-core.json')
    config.mutate.unshift('**/custom/**/*.cs')
    await writeFile(configPath, `${JSON.stringify({ 'stryker-config': config }, null, 2)}\n`)

    const protectedRun = await run(CONFIGURE, ['--root', root], { cwd: root, env })
    assert.equal(protectedRun.exitCode, 2)
    assert.match(protectedRun.stderr, /refusing to overwrite customized config/i)
    assert.equal((await readConfig(root, 'stryker-config-core.json')).mutate[0], '**/custom/**/*.cs')

    const forced = await run(CONFIGURE, ['--root', root, '--force'], { cwd: root, env })
    assert.equal(forced.exitCode, 0, forced.stderr)
    assert.equal((await readConfig(root, 'stryker-config-core.json')).mutate[0], '**/*.Domain/**/*.cs')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runner exit code, missing report, and mutant-free report all fail the gate', async () => {
  for (const [variable, expectedMessage] of [
    ['FAKE_DOTNET_FAIL_CONFIG', null],
    ['FAKE_DOTNET_NO_REPORT_CONFIG', /native mutation report missing/i],
    ['FAKE_DOTNET_EMPTY_REPORT_CONFIG', /contains no mutants/i],
  ]) {
    const { root, env } = await setup()
    try {
      await canonicalSolution(root)
      await run(CONFIGURE, ['--root', root], { cwd: root, env })
      const evidence = join(root, 'evidence')
      const result = await run(CORE, ['--root', root, '--evidence', evidence], {
        cwd: root,
        env: { ...env, [variable]: 'stryker-config-core.json' },
      })
      assert.equal(result.exitCode, 1)
      assert.equal(JSON.parse(result.stdout).passed, false)
      if (expectedMessage) assert.match(result.stderr, expectedMessage)
      assert.equal(await readFile(join(evidence, 'qg-mutation.exit'), 'utf8'), '1\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('runner rejects threshold drift before invoking Stryker', async () => {
  const { root, log, env } = await setup()
  try {
    await canonicalSolution(root)
    await run(CONFIGURE, ['--root', root], { cwd: root, env })
    const path = join(root, 'stryker-config-core.json')
    const config = await readConfig(root, 'stryker-config-core.json')
    config.thresholds.break = 99
    await writeFile(path, `${JSON.stringify({ 'stryker-config': config }, null, 2)}\n`)

    const result = await run(CORE, ['--root', root, '--evidence', join(root, 'evidence')], { cwd: root, env })
    assert.equal(result.exitCode, 2)
    assert.match(result.stderr, /thresholds high\/low\/break at 100/i)
    assert.equal(await readFile(log, 'utf8'), '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('threshold stays policy-owned and cannot be supplied by a caller', async () => {
  const { root } = await setup()
  try {
    for (const script of [CONFIGURE, CORE, BOUNDARY]) {
      const result = await run(script, ['--expected', '1'], { cwd: root })
      assert.equal(result.exitCode, 2)
      assert.match(result.stderr, /refusing --expected/)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})