// Central error code list. Rest of framework should reuse names from here.
export const MISSING_ARTEFACT = 'MISSING_ARTEFACT'
export const INVALID_STATE = 'INVALID_STATE'
export const PHASE_REJECTED = 'PHASE_REJECTED'
export const MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED'
export const CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND'
export const INVALID_PHASE = 'INVALID_PHASE'
export const INVALID_VERDICT = 'INVALID_VERDICT'
export const MISSING_MANDATORY_SKILL = 'MISSING_MANDATORY_SKILL'
// G7 — a direct write to state.json / execution-log (must go through the state CLI).
export const STATE_WRITE_FORBIDDEN = 'STATE_WRITE_FORBIDDEN'
// G8 — a src/ or tests/ write attempted outside the monitored DELIVER sub-agent.
export const UNMONITORED_WRITE = 'UNMONITORED_WRITE'
