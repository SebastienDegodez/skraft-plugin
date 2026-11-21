// qg-collect: every .NET gate, the snapshots, the covered commits, the evidence log and its
// verification in one command — one turn of the engineer instead of ten.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

import { parseCycle, trxMetrics } from '../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/qg-collect.mjs'

const SCRIPTS = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/', import.meta.url))
const COLLECT = join(SCRIPTS, 'qg-collect.mjs')

// test → a TRX with FAKE_COUNTS (total,passed,failed) and, under coverage, one Cobertura report;
// build → exit FAKE_BUILD_EXIT. The architecture filter gets its own counts.
const FAKE_DOTNET = `
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1]
if (args[0] === '--version') process.exit(0)
if (args[0] === 'build') { process.stdout.write('Build succeeded.\\n'); process.exit(Number(process.env.FAKE_BUILD_EXIT ?? 0)) }
if (args[0] === 'test') {
  const results = option('--results-directory')
  const arch = args.includes('FullyQualifiedName~Architecture')
  const [total, passed, failed] = (arch ? process.env.FAKE_ARCH_COUNTS ?? '2,2,0' : process.env.FAKE_COUNTS ?? '15,15,0').split(',')
  const logger = args.find((arg) => arg.startsWith('trx;LogFileName='))
  if (logger) writeFileSync(join(results, logger.split('=')[1]), '<TestRun><ResultSummary outcome="Completed"><Counters total="' + total + '" executed="' + total + '" passed="' + passed + '" failed="' + failed + '" /></ResultSummary></TestRun>')
  if (args.includes('--collect:XPlat Code Coverage')) {
    mkdirSync(join(results, 'run-1'), { recursive: true })
    const lines = '<lines><line number="1" hits="1" branch="False"/></lines>'
    writeFileSync(join(results, 'run-1', 'coverage.cobertura.xml'), '<coverage><packages><package name="Shop.Domain" line-rate="1"><classes><class name="C" filename="src/Shop.Domain/C.cs"><methods><method name="M">' + lines + '</method></methods>' + lines + '</class></classes></package></packages></coverage>')
  }
  process.stdout.write('Passed!\\n')
  process.exit(Number(failed) > 0 ? 1 : 0)
}
process.exit(90)
`

let workspace
let fakeDotnet
before(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'qg-collect-')))
  fakeDotnet = join(workspace, 'fake-dotnet.mjs')
  writeFileSync(fakeDotnet, FAKE_DOTNET)
})
after(() => rmSync(workspace, { recursive: true, force: true }))

const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

// A story: base, one RED commit with two acceptance tests, then one green per scenario.
const story = (name) => {
  const root = join(workspace, name)
  mkdirSync(root)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  git('init', '--quiet', '-b', 'main')
  git('config', 'user.email', 'e@x.invalid')
  git('config', 'user.name', 'E')
  write(root, 'Shop.slnx', '<Solution />\n')
  write(root, 'src/Shop.Domain/Shop.Domain.csproj', '<Project />\n')
  write(root, 'src/Shop.Application/Shop.Application.csproj', '<Project />\n')
  git('add', '.')
  git('commit', '--quiet', '-m', 'chore(shop): base')
  const base = git('rev-parse', 'HEAD')
  const test = 'tests/Shop.UnitTest/CheckoutAcceptanceTests.cs'
  write(root, test, '// S1\n// S2\n')
  git('add', '.')
  git('commit', '--quiet', '-s', '-m', 'test(shop): acceptance tests S1–S2')
  const red = git('rev-parse', 'HEAD')
  const greens = ['S1', 'S2'].map((scenario) => {
    write(root, `src/Shop.Application/${scenario}.cs`, `// ${scenario}\n`)
    git('add', '.')
    git('commit', '--quiet', '-s', '-m', `feat(shop): ${scenario}`)
    return git('rev-parse', 'HEAD')
  })
  return { root, git, base, red, greens, test }
}

// A mutation gate that writes its evidence and exits with the given code, as mutation-testing's does.
const mutationGate = (exit, stdout) => {
  const gate = join(workspace, `mutation-gate-${exit}.mjs`)
  writeFileSync(gate, `import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const ev = process.argv[process.argv.indexOf('--evidence') + 1]
const out = ${JSON.stringify(stdout)}
writeFileSync(join(ev, 'qg-mutation.stdout'), out)
writeFileSync(join(ev, 'qg-mutation.exit'), '${exit}\\n')
writeFileSync(join(ev, 'qg-mutation.stdout.sha256'), createHash('sha256').update(out).digest('hex') + '\\n')
process.exit(${exit})
`)
  return gate
}

