import { escalatedTier, HOSTS } from '../../domain/config/model-assignment.mjs'
import { closestName } from '../../domain/config/agent-names.mjs'
import { REFUTER } from '../../domain/review/lenses.mjs'
import { assignmentOf, reviewAssignmentsOf } from '../config/agent-models.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {import('../../domain/config/model-assignment.mjs').Host} Host
 * @typedef {import('../../domain/config/model-assignment.mjs').ResolvedAssignment} ResolvedAssignment
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../../domain/workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../ports/host-settings.mjs').HostAgentSettings} HostAgentSettings
 * @typedef {{ subject: string, status: 'ok' | 'warn' | 'fail', detail: string }} DoctorCheck
 * @typedef {{ step: string, agent: string, type: import('../../domain/config/model-assignment.mjs').AgentType, assignment: ResolvedAssignment }} Dispatched
 * @typedef {{
 *   step: string, agent: string, type: string, family: string | null, tier: string | null, model: string[] | null, effort: string | null,
 *   source: { family: string, model: string, effort: string },
 * }} AssignmentRow
 *   one agent a node dispatches, on one host; null: the host decides.
 * @typedef {Record<Host, AssignmentRow[]>} AssignmentTable
 * @typedef {{
 *   agentCatalog: import('../ports/agent-catalog.mjs').AgentCatalog,
 *   hostSettings: import('../ports/host-settings.mjs').HostSettings,
 * }} ModelCheckDeps
 */

/** Where an agent runs when a host gets no model from skraft. */
const FALLBACK = Object.freeze({ 'claude-code': "the agent file's model", copilot: "the session's model" })
/** Copilot takes the `max` effort on Anthropic's models only; their names say `claude`. */
const ANTHROPIC = /claude/i

/**
 * What every agent the workflow dispatches runs on, on each host, and what doctor says of it:
 * an agent rule nobody provides fails; a family left to a host, `max` on a model not
 * Anthropic, `CLAUDE_CODE_EFFORT_LEVEL` and a Copilot setting skraft masks are warnings.
 * @param {ModelCheckDeps} deps @param {SkraftConfig} config @param {Workflow} workflow
 * @returns {Promise<{ checks: DoctorCheck[], assignments: AssignmentTable }>}
 */
export const modelChecks = async (deps, config, workflow) => {
  const dispatched = workflow.order.flatMap((id) => nodeAgents(config, workflow.nodes[id]))
  const settings = await deps.hostSettings.read()
  const checks = [...await unknownAgents(deps, config, dispatched), ...hostChecks(dispatched, settings)]
  return { checks, assignments: /** @type {AssignmentTable} */ (Object.fromEntries(HOSTS.map((host) => [host, dispatched.map((entry) => rowOf(entry, host))]))) }
}

/** @param {SkraftConfig} config @param {WorkflowNode} node @returns {Dispatched[]} */
const nodeAgents = (config, node) => {
  if (node.kind === 'review' || node.kind === 'call') return reviewAgents(node, reviewAssignmentsOf(config, node))
  if (node.kind !== 'agent') return []
  const agent = /** @type {string} */ (node.agent)
  return [{ step: node.id, agent, type: 'phase', assignment: assignmentOf(config, { agent, type: 'phase', named: node.model }) }]
}

/**
 * The node's lenses, then its refuter as it checks the node's strongest lens.
 * @param {WorkflowNode} node @param {import('../config/agent-models.mjs').ReviewAssignments} assignments @returns {Dispatched[]}
 */
const reviewAgents = (node, { lenses, refuter }) => {
  const rows = Object.entries(lenses).map(([agent, assignment]) => ({ step: node.id, agent, type: /** @type {const} */ ('lens'), assignment }))
  const tier = /** @type {'standard' | 'frontier'} */ (escalatedTier(rows.map(({ assignment }) => assignment.tier)))
  return [...rows, { step: node.id, agent: REFUTER, type: 'refuter', assignment: refuter[tier] }]
}

/** @param {Dispatched} dispatched @param {Host} host @returns {AssignmentRow} */
const rowOf = ({ step, agent, type, assignment: { family, tier, source, hosts } }, host) => {
  const { model, effort, source: from } = hosts[host]
  return { step, agent, type, family, tier, model, effort, source: { family: source, model: from.model, effort: from.effort } }
}

