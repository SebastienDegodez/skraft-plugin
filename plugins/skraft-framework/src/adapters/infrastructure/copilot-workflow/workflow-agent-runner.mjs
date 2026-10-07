// AgentRunner (ports/infrastructure/agent-runner.mjs) on a Copilot dynamic workflow:
// ctx.agent(prompt, { label, agent }). ctx.agent journals each call by prompt + options,
// so a resumed run gets finished dispatches back without re-running them; the label keeps
// distinct dispatches distinct. A failure resolves null, never throws.
//
// Agent ids: the config names an agent canonically ("Skraft - Solution Researcher"); a
// session registers a plugin agent under its own id ("skraft:solution-researcher"), and an
// unknown name makes ctx.agent answer nothing. So the id is resolved, once per run, in order:
//   1. agentIds[canonical]                       the workflow argument, explicit
//   2. the session's agent list (session.agent.list) — the entry whose id, name or
//      displayName is the canonical name or its kebab alias, or whose id ends in ":<alias>"
//   3. "<plugin>:<alias>"                        when the session cannot list its agents
// An agent the session lists nowhere is not dispatched: the run says which and why.
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

// The kebab alias of a canonical name: the agent file id ("solution-researcher").
const kebabAliasOf = (canonical, aliases) => Object.entries(aliases ?? {})
  .find(([alias, target]) => target === canonical && /^[a-z0-9-]+$/.test(alias))?.[0] ?? null

// Pure: the session agent to call for a canonical name, or null when none is listed.
export const resolveCopilotAgentId = (canonical, { listed = null, aliases = {}, pluginName = null } = {}) => {
  const kebab = kebabAliasOf(canonical, aliases)
  if (Array.isArray(listed)) {
    const names = new Set([canonical, kebab].filter(Boolean))
    const exact = listed.find((entry) => [entry.id, entry.name, entry.displayName].some((value) => names.has(value)))
    if (exact) return exact.id ?? exact.name
    const prefixed = kebab ? listed.find((entry) => String(entry.id ?? '').endsWith(`:${kebab}`)) : null
    return prefixed ? prefixed.id : null
  }
  return kebab && pluginName ? `${pluginName}:${kebab}` : canonical
}

// The session's agents, or null when this host cannot list them.
const listAgents = async (ctx) => {
  const list = ctx.session?.rpc?.agent?.list
  if (typeof list !== 'function') return null
  try {
    const answer = await list.call(ctx.session.rpc.agent, {})
    return Array.isArray(answer?.agents) ? answer.agents : null
  } catch {
    return null
  }
}

export const createWorkflowAgentRunner = ({ ctx, agentIds = {}, aliases = {}, pluginName = null }) => {
  let listed
  const idOf = async (agent) => {
    if (agentIds[agent]) return agentIds[agent]
    if (listed === undefined) listed = listAgents(ctx)
    return resolveCopilotAgentId(agent, { listed: await listed, aliases, pluginName })
  }
  return Object.freeze({ run: async ({ agent, label, prompt }) => {
    const name = agent === null ? undefined : await idOf(agent)
    if (agent !== null && !name) {
      const known = ((await listed) ?? []).map((entry) => entry.id ?? entry.name).join(', ')
      return Object.freeze({ ok: false, unavailable: true, text: '', error: `agent "${agent}" is not available in this Copilot session (agents: ${known || 'none'}); install or enable the skraft plugin, or pass agentIds` })
    }
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
    const answered = typeof text === 'string' && text.length > 0
    return Object.freeze({
      ok: answered,
      text: typeof text === 'string' ? text : '',
      ...(answered ? {} : { error: `${name} answered nothing` }),
      ...(usage ? { usage } : {}),
    })
  } })
}
