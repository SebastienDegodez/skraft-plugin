/**
 * The Claude Code session's MCP servers as the engine's McpTools (application/ports/mcp-tools.mjs).
 * Measured on Claude Code 2.1.291 and 2.1.314 (docs/v2/host-verification.md): `$.tool.list()` gives
 * objects `{ description, mcp, name }`, `name` = `mcp__<server>__<tool>`, no server list;
 * `$.mcp.call(server, tool, args)` gives `{ content, isError }` once the permission is granted, and
 * under `-p` rejects otherwise on both versions (`… you haven't granted it yet.`), or with
 * `no connected MCP tool …` for a server absent, dead, or without the tool. The interactive
 * session is not measured.
 * Nothing throws out of here; no text of the host is passed on.
 *
 * @typedef {{ tools: () => Promise<Array<{ name: string }>>, call: (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown> }} ModMcp
 *   tools: `$.tool.list`; call: `$.mcp.call`.
 * @param {ModMcp} mcp @returns {import('../../application/ports/mcp-tools.mjs').McpTools}
 */
export const createModMcp = (mcp) => Object.freeze({
  servers: () => serversOf(mcp),
  call: (request) => called(mcp, request),
})

/** The server of an MCP tool's name, as Claude Code spells it. */
const SERVER_OF = /^mcp__(.+?)__./

/** @param {ModMcp} mcp @returns {Promise<string[]>} */
const serversOf = async (mcp) => {
  try {
    const servers = (await mcp.tools()).map(serverOf).filter((server) => server !== null)
    return [...new Set(servers)]
  } catch {
    return []
  }
}

/**
 * The server of one listed tool; null for a tool no MCP server gives.
 * @param {{ name: string }} tool @returns {string | null}
 */
const serverOf = ({ name }) => SERVER_OF.exec(name)?.[1] ?? null

/** Claude Code's own line for a call the person has not allowed, read only to tell it apart; never passed on. */
const NOT_GRANTED = /haven't granted/

/**
 * @param {ModMcp} mcp @param {{ server: string, tool: string, arguments: Record<string, unknown> }} request
 * @returns {Promise<import('../../application/ports/mcp-tools.mjs').McpCall>}
 */
const called = async (mcp, { server, tool, arguments: args }) => {
  try {
    const result = /** @type {{ content?: unknown, isError?: boolean }} */ (await mcp.call(server, tool, args))
    return result?.isError === true ? { ok: false, reason: 'mcp-failed' } : { ok: true, text: textOf(result?.content) }
  } catch (error) {
    return { ok: false, reason: NOT_GRANTED.test(String(/** @type {Error} */ (error)?.message)) ? 'mcp-refused' : 'mcp-unavailable' }
  }
}

/** The text parts of a tool's content, together. @param {unknown} content */
const textOf = (content) => (Array.isArray(content)
  ? content.filter((part) => part?.type === 'text').map((part) => String(part.text)).join('')
  : String(content ?? ''))
