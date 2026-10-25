/**
 * AgentRunner — the host starts agents and waits for their answers. Drivers implement it
 * (`ctx.agent`, `$.agent.spawn`); no agent is started any other way.
 *
 * @typedef {{
 *   agent: string, source: import('./agent-catalog.mjs').AgentSource, label: string, prompt: string,
 *   model?: string, models?: Readonly<Record<string, readonly string[]>>, effort?: Readonly<Record<string, string>>,
 * }} AgentDispatch
 *   agent is the agent's file id (`solution-researcher`); source: whether skraft ships it or the
 *   working copy does; label is stable across a resume; model: the family the agent runs on
 *   (economy, implementer, gpt-codex…), absent when the host decides; models: each host's model
 *   names for that family (`claude-code`, `copilot`), the preferred first, absent for a host the
 *   configuration gives none; effort: each host's reasoning effort (low, medium, high, xhigh,
 *   max), absent for a host it gives none. A driver starts the agent on its host's first name;
 *   without one, the agent's own file or the session decides.
 * @typedef {{ ok: boolean, text: string, error?: string, unavailable?: boolean, costUsd?: number, model?: string | null }} AgentAnswer
 *   unavailable: the host could not start this agent at all (not installed, not listed).
 *   costUsd: what this agent alone cost, when the host can tell. model: the model the agent ran
 *   on as the host names it, null when the host ran its session's own.
 * @typedef {{ answers: AgentAnswer[], costUsd?: number }} AgentAnswers
 *   answers: one per dispatch, in their order. costUsd: what the batch cost, when the host can
 *   tell it but not each agent's share.
 * @typedef {{
 *   run: (dispatch: AgentDispatch) => Promise<AgentAnswer>,
 *   runMany: (dispatches: AgentDispatch[]) => Promise<AgentAnswers>,
 * }} AgentRunner
 *   runMany: the dispatches together, in parallel where the host can run agents side by side.
 *   A host that hands the dispatches to someone else instead (the agent loop's `skraft next`)
 *   may throw its own hand-over once they are written down: the attempt stays open, and the
 *   next run asks again under the same labels.
 */
export {}
