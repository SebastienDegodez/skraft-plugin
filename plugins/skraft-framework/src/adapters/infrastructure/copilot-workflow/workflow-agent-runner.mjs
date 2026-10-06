// AgentRunner (ports/infrastructure/agent-runner.mjs) on a Copilot dynamic workflow:
// ctx.agent(prompt, { label, agent }). ctx.agent journals each call by prompt + options,
// so a resumed run gets finished dispatches back without re-running them; the label keeps
// distinct dispatches distinct. A failure resolves null, never throws.
//
// A Copilot plugin agent is addressed by its .agent.md `name` ("Skraft - Software
// Engineer"), which is the canonical name of the config; agentIds overrides it per agent.
export const createWorkflowAgentRunner = ({ ctx, agentIds = {} }) => Object.freeze({
  run: async ({ agent, label, prompt }) => {
    const text = await ctx.agent(prompt, { label, agent: agentIds[agent] ?? agent })
    return Object.freeze({ ok: typeof text === 'string' && text.length > 0, text: typeof text === 'string' ? text : '' })
  },
})
