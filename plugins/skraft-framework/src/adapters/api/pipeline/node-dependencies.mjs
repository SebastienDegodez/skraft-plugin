import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createJsonStateReader } from '../../infrastructure/json-state-reader.mjs'
import { createJsonStateWriter } from '../../infrastructure/state/json-state-writer.mjs'
import { resolveTrackingRoot } from '../../infrastructure/tracking-root-resolver.mjs'
import { createSystemTime } from '../../infrastructure/system-time.mjs'
import { createNodeProcessRunner } from '../../infrastructure/process/node-process-runner.mjs'
import { createFsTrackingStore } from '../../infrastructure/pipeline/fs-tracking-store.mjs'
import { createFsRepositoryReader } from '../../infrastructure/pipeline/fs-repository-reader.mjs'
import { createGitSourceControl } from '../../infrastructure/pipeline/git-source-control.mjs'
import { createCliQualityGateVerifier } from '../../infrastructure/pipeline/cli-quality-gate-verifier.mjs'
import { createCliStructuralScanner } from '../../infrastructure/pipeline/cli-structural-scanner.mjs'
import { createTrackingDecisionStore } from '../../infrastructure/pipeline/tracking-decision-store.mjs'

// Composition of the driven adapters every Node host shares (the Copilot workflow, the
// decide command): state, tracking directory, repository, git, quality gates, structural
// scan, decisions, clock. A host adds what is its own: agentRunner, humanInteraction,
// progress. Wiring only — no decision is taken here.
export const loadPipelineConfig = (pluginRoot) =>
  JSON.parse(readFileSync(join(pluginRoot, 'skraft-framework.config.json'), 'utf8'))

export const createNodePipelineDependencies = ({ cwd, env = process.env, pluginRoot, signal }) => {
  const trackingRoot = resolveTrackingRoot({ env, cwd })
  const time = createSystemTime()
  const runProcess = createNodeProcessRunner({ cwd, signal })
  const trackingStore = createFsTrackingStore({ trackingRoot, cwd })
  return Object.freeze({
    config: loadPipelineConfig(pluginRoot),
    stateReader: createJsonStateReader(trackingRoot),
    stateWriter: createJsonStateWriter(trackingRoot),
    trackingStore,
    repositoryReader: createFsRepositoryReader({ cwd }),
    sourceControl: createGitSourceControl({ cwd }),
    qualityGateVerifier: createCliQualityGateVerifier({ runProcess, pluginRoot, trackingStore }),
    structuralScanner: createCliStructuralScanner({ runProcess, pluginRoot, trackingStore }),
    decisionStore: createTrackingDecisionStore({ trackingStore, time }),
    time,
  })
}
