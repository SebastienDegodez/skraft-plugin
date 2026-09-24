import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { runGates, executeChild, resolveToolchain } from '../../../plugins/skraft-framework/skills/quality-gates-javascript/scripts/run-gates.mjs'
import { config, source } from './quality-gates-javascript.fixture.mjs'

const fake = fileURLToPath(new URL('./quality-gates-javascript-fake-stryker.fixture.mjs', import.meta.url))
const modules = fileURLToPath(new URL('../../../plugins/skraft-framework/src/node_modules', import.meta.url))
const cli = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/quality-gates-javascript/scripts/run-gates.mjs', import.meta.url))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'qg-js-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (name, body) => {
    const path = join(root, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }
  await put('pkg/package.json', JSON.stringify({ devDependencies: { '@stryker-mutator/core': '9.6.1', '@stryker-mutator/tap-runner': '9.6.1' } }))
  await symlink(modules, join(root, 'pkg/node_modules'), 'dir')
  for (const scope of ['core', 'boundary']) {
    await put(`${scope}.json`, JSON.stringify(config(scope)))
    await put(`src/${scope}.mjs`, source)
  }
  await put('tests/smoke.test.mjs', "import { test } from 'node:test'; test('smoke', () => {})\n")
  execFileSync('git', ['init', '-q', root])
  execFileSync('git', ['-C', root, 'add', 'core.json', 'boundary.json', 'src', 'tests', 'pkg/package.json'])
  execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], { env: { ...process.env, HUSKY: '0' } })
  return { root, package: 'pkg', core: 'core.json', boundary: 'boundary.json', evidence: 'evidence', coreOnly: false }
}

function testPort(calls, mode = 'pass') {
  return async (command, args, options) => {
    calls.push({ command, args, options })
    return executeChild(command, [fake, ...args.slice(1), mode], options)
  }
}

test('one invocation executes core then boundary and captures independently hashable fresh evidence', async (t) => {
  const input = await fixture(t)
  const calls = []
  const result = await runGates(input, { execute: testPort(calls) })
  assert.equal(result.exitCode, 0, JSON.stringify(result))
  assert.equal(result.status, 'pass')
  assert.equal(result.combinedPass, true)
  assert.deepEqual(result.gates.map((gate) => gate.scope), ['core', 'boundary'])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].command, process.execPath)
  assert.match(calls[0].args[0], /@stryker-mutator[\\/]core[\\/]bin[\\/]stryker\.js$/)
  assert.equal(calls[0].args[1], 'run')
  for (const gate of result.gates) {
    assert.equal(gate.childExitCode, 0)
    assert.equal(await readFile(gate.exit_ref, 'utf8'), '0\n')
    assert.equal(hash(await readFile(gate.stdout_ref)), gate.stdout_sha256)
    assert.equal(hash(await readFile(gate.report_ref)), gate.report_sha256)
    assert.equal(hash(await readFile(gate.config_ref)), gate.config_sha256)
    assert.match(await readFile(gate.stderr_ref, 'utf8'), /fixture runner stderr/)
    assert.equal(gate.metrics.score, 100)
  }
  const saved = JSON.parse(await readFile(result.manifest, 'utf8'))
  assert.equal(saved.combinedPass, true)
  assert.match(saved.repo_root_rev, /^[a-f0-9]{40}$/)
  assert.equal(saved.toolchain.version, '9.6.1')
  const second = await runGates(input, { execute: testPort([], 'missing') })
  assert.notEqual(second.directory, result.directory)
  assert.equal(second.exitCode, 1)
  assert.equal(second.gates.length, 1)
})

for (const mode of ['missing', 'malformed', 'empty', 'unexpected', 'stale', 'survived', 'nonzero', 'symlink', 'change-source', 'signal']) {
  test(`${mode} core blocks boundary even when child claims success`, async (t) => {
    const input = await fixture(t)
    const calls = []
    const result = await runGates(input, { execute: testPort(calls, mode) })
    assert.equal(result.exitCode, 1, JSON.stringify(result))
    assert.equal(result.combinedPass, false)
    assert.equal(calls.length, 1)
    assert.equal(result.gates[0].passed, false)
    await readFile(result.manifest)
  })
}

