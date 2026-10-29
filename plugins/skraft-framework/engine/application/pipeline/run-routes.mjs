import { route } from '../../domain/pipeline/next-step.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 */

/**
 * Where the run goes once a node passed, or why it cannot go on.
 * @param {{ loaded: { workflow: Workflow } }} context
 * @param {RunState} run @param {string} from
 * @param {string | null} label PASS or FAIL for a gate, the verdict for a review, the answer for an ask node, null for an agent
 * @param {string[]} failures
 * @returns {{ next: string | null, code?: string, reason?: string, ceiling?: string | null }}
 *   ceiling: on a blocked route, the node the edge at its max_visits leads to; null when no edge leads on
 */
export const leave = ({ loaded }, run, from, label, failures) => {
  const routed = route(loaded.workflow, run, from, label)
  if (routed.ok) return { next: routed.to }
  const why = routed.code === 'loop-ceiling'
    ? `${from} -> ${routed.to} was already taken ${routed.taken} times, its max_visits`
    : `${from} ${NO_EDGE[routed.code]}`
  return { next: null, code: routed.code, reason: [why, ...failures].join('; '), ceiling: routed.to }
}

const NO_EDGE = Object.freeze({
  'gates-failed': 'failed and the workflow has no FAIL edge out of it',
  'review-rejected': 'asked for rework and the workflow has no NEEDS_REWORK edge out of it',
})
