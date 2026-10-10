// The SKRAFT engineering pipeline, declared where it runs: in code (RunPipeline, driven by
// the Copilot `skraft-pipeline` workflow and the Claude Code `/skraft` command). Agents
// no longer declare it — the launcher agent only starts it.
//
//   PIPELINE_PHASES      the phase order; skraft-framework.config.json::phaseOrder is built
//                        from it (cli/build-config.mjs)
//   PIPELINE_DISPATCHER  what a phase agent names as its `metadata.dispatched_by`: the
//                        pipeline dispatches the phase agents, no agent does
//   PIPELINE_LAUNCHER    the agent a person picks to start the pipeline (file id); the
//                        catalogue shows it as the engineering entry point
//   WORKSPACE_PHASES     the phases whose specialist and workers write src/ and tests/:
//                        DISTILL its RED acceptance tests and the stubs they compile
//                        against, DELIVER the code. config:build turns it into the
//                        writeRights of each agent (write-rights-policy.mjs, G8)
// No import: the state machine and the policies read the order from here.
export const PIPELINE_PHASES = Object.freeze(['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
export const PIPELINE_DISPATCHER = 'skraft-pipeline'
export const PIPELINE_LAUNCHER = 'skraft-orchestrator'
export const WORKSPACE_PHASES = Object.freeze(['DISTILL', 'DELIVER'])

export const isPipelineDispatcher = (reference) => reference === PIPELINE_DISPATCHER
