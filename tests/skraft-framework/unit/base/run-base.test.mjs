import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { FakeHasher, FixedClock, InMemorySourceControl, InMemoryTracking, InMemoryWorkspace } from '../support/in-memory-host.mjs'

const CONFIG = (extra = {}) => JSON.stringify({
  components: [
    { name: 'api', root: '.', stack: 'dotnet', commands: { test: 'dotnet test' } },
    { name: 'web', root: '../payment-web', stack: 'react', commands: { test: 'npm test' }, ...extra },
  ],
})

/** The API in the working copy's repository, the front in a neighbour repository. */
const twoRepositories = () => new InMemorySourceControl({
  '.': { top: '.', mergeBases: { main: 'a1', develop: 'a2', 'release/2.0': 'a3' } },
  '../payment-web': { top: '../payment-web', mergeBases: { 'origin/main': 'w1', develop: 'w2', 'release/2.0': 'w3' } },
})

const start = async ({ config = CONFIG(), sourceControl = twoRepositories(), base } = {}) => {
  const tracking = new InMemoryTracking()
  const deps = {
    journal: tracking, activePipeline: tracking, files: tracking,
    workspace: new InMemoryWorkspace(config === null ? {} : { 'skraft-config.json': config }),
    sourceControl, clock: new FixedClock('2026-10-15T08:00:00.000Z'), hasher: new FakeHasher(),
  }
  const outcome = await createInit(deps).init({ slug: 'checkout', story: null, ...(base === undefined ? {} : { base }) })
  return { outcome, tracking, started: tracking.journal('checkout')[0] }
}

test('without any setting, every repository is compared with its merge base with main, journaled at the start', async () => {
  const { outcome, started } = await start()

  assert.equal(outcome.ok, true, outcome.reason)
  assert.deepEqual(started.base, [
    { component: null, root: '.', repository: '.', ref: 'main', source: 'default', sha: 'a1' },
    { component: 'api', root: '.', repository: '.', ref: 'main', source: 'default', sha: 'a1' },
    { component: 'web', root: '../payment-web', repository: '../payment-web', ref: 'origin/main', source: 'default', sha: 'w1' },
  ])
})

test('a component in a neighbour repository takes its base in that repository', async () => {
  const sourceControl = twoRepositories()
  sourceControl.folders['../payment-web/app'] = { top: '../payment-web', mergeBases: { main: 'w9' } }
  const config = JSON.stringify({ components: [{ name: 'web', root: '../payment-web/app', stack: 'react' }] })

  const { started } = await start({ config, sourceControl })

  assert.deepEqual(started.base.at(-1), { component: 'web', root: '../payment-web/app', repository: '../payment-web', ref: 'main', source: 'default', sha: 'w9' })
})

test('baseBranch on a component is that component\'s base; the global one applies to the others', async () => {
  const config = JSON.stringify({ ...JSON.parse(CONFIG({ baseBranch: 'develop' })), baseBranch: 'release/2.0' })

  const { started } = await start({ config })

  assert.deepEqual(started.base.map(({ component, ref, source, sha }) => [component, ref, source, sha]), [
    [null, 'release/2.0', 'config', 'a3'],
    ['api', 'release/2.0', 'config', 'a3'],
    ['web', 'develop', 'component', 'w2'],
  ])
})

test('--base at launch wins over every baseBranch', async () => {
  const { started } = await start({ config: CONFIG({ baseBranch: 'develop' }), base: 'release/2.0' })

  assert.deepEqual(started.base.map(({ component, ref, source, sha }) => [component, ref, source, sha]), [
    [null, 'release/2.0', 'flag', 'a3'],
    ['api', 'release/2.0', 'flag', 'a3'],
    ['web', 'release/2.0', 'flag', 'w3'],
  ])
})

test('a base Git cannot find refuses the start, names the repository, and journals nothing', async () => {
  const { outcome, tracking } = await start({ base: 'feature/gone' })

  assert.deepEqual(outcome, {
    ok: false, slug: 'checkout', created: false, code: 'base-unresolved',
    reason: 'the working copy (.) has no merge base with feature/gone; component api (.) has no merge base with feature/gone; component web (../payment-web) has no merge base with feature/gone; set baseBranch in skraft-config.json or pass --base <ref>',
  })
  assert.deepEqual(tracking.journal('checkout'), [])
  assert.equal(tracking.activeSlug, null)
})

test('a --base that is not a single git ref is refused before anything is read', async () => {
  const { outcome } = await start({ base: '--upload-pack=evil' })

  assert.deepEqual([outcome.ok, outcome.code, outcome.reason], [false, 'invalid-base', '--base must be a git ref, got "--upload-pack=evil"'])
})

test('a working copy outside Git, without skraft-config.json, starts with no base', async () => {
  const { outcome, started } = await start({ config: null, sourceControl: new InMemorySourceControl() })

  assert.equal(outcome.ok, true)
  assert.deepEqual(started.base, [])
})

test('an invalid skraft-config.json refuses the start with its errors', async () => {
  const { outcome } = await start({ config: '{"components":{}}' })

  assert.deepEqual([outcome.code, outcome.reason], ['config-invalid', 'skraft-config.json is invalid: components must be an array'])
})

test('the base is taken once: resuming an existing run with another --base keeps the journaled one', async () => {
  const tracking = new InMemoryTracking()
  const deps = {
    journal: tracking, activePipeline: tracking, files: tracking, workspace: new InMemoryWorkspace({ 'skraft-config.json': CONFIG() }),
    sourceControl: twoRepositories(), clock: new FixedClock('2026-10-15T08:00:00.000Z'), hasher: new FakeHasher(),
  }
  await createInit(deps).init({ slug: 'checkout' })
  const again = await createInit(deps).init({ slug: 'checkout', base: 'develop' })

  assert.deepEqual([again.ok, again.created], [true, false])
  assert.deepEqual(tracking.journal('checkout').map((event) => event.type), ['run.started'])
  assert.equal(tracking.journal('checkout')[0].base[0].ref, 'main')
})

test('components with a host that cannot run Git refuse the start; without components the run starts with no base', async () => {
  const sourceControl = new InMemorySourceControl({}, { unavailable: 'command not found: git' })

  const refused = await start({ sourceControl })
  assert.deepEqual([refused.outcome.code, refused.outcome.reason], ['source-control-unavailable', 'command not found: git; the components of skraft-config.json need Git for their base'])

  const plain = await start({ config: null, sourceControl })
  assert.deepEqual([plain.outcome.ok, plain.started.base], [true, []])
})
