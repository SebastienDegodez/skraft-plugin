import { offeredTools, refusalOf, toolListing } from './mcp-tools.mjs'
import { offeredPrompts, promptListing, promptMessages, promptRefusalOf } from './mcp-prompts.mjs'
import { chosenWorkspace, givenWorkingCopy, rootFolders } from './mcp-roots.mjs'
import { createDecide } from '../../application/decisions/decide-usecase.mjs'

/**
 * `skraft mcp`: the commands of this driver served to an agent host as MCP tools, JSON-RPC over
 * stdin and stdout, one message per line. stdout carries only the protocol; the server's own log
 * goes to stderr. A tool runs the command line it stands for, in the same process, so a tool and
 * the command never differ. skraft_answer alone calls Decide directly, without terminal consent
 * or argv conversion of the human's text.
 *
 * @typedef {import('./run-cli.mjs').CliServices} CliServices
 * @typedef {import('./run-cli.mjs').Console} Console
 * @typedef {(args: string[], services: CliServices, console: Console) => Promise<number>} Run
 * @typedef {{
 *   lines: () => AsyncIterable<string>, at: (directory: string) => CliServices,
 *   workingDirectory: () => string | null, patienceMs?: number,
 *   pluginFolder: () => string, isWorkingCopy: (directory: string) => Promise<boolean>,
 * }} McpServices
 *   lines: the messages the host writes; at: the services of a command run in that folder;
 *   workingDirectory: the folder the host started the server in, null when it is no repository;
 *   patienceMs: how long the host may take to list its roots;
 *   pluginFolder: the folder of the plugin; isWorkingCopy: whether a folder is the root of a git working copy.
 * @typedef {{
 *   services: CliServices & McpServices, run: Run, send: (message: object) => void, log: (line: string) => void,
 *   roots: boolean, loop: boolean, closed: boolean, sent: number, patienceMs: number,
 *   pending: Map<unknown, (answer: unknown) => void>, queue: Promise<unknown>,
 * }} Session
 *   roots: whether the host lists its roots; loop: whether it conducts the agent loop; pending: the requests sent to the host, by id;
 *   queue: tool calls run one after the other, as they share the working copy.
 * @typedef {import('./mcp-tools.mjs').SkraftTool} SkraftTool
 */

/** The protocol versions this server speaks, the latest first. */
export const PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'])

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

// Stryker disable next-line ArithmeticOperator: any patience long enough for a host to answer behaves alike
const ROOTS_PATIENCE_MS = 10 * 1000

/**
 * The hosts that conduct the agent loop: VS Code, by the name it gives at the handshake (its
 * product's long name, read in microsoft/vscode `mcpServerRequestHandler.ts`, not measured).
 * Copilot CLI and Claude Code run the pipeline and the review themselves, so a model there never
 * sees a tool that would start them a second way; an unknown host neither.
 */
const LOOP_HOSTS = new Set(['Visual Studio Code', 'Visual Studio Code - Insiders'])

/** How a story starts, for a host that conducts the agent loop and for one that does not. */
const STARTS = Object.freeze({
  loop: "Only the Skraft - Orchestrator agent conducts a pipeline: hand it the story. It alone calls skraft_start, then skraft_next and skraft_record as each answer's then names.",
  host: "A story or a review runs through the host's own skraft pipeline (the skraft-pipeline and skraft-review workflows on GitHub Copilot CLI, /skraft on Claude Code), which the Skraft orchestrator agent starts; this server starts none.",
})

/** What the host passes to its model when it connects. @param {boolean} loop */
const instructionsFor = (loop) => [
  'skraft runs a delivery pipeline (research, design, distill, deliver) in the repository the host shares.',
  'Before the first prompt in a repository, call skraft_doctor. When its config check fails, or a run is refused with configuration-incomplete, set skraft up with the skraft-init skill, which calls skraft_init.',
  loop ? STARTS.loop : STARTS.host,
  'For a pipeline question, read skraft_status. For unforeseen only, follow skraft_answer host-llm guidance with observed model/cost/unit, without a human dialog. For every other kind, ask the EXACT text and options through the offered native ask_user or askQuestions tool, and request a refusal reason there. Relay ONLY its returned human reply with skraft_answer {key, answer, reason?, workspace}. After successful record resume the SAME workflow run ID; for the MCP loop call skraft_next in the same workspace. Missing native tool or dismissal: report the concrete blocker, leave paused and record nothing, never infer a human answer or use ordinary prose instead.',
  'Publishing, a review verdict comment and the V2 migration keep terminal consent: the person runs skraft publish, skraft review --publish or skraft migrate in their own terminal.',
].join(' ')

/**
 * Serves the host until it closes stdin, then waits for the calls still running.
 * @param {CliServices & McpServices} services @param {Console} console @param {Run} run
 * @returns {Promise<number>}
 */
export const serveMcp = async (services, console, run) => {
  const session = openSession(services, console, run)
  /** @type {Set<Promise<void>>} */
  const running = new Set()
  for await (const line of services.lines()) track(running, receive(session, line))
  closeSession(session)
  await Promise.all(running)
  return 0
}

