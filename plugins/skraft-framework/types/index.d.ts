// The values the skraft mod keeps in `$.state`: the snapshot the `skraft-pipeline` pane
// draws, the engine's Observe view (engine/application/pipeline/observe-usecase.mjs) and the run's log.

export type SkraftPhaseView = { phase: string; state: 'pending' | 'open' | 'closed' }

export type SkraftRunView = {
  slug: string | null
  status: 'idle' | 'not-initialised' | 'running' | 'waiting' | 'done' | 'blocked' | 'tampered'
  reason: string
  phases: SkraftPhaseView[]
  current: { step: string; phase: string; agent: string | null; gates: string[] | null; question: string | null; visit: number; attempt: number } | null
  question: { key: string; kind: string; text: string; options: string[]; refusals: string[]; header: string } | null
  attempts: number
  costUsd: number | null
  graph: {
    nodes: Array<{
      id: string; kind: string | null; phase: string | null; what: string | null; state: 'pending' | 'open' | 'done'; outcome: string | null
      visits: number; attempts: number; retries: number; durationMs: number; costUsd: number | null
    }>
    edges: Array<{ from: string; to: string; label: string | null; taken: number }>
  }
  reviews: Array<{ step: string; visit: number; verdict: string | null; lenses: Array<{ lens: string; verdict: string; findings: number }> }>
  gates: Array<{ component: string; gate: string; command: string; status: string; durationMs: number; evidence: string; survivors?: number | null }>
}

// live: a run of this session drives the pipeline; its own dialog asks, so the pane offers no answer.
export type SkraftPipelineSnapshot = { view: SkraftRunView; log: string[]; live: boolean }

declare module 'claude-code' {
  interface PluginState {
    skraft: { pipeline: SkraftPipelineSnapshot | null }
  }
}
