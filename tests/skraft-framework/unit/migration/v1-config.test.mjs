import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMigrate } from '../../../../plugins/skraft-framework/engine/application/migration/migrate-usecase.mjs'
import { InMemorySourceControl, InMemoryWorkspace, inMemoryDeps } from '../support/in-memory-host.mjs'

/** The working copy holds a .NET API and a v1 configuration. */
const host = (config, files = { 'api/Payment.sln': '', 'api/Payment.csproj': '' }) => {
  const workspace = new InMemoryWorkspace({ ...files, ...(config === undefined ? {} : { 'skraft-config.json': JSON.stringify(config) }) })
  const sourceControl = new InMemorySourceControl({ '.': { top: '.', mergeBases: { main: 'b2' } }, api: { top: '.', mergeBases: { main: 'b2' } } })
  const deps = inMemoryDeps({ workspace, sourceControl })
  return { deps, workspace, tracking: deps.journal }
}

const V1_CONFIG = Object.freeze({ trackingLayout: 'namespaced', depthTier: 'deep', depthTierRationale: 'payments', baseBranch: 'develop' })

test('a v1 configuration loses its v1 keys, keeps the keys V2 reads, and lists the components found', async () => {
  const { deps, workspace } = host(V1_CONFIG)

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  const { components, ...kept } = workspace.config()
  assert.deepEqual(kept, { baseBranch: 'develop' })
  assert.deepEqual(components?.map(({ name, root, stack }) => [name, root, stack]), [['api', 'api', 'dotnet']])
  assert.deepEqual(outcome.config, {
    status: 'migrated', dropped: ['trackingLayout', 'depthTier', 'depthTierRationale'], unmapped: [],
    reason: 'skraft-config.json: dropped trackingLayout, depthTier and depthTierRationale; skraft-config.json: api (dotnet, api)',
  })
  assert.deepEqual([outcome.ok, outcome.code], [true, null])
})

test('every key V2 reads stays as written, and a project at the root is named after the working copy', async () => {
  const v2 = { baseBranch: 'develop', tdd: { replay: 'last-red' }, publish: { pullRequest: false }, models: {}, assign: {} }
  const { deps, workspace } = host({ trackingLayout: 'namespaced', ...v2 }, { 'Payment.sln': '', 'Payment.csproj': '' })

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  const { components, ...kept } = workspace.config()
  assert.deepEqual([outcome.config.status, outcome.config.unmapped], ['migrated', []])
  assert.deepEqual(kept, v2)
  assert.deepEqual(components.map(({ name, root }) => [name, root]), [['payments', '.']])
})

test('a configuration that holds no JSON object is no v1 one', async () => {
  for (const config of [null, ['trackingLayout'], 'trackingLayout']) {
    const outcome = await createMigrate(host(config).deps).migrate({ dryRun: true, workingCopyName: 'payments' })
    assert.deepEqual(outcome.config, { status: 'unchanged', dropped: [], unmapped: [], reason: 'skraft-config.json holds no v1 key; left as it is' })
  }
})

test('the configuration loses its v1 keys in one replacement of the file, never by a write a crash could cut short', async () => {
  const { deps, workspace } = host(V1_CONFIG)

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  assert.equal(outcome.config.status, 'migrated', outcome.config.reason)
  assert.deepEqual(workspace.replaced, [['skraft-config.json', '{\n  "baseBranch": "develop"\n}\n']])
})

test('components that cannot be listed after the v1 keys are dropped leave the migration not ok, with why', async () => {
  const { deps, workspace } = host({ trackingLayout: 'namespaced', baseBranch: '--force' })

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  assert.deepEqual(workspace.config(), { baseBranch: '--force' })
  assert.deepEqual(outcome.config, {
    status: 'components-refused', dropped: ['trackingLayout'], unmapped: [],
    reason: 'skraft-config.json: dropped trackingLayout; no component listed: skraft-config.json is invalid: baseBranch must be a git ref, got "--force"',
  })
  assert.deepEqual([outcome.ok, outcome.code], [false, 'config-components-refused'])
})

