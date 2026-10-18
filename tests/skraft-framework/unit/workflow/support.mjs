import { createWorkflowCommands } from '../../../../plugins/skraft-framework/engine/application/workflow.mjs'
import { BUILT_IN_WORKFLOW, InMemoryAgentCatalog, InMemoryWorkflowSource, InMemoryWorkspace } from '../support/in-memory-host.mjs'

/**
 * The text with each `[old, new]` replacement made; throws when an `old` is not in it, so a
 * scenario never runs on a workflow it did not change.
 * @param {string} text @param {...[string, string]} replacements
 */
export const edit = (text, ...replacements) => replacements.reduce((edited, [old, now]) => {
  if (!edited.includes(old)) throw new Error(`${JSON.stringify(old)} is not in the workflow`)
  return edited.replace(old, now)
}, text)

/** The plugin workflow with a security review between design and distill. */
export const WITH_SECURITY = edit(
  BUILT_IN_WORKFLOW,
  ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  security [shape=box, agent="acme-security-reviewer", outputs="security/{date}/{slug}-review.md, notes.md", writes="docs/security/, src/", max_attempts=2]'],
  ['  adr -> distill   [label="RATIFIED"]', '  adr -> security  [label="RATIFIED"]\n  security -> distill'],
)

/** A working copy whose skraft-config.json designates skraft-workflow.dot, holding `dot`. */
export const designating = (dot, config = {}) => ({
  'skraft-config.json': JSON.stringify({ ...config, workflow: 'skraft-workflow.dot' }),
  'skraft-workflow.dot': dot,
})

/**
 * @param {{ files?: Record<string, string>, repository?: string[], builtIn?: string }} [host]
 *   repository: the agents the working copy provides (`.claude/agents/`, `.github/agents/`)
 */
export const host = ({ files = {}, repository = [], builtIn = BUILT_IN_WORKFLOW } = {}) => {
  const workspace = new InMemoryWorkspace(files)
  const deps = { workspace, workflowSource: new InMemoryWorkflowSource(builtIn), agentCatalog: new InMemoryAgentCatalog({ repository }) }
  return { workspace, deps, commands: createWorkflowCommands(deps) }
}
