import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failureSignature } from '../../../../plugins/skraft-framework/engine/domain/pipeline/failure-signature.mjs'

/**
 * A failure as each tool prints it, run twice: what a run changes from one try to the next (the
 * time, a duration, a process, a temporary folder, a sha, a GUID, a port, an attempt) differs
 * between the two runs.
 */
const RUNS = [
  { n: 1, time: '2026-11-09T09:01:00.120Z', clock: '09:01:00', stamp: '2026-11-09_09_01_00', ms: 12, s: '1.42', pid: 4001, tmp: '/tmp/skraft-1f3a', sha: 'c0ffee1', guid: '0b5e0d2a-1c3e-4f00-9a1b-2c3d4e5f6a71', port: 51001, offset: '+01:00' },
  { n: 2, time: '2026-11-10T17:45:09.004Z', clock: '17:45:09', stamp: '2026-11-10_17_45_09', ms: 340, s: '0.87', pid: 9311, tmp: '/private/var/folders/rt/7b90yj/T/skraft-9e01', sha: 'f00dbab2', guid: '7d0a3b44-91ef-4c2e-8f6d-0e1f2a3b4c5d', port: 63112, offset: '-05:00' },
]

const TOOLS = {
  'dotnet test (VSTest)': (r, failing = 'PaysByCard', actual = 0) => `Test run for ${r.tmp}/Checkout.Tests/bin/Debug/net10.0/Checkout.Tests.dll (.NETCoreApp,Version=v10.0)
Starting test execution, please wait...
[xUnit.net 00:00:0${r.n}.12]     CheckoutTests.${failing} [FAIL]
  Failed CheckoutTests.${failing} [${r.ms} ms]
  Error Message:
   Assert.Equal() Failure: Values differ
Expected: 10
Actual:   ${actual}
Results File: ${r.tmp}/TestResults/runner_host_${r.stamp}.trx
Failed!  - Failed:     1, Passed:     4, Skipped:     0, Total:     5, Duration: ${r.ms} ms - Checkout.Tests.dll (net10.0)`,
  'dotnet test (Microsoft.Testing.Platform)': (r, failing = 'PaysByCard', actual = 0) => `Running tests from ${r.tmp}/bin/Debug/net10.0/Checkout.Tests.dll
failed ${failing} (${r.ms}ms)
  Assert.Equal() Failure: Values differ, actual ${actual}
In process file artifacts produced:
  - /work/tests/Checkout.Tests/bin/Debug/net10.0/TestResults/${r.guid}.trx
Test run summary: Failed!
  total: 5 failed: 1 succeeded: 4 skipped: 0 duration: ${r.n}s ${r.ms}ms`,
  'mvn test': (r, failing = 'paysByCard', actual = 0) => `[INFO] Running com.shop.CheckoutTest
[ERROR] Tests run: 5, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: ${r.s} s <<< FAILURE! -- in com.shop.CheckoutTest
[ERROR] com.shop.CheckoutTest.${failing} -- Time elapsed: 0.0${r.n} s <<< FAILURE!
org.opentest4j.AssertionFailedError: expected: <10> but was: <${actual}>
[INFO] BUILD FAILURE
[INFO] Total time:  ${r.s} s
[INFO] Finished at: ${r.time.slice(0, 19)}${r.offset}`,
  'gradle test': (r, failing = 'paysByCard', actual = 0) => `> Task :test FAILED
CheckoutTest > ${failing}() FAILED
    org.opentest4j.AssertionFailedError: expected: <10> but was: <${actual}>
5 tests completed, 1 failed
> There were failing tests. See the report at: file://${r.tmp}/build/reports/tests/test/index.html
BUILD FAILED in ${r.n}s`,
  pytest: (r, failing = 'test_pays_by_card', actual = 0) => `platform darwin -- Python 3.12.4, pytest-8.3.2, pluggy-1.5.0
tests/test_checkout.py ....F                                             [100%]
____________________________ ${failing} _____________________________
tmp_path = PosixPath('${r.tmp}/pytest-of-dev/pytest-${r.n}/test0')
E       assert ${actual} == 10
FAILED tests/test_checkout.py::${failing} - assert ${actual} == 10
========================= 1 failed, 4 passed in ${r.s}s =========================`,
  vitest: (r, failing = 'pays by card', actual = 0) => ` FAIL  src/checkout.test.ts > checkout > ${failing}
AssertionError: expected ${actual} to be 10 // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Start at  ${r.clock}
   Duration  ${r.ms}ms (transform ${r.n}ms, setup 0ms, collect ${r.ms}ms, tests ${r.n}ms)`,
  jest: (r, failing = 'pays by card', actual = 0) => `FAIL src/checkout.test.js
  ● checkout › ${failing}
    Expected: 10
    Received: ${actual}
Tests:       1 failed, 4 passed, 5 total
Time:        ${r.s} s`,
  'git commit, a pre-commit hook failing': (r, failing = "'total' is assigned a value but never used", actual = 1) => `husky - pre-commit script failed (code 1)
[STARTED] Backed up original state in git stash (${r.sha})
/work/web/src/Cart.tsx
  12:7  error  ${failing}  no-unused-vars
✖ ${actual} problem (${actual} error, 0 warnings)`,
  'docker, through Testcontainers': (r, failing = 'testcontainers/ryuk:0.11.0', actual = 'Could not find a valid Docker environment') => `${r.clock}.120 INFO  tc.${failing} -- Creating container for image: ${failing}
${r.clock}.344 ERROR tc.${failing} -- Could not start container ${r.sha}e0d2a
org.testcontainers.containers.ContainerLaunchException: ${actual}`,
  podman: (r, failing = 'connection refused', actual = 'Podman socket') => `Error: unable to connect to ${actual}: failed to connect: dial tcp 127.0.0.1:${r.port}: connect: ${failing} (pid ${r.pid})`,
}

