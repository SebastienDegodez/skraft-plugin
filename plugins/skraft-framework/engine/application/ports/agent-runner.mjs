/**
 * AgentRunner — the host starts one agent and waits for its answer. Drivers implement it
 * (`ctx.agent`, `$.agent.spawn`); no agent is started any other way.
 *
 * @typedef {{ agent: string, source: import('./agent-catalog.mjs').AgentSource, label: string, prompt: string }} AgentDispatch
 *   agent is the agent's file id (`solution-researcher`); source: whether skraft ships it or the
 *   working copy does; label is stable across a resume.
 * @typedef {{ ok: boolean, text: string, error?: string, unavailable?: boolean, costUsd?: number }} AgentAnswer
 *   unavailable: the host could not start this agent at all (not installed, not listed).
 * @typedef {{ run: (dispatch: AgentDispatch) => Promise<AgentAnswer> }} AgentRunner
 */
export {}
