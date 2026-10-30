/**
 * The joined Copilot session's MCP servers as the engine's McpTools (application/ports/mcp-tools.mjs).
 * Measured on Copilot CLI 1.0.102-1, SDK 1.0.102-1 (docs/v2/host-verification.md, probe checks
 * `mcp-tool-from-workflow`, `mcp-permission-from-workflow`, `mcp-unavailable-from-workflow`):
 * `rpc.mcp.list()` gives `{ servers: [{ name, status }] }`; `rpc.tools.execute({ name:
 * '<server>-<tool>', arguments })` gives `{ resultType, textResultForLlm }`, `rejected` when the
 * permission is refused, `failure` for a tool the server lacks, and throws for a server not
 * connected. Nothing throws out of here; no text of the host is passed on.
 *
 * @typedef {{ rpc: { mcp: { list: () => Promise<unknown> }, tools: { execute: (request: { name: string, arguments: Record<string, unknown> }) => Promise<unknown> } } }} McpSession
 * @param {{ session: () => McpSession | null }} options the session once joined, null before
 * @returns {import('../../application/ports/mcp-tools.mjs').McpTools}
 */
export const createSessionMcp = ({ session }) => Object.freeze({
  servers: () => connected(session()),
  call: (request) => executed(session(), request),
})

/** @param {McpSession | null} joined @returns {Promise<string[]>} */
const connected = async (joined) => {
  try {
    const listed = /** @type {{ servers?: Array<{ name?: unknown, status?: unknown }> }} */ (await joined?.rpc.mcp.list())
    const servers = listed?.servers ?? []
    return servers.filter(isConnected).map((server) => /** @type {string} */ (server.name))
  } catch {
    return []
  }
}

/** A server the session lists connected, by its name. @param {{ name?: unknown, status?: unknown }} server */
const isConnected = (server) => server?.status === 'connected' && typeof server.name === 'string'

/**
 * @param {McpSession | null} joined @param {{ server: string, tool: string, arguments: Record<string, unknown> }} request
 * @returns {Promise<import('../../application/ports/mcp-tools.mjs').McpCall>}
 */
const executed = async (joined, { server, tool, arguments: args }) => {
  try {
    return outcomeOf(await /** @type {McpSession} */ (joined).rpc.tools.execute({ name: `${server}-${tool}`, arguments: args }))
  } catch {
    return { ok: false, reason: 'mcp-unavailable' }
  }
}

/** What the host's permission handler or the person answers when the call is not let through. */
const REFUSED = new Set(['rejected', 'denied'])

/** @param {any} result @returns {import('../../application/ports/mcp-tools.mjs').McpCall} */
const outcomeOf = (result) => {
  if (result?.resultType === 'success') return { ok: true, text: String(result.textResultForLlm ?? '') }
  return { ok: false, reason: REFUSED.has(result?.resultType) ? 'mcp-refused' : 'mcp-failed' }
}