/** @param {CliServices & McpServices} services @param {Console} console @param {Run} run @returns {Session} */
const openSession = (services, console, run) => ({
  services, run, log: console.err, send: (message) => console.out(JSON.stringify(message)),
  roots: false, loop: false, closed: false, sent: 0, patienceMs: services.patienceMs ?? ROOTS_PATIENCE_MS,
  pending: new Map(), queue: Promise.resolve(),
})

/** @param {Set<Promise<void>>} running @param {Promise<void>} work */
const track = (running, work) => {
  running.add(work)
  work.then(() => running.delete(work))
}

/** Requests waiting on the host get no answer once it is gone, and no tool starts. @param {Session} session */
const closeSession = (session) => {
  session.closed = true
  for (const id of [...session.pending.keys()]) settle(session, { id, error: 'closed' })
}

/** One line from the host; never rejects. @param {Session} session @param {string} line @returns {Promise<void>} */
const receive = async (session, line) => {
  try {
    await handle(session, line)
  } catch (error) {
    session.log(`skraft mcp: a message failed: ${errorText(error)}`)
  }
}

/** @param {Session} session @param {string} line */
const handle = async (session, line) => {
  if (line.trim() === '') return
  const message = parsed(line)
  if (message === undefined) return session.send(failure(null, PARSE_ERROR, 'Parse error'))
  if (!isMessage(message)) return session.send(failure(null, INVALID_REQUEST, 'Invalid Request'))
  if (message.method === undefined) return settle(session, message)
  if (message.id !== undefined) session.send(await answered(session, message))
}

/** @param {string} line @returns {unknown} undefined when the line is no JSON */
const parsed = (line) => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

/** @param {unknown} message @returns {message is Record<string, any>} */
const isMessage = (message) => typeof message === 'object' && message !== null && !Array.isArray(message) && message.jsonrpc === '2.0'

/** The host's answer to a request this server sent; null when it failed. @param {Session} session @param {Record<string, any>} answer */
const settle = (session, { id, result, error }) => {
  const resolve = session.pending.get(id)
  session.pending.delete(id)
  resolve?.(error === undefined ? result : null)
}

/**
 * Asks the host; null when it fails, takes longer than the server's patience, or goes away.
 * @param {Session} session @param {string} method @returns {Promise<unknown>}
 */
const ask = (session, method) => new Promise((resolve) => {
  session.sent += 1
  const id = `skraft-${session.sent}`
  const timer = setTimeout(() => settle(session, { id, error: 'timeout' }), session.patienceMs)
  session.pending.set(id, (answer) => {
    clearTimeout(timer)
    resolve(answer)
  })
  session.send({ jsonrpc: '2.0', id, method })
})

/** A request refused for its parameters, with a message fixed by code. */
class Refused extends Error {}

/** @param {Session} session @param {Record<string, any>} request */
const answered = async (session, { id, method, params }) => {
  const handler = METHODS.get(method)
  if (handler === undefined) return failure(id, METHOD_NOT_FOUND, 'Method not found')
  try {
    return { jsonrpc: '2.0', id, result: await handler(session, params ?? {}) }
  } catch (error) {
    return failed(session, id, error)
  }
}

/** @param {Session} session @param {unknown} id @param {unknown} error */
const failed = (session, id, error) => {
  if (error instanceof Refused) return failure(id, INVALID_PARAMS, error.message)
  session.log(`skraft mcp: a request failed: ${errorText(error)}`)
  return failure(id, INTERNAL_ERROR, 'Internal error')
}

/** @param {unknown} id @param {number} code @param {string} message */
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

/** @param {unknown} error */
const errorText = (error) => (error instanceof Error ? error.stack : String(error))

/** @param {Session} session @param {Record<string, any>} params */
const initialize = (session, { protocolVersion, capabilities, clientInfo }) => {
  session.roots = Boolean(capabilities?.roots)
  session.loop = LOOP_HOSTS.has(clientInfo?.name)
  return {
    protocolVersion: PROTOCOL_VERSIONS.includes(protocolVersion) ? protocolVersion : PROTOCOL_VERSIONS[0],
    capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
    serverInfo: { name: 'skraft', title: 'skraft', version: session.services.pluginVersion() },
    instructions: instructionsFor(session.loop),
  }
}

/** @param {Session} session @param {Record<string, any>} params */
const callTool = async (session, { name, arguments: args = {}, _meta: meta }) => {
  const tool = offeredTools(session.loop).find((each) => each.name === name)
  if (tool === undefined) throw new Refused('Unknown tool')
  const refusal = refusalOf(tool, args)
  if (refusal !== null) return refusedResult(refusal)
  return serially(session, () => runTool(session, tool, args, meta?.progressToken))
}

/** @template T @param {Session} session @param {() => Promise<T>} work @returns {Promise<T>} */
const serially = (session, work) => {
  const done = session.queue.then(work)
  session.queue = done.catch(() => undefined)
  return done
}

