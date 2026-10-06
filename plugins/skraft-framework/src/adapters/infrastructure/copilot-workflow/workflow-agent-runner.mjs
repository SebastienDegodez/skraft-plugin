// AgentRunner (ports/infrastructure/agent-runner.mjs) on a Copilot dynamic workflow:
// ctx.agent(prompt, { label, agent }). ctx.agent journals each call by prompt + options,
// so a resumed run gets finished dispatches back without re-running them; the label keeps
// distinct dispatches distinct. A failure resolves null, never throws.
//
// A Copilot plugin agent is addressed by its .agent.md `name` ("Skraft - Software
// Engineer"), which is the canonical name of the config; agentIds overrides it per agent.
// agent null runs the session's default agent (the report transport).
//
// Usage: while the dispatch runs, every `assistant.usage` event of a subagent (it carries
// an agentId; the main agent's do not) is summed — RunPipeline dispatches one agent at a
// time, so they are this dispatch's, its own subagents included. Copilot reports cost in
// nano-AI units: credits = nano-AIU / 1e9 (copilot-sdk docs/usage-and-billing). A resumed,
// memoized call spends nothing and reports no usage.
const NANO_AIU_PER_CREDIT = 1e9

export const sumCopilotUsage = (events) => {
  if (events.length === 0) return undefined
  const sum = (pick) => events.reduce((total, event) => total + (Number(pick(event.data ?? {})) || 0), 0)
  const nanoAiu = sum((data) => data.copilotUsage?.totalNanoAiu)
  return Object.freeze({
    model: events.at(-1).data?.model ?? null,
    requests: events.length,
    inputTokens: sum((data) => data.inputTokens),
    outputTokens: sum((data) => data.outputTokens),
    cacheReadTokens: sum((data) => data.cacheReadTokens),
    cacheWriteTokens: sum((data) => data.cacheWriteTokens),
    ...(events.some((event) => event.data?.copilotUsage) ? { credits: nanoAiu / NANO_AIU_PER_CREDIT } : {}),
  })
}

export const createWorkflowAgentRunner = ({ ctx, agentIds = {} }) => Object.freeze({
  run: async ({ agent, label, prompt }) => {
    const name = agent === null ? undefined : (agentIds[agent] ?? agent)
    const events = []
    const stop = typeof ctx.session?.on === 'function'
      ? ctx.session.on('assistant.usage', (event) => { if (event?.agentId) events.push(event) })
      : () => {}
    let text
    try {
      text = await ctx.agent(prompt, { label, ...(name ? { agent: name } : {}) })
    } finally {
      stop()
    }
    const usage = sumCopilotUsage(events)
    return Object.freeze({
      ok: typeof text === 'string' && text.length > 0,
      text: typeof text === 'string' ? text : '',
      ...(usage ? { usage } : {}),
    })
  },
})
