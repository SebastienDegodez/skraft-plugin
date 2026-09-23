// G7 and G11 for .NET, as scripts the adapter ships: evidence is produced by the script,
// never assembled by hand, and the script's exit code is the gate verdict.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SCRIPTS = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/', import.meta.url))
const NO_MOCKS = join(SCRIPTS, 'no-mocks-in-core.sh')
const COVERAGE = join(SCRIPTS, 'coverage-core.sh')

const touch = async (root, relativePath, contents = '') => {
  const path = join(root, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

const run = async (script, args, env = {}) => {
  try {
    const { stdout, stderr } = await execFileAsync('bash', [script, ...args], { env: { ...process.env, ...env } })
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

// ─── G11 ────────────────────────────────────────────────────────────────────────

// Real Cobertura lists each line under its method and again under its class.
const cobertura = (packages) => `<?xml version="1.0"?>\n<coverage>\n<packages>\n${packages.map(([name, covered, valid]) => {
  const lines = Array.from({ length: valid }, (_, i) => `<line number="${i + 1}" hits="${i < covered ? 1 : 0}" branch="False"/>`).join('')
  return `<package name="${name}" line-rate="${valid ? covered / valid : 1}"><classes><class name="C" filename="src/${name}/C.cs" line-rate="1"><methods><method name="M"><lines>${lines}</lines></method></methods><lines>${lines}</lines></class></classes></package>`
}).join('\n')}\n</packages>\n</coverage>\n`

// A dotnet that writes one Cobertura report per test project into --results-directory.
const fakeDotnet = async (root, reports, exitCode = 0) => {
  const bin = join(root, 'bin')
  await mkdir(bin, { recursive: true })
  const script = `#!/usr/bin/env bash
[ "$1" = "test" ] || exit 90
while [ $# -gt 0 ]; do
  case "$1" in --results-directory) results="$2"; shift 2 ;; *) shift ;; esac
done
i=0
for report in ${reports.map((r) => `'${r}'`).join(' ')}; do
  i=$((i+1)); mkdir -p "$results/run-$i"; cp "$report" "$results/run-$i/coverage.cobertura.xml"
done
echo "Passed!"
exit ${exitCode}
`
  await writeFile(join(bin, 'dotnet'), script)
  await chmod(join(bin, 'dotnet'), 0o755)
  return { PATH: `${bin}:${process.env.PATH}` }
}

test('G11 passes at 100% line coverage of Domain and Application, whatever the boundary covers', async () => {
  await withRoot(async (root) => {
    await touch(root, 'Checkout.sln')
    const report = join(root, 'a.xml')
    await writeFile(report, cobertura([['Checkout.Domain', 10, 10], ['Checkout.Application', 4, 4], ['Checkout.Infrastructure', 1, 9]]))
    const evidence = join(root, 'ev')
    const result = await run(COVERAGE, ['--root', root, '--evidence', evidence], await fakeDotnet(root, [report]))
    assert.equal(result.exitCode, 0, result.stderr)
    const manifest = JSON.parse(await readFile(join(evidence, 'qg-coverage.json'), 'utf8'))
    assert.deepEqual(manifest, { gate: 'coverage', expected: 100, covered: 14, valid: 14, percent: 100, passed: true, exit: 0 })
    assert.equal((await readFile(join(evidence, 'qg-coverage.exit'), 'utf8')).trim(), '0')
    assert.match(await readFile(join(evidence, 'qg-coverage.stdout'), 'utf8'), /Line coverage \(Domain, Application\): 14\/14 = 100%/)
    assert.deepEqual((await readdir(evidence)).sort(), ['qg-coverage.exit', 'qg-coverage.json', 'qg-coverage.stdout', 'qg-coverage.stdout.sha256'])
  })
})

test('G11 fails below the bar across every report, nested contexts included', async () => {
  await withRoot(async (root) => {
    await touch(root, 'Checkout.sln')
    const a = join(root, 'a.xml')
    const b = join(root, 'b.xml')
    await writeFile(a, cobertura([['Ordering.Domain', 10, 10]]))
    await writeFile(b, cobertura([['Billing.Application', 3, 4]]))
    const evidence = join(root, 'ev')
    const result = await run(COVERAGE, ['--root', root, '--evidence', evidence], await fakeDotnet(root, [a, b]))
    assert.equal(result.exitCode, 1)
    const manifest = JSON.parse(await readFile(join(evidence, 'qg-coverage.json'), 'utf8'))
    assert.equal(manifest.passed, false)
    assert.equal(manifest.covered, 13)
    assert.equal(manifest.valid, 14)
  })
})

test('G11 fails when the tests fail, and when no core package was measured', async () => {
  await withRoot(async (root) => {
    await touch(root, 'Checkout.sln')
    const report = join(root, 'a.xml')
    await writeFile(report, cobertura([['Checkout.Domain', 5, 5]]))
    const failing = await run(COVERAGE, ['--root', root, '--evidence', join(root, 'ev1')], await fakeDotnet(root, [report], 1))
    assert.equal(failing.exitCode, 1)

    const boundaryOnly = join(root, 'b.xml')
    await writeFile(boundaryOnly, cobertura([['Checkout.Api', 5, 5]]))
    const unmeasured = await run(COVERAGE, ['--root', root, '--evidence', join(root, 'ev2')], await fakeDotnet(root, [boundaryOnly]))
    assert.equal(unmeasured.exitCode, 1)
    assert.match(await readFile(join(root, 'ev2', 'qg-coverage.stdout'), 'utf8'), /no Domain or Application package was measured/)
  })
})

test('G11 keeps the threshold policy-owned', async () => {
  await withRoot(async (root) => {
    const result = await run(COVERAGE, ['--root', root, '--evidence', join(root, 'ev'), '--threshold', '50'])
    assert.equal(result.exitCode, 2)
  })
})
