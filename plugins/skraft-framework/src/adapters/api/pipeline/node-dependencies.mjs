import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createJsonStateReader } from '../../infrastructure/json-state-reader.mjs'
import { createJsonStateWriter } from '../../infrastructure/state/json-state-writer.mjs'
import { resolveTrackingRoot } from '../../infrastructure/tracking-root-resolver.mjs'
import { createSystemTime } from '../../infrastructure/system-time.mjs'
import { createFsTrackingStore } from '../../infrastructure/pipeline/fs-tracking-store.mjs'
import { createFsRepositoryReader } from '../../infrastructure/pipeline/fs-repository-reader.mjs'
import { createNodeSourceControl } from '../../infrastructure/git/node-source-control.mjs'
import { createNodeSourceTree } from '../../infrastructure/source-tree/node-source-tree.mjs'
import { createWebCryptoHasher } from '../../infrastructure/web-crypto-hasher.mjs'
import { createTrackingDecisionStore } from '../../infrastructure/pipeline/tracking-decision-store.mjs'
import { createFsActivePipeline } from '../../infrastructure/pipeline/fs-active-pipeline.mjs'

// Composition of the driven adapters every Node host shares (the Copilot workflow, the
// decide command): state, tracking directory, repository, git, source tree, hasher,
// decisions, clock. A host adds what is its own: agentRunner, humanInteraction,
// progress. Wiring only — no decision is taken here.
export const loadPipelineConfig = (pluginRoot) =>
  JSON.parse(readFileSync(join(pluginRoot, 'skraft-framework.config.json'), 'utf8'))

export const createNodePipelineDependencies = ({ cwd, env = process.env, pluginRoot }) => {
  const trackingRoot = resolveTrackingRoot({ env, cwd })
  const time = createSystemTime()
  const trackingStore = createFsTrackingStore({ trackingRoot, cwd })
  return Object.freeze({
    config: loadPipelineConfig(pluginRoot),
    stateReader: createJsonStateReader(trackingRoot),
    stateWriter: createJsonStateWriter(trackingRoot),
    trackingStore,
    repositoryReader: createFsRepositoryReader({ cwd }),
    sourceControl: createNodeSourceControl({ cwd }),
    sourceTree: createNodeSourceTree({ cwd }),
    hasher: createWebCryptoHasher(),
    activePipeline: createFsActivePipeline({ trackingRoot }),
    decisionStore: createTrackingDecisionStore({ trackingStore, time }),
    time,
  })
}