test('boundary failure fails combined run; core-only is explicitly diagnostic', async (t) => {
  const input = await fixture(t)
  const calls = []
  const execute = (command, args, options) => testPort(calls, calls.length ? 'nonzero' : 'pass')(command, args, options)
  const failed = await runGates(input, { execute })
  assert.equal(failed.exitCode, 1)
  assert.equal(failed.gates.length, 2)
  const debug = await runGates({ ...input, coreOnly: true, boundary: undefined }, { execute: testPort([]) })
  assert.equal(debug.exitCode, 0)
  assert.equal(debug.status, 'core-only')
  assert.equal(debug.combinedPass, false)
  assert.equal(debug.gates.length, 1)
})

for (const defect of ['untracked', 'unsupported', 'missing', 'empty-glob', 'excluded', 'overlap', 'outside', 'suppressed']) {
  test(`input ${defect} blocks before executing either gate`, async (t) => {
    const input = await fixture(t)
    if (defect === 'untracked') execFileSync('git', ['-C', input.root, 'rm', '--cached', 'core.json'])
    if (defect === 'unsupported') await writeFile(join(input.root, 'boundary.json'), JSON.stringify({ ...config('boundary'), testRunner: 'jest' }))
    if (defect === 'missing') input.core = 'absent.json'
    if (defect === 'empty-glob') await writeFile(join(input.root, 'core.json'), JSON.stringify({ ...config(), mutate: ['absent/*.mjs'] }))
    if (defect === 'excluded') await writeFile(join(input.root, 'core.json'), JSON.stringify({ ...config(), ignoreStatic: true }))
    if (defect === 'overlap') await writeFile(join(input.root, 'boundary.json'), JSON.stringify({ ...config('boundary'), mutate: ['src/core.mjs'] }))
    if (defect === 'outside') input.core = '../outside.json'
    if (defect === 'suppressed') await writeFile(join(input.root, 'src/core.mjs'), '// Stryker disable all\n' + source)
    const calls = []
    const result = await runGates(input, { execute: testPort(calls) })
    assert.equal(result.exitCode, 2, JSON.stringify(result))
    assert.equal(result.combinedPass, false)
    assert.equal(calls.length, 0)
  })
}

test('local package selection resolves installed dependencies, missing package blocks without install', async (t) => {
  const input = await fixture(t)
  const toolchain = await resolveToolchain(join(input.root, 'pkg'))
  assert.equal(toolchain.version, '9.6.1')
  const result = await runGates({ ...input, package: 'absent' })
  assert.equal(result.exitCode, 2)
})

test('CLI usage errors are structured exit 2, not raw exceptions', () => {
  assert.throws(() => execFileSync(process.execPath, [cli, '--threshold', '0'], { encoding: 'utf8', stdio: 'pipe' }), (error) => {
    assert.equal(error.status, 2)
    assert.equal(JSON.parse(error.stdout).status, 'blocked')
    return true
  })
})

test('boundary cannot change previously proven core and retain combined pass', async (t) => {
  const input = await fixture(t)
  const calls = []
  const execute = (command, args, options) => testPort(calls, calls.length ? 'change-core' : 'pass')(command, args, options)
  const result = await runGates(input, { execute })
  assert.equal(result.exitCode, 1)
  assert.equal(result.combinedPass, false)
  assert.match(result.gates.at(-1).error, /changed/)
})

test('failed spawn preserves diagnostics and never unlocks boundary', async (t) => {
  const input = await fixture(t)
  const result = await runGates(input, {
    execute: (command, args, options) => executeChild(join(input.root, 'missing-node'), args, options),
  })
  assert.equal(result.exitCode, 1)
  assert.equal(result.gates.length, 1)
  assert.match(result.gates[0].childError, /ENOENT/)
  assert.equal(await readFile(result.gates[0].exit_ref, 'utf8'), 'null\n')
})

test('checked-in ESM config is loaded, snapshotted and left unchanged', async (t) => {
  const input = await fixture(t)
  const path = join(input.root, 'core.mjs')
  const text = `export default ${JSON.stringify(config())}\n`
  await writeFile(path, text)
  execFileSync('git', ['-C', input.root, 'add', 'core.mjs'])
  execFileSync('git', ['-C', input.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'esm config'])
  const result = await runGates({ ...input, core: 'core.mjs' }, { execute: testPort([]) })
  assert.equal(result.exitCode, 0, JSON.stringify(result))
  assert.equal(await readFile(path, 'utf8'), text)
})