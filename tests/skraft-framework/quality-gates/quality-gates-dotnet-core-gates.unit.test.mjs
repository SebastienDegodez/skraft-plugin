// test.no-mocks-core for .NET, as scripts the adapter ships: evidence is produced by the script,
// never assembled by hand, and the script's exit code is the gate verdict.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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

    const evidence = join(root, 'ev')
    const result = await run(NO_MOCKS, ['--root', root, '--evidence', evidence])
    assert.equal(result.exitCode, 1)
    const found = await readFile(join(evidence, 'qg-mocks.stdout'), 'utf8')
    assert.match(found, /Ordering\.Application\/Handler\.cs:1:using NSubstitute;/)
    assert.match(found, /Ordering\.Domain\.UnitTests\/OrderTests\.cs:1:using Moq;/)
    assert.doesNotMatch(found, /IntegrationTests|obj\//, 'integration tests may use in-process doubles; build output is not source')
    assert.equal((await readFile(join(evidence, 'qg-mocks.exit'), 'utf8')).trim(), '1')
  })
})

test('G7 passes with an empty output when the core is double-free', async () => {
  await withRoot(async (root) => {
    await touch(root, 'src/Checkout.Domain/Basket.cs', 'namespace Checkout;\n')
    await touch(root, 'tests/Checkout.UnitTests/BasketTests.cs', 'using Xunit;\n')
    const evidence = join(root, 'ev')
    const result = await run(NO_MOCKS, ['--root', root, '--evidence', evidence])
    assert.equal(result.exitCode, 0, result.stderr)
    assert.equal(await readFile(join(evidence, 'qg-mocks.stdout'), 'utf8'), '')
    assert.equal((await readFile(join(evidence, 'qg-mocks.exit'), 'utf8')).trim(), '0')
    const digest = (await readFile(join(evidence, 'qg-mocks.stdout.sha256'), 'utf8')).trim()
    assert.equal(digest, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

test('G7 refuses a repository with no Domain or Application project', async () => {
  await withRoot(async (root) => {
    await touch(root, 'src/Web/Program.cs', '')
    const result = await run(NO_MOCKS, ['--root', root, '--evidence', join(root, 'ev')])
    assert.equal(result.exitCode, 2)
    assert.match(result.stderr, /no \*\.Domain or \*\.Application project/)
  })
})