test('a key that maps to no V2 key is reported and the configuration is left as it is', async () => {
  const { deps, workspace } = host({ trackingLayout: 'namespaced', teamOwner: 'payments', phaseOrder: ['RESEARCH'], baseBranch: 'develop' })
  const before = workspace.files.get('skraft-config.json')

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  assert.equal(workspace.files.get('skraft-config.json'), before)
  assert.deepEqual(outcome.config, {
    status: 'unmapped', dropped: ['trackingLayout'], unmapped: ['teamOwner', 'phaseOrder'],
    reason: 'skraft-config.json: teamOwner and phaseOrder map to no key of V2; it is left as it is: move or remove them, then migrate again',
  })
  assert.deepEqual([outcome.ok, outcome.code], [false, 'config-unmapped'])
})

test('a dry run shows the configuration it would write and writes nothing', async () => {
  const { deps, workspace } = host({ trackingLayout: 'namespaced', components: [{ name: 'api', root: 'api', stack: 'dotnet' }] })
  const before = new Map(workspace.files)

  const outcome = await createMigrate(deps).migrate({ dryRun: true, workingCopyName: 'payments' })

  assert.deepEqual(workspace.files, before)
  assert.deepEqual(outcome.config, {
    status: 'would-migrate', dropped: ['trackingLayout'], unmapped: [],
    reason: 'skraft-config.json: dropped trackingLayout; skraft init would then list the components it finds; their bases are not shown',
    text: '{\n  "components": [\n    {\n      "name": "api",\n      "root": "api",\n      "stack": "dotnet"\n    }\n  ]\n}\n',
  })
})

test('a configuration with no v1 key, or none at all, is left as it is, so migrating again changes nothing', async () => {
  const { deps, workspace } = host(V1_CONFIG)
  await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })
  const migrated = workspace.files.get('skraft-config.json')

  const again = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })
  const none = await createMigrate(host(undefined).deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  assert.equal(workspace.files.get('skraft-config.json'), migrated)
  assert.deepEqual(again.config, { status: 'unchanged', dropped: [], unmapped: [], reason: 'skraft-config.json holds no v1 key; left as it is' })
  assert.deepEqual(none.config, { status: 'absent', dropped: [], unmapped: [], reason: 'skraft-config.json is absent; nothing to migrate' })
  assert.equal(none.ok, true)
})

test('a run migrated with its configuration takes the base of every component found', async () => {
  const { deps, tracking } = host(V1_CONFIG)
  deps.sourceControl.folders['.'].mergeBases = { develop: 'd1' }
  deps.sourceControl.folders.api.mergeBases = { develop: 'd1' }
  await tracking.write('checkout-flow', 'state.json', JSON.stringify({ currentPhase: 'DESIGN', phasesCompleted: ['RESEARCH'] }))

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  assert.equal(outcome.ok, true, outcome.reason)
  assert.deepEqual(tracking.journal('checkout-flow')[0].base, [
    { component: null, root: '.', repository: '.', ref: 'develop', source: 'config', sha: 'd1' },
    { component: 'api', root: 'api', repository: '.', ref: 'develop', source: 'config', sha: 'd1' },
  ])
})

test('observability, a v1 key, is dropped like the others, never reported as unmapped', async () => {
  const { deps, workspace } = host({ observability: { traces: true }, trackingLayout: 'namespaced' })

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  assert.deepEqual([outcome.config.status, outcome.config.dropped, outcome.config.unmapped], ['migrated', ['trackingLayout', 'observability'], []])
  assert.equal(Object.hasOwn(workspace.config(), 'observability'), false)
})

test('a configuration that holds only observability is a v1 one', async () => {
  const { deps, workspace } = host({ observability: { traces: true } })

  const outcome = await createMigrate(deps).migrate({ dryRun: false, workingCopyName: 'payments' })

  assert.deepEqual([outcome.config.status, outcome.config.dropped], ['migrated', ['observability']])
  assert.deepEqual(Object.keys(workspace.config()), ['components'])
})
