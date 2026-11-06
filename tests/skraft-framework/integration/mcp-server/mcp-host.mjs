// An MCP host in this process: it writes JSON-RPC lines to `skraft mcp` and reads the lines the
// server writes back, as Copilot CLI, VS Code or Claude Code would through the server's stdin and
// stdout. It lists its roots when asked, unless told not to answer. No doubles: the server runs the
// real commands on the real Node adapters.
import { pathToFileURL } from 'node:url'
import { runCli } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { inProcessServices } from '../support/workspace.mjs'

/** Lines handed to the server as it reads them, until the host closes its end. */
const inbox = () => {
  /** @type {string[]} */ const queued = []
  /** @type {((value: IteratorResult<string>) => void)[]} */ const readers = []
  let closed = false
  const iterator = {
    next: () => {
      if (queued.length > 0) return Promise.resolve({ value: /** @type {string} */ (queued.shift()), done: false })
      if (closed) return Promise.resolve({ value: undefined, done: true })
      return new Promise((resolve) => readers.push(resolve))
    },
    [Symbol.asyncIterator]() { return this },
  }
  const write = (/** @type {string} */ line) => (readers.length > 0 ? readers.shift()({ value: line, done: false }) : queued.push(line))
  const close = () => {
    closed = true
    for (const reader of readers.splice(0)) reader({ value: undefined, done: true })
  }
  return { iterator, write, close }
}

/**
 * Starts `skraft mcp` in this process.
 * @param {{
 *   roots?: string[] | null, answersRoots?: boolean, workingDirectory?: string | null, patienceMs?: number,
 *   client?: string | null,
 * }} options roots: the folders the host shares, null for a host without roots; client: the name
 *   the host gives at the handshake, VS Code's unless told, null for none; answersRoots:
 *   false for a host that never answers `roots/list`; workingDirectory: the folder the host
 *   started the server in, null for the plugin's own
 */
export const mcpHost = ({ roots = null, answersRoots = true, workingDirectory = null, patienceMs, client = 'Visual Studio Code' } = {}) => {
  const lines = inbox()
  /** @type {any[]} */ const received = []
  /** @type {string[]} */ const log = []
  /** @type {Map<unknown, (message: any) => void>} */ const waiting = new Map()
  let id = 0
  const deliver = (/** @type {any} */ message) => {
    received.push(message)
    if (message.method === 'roots/list' && answersRoots) lines.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { roots: (roots ?? []).map((folder) => ({ uri: pathToFileURL(folder).href, name: folder })) } }))
    else if (message.method === undefined) waiting.get(message.id)?.(message)
  }
  const services = {
    ...inProcessServices(workingDirectory ?? 'not-a-repository'),
    lines: () => lines.iterator,
    at: (/** @type {string} */ directory) => inProcessServices(directory, { confirm: async () => { throw new Error('a tool asked for a confirmation') } }),
    workingDirectory: () => workingDirectory,
    ...(patienceMs === undefined ? {} : { patienceMs }),
  }
  const served = runCli(['mcp'], services, { out: (line) => deliver(JSON.parse(line)), err: (line) => log.push(line) })
  const request = (/** @type {string} */ method, /** @type {object | undefined} */ params) => {
    id += 1
    const answered = new Promise((resolve) => waiting.set(id, resolve))
    lines.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }))
    return answered
  }
  const host = {
    received, log, request,
    write: (/** @type {string} */ line) => lines.write(line),
    notify: (/** @type {string} */ method, /** @type {object | undefined} */ params) => lines.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })),
    /** The handshake, with the roots capability when the host has roots. */
    initialize: async (protocolVersion = '2025-06-18') => {
      const answer = await request('initialize', { protocolVersion, capabilities: roots === null ? {} : { roots: { listChanged: false } }, ...(client === null ? {} : { clientInfo: { name: client, version: '1' } }) })
      host.notify('notifications/initialized')
      return answer
    },
    /** A tool's result. @param {string} name @param {object} [args] @param {object} [meta] */
    call: async (name, args = {}, meta) => (await request('tools/call', { name, arguments: args, ...(meta === undefined ? {} : { _meta: meta }) })).result,
    /** The JSON a tool printed on stdout. @param {string} name @param {object} [args] */
    json: async (name, args = {}) => JSON.parse((await host.call(name, args)).content[0].text),
    /** Closes the server's stdin; its exit code once the calls still running end. */
    close: () => {
      lines.close()
      return served
    },
  }
  return host
}