/** @param {Session} session @param {SkraftTool} tool @param {Record<string, any>} args @param {unknown} token */
const runTool = async (session, tool, args, token) => {
  const place = await workspaceOf(session, args.workspace)
  if (place.directory === null) return refusedResult(place.reason)
  if (session.closed) return refusedResult('closed: the host closed the connection; nothing ran')
  const captured = capturing(progress(session, token))
  const services = { ...session.services.at(place.directory), confirm: async () => null, then: mcpThen(args.workspace) }
  const code = await guarded(session, tool, () => tool.name === 'skraft_answer'
    ? recordAnswer(services, args, captured.console)
    : session.run(tool.argv(args), services, captured.console))
  return toolResult(code, captured)
}

/** @param {CliServices} services @param {Record<string, any>} args @param {Console} console */
const recordAnswer = async (services, { key, answer, reason, by, model, cost, costUnit }, console) => {
  const outcome = await createDecide(services.adapters()).decide({ key, answer, reason, by, model, cost, costUnit })
  console.out(JSON.stringify(outcome))
  return outcome.ok ? 0 : 1
}

/**
 * The folder a call works in: one the host offers, else the working copy `workspace` names.
 * @param {Session} session @param {string | undefined} named
 */
const workspaceOf = async (session, named) => {
  const folders = await offeredFolders(session)
  if (folders.length > 0 || named === undefined) return chosenWorkspace(folders, named)
  return givenWorkingCopy(named, session.services)
}

/** The host's roots, else the folder it started the server in. @param {Session} session @returns {Promise<string[]>} */
const offeredFolders = async (session) => {
  const roots = session.roots ? rootFolders(await ask(session, 'roots/list')) : []
  if (roots.length > 0) return roots
  const here = session.services.workingDirectory()
  return here === null ? [] : [here]
}

/**
 * What a loop step names to call next: the tool, with the same workspace.
 * @param {string | undefined} workspace @returns {import('./agent-loop.mjs').LoopThen}
 */
const mcpThen = (workspace) => {
  const call = (/** @type {string} */ tool, /** @type {object} */ args) =>
    `call the ${tool} tool with ${JSON.stringify(workspace === undefined ? args : { ...args, workspace })}`
  return { next: call('skraft_next', {}), record: call('skraft_record', {}), review: ({ number }) => call('skraft_review', { pr: number, record: true }) }
}

/**
 * The command's output, line by line; each line of its log goes to the host as progress when it
 * asked for it, which keeps a long run from timing out.
 * @param {(line: string) => void} onLog
 */
const capturing = (onLog) => {
  /** @type {string[]} */ const out = []
  /** @type {string[]} */ const err = []
  const console = { out: (/** @type {string} */ line) => { out.push(line) }, err: (/** @type {string} */ line) => { err.push(line); onLog(line) } }
  return { out, err, console }
}

/** @param {Session} session @param {unknown} token */
const progress = (session, token) => {
  if (typeof token !== 'string' && typeof token !== 'number') return () => undefined
  let count = 0
  return (/** @type {string} */ line) => {
    count += 1
    session.send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: count, message: line } })
  }
}

/** The command's exit code; null when it threw, which only the server's log details. @param {Session} session @param {SkraftTool} tool @param {() => Promise<number>} work */
const guarded = async (session, tool, work) => {
  try {
    return await work()
  } catch (error) {
    session.log(`skraft mcp: ${tool.name} failed: ${errorText(error)}`)
    return null
  }
}

/**
 * stdout, then the log; an error only when the command failed without an answer on stdout (a
 * failing gate or doctor still answers).
 * @param {number | null} code @param {{ out: string[], err: string[] }} captured
 */
const toolResult = (code, { out, err }) => {
  if (code === null) return refusedResult('skraft could not finish this call; the log of the skraft MCP server says why')
  const content = [out, err].filter((lines) => lines.length > 0).map((lines) => ({ type: 'text', text: lines.join('\n') }))
  return { content: content.length > 0 ? content : [{ type: 'text', text: `exit code ${code}` }], isError: code !== 0 && out.length === 0 }
}

/** @param {string} text */
const refusedResult = (text) => ({ content: [{ type: 'text', text }], isError: true })

/** @param {Session} session @param {Record<string, any>} params */
const getPrompt = (session, { name, arguments: args = {} }) => {
  const prompt = offeredPrompts(session.loop).find((each) => each.name === name)
  if (prompt === undefined) throw new Refused('Unknown prompt')
  const refusal = promptRefusalOf(prompt, args)
  if (refusal !== null) throw new Refused(refusal)
  return promptMessages(prompt, args)
}

/** What each request method answers. @type {Map<unknown, (session: Session, params: Record<string, any>) => unknown>} */
const METHODS = new Map([
  ['initialize', initialize],
  ['ping', () => ({})],
  ['tools/list', (session) => ({ tools: offeredTools(session.loop).map(toolListing) })],
  ['tools/call', callTool],
  ['prompts/list', (session) => ({ prompts: offeredPrompts(session.loop).map(promptListing) })],
  ['prompts/get', getPrompt],
])
