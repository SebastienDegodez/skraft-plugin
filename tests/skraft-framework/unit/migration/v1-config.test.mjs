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
    reason: 'skraft-config.json: dropped trackingLayout, depthTier and depthTierRationale; 1 component added: api (dotnet, api)',
  })
  assert.deepEqual([outcome.ok, outcome.code], [true, null])
})
