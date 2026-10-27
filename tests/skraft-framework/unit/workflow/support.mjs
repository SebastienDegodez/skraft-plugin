import { createWorkflowCommands } from '../../../../plugins/skraft-framework/engine/application/workflow/workflow-commands-usecase.mjs'
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

/**
 * The workflow with the lens nodes of the review closed by the fan-in `review` replaced by one
 * per lens given, in order: `<lens>`, `<lens>@<family>` (the node's model=) or
 * `<lens> when=<trigger>`. Each lens node is `<review>_<lens>`, between `<review>_lenses` and
 * `review`, as `skraft workflow check` names it.
 * @param {string} text @param {string} review @param {string[]} lenses
 */
export const withLenses = (text, review, lenses) => {
  const fanOut = `  ${review}_lenses [shape=component]\n`
  if (!text.includes(fanOut)) throw new Error(`${review} has no fan-out ${review}_lenses in the workflow`)
  const nodes = new RegExp(`^  ${review}_(?!lenses )\\w+ \\[shape=note.*\\]\\n`, 'gm')
  const branches = new RegExp(`^  ${review}_lenses -> \\w+ -> ${review}\\n`, 'gm')
  const added = lenses.map((spec) => lensBranch(review, spec)).join('')
  return text.replace(nodes, '').replace(branches, '').replace(fanOut, `${fanOut}${added}`)
}

/** @param {string} review @param {string} spec */
const lensBranch = (review, spec) => {
  const [lensAndFamily, trigger] = spec.split(' when=')
  const [lens, family] = lensAndFamily.split('@')
  const id = `${review}_${lens.replaceAll('-', '_')}`
  const attributes = [`lens="${lens}"`, ...(family === undefined ? [] : [`model="${family}"`]), ...(trigger === undefined ? [] : [`when="${trigger}"`])]
  return `  ${id} [shape=note, ${attributes.join(', ')}]\n  ${review}_lenses -> ${id} -> ${review}\n`
}

/** The plugin workflow with a security review in DESIGN, between the architect and the design review. */
export const WITH_SECURITY = edit(
  BUILT_IN_WORKFLOW,
  ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  security [shape=box, agent="acme-security-reviewer", outputs="security/{date}/{slug}-review.md, notes.md", writes="docs/security/, src/", max_attempts=2]'],
  ['research -> design -> design_review_lenses\n', 'research -> design -> security\n  security -> design_review_lenses\n'],
)

/** A working copy whose skraft-config.json designates skraft-workflow.dot, holding `dot`. */
export const designating = (dot, config = {}) => ({
  'skraft-config.json': JSON.stringify({ publish: { pullRequest: false }, ...config, workflow: 'skraft-workflow.dot' }),
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
