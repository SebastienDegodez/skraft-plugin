// Inbound port: run (or resume) the SKRAFT pipeline for one story.
// Contract: run({ slug, story? }) => Promise<{ status, phase, reason, checkpoint? }>
//   status — 'done' | 'blocked' | 'awaiting-human'
// Implemented by application/pipeline/run-pipeline.mjs; driven by the Claude Code mod
// (hooks/skraft-mod.mjs) and the Copilot workflow (com.github.copilot/extensions/skraft-pipeline).
export const RUN_PIPELINE_INTERFACE = 'RunPipelineInterface'
