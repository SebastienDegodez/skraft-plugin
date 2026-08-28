import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const [layout, outcome] = process.argv.slice(2)
const root = process.cwd()
const excluded = ['!**/*Marker.cs', '!**/DependencyInjection.cs', '!**/Program.cs', '!**/obj/**']

const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  }))
  return nested.flat()
}
const scoreOf = (report) => {
  const mutants = Object.values(report.files ?? {}).flatMap((file) => file.mutants ?? [])
  assert.ok(mutants.length > 0, 'mutation report must contain mutants')
  const killed = mutants.filter(({ status }) => status === 'Killed').length
  return killed * 100 / mutants.length
}
const configAt = async (name, expected, solution) => {
  const path = join(root, name)
  const config = (await json(path))['stryker-config']
  assert.ok(config, `${name} must contain stryker-config`)
  assert.equal(config.solution, solution)
  assert.deepEqual(config.thresholds, { high: expected, low: expected, break: expected })
  assert.ok(config.reporters.map((entry) => entry.toLowerCase()).includes('json'))
  assert.ok(config.reporters.map((entry) => entry.toLowerCase()).includes('cleartext'))
  assert.equal(config['report-file-name'], 'mutation-report')
  assert.equal(config['break-on-initial-test-failure'], true)
  for (const pattern of excluded) assert.ok(config.mutate.includes(pattern), `${name} misses ${pattern}`)
  return config
}
const evidenceFile = async (name) => {
  const paths = (await walk(join(root, '.copilot-tracking', 'skraft-plans')))
    .filter((path) => new RegExp(`/evidence/\\d{4}-\\d{2}-\\d{2}/${name.replaceAll('.', '\\.')}$$`).test(path))
  assert.equal(paths.length, 1, `expected one dated evidence/${name}, found ${paths.length}`)
  return paths[0]
}
const verifyManifest = async (name, expected, score, passed) => {
  const manifest = await json(await evidenceFile(name))
  assert.equal(manifest.expected, expected)
  assert.equal(manifest.passed, passed)
  assert.equal(manifest.exit === 0, passed)
  const reportPath = isAbsolute(manifest.report) ? manifest.report : resolve(root, manifest.report)
  const report = await json(reportPath)
  assert.equal(scoreOf(report), score)
}

if (!['canonical', 'bff'].includes(layout)) throw new Error(`unknown layout ${layout}`)
if (!['pass', 'core-failure', 'boundary-failure'].includes(outcome)) throw new Error(`unknown outcome ${outcome}`)

const solution = layout === 'canonical' ? 'Orders.slnx' : 'Storefront.slnx'
const core = await configAt('stryker-config-core.json', 100, solution)
const boundary = await configAt('stryker-config-boundary.json', 80, solution)

if (layout === 'canonical') {
  assert.ok(core.mutate.includes('**/*.Domain/**/*.cs'))
  assert.ok(core.mutate.includes('**/*.Application/**/*.cs'))
  assert.ok(boundary.mutate.includes('**/*.API/**/*.cs'))
  assert.ok(boundary.mutate.includes('**/*.Infrastructure/**/*.cs'))
} else {
  assert.ok(core.mutate.some((pattern) => /Storefront\/BusinessRules\/.*\*\.cs/.test(pattern)))
  assert.ok(boundary.mutate.some((pattern) => /Storefront\/DeliveryAdapters\/.*\*\.cs/.test(pattern)))
}

const allFiles = await walk(root)
for (const name of ['stryker-config-core.json', 'stryker-config-boundary.json']) {
  assert.deepEqual(allFiles.filter((path) => path.endsWith(`/${name}`)), [join(root, name)])
}

const invocations = (await readFile(join(root, '.eval', 'mutation-invocations.jsonl'), 'utf8'))
  .trim().split('\n').map((line) => JSON.parse(line))
assert.ok(invocations.some(({ event, scope }) => event === 'init' && scope === 'core'))
assert.ok(invocations.some(({ event, scope }) => event === 'init' && scope === 'boundary'))
const coreRun = invocations.findIndex(({ event, scope }) => event === 'run' && scope === 'core')
const boundaryRun = invocations.findIndex(({ event, scope }) => event === 'run' && scope === 'boundary')
assert.ok(coreRun >= 0, 'core mutation gate was not run')

if (outcome === 'pass') {
  assert.ok(boundaryRun > coreRun, 'boundary gate must run after core')
  await verifyManifest('qg-mutation.json', 100, 100, true)
  await verifyManifest('qg-mutation-boundary.json', 80, 80, true)
} else if (outcome === 'core-failure') {
  assert.equal(boundaryRun, -1, 'boundary gate must not run after core failure')
  await verifyManifest('qg-mutation.json', 100, 99, false)
  const boundaryEvidence = allFiles.filter((path) => /\/evidence\/\d{4}-\d{2}-\d{2}\/qg-mutation-boundary\.json$/.test(path))
  assert.equal(boundaryEvidence.length, 0)
} else {
  assert.ok(boundaryRun > coreRun, 'boundary gate must run after passing core')
  await verifyManifest('qg-mutation.json', 100, 100, true)
  await verifyManifest('qg-mutation-boundary.json', 80, 79, false)
}

if (process.env.SKRAFT_VERIFY_SENTINEL === '1') {
  await access(join(root, '.eval-bin', 'dotnet'), constants.X_OK)
  const protectedPaths = ['.eval-bin', '.eval', 'scripts', 'src', 'tests', solution]
  const diff = spawnSync('git', ['diff', '--exit-code', 'eval-baseline', '--', ...protectedPaths], { cwd: root, encoding: 'utf8' })
  assert.equal(diff.status, 0, diff.stdout || diff.stderr)
}

process.stdout.write(`${JSON.stringify({ score: 1, evidence: `${layout} ${outcome} mutation gates verified` })}\n`)