import { resolveActivePipeline } from '../../domain/pipeline/active-pipeline-policy.mjs'

// Step shared by every inbound adapter that acts on "the pipeline" of a working copy
// (the Copilot canvas and tools, the Claude Code commands): the slug comes from the
// ActivePipeline port (.active-slug), and a slug the caller names must be that one.
// Result: Ok(slug) | Err({ code, reason })  — domain/pipeline/active-pipeline-policy.mjs
export const activePipelineSlug = async ({ activePipeline }, requested = null) => {
  let active = null
  try { active = await activePipeline.current() } catch { /* unreadable pointer: none */ }
  return resolveActivePipeline({ requested: requested || null, active })
}