const CONTEXT = { slug: 'checkout', root: '/work' }
const signature = (text, step = 'gates', code = 'gates-failed') => failureSignature({ step, code, lines: [text] }, CONTEXT)

test('the same failure of each tool gets the same signature, whatever time, duration, process, temporary folder, sha, GUID or port its run prints', () => {
  for (const [tool, print] of Object.entries(TOOLS)) {
    assert.equal(signature(print(RUNS[0])), signature(print(RUNS[1])), tool)
  }
})

test('another failing test, another value, another step or another code is another failure', () => {
  for (const [tool, print] of Object.entries(TOOLS)) {
    const first = signature(print(RUNS[0]))
    assert.notEqual(signature(print(RUNS[0], 'refundsTheCard')), first, `${tool}: another test`)
    assert.notEqual(signature(print(RUNS[0], undefined, 7)), first, `${tool}: another value`)
    assert.notEqual(signature(print(RUNS[0]), 'mutation_gates'), first, `${tool}: another step`)
    assert.notEqual(signature(print(RUNS[0]), 'gates', 'tdd'), first, `${tool}: another code`)
  }
})

test('what the engine says of a refused attempt names the run\'s places, its slug and its attempt the same way on every attempt and every machine', () => {
  const said = (root, attempt, sha) => [
    `missing outputs: ${root}/.copilot-tracking/skraft-plans/checkout/results/deliver-2-g1-${attempt}.json`,
    `commit ${sha} "wip" is not a conventional commit (type(scope): subject); reword it`,
    `gates failed on pass ${attempt}`,
    '',
    'trailing spaces   ',
  ].join('\n')
  const at = (root, slug = 'checkout') => ({ slug, root })
  const of = (text, context) => failureSignature({ step: 'deliver', code: 'tdd', lines: [text] }, context)
  const here = of(said('/work', 1, 'c0ffee1'), at('/work'))

  assert.equal(of(said('/home/ci/shop', 3, 'abc1234'), at('/home/ci/shop')), here)
  assert.equal(of(said('/work', 1, 'c0ffee1').replaceAll('checkout', 'refund'), at('/work', 'refund')), here)
  assert.equal(of(said('/work', 2, 'f00dbab2').replaceAll('\n', '\r\n'), at('/work')), here)
  assert.equal(of(said('C:\\src\\shop', 2, 'f00dbab2'), at('C:\\src\\shop')), of(said('C:\\src\\shop', 3, 'abc1234'), at('C:\\src\\shop')))
  assert.match(here, /^[0-9a-f]{8}$/)
})

test('counts, exit codes, words and line order stay: they tell one failure from another', () => {
  const lines = (...said) => signature(said.join('\n'))
  assert.notEqual(lines('Tests run: 5, Failures: 1'), lines('Tests run: 5, Failures: 2'))
  assert.notEqual(lines('api/test: exited 1'), lines('api/test: exited 2'))
  assert.notEqual(lines('first', 'second'), lines('second', 'first'))
  assert.notEqual(lines('deadbeef is a word'), lines('feedface is a word'))
  assert.notEqual(lines('see /work/project/tmp/report-a.xml'), lines('see /work/project/tmp/report-b.xml'))
  assert.notEqual(lines('1234567 orders'), lines('7654321 orders'))
  assert.notEqual(lines('the 5 mutants left'), lines('the 6 mutants left'))
  assert.equal(lines('first', '', 'second'), lines('first', 'second'))
  assert.equal(lines('first   ', 'second\t'), lines('first', 'second'))
  assert.notEqual(failureSignature({ step: 'gates', code: null, lines: ['ab', 'c'] }, CONTEXT), failureSignature({ step: 'gates', code: null, lines: ['a', 'bc'] }, CONTEXT))
  assert.notEqual(lines('/work/tests/Pay.cs'), lines('/tests/Pay.cs'))
  assert.notEqual(lines('feat(checkout): pay'), lines('feat(): pay'))
  assert.notEqual(failureSignature({ step: 'ab', code: 'c', lines: ['x'] }, CONTEXT), failureSignature({ step: 'a', code: 'bc', lines: ['x'] }, CONTEXT))
})

test('a signature stays the same from one version of the engine to the next: eight hexadecimal digits, leading zeros kept', () => {
  const of = (line) => failureSignature({ step: 'gates', code: null, lines: [line] }, { slug: 'checkout', root: '/work' })
  assert.equal(of('api/test: exited 1'), '59ee657d')
  assert.equal(of('api/test: exited 124'), '0fad464b')
})
