/**
 * What the forges' MCP-first adapters share: the route of a result, an operation served by the
 * host's MCP server else by the forge's command line, and the answer of one tool call.
 *
 * @typedef {import('../ports/mcp-tools.mjs').McpTools} McpTools
 * @typedef {import('../ports/mcp-tools.mjs').McpFailure} McpFailure
 * @typedef {McpFailure | 'mcp-unreadable'} Fallback
 *   mcp-unreadable: the server answered what skraft cannot read.
 * @typedef {{ failure: Fallback }} Failed
 */

/**
 * The route of a result, as a journal event keeps it: none when no MCP server was offered.
 * @param {{ via?: 'mcp' | 'gh' | 'az', fallback?: Fallback }} result
 */
export const routeOf = ({ via, fallback }) => ({ ...(via === undefined ? {} : { via }), ...(fallback === undefined ? {} : { fallback }) })

/** @template T @param {() => Promise<T>} load @returns {() => Promise<T>} what load gives, asked once */
export const once = (load) => {
  /** @type {Promise<T> | undefined} */
  let kept
  return () => {
    kept ??= load()
    return kept
  }
}

/**
 * The operation on the MCP server, else on the forge's command line (`cli`: gh or az), with the way that served it.
 * @template T, S @param {() => Promise<S | Failed>} route @param {(reached: S) => Promise<{ served: T } | Failed>} attempt
 * @param {() => Promise<T>} fallback @param {'gh' | 'az'} cli
 */
export const served = async (route, attempt, fallback, cli) => {
  const reached = await route()
  const tried = 'failure' in reached ? reached : await attempt(/** @type {S} */ (reached))
  if ('served' in tried) return { ...tried.served, via: /** @type {const} */ ('mcp') }
  return { ...(await fallback()), via: cli, fallback: tried.failure }
}

/** @type {Failed} */
export const UNAVAILABLE = Object.freeze({ failure: 'mcp-unavailable' })
/** @type {Failed} */
export const UNREADABLE = Object.freeze({ failure: 'mcp-unreadable' })

/** @param {McpTools} mcpTools @param {{ server: string, tool: string, arguments: Record<string, unknown> }} request */
export const answerOf = async (mcpTools, request) => {
  const called = await mcpTools.call(request)
  if (!called.ok) return { failure: called.reason }
  const json = jsonOf(called.text)
  return json === null ? UNREADABLE : { json }
}

/** @param {string} text */
const jsonOf = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
