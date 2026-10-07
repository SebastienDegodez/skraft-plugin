// Type contract of the skraft mod (hooks/skraft-mod.mjs): the values it keeps in $.state.
export type SkraftRunStatus = 'idle' | 'running' | 'done' | 'blocked' | 'awaiting-human' | 'error'

export type SkraftRunView = {
  slug: string | null
  status: SkraftRunStatus
  phase: string | null
  reason: string
  log: string[]
  checkpointKey: string | null
}

declare module 'claude-code' {
  interface PluginState {
    skraft: { run: SkraftRunView }
  }
}
