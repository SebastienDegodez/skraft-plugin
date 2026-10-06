// Port for running one pipeline subagent (a phase specialist or reviewer) to completion.
// Contract: run({ agent, phase, role, label, prompt }) => Promise<{ ok: boolean, text: string }>
//   agent  — canonical name from skraft-framework.config.json ("Skraft - Software Engineer");
//            the adapter maps it to its host's agent id.
//   label  — unique per dispatch; hosts that memoize identical calls must not merge two dispatches.
//   ok:false when the subagent errored or answered nothing. MUST NOT throw for an agent failure;
//   a host cancellation may propagate.
export const AGENT_RUNNER_PORT = 'AgentRunner'