const collect = ({ root, base, red, greens, test }, env = {}, extra = ['--mutation-gate', mutationGate(0, 'Mutation score 92%\n')]) =>
  spawnSync(process.execPath, [COLLECT, '--root', root, '--evidence', '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout',
    '--story', 'checkout', '--feature', 'shop', '--base', base,
    '--cycle', `1:${red}:${greens[0]}:${test}`, '--cycle', `2:${red}:${greens[1]}:${test}`, ...extra], {
    cwd: root, encoding: 'utf8', env: { ...process.env, SKRAFT_DOTNET: fakeDotnet, ...env },
  })

describe('qg-collect', () => {
  it('records every gate, commits the evidence alone and passes qg-verify', () => {
    const repo = story('pass')

    const result = collect(repo)

    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /"verdict": "pass"/)
    const log = JSON.parse(readFileSync(join(repo.root, '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout/qg-checkout.json'), 'utf8'))
    assert.equal(log.$schema, 'quality-gates-evidence/v6')
    assert.deepEqual(log.gates.map((gate) => gate.id), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G11'])
    assert.deepEqual(log.gates[0].metrics, { tests_total: 15, tests_passed: 15, tests_failed: 0 })
    assert.equal(log.gates[0].stdout_ref, 'evidence/2026-11-20/checkout/qg-tests.stdout')
    assert.equal(log.commits_covered.length, 3)
    assert.equal(log.test_integrity.cycles[1].green_commit, repo.greens[1])
    assert.equal(repo.git('log', '-1', '--format=%s'), 'chore(shop): record quality evidence for checkout')
    assert.deepEqual(repo.git('show', '--name-only', '--format=', 'HEAD').split('\n').every((file) => file.startsWith('.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout/')), true)
  })

  it('records G6 not_run with the gate\'s reason when no mutation command is declared', () => {
    const repo = story('mutation')
    const gate = mutationGate(3, 'no component declares commands.mutation\n')

    const result = collect(repo, {}, ['--mutation-gate', gate])

    assert.equal(result.status, 0, result.stdout + result.stderr)
    const log = JSON.parse(readFileSync(join(repo.root, '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout/qg-checkout.json'), 'utf8'))
    assert.deepEqual(log.gates[5], { id: 'G6', label: 'Mutation score meets the bar', status: 'not_run', rationale: 'no component declares commands.mutation' })
  })

  it('fails when a test fails, and still writes and commits the log', () => {
    const repo = story('red')

    const result = collect(repo, { FAKE_COUNTS: '15,14,1' })

    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /G1 fail/)
    assert.match(repo.git('log', '-1', '--format=%s'), /record quality evidence/)
  })

  it('marks G5 not applicable when the solution holds no architecture test', () => {
    const repo = story('no-arch')

    collect(repo, { FAKE_ARCH_COUNTS: '0,0,0' }, ['--no-commit', '--mutation-gate', mutationGate(0, 'ok\n')])

    const log = JSON.parse(readFileSync(join(repo.root, '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout/qg-checkout.json'), 'utf8'))
    assert.equal(log.gates[4].status, 'not_applicable')
  })

  it('refuses a malformed cycle or a missing cycle', () => {
    assert.throws(() => parseCycle('1:abc:def'), /is not <k>:<red sha>:<green sha>:<file>/)
    assert.deepEqual(parseCycle('2:abcdef1:1234567:tests\\A.cs'), { cycle: 2, red: 'abcdef1', green: '1234567', file: 'tests/A.cs' })
    const result = spawnSync(process.execPath, [COLLECT, '--root', '.', '--evidence', 'ev', '--story', 's', '--feature', 'f', '--base', 'HEAD'], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /one --cycle per delivered scenario is required/)
  })

  it('reads TRX counters', () => {
    assert.deepEqual(trxMetrics('<Counters total="3" executed="3" passed="2" failed="1" />'), { tests_total: 3, tests_passed: 2, tests_failed: 1 })
    assert.equal(trxMetrics('no counters'), undefined)
  })
})
