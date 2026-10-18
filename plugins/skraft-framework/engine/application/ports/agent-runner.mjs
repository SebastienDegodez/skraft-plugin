/**
 * AgentRunner — the host starts agents and waits for their answers. Drivers implement it
 * (`ctx.agent`, `$.agent.spawn`); no agent is started any other way.
 *
 * @typedef {{ agent: string, source: import('./agent-catalog.mjs').AgentSource, label: string, prompt: string, model?: string }} AgentDispatch
 *   agent is the agent's file id (`solution-researcher`); source: whether skraft ships it or the
 *   working copy does; label is stable across a resume; model: the family the agent runs on
 *   (haiku, sonnet, opus, gpt-luna…), which the driver maps to the host's model; without it,
 *   the agent's own file or the session decides.
 * @typedef {{ ok: boolean, text: string, error?: string, unavailable?: boolean, costUsd?: number, model?: string | null }} AgentAnswer
 *   unavailable: the host could not start this agent at all (not installed, not listed).
 *   costUsd: what this agent alone cost, when the host can tell. model: the model the agent ran
 *   on as the host names it (`claude-sonnet-5.5`), null when the host ran its session's own.
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