/**
 * Each agent rule for an agent neither the plugin nor the working copy provides, with the
 * dispatched agent whose name is closest.
 * @param {ModelCheckDeps} deps @param {SkraftConfig} config @param {Dispatched[]} dispatched @returns {Promise<DoctorCheck[]>}
 */
const unknownAgents = async ({ agentCatalog }, config, dispatched) => {
  const names = [...new Set(dispatched.map(({ agent }) => agent))]
  const missing = []
  for (const agent of Object.keys(config.assign.agents)) if ((await agentCatalog.locate(agent)) === null) missing.push(agent)
  return missing.map((agent) => ({ subject: 'models', status: 'fail', detail: `assign.agents.${agent}: no agent ${agent} in the plugin, .claude/agents/ or .github/agents/; did you mean ${closestName(agent, names)}?` }))
}

/** @param {Dispatched[]} dispatched @param {HostAgentSettings} settings @returns {DoctorCheck[]} */
const hostChecks = (dispatched, { claudeCodeEffort, copilotAgents }) => [
  modelsOn('claude-code', dispatched),
  ...(claudeCodeEffort === null ? [] : [warn('claude-code', `CLAUDE_CODE_EFFORT_LEVEL is set to ${JSON.stringify(claudeCodeEffort)}: Claude Code applies it to every agent, over the effort skraft assigns`)]),
  modelsOn('copilot', dispatched),
  ...maxEffort(dispatched),
  ...maskedOverrides(dispatched, copilotAgents),
]

/** @param {Host} host @param {string} detail @returns {DoctorCheck} */
const warn = (host, detail) => ({ subject: `models/${host}`, status: 'warn', detail })

/**
 * The families a host gets no model for, each with how many dispatches fall back to the host.
 * @param {Host} host @param {Dispatched[]} dispatched @returns {DoctorCheck}
 */
const modelsOn = (host, dispatched) => {
  const counted = new Map()
  for (const { assignment: { family, hosts } } of dispatched) if (family !== null && hosts[host].model === null) counted.set(family, (counted.get(family) ?? 0) + 1)
  if (counted.size === 0) return { subject: `models/${host}`, status: 'ok', detail: `every family the workflow's agents run on has a model on ${host}` }
  const families = [...counted].map(([family, count]) => `${family} (${count} ${count === 1 ? 'dispatch' : 'dispatches'})`)
  return warn(host, `no model on ${host} for ${families.join(', ')}; these run on ${FALLBACK[host]}`)
}

/** `max` asked of Copilot on a model whose name does not look Anthropic's. @param {Dispatched[]} dispatched @returns {DoctorCheck[]} */
const maxEffort = (dispatched) => {
  const risky = [...new Set(dispatched.flatMap(({ agent, assignment: { hosts: { copilot } } }) => {
    const others = (copilot.model ?? []).filter((name) => !ANTHROPIC.test(name))
    return copilot.effort === 'max' && others.length > 0 ? [`${agent} (${others.join(', ')})`] : []
  }))]
  return risky.length === 0 ? [] : [warn('copilot', `max effort on ${risky.join(', ')}: Copilot takes max on Anthropic models only, and these names do not contain "claude"`)]
}

/**
 * A Copilot `subagents.agents` setting for an agent skraft gives a model or an effort on
 * Copilot: what skraft passes at the call wins over it.
 * @param {Dispatched[]} dispatched @param {string[]} overrides @returns {DoctorCheck[]}
 */
const maskedOverrides = (dispatched, overrides) => {
  const assigned = new Set(dispatched.filter(({ assignment: { hosts: { copilot } } }) => copilot.model !== null || copilot.effort !== null).map(({ agent }) => agent))
  const masked = [...new Set(overrides.map((id) => id.slice(id.lastIndexOf(':') + 1)))].filter((agent) => assigned.has(agent))
  return masked.length === 0 ? [] : [warn('copilot', `~/.copilot/settings.json sets subagents.agents for ${masked.join(', ')}; skraft passes its own model or effort for them, so those settings are ignored`)]
}
