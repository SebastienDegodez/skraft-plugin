import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// The engine runs the mutation gate and keeps its evidence; the software-engineer it
// sends back answers what the gate reported. These checks read what the engineer left:
// the root Stryker configs it scaffolds once, the test or the reasoned suppression a
// survivor takes, and the absence of any mutation run or evidence of its own.
const [mode, variant] = process.argv.slice(2)
const root = process.cwd()
const excluded = ['!**/*Marker.cs', '!**/DependencyInjection.cs', '!**/Program.cs', '!**/obj/**']
const CONFIGS = ['stryker-config-core.json', 'stryker-config-boundary.json']

// Every check below throws on the first thing the run got wrong, and a thrown
// assertion leaves no verdict on stdout — the report then reads `Grader output
// did not match schema`, which says the grader is broken when what happened is
// that the agent never wrote the file being read. Report the reason instead.
const report = (score, evidence) => {
  process.stdout.write(`${JSON.stringify({ score, evidence })}\n`)
  process.exit(0)
}
const reportFailure = (error) => report(0, error?.message ?? String(error))
process.on('uncaughtException', reportFailure)
process.on('unhandledRejection', reportFailure)

const git = (...args) => {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout.trim()
}
const lines = (text) => text.split('\n').filter(Boolean)
const changedSinceBaseline = (...paths) => lines(git('diff', '--name-only', 'eval-baseline', '--', ...paths))
const untracked = (...paths) => lines(git('ls-files', '--others', '--exclude-standard', '--', ...paths))
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const walk = async (directory) => {
  if (!existsSync(directory)) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  }))
  return nested.flat()
}

const configAt = async (name, expected, solution) => {
  const config = (await json(join(root, name)))['stryker-config']
  assert.ok(config, `${name} must contain stryker-config`)
  assert.equal(config.solution, solution)
  assert.deepEqual(config.thresholds, { high: expected, low: expected, break: expected })
  assert.ok(config.reporters.map((entry) => entry.toLowerCase()).includes('json'))
  assert.equal(config['report-file-name'], 'mutation-report')
  for (const pattern of excluded) assert.ok(config.mutate.includes(pattern), `${name} misses ${pattern}`)
  assert.ok(!('ignore-mutations' in config), `${name} ignores mutations`)
  return config
}

