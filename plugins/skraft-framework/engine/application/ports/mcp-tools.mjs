/**
 * McpTools — the MCP servers the host has connected, and one tool of one of them called. A driver
 * supplies it where the host lets the engine call an MCP tool (the Copilot extension's
 * `session.rpc`, the Claude Code mod's `$.mcp`); a host without one (`skraft next`, the CLI) gives
 * none. It never throws: every failure is one of the fixed reasons, never the host's text.
 *
 * @typedef {'mcp-unavailable' | 'mcp-tool-missing' | 'mcp-refused' | 'mcp-failed'} McpFailure
 *   mcp-unavailable: the server is not configured, not connected or in failure; mcp-tool-missing:
 *   the server has no such tool; mcp-refused: the person or the host's policy refused the call;
 *   mcp-failed: the tool ran and answered with an error.
 * @typedef {{ ok: true, text: string } | { ok: false, reason: McpFailure }} McpCall
 *   text: what the tool answered, as text.
 * @typedef {{
 *   servers: () => Promise<string[]>,
 *   call: (request: { server: string, tool: string, arguments: Record<string, unknown> }) => Promise<McpCall>,
 * }} McpTools
 *   servers: the names of the servers connected now, none when the host cannot say.
 */
export {}
