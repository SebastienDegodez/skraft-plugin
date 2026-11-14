/**
 * What one `claude -p --output-format stream-json --verbose` run shows. Pure: it reads text, never
 * a process. Both Claude host probes parse their stream here, so a stream field is read in one place.
 */

/**
 * The name Claude Code gives a tool of a plugin's MCP server: `mcp__plugin_<plugin>_<server>__<tool>`
 * (measured on 2.1.319, #566). The two probes and the engine's agents must name a tool the same way.
 */
export const MCP_PREFIX = 'mcp__plugin_skraft_skraft__'

/** @param {string} line @returns {Record<string, any> | null} */
const parseLine = (line) => {
  try { return JSON.parse(line) } catch { return null }
}

/** The events of a stream, in order; a line that is not JSON is dropped. @param {string} text */
export const streamEvents = (text) => text.split(/\r?\n/).map(parseLine).filter((event) => event !== null)

/**
 * Every tool the session asked for, with the dispatch it belongs to: `parent` is null in the main
 * session and holds the `Agent` call's id inside a sub-agent, which is what attributes a call.
 * @param {ReadonlyArray<Record<string, any>>} events
 */
export const toolCalls = (events) => events.filter((event) => event.type === 'assistant')
  .flatMap((event) => (event.message?.content ?? [])
    .filter((part) => part.type === 'tool_use')
    .map(({ name, input }) => ({ name, input, parent: event.parent_tool_use_id ?? null })))

/**
 * Each sub-agent the main session started: the host announces one `task_started` per dispatch.
 * @param {ReadonlyArray<Record<string, any>>} events
 */
export const dispatches = (events) => events.filter((event) => event.type === 'system' && event.subtype === 'task_started')
  .map(({ subagent_type: type, spawn_depth: depth, tool_use_id: id }) => ({ type, depth, id }))

/** The calls a sub-agent made, never the main session's. @param {ReadonlyArray<{ parent: string | null }>} calls */
export const subagentCalls = (calls) => calls.filter(({ parent }) => parent !== null)

/** @param {string} text */
export const streamSummary = (text) => {
  const events = streamEvents(text)
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init') ?? {}
  const result = events.find((event) => event.type === 'result') ?? null
  const calls = toolCalls(events)
  return {
    model: init.model ?? null, claudeCode: init.claude_code_version ?? null,
    skraftTools: (init.tools ?? []).filter((/** @type {string} */ name) => name.includes('skraft')),
    mcpServers: (init.mcp_servers ?? []).filter((/** @type {{ name: string }} */ { name }) => name.includes('skraft')),
    plugins: init.plugins ?? null, agents: init.agents ?? null,
    calls: calls.map(({ name, input }) => ({ name, input })), attributed: calls, dispatches: dispatches(events),
    reply: result?.result ?? null, isError: result?.is_error ?? null, costUsd: result?.total_cost_usd ?? null,
    modelUsage: result?.modelUsage ?? null, denials: result?.permission_denials ?? [],
  }
}