// The engine launches the mutation run; the engineer never does, and keeps no evidence of its own.
const noRunAndNoEvidence = async () => {
  const log = join(root, '.eval', 'mutation-invocations.jsonl')
  const runs = existsSync(log) ? lines(await readFile(log, 'utf8')).map((line) => JSON.parse(line)).filter(({ event }) => event === 'run') : []
  assert.equal(runs.length, 0, `the agent launched ${runs.length} mutation run(s)`)
  const evidence = (await walk(join(root, '.copilot-tracking', 'skraft-plans'))).filter((path) => /\/evidence\//.test(path))
  assert.deepEqual(evidence, [], 'the agent wrote gate evidence')
  const gates = [...changedSinceBaseline('.copilot-tracking/skraft-gates'), ...untracked('.copilot-tracking/skraft-gates')]
  assert.deepEqual(gates, [], 'the agent rewrote the engine gate output')
}

const verifyConfig = async (layout) => {
  const solution = layout === 'canonical' ? 'Orders.slnx' : 'Storefront.slnx'
  const core = await configAt(CONFIGS[0], 100, solution)
  const boundary = await configAt(CONFIGS[1], 80, solution)
  if (layout === 'canonical') {
    assert.ok(core.mutate.includes('**/*.Domain/**/*.cs'))
    assert.ok(core.mutate.includes('**/*.Application/**/*.cs'))
    assert.ok(boundary.mutate.includes('**/*.API/**/*.cs'))
    assert.ok(boundary.mutate.includes('**/*.Infrastructure/**/*.cs'))
  } else {
    assert.ok(core.mutate.some((pattern) => /Storefront\/BusinessRules\/.*\*\.cs/.test(pattern)), 'core scope misses BusinessRules')
    assert.ok(boundary.mutate.some((pattern) => /Storefront\/DeliveryAdapters\/.*\*\.cs/.test(pattern)), 'boundary scope misses DeliveryAdapters')
    for (const pattern of [...core.mutate, ...boundary.mutate]) {
      assert.doesNotMatch(pattern, /\.(Domain|Application|API|Infrastructure)\//, `invented project in ${pattern}`)
    }
  }
  const allFiles = await walk(root)
  for (const name of CONFIGS) assert.deepEqual(allFiles.filter((path) => path.endsWith(`/${name}`)), [join(root, name)])
  await noRunAndNoEvidence()
}

const verifySurvivor = async (kind) => {
  assert.deepEqual(changedSinceBaseline(...CONFIGS), [], 'the mutation configs changed')
  if (kind === 'real') {
    assert.deepEqual(changedSinceBaseline('src'), [], 'production code changed for a missing test')
    const tests = [...changedSinceBaseline('tests/Orders.UnitTests'), ...untracked('tests/Orders.UnitTests')]
    assert.ok(tests.length > 0, 'no unit test was added for the surviving mutant')
  } else {
    assert.deepEqual(changedSinceBaseline('tests'), [], 'a test was written for an equivalent mutant')
    assert.deepEqual(untracked('tests'), [], 'a test was written for an equivalent mutant')
    assert.deepEqual(changedSinceBaseline('src').filter((path) => path !== 'src/Orders.Application/QuoteOrder.cs'), [], 'production code outside the survivor changed')
    const source = await readFile(join(root, 'src/Orders.Application/QuoteOrder.cs'), 'utf8')
    const suppressed = /\/\/\s*Stryker\s+disable\s+(once|next-line)\s+[A-Za-z, ]+:\s*\S.{8,}/i.test(source)
    const removed = !/total\s*\*\s*1m/.test(source)
    assert.ok(suppressed || removed, 'the equivalent mutant is neither suppressed with a reason nor removed with its dead code')
    assert.doesNotMatch(source, /Stryker\s+disable\s+all\b(?!.*:)/i, 'a blanket suppression without a reason')
  }
  await noRunAndNoEvidence()
}

// A test that passes from the start is refused as a `test` commit; the change is committed.
const verifyCommits = () => {
  assert.equal(git('status', '--porcelain', '--', 'src', 'tests', ...CONFIGS), '', 'the answer to the gate is not committed')
  const subjects = lines(git('log', '--format=%s', 'eval-baseline..HEAD'))
  assert.ok(subjects.length > 0, 'no commit answers the gate')
  for (const subject of subjects) {
    assert.match(subject, /^[a-z]+\([a-z0-9-]+\)!?: \S/, `not type(scope): subject: ${subject}`)
    assert.doesNotMatch(subject, /^test\(/, `a passing test committed as a failing one: ${subject}`)
  }
}

const sentinel = async (layout) => {
  await access(join(root, '.eval-bin', 'dotnet'), constants.X_OK)
  const solution = layout === 'bff' ? 'Storefront.slnx' : 'Orders.slnx'
  const diff = spawnSync('git', ['diff', '--exit-code', 'eval-baseline', '--', '.eval-bin', '.eval/verify-mutation-gates.mjs', solution], { cwd: root, encoding: 'utf8' })
  assert.equal(diff.status, 0, diff.stdout || diff.stderr)
}

if (process.env.SKRAFT_VERIFY_SENTINEL === '1') {
  await sentinel(mode === 'config' ? variant : 'canonical')
} else if (mode === 'config' && ['canonical', 'bff'].includes(variant)) {
  await verifyConfig(variant)
  assert.deepEqual([...changedSinceBaseline('src', 'tests'), ...untracked('src', 'tests')], [], 'source or tests changed while configuring mutation')
} else if (mode === 'survivor' && ['real', 'equivalent'].includes(variant)) {
  await verifySurvivor(variant)
} else if (mode === 'commits') {
  verifyCommits()
} else {
  throw new Error(`unknown check ${mode} ${variant ?? ''}`)
}

process.stdout.write(`${JSON.stringify({ score: 1, evidence: `${[mode, variant].filter(Boolean).join(" ")} verified` })}\n`)
