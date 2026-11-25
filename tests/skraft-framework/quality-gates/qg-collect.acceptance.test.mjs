// qg-collect: every .NET gate, the evidence log of verdicts and its verification in one
// command — one turn of the engineer instead of ten. Nothing is committed, and the log (plus
// any screenshot) is the only file left in the evidence directory.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

import { trxMetrics } from '../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/qg-collect.mjs'

const SCRIPTS = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/', import.meta.url))
const COLLECT = join(SCRIPTS, 'qg-collect.mjs')

// test → a TRX with FAKE_COUNTS (total,passed,failed); build → exit FAKE_BUILD_EXIT.
const FAKE_DOTNET = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1]
if (args[0] === '--version') process.exit(0)
if (args[0] === 'build') { process.stdout.write('Build succeeded.\\n'); process.exit(Number(process.env.FAKE_BUILD_EXIT ?? 0)) }
if (args[0] === 'test') {
  const results = option('--results-directory')
  const [total, passed, failed] = (process.env.FAKE_COUNTS ?? '15,15,0').split(',')
  const logger = args.find((arg) => arg.startsWith('trx;LogFileName='))
  if (logger) writeFileSync(join(results, logger.split('=')[1]), '<TestRun><ResultSummary outcome="Completed"><Counters total="' + total + '" executed="' + total + '" passed="' + passed + '" failed="' + failed + '" /></ResultSummary></TestRun>')
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

// A story: base, DISTILL's RED commit with two acceptance tests, then (DELIVER) one green per scenario.
const story = (name, { ignore = true } = {}) => {
  const root = join(workspace, name)
  mkdirSync(root)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  git('init', '--quiet', '-b', 'main')
  git('config', 'user.email', 'e@x.invalid')
  git('config', 'user.name', 'E')
  write(root, 'Shop.slnx', '<Solution />\n')
  if (ignore) write(root, '.gitignore', '.copilot-tracking/skraft-plans/*/evidence/\n')
  write(root, 'src/Shop.Domain/Shop.Domain.csproj', '<Project />\n')
  write(root, 'src/Shop.Application/Shop.Application.csproj', '<Project />\n')
  git('add', '.')
  git('commit', '--quiet', '-m', 'chore(shop): base')
  const distill = git('rev-parse', 'HEAD')
  const test = 'tests/Shop.UnitTest/CheckoutAcceptanceTests.cs'
  write(root, test, '// S1\n// S2\n')
  git('add', '.')
  git('commit', '--quiet', '-s', '-m', 'test(shop): acceptance tests S1–S2')
  const base = git('rev-parse', 'HEAD')
  const greens = ['S1', 'S2'].map((scenario) => {
    write(root, `src/Shop.Application/${scenario}.cs`, `// ${scenario}\n`)
    git('add', '.')
    git('commit', '--quiet', '-s', '-m', `feat(shop): ${scenario}`)
    return git('rev-parse', 'HEAD')
  })
  return { root, git, distill, base, greens, test }
}

const LOG = '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout/qg-checkout.json'
const collect = ({ root, distill, base }, env = {}, extra = []) =>
  spawnSync(process.execPath, [COLLECT, '--root', root, '--log', LOG, '--base', base, '--red-base', distill, ...extra], {
    cwd: root, encoding: 'utf8', env: { ...process.env, SKRAFT_DOTNET: fakeDotnet, ...env },
  })

describe('qg-collect', () => {
  it('records every v7 gate, commits nothing and passes qg-verify', () => {
    const repo = story('pass')
    const head = repo.git('rev-parse', 'HEAD')

    const result = collect(repo)

    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /"verdict": "pass"/)
    const evidence = join(repo.root, '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout')
    const log = JSON.parse(readFileSync(join(evidence, 'qg-checkout.json'), 'utf8'))
    assert.equal(log.$schema, 'quality-gates-evidence/v7')
    assert.deepEqual(log.gates.map((gate) => gate.id), ['test.acceptance', 'test.unit', 'build.compile', 'build.lint', 'test.no-mocks-core'])
    assert.deepEqual(log.gates[0].metrics, { tests_total: 15, tests_passed: 15, tests_failed: 0 })
    assert.deepEqual([log.gates[0].status, log.gates[0].summary], ['pass', 'Passed!'])
    assert.equal(log.gates[4].summary, 'no mocking symbol in the core')
    assert.equal(log.repo_root_rev, head)
    assert.equal(log.commits_covered, undefined)
    assert.equal(log.test_integrity, undefined)
    assert.equal(repo.git('rev-parse', 'HEAD'), head)
    assert.equal(repo.git('status', '--porcelain'), '')
    assert.deepEqual(readdirSync(evidence), ['qg-checkout.json'])
  })

  it('refuses an evidence directory Git does not ignore', () => {
    const repo = story('tracked', { ignore: false })

    const result = collect(repo)

    assert.equal(result.status, 2, result.stdout + result.stderr)
    assert.match(result.stderr, /is not ignored by Git: add \.copilot-tracking\/skraft-plans\/\*\/evidence\/ to \.gitignore/)
  })

  it('copies and hashes each screenshot into the evidence directory', () => {
    const repo = story('screens')
    write(repo.root, '.copilot-tracking/shots/basket.png', 'PNG bytes')

    const result = collect(repo, {}, ['--screenshot', '.copilot-tracking/shots/basket.png'])

    const evidence = join(repo.root, '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout')
    const log = JSON.parse(readFileSync(join(evidence, 'qg-checkout.json'), 'utf8'))
    assert.deepEqual(log.gates.at(-1), {
      id: 'evidence.screenshots', label: 'Frontend screenshots captured', status: 'pass',
      screenshots: [{ ref: 'evidence/2026-11-20/checkout/screenshots/basket.png', sha256: createHash('sha256').update('PNG bytes').digest('hex') }],
    })
    assert.equal(readFileSync(join(evidence, 'screenshots/basket.png'), 'utf8'), 'PNG bytes')
    assert.equal(result.status, 0, result.stdout + result.stderr)
  })

  it('runs neither architecture, coverage nor mutation', () => {
    const repo = story('retired')

    const result = collect(repo)

    assert.equal(result.status, 0, result.stdout + result.stderr)
    const evidence = join(repo.root, '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout')
    const log = JSON.parse(readFileSync(join(evidence, 'qg-checkout.json'), 'utf8'))
    for (const id of ['arch.boundaries', 'ci.coverage', 'ci.mutation']) assert.equal(log.gates.some((gate) => gate.id === id), false, id)
  })

  it('refuses --mutation-gate: the pipeline never runs mutation', () => {
    const repo = story('no-gate')

    const result = collect(repo, {}, ['--mutation-gate', 'gate.mjs'])

    assert.equal(result.status, 2, result.stdout + result.stderr)
  })

  it('fails when a test fails, and still writes the log', () => {
    const repo = story('red')

    const result = collect(repo, { FAKE_COUNTS: '15,14,1' })

    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /test\.acceptance fail/)
    assert.equal(existsSync(join(repo.root, '.copilot-tracking/skraft-plans/shop/evidence/2026-11-20/checkout/qg-checkout.json')), true)
  })

  it('needs a log path named after the story, and takes no cycle any more', () => {
    const repo = story('usage')
    const bad = spawnSync(process.execPath, [COLLECT, '--root', repo.root, '--log', '.copilot-tracking/skraft-plans/shop/evidence/x/log.json'], { encoding: 'utf8' })
    assert.equal(bad.status, 2)
    assert.match(bad.stderr, /is not <evidence dir>\/qg-<story>\.json/)
    const cycle = collect(repo, {}, ['--cycle', '1:abc:def:t.cs'])
    assert.equal(cycle.status, 2, cycle.stdout + cycle.stderr)
  })

  it('fails a GREEN that rewrites a line of the RED acceptance test', () => {
    const repo = story('tampered')
    write(repo.root, repo.test, '// S1 changed\n// S2\n')
    repo.git('commit', '--quiet', '-s', '-am', 'feat(shop): S2 again')

    const result = collect(repo)

    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /TEST_TAMPERED/)
  })

  it('reads TRX counters', () => {
    assert.deepEqual(trxMetrics('<Counters total="3" executed="3" passed="2" failed="1" />'), { tests_total: 3, tests_passed: 2, tests_failed: 1 })
    assert.equal(trxMetrics('no counters'), undefined)
  })
})
