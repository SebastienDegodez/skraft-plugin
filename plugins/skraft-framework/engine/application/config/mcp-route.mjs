/**
 * What the forges' MCP-first adapters share: the route of a result, an operation served by the
 * host's MCP server else by the forge's command line, and the answer of one tool call.
 *
 * @typedef {import('../ports/mcp-tools.mjs').McpTools} McpTools
 * @typedef {import('../ports/mcp-tools.mjs').McpFailure} McpFailure
 * @typedef {McpFailure | 'mcp-unreadable'} Fallback
 *   mcp-unreadable: the server answered what skraft cannot read.
 * @typedef {{ failure: Fallback, tool?: string }} Failed
 *   tool: the tool whose call failed, when one did.
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
 * A refusal (the person or the host said no, to a read as to a write) is final: `refusedBy` gives the
 * operation's own result and the command line is never asked. Any other failure goes to the command line.
 * @template T, S @param {() => Promise<S | Failed>} route @param {(reached: S) => Promise<{ served: T } | Failed>} attempt
 * @param {() => Promise<T>} fallback @param {'gh' | 'az'} cli @param {(tool: string | undefined) => T} refusedBy
 */
export const served = async (route, attempt, fallback, cli, refusedBy) => {
  const reached = await route()
  const tried = 'failure' in reached ? reached : await attempt(/** @type {S} */ (reached))
  if ('served' in tried) return { ...tried.served, via: /** @type {const} */ ('mcp') }
  if (tried.failure === 'mcp-refused') return { ...refusedBy(tried.tool), via: /** @type {const} */ ('mcp') }
  return { ...(await fallback()), via: cli, fallback: tried.failure }
}

/**
 * What a refusal of a tool says, fixed by code: a write wrote nothing; a read read nothing and the
 * forge's command line was not asked instead.
 * @param {{ server: string, place: string, writes: readonly string[], cli: 'gh' | 'az' }} forge
 * @returns {(tool: string | undefined) => { ok: false, reason: string }}
 */
export const refusalOf = ({ server, place, writes, cli }) => (tool) => ({ ok: false, reason: `the host refused the ${server} MCP server's ${tool}, so skraft ${effectOf(writes.includes(String(tool)), place, cli)}; allow it, or run again where it is allowed` })

/** @param {boolean} isWrite @param {string} place @param {string} cli */
const effectOf = (isWrite, place, cli) => (isWrite ? `wrote nothing on ${place}` : `read nothing from ${place} and did not ask ${cli} instead`)

/** @type {Failed} */
export const UNAVAILABLE = Object.freeze({ failure: 'mcp-unavailable' })
/** @type {Failed} */
export const UNREADABLE = Object.freeze({ failure: 'mcp-unreadable' })

/** @param {McpTools} mcpTools @param {{ server: string, tool: string, arguments: Record<string, unknown> }} request */
export const answerOf = async (mcpTools, request) => {
  const called = await mcpTools.call(request)
  if (!called.ok) return { failure: called.reason, tool: request.tool }
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
