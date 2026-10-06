// Port for running one pipeline subagent (a phase specialist or reviewer) to completion.
// Contract: run({ agent, phase, role, label, prompt }) => Promise<{ ok, text, usage? }>
//   agent  — canonical name from skraft-framework.config.json ("Skraft - Software Engineer");
//            the adapter maps it to its host's agent id. null: the host's general-purpose
//            agent, which sees the session's tools (the report transport needs its MCP tools).
//   label  — unique per dispatch; hosts that memoize identical calls must not merge two dispatches.
//   ok:false when the subagent errored or answered nothing, with `error` saying why when the
//   adapter knows; `unavailable: true` when the host does not have that agent at all (no
//   retry can help: the run stops and says so). MUST NOT throw for an agent failure;
//   a host cancellation may propagate.
//   usage  — what the dispatch cost, when the host reports it; every field optional:
//            { model, requests, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
//              credits (GitHub Copilot AI credits), usd (US dollars) }
export const AGENT_RUNNER_PORT = 'AgentRunner'
