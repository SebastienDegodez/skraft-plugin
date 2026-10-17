/**
 * AgentRunner — the host starts agents and waits for their answers. Drivers implement it
 * (`ctx.agent`, `$.agent.spawn`); no agent is started any other way.
 *
 * @typedef {{ agent: string, source: import('./agent-catalog.mjs').AgentSource, label: string, prompt: string }} AgentDispatch
 *   agent is the agent's file id (`solution-researcher`); source: whether skraft ships it or the
 *   working copy does; label is stable across a resume.
 * @typedef {{ ok: boolean, text: string, error?: string, unavailable?: boolean, costUsd?: number }} AgentAnswer
 *   unavailable: the host could not start this agent at all (not installed, not listed).
 *   costUsd: what this agent alone cost, when the host can tell.
 * @typedef {{ answers: AgentAnswer[], costUsd?: number }} AgentAnswers
 *   answers: one per dispatch, in their order. costUsd: what the batch cost, when the host can
 *   tell it but not each agent's share.
 * @typedef {{
 *   run: (dispatch: AgentDispatch) => Promise<AgentAnswer>,
 *   runMany: (dispatches: AgentDispatch[]) => Promise<AgentAnswers>,
 * }} AgentRunner
 *   runMany: the dispatches together, in parallel where the host can run agents side by side.
 */
export {}
