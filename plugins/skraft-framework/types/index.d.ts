// The values the skraft mod keeps in `$.state`: the snapshot the `skraft-pipeline` pane
// draws, the engine's Observe view (engine/application/pipeline/observe-usecase.mjs) and the run's log.

export type SkraftPhaseView = { phase: string; state: 'pending' | 'open' | 'closed' }

export type SkraftRunView = {
  slug: string | null
  status: 'idle' | 'not-initialised' | 'running' | 'waiting' | 'done' | 'blocked' | 'tampered'
  reason: string
  phases: SkraftPhaseView[]
  current: { step: string; phase: string; agent: string | null; gates: string[] | null; question: string | null; visit: number; attempt: number } | null
  question: { key: string; kind: string; text: string; options: string[]; refusals: string[] } | null
  attempts: number
  costUsd: number | null
}

export type SkraftPipelineSnapshot = { view: SkraftRunView; log: string[] }

declare module 'claude-code' {
  interface PluginState {
    skraft: { pipeline: SkraftPipelineSnapshot | null }
  }
}
