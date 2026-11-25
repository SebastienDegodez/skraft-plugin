// test.no-mocks-core for .NET, as scripts the adapter ships: the script prints its hits and, with
// --log, records the gate verdict (its exit code) in the evidence log; no other file is written.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SCRIPTS = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/', import.meta.url))
const NO_MOCKS = join(SCRIPTS, 'no-mocks-in-core.mjs')

const touch = async (root, relativePath, contents = '') => {
  const path = join(root, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

const run = async (script, args, env = {}) => {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], { env: { ...process.env, ...env } })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    return { exitCode: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

const withRoot = async (fn) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft-core-gates-')))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

// ─── G7 ─────────────────────────────────────────────────────────────────────────

test('G7 finds a mocking framework in a nested bounded context and its unit tests', async () => {
  await withRoot(async (root) => {
    await touch(root, 'src/Ordering/Ordering.Domain/Order.cs', 'namespace Ordering;\n')
    await touch(root, 'src/Ordering/Ordering.Application/Handler.cs', 'using NSubstitute;\n')
    await touch(root, 'tests/Ordering/Ordering.Domain.UnitTests/OrderTests.cs', 'using Moq;\nvar m = new Mock<IClock>();\n')
    await touch(root, 'tests/Ordering/Ordering.Api.IntegrationTests/ApiTests.cs', 'using FakeItEasy;\n')
    await touch(root, 'src/Ordering/Ordering.Domain/obj/Generated.cs', 'using Moq;\n')

    const result = await run(NO_MOCKS, ['--root', root])
    assert.equal(result.exitCode, 1)
    assert.match(result.stdout, /Ordering\.Application\/Handler\.cs:1:using NSubstitute;/)
    assert.match(result.stdout, /Ordering\.Domain\.UnitTests\/OrderTests\.cs:1:using Moq;/)
    assert.doesNotMatch(result.stdout, /IntegrationTests|obj\//, 'integration tests may use in-process doubles; build output is not source')
  })
})

test('G7 records its verdict in the evidence log and leaves no other file', async () => {
  await withRoot(async (root) => {
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.email=e@x', '-c', 'user.name=E', ...args], { encoding: 'utf8' })
    await touch(root, '.gitignore', '.copilot-tracking/skraft-plans/*/evidence/\n')
    await touch(root, 'src/Checkout.Domain/Basket.cs', 'namespace Checkout;\n')
    await touch(root, 'tests/Checkout.UnitTests/BasketTests.cs', 'using Xunit;\n')
    git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'chore(checkout): base')
    const dir = '.copilot-tracking/skraft-plans/p/evidence/d/basket'
    const result = await run(NO_MOCKS, ['--root', root, '--log', `${dir}/qg-basket.json`])
    assert.equal(result.exitCode, 0, result.stderr)
    assert.equal(result.stdout, '')
    assert.deepEqual(await readdir(join(root, dir)), ['qg-basket.json'])
    const log = JSON.parse(await readFile(join(root, dir, 'qg-basket.json'), 'utf8'))
    assert.deepEqual(log.gates.map(({ id, status, summary }) => ({ id, status, summary })), [{ id: 'test.no-mocks-core', status: 'pass', summary: 'no mocking symbol in the core' }])
    assert.deepEqual([log.$schema, log.story, log.tech_adapter], ['quality-gates-evidence/v7', 'basket', 'quality-gates-dotnet'])
  })
})

test('G7 refuses a repository with no Domain or Application project', async () => {
  await withRoot(async (root) => {
    await touch(root, 'src/Web/Program.cs', '')
    const result = await run(NO_MOCKS, ['--root', root])
    assert.equal(result.exitCode, 2)
    assert.match(result.stderr, /no \*\.Domain or \*\.Application project/)
  })
})
