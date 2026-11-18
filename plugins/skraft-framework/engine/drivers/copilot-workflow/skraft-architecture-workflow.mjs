import { runWorkflowBody } from './skraft-pipeline-workflow.mjs'

/**
 * `skraft-architecture` dynamic workflow: produces the architecture brief and its ADRs on one
 * story (`--issue`) or one epic (`--epic`), then opens the PR. Reuses the pipeline workflow's
 * body with the `epic-design.skraft.dot` workflow file of the plugin (A1 #623, A4 #626).
 * @typedef {import('./skraft-pipeline-workflow.mjs').WorkflowContext} WorkflowContext
 * @typedef {import('./skraft-pipeline-workflow.mjs').Host} Host
 * @typedef {import('./skraft-pipeline-workflow.mjs').RunOutcome} RunOutcome
 */

export const SKRAFT_ARCHITECTURE_META = Object.freeze({
  name: 'skraft-architecture',
  // Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
  description:
    'SKRAFT architecture workflow: research and design for one story or one epic, with ADR ratification and a PR of architecture. ' +
    'args: { slug?: kebab-case feature scope (omit to resume the active run), issue?: number for one story, ' +
    'epic?: number for an epic (A4 #626), title?: string, base?: git ref, ' +
    'agentIds?: { [agent file id]: session agent id } }. ' +
    'The Copilot model and reasoning effort of each agent come from models and assign in the skraft configuration, never from args. ' +
    'On pause (ADR ratification), when skraft_decide is not among your tools, find it with tool_search_tool; then read skraft_decide {}, ' +
    'ask the exact question and options with the offered native ask_user or askQuestions tool, ' +
    'relay the human reply with skraft_decide {key, answer, reason?}, then resume the SAME workflow run ID. ' +
    'Missing native tool or dismissal: record nothing, report the blocker and leave this run paused.',
  phases: Object.freeze([
    Object.freeze({ title: 'RESEARCH', detail: 'Solution Researcher' }),
    Object.freeze({ title: 'DESIGN', detail: 'Solution Architect and the DESIGN review' }),
    Object.freeze({ title: 'ADR', detail: 'Ratification of the Proposed ADRs' }),
    Object.freeze({ title: 'PUBLISH', detail: 'PR Writer and the architecture pull request' }),
  ]),
  // Stryker restore StringLiteral
  argsSchema: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      slug: Object.freeze({ type: 'string' }),
      issue: Object.freeze({ type: 'integer' }),
      epic: Object.freeze({ type: 'integer' }),
      title: Object.freeze({ type: 'string' }),
      base: Object.freeze({ type: 'string' }),
      agentIds: Object.freeze({ type: 'object' }),
    }),
  }),
})

/** @param {WorkflowContext} ctx @param {Host} host @returns {Promise<RunOutcome>} */
export const runSkraftArchitectureWorkflow = (ctx, host) => runWorkflowBody(ctx, host, 'epic-design')
