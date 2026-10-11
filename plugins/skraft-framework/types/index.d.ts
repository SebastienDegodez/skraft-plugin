// The values the skraft mod keeps in `$.state`: the snapshot the `skraft-pipeline` pane
// draws, the engine's Observe view (engine/application/observe.mjs) and the run's log.

export type SkraftPhaseView = { phase: string; state: 'pending' | 'open' | 'closed' }

export type SkraftRunView = {
  slug: string | null
  status: 'idle' | 'not-initialised' | 'running' | 'done' | 'blocked' | 'tampered'
  reason: string
  phases: SkraftPhaseView[]
  current: { step: string; phase: string; agent: string; attempt: number } | null
  attempts: number
  costUsd: number | null
}

export type SkraftPipelineSnapshot = { view: SkraftRunView; log: string[] }

declare module 'claude-code' {
  interface PluginState {
    skraft: { pipeline: SkraftPipelineSnapshot | null }
  }
}
