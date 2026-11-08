// The agents a plugin's shipped workflows name, read from the `.skraft.dot`
// files the engine runs (plugins/<plugin>/workflows/). In V2 the workflow, not
// an agent descriptor, says which phases run in which order, which agent each
// phase dispatches, and which lenses and refuter the engine starts: the
// catalogue reads that here instead of from descriptor metadata.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { readWorkflow } from '../../plugins/skraft-framework/engine/domain/workflow/workflow.mjs'

const REFUTER = 'finding-refuter'

/**
 * What one parsed workflow names.
 *
 * @param {{ order: string[], nodes: Record<string, { kind: string, phase: string|null, agent: string|null, lenses: string[] }> }} workflow
 * @returns {{ phases: Array<{ phase: string, specialist: string }>, agents: string[] }}
 *   phases: each phase in run order with the first agent it dispatches (none when only reviews and gates run in it);
 *   agents: every agent the workflow dispatches, its lenses (`<lens>-lens`) and the refuter included
 */
export function workflowAgents(workflow) {
  const nodes = workflow.order.map((id) => workflow.nodes[id])
  const phases = []
  for (const node of nodes) {
    if (node.kind !== 'agent' || !node.agent || !node.phase) continue
    if (!phases.some(({ phase }) => phase === node.phase)) phases.push({ phase: node.phase, specialist: node.agent })
  }
  const reviews = nodes.filter((node) => node.kind === 'review')
  const agents = [
    ...nodes.filter((node) => node.kind === 'agent' && node.agent).map((node) => node.agent),
    ...reviews.flatMap((node) => node.lenses.map((lens) => `${lens}-lens`)),
    ...(reviews.length ? [REFUTER] : []),
  ]
  return { phases, agents: [...new Set(agents)] }
}

/**
 * @param {string} root the repository root
 * @returns {Array<{ path: string, pluginDir: string, entry: boolean, phases: Array<{ phase: string, specialist: string }>, agents: string[] }>}
 *   path relative to root with `/`; entry: a workflow a run starts from, not one another workflow calls
 */
export function findShippedWorkflows(root) {
  const pluginsDir = join(root, 'plugins')
  if (!existsSync(pluginsDir)) return []
  return readdirSync(pluginsDir).sort().flatMap((pluginDir) => {
    const dir = join(pluginsDir, pluginDir, 'workflows')
    if (!existsSync(dir)) return []
    return readdirSync(dir).filter((file) => file.endsWith('.skraft.dot')).sort().flatMap((file) => {
      const text = readFileSync(join(dir, file), 'utf8')
      const asEntry = readWorkflow(text)
      const read = asEntry.ok ? asEntry : readWorkflow(text, { called: true })
      if (!read.ok) return []
      return [{
        path: relative(root, join(dir, file)).split('\\').join('/'),
        pluginDir,
        entry: asEntry.ok,
        ...workflowAgents(read.workflow),
      }]
    })
  })
}

