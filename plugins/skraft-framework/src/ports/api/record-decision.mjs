// Inbound port: record a human's answer to a pipeline checkpoint.
// Contract: record({ slug, key, answer, by? }) => Promise<Result<{ key }>>
// Implemented by application/pipeline/record-decision.mjs; driven by the Claude Code mod
// (/skraft decide) and the Copilot skraft_decide tool.
export const RECORD_DECISION_INTERFACE = 'RecordDecisionInterface'
