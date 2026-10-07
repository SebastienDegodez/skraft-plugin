// Inbound port: close the open, reviewed phase after human-validated reworks, without a
// reviewer APPROVED (skraft-orchestrator.md "Manual closure").
// Contract: close({ slug, phase?, findings? }) => Promise<Result<{ phase, next, review }>>
//   findings — findings the human's rework pass fixed (non-negative integer, default 0)
// Refusals: INVALID_SLUG, INVALID_ARGUMENT, PIPELINE_DONE, PHASE_MISMATCH, NO_REVIEWER,
// NON_CONVENTIONAL_COMMITS (DELIVER: rename them first), and the state service's own.
// Implemented by application/pipeline/close-manually.mjs; driven by the Claude Code mod
// (/skraft close) and the Copilot skraft_close_phase tool.
export const CLOSE_MANUALLY_INTERFACE = 'CloseManuallyInterface'
