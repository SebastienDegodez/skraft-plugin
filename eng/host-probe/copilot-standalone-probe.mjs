#!/usr/bin/env node
// Measures how the GitHub Copilot host loads the standalone plugins, skraft-design and
// skraft-deliver: no model call, no AI credit. Each session is opened on a temporary Git
// repository with one plugin under `pluginDirectories`, its lists read, then closed.
//
//   node eng/host-probe/copilot-standalone-probe.mjs --sdk <copilot-sdk dir> [--out <dir>]
//
// The CLI the SDK starts is the `index.js` next to the SDK folder unless COPILOT_CLI_PATH names one.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RPC_MS = 30_000
const TOOLS_MS = 45_000

const withTimeout = (promise, ms, label) => {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: no answer within ${ms} ms`)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const messageOf = (error) => String(error?.message ?? error)

/** The tools the descriptors of a plugin's Copilot tree declare from its own MCP server. */
export const declaredServerTools = (agentsDir, server) => [...new Set(readdirSync(agentsDir).filter((name) => name.endsWith('.agent.md'))
  .flatMap((name) => readFileSync(join(agentsDir, name), 'utf8').split('\n').map((line) => line.trim()).filter((line) => line.startsWith(`- ${server}/`)).map((line) => line.slice(2))))].sort()

/** The MCP tools the plugin's engine declares, by name. */
const engineTools = async (plugin) => {
  const kind = plugin.replace(/^skraft-/, '')
  const { STANDALONE_TOOLS } = await import(pathToFileURL(join(REPO_ROOT, 'plugins', plugin, 'engine', 'drivers', 'cli', 'standalone-tools.mjs')).href)
  return STANDALONE_TOOLS.map(({ name }) => name).filter((name) => name.startsWith(`skraft_${kind}_`)).sort()
}

const permissionHandler = (sdk) => async (request, invocation) => {
  if (typeof sdk.approveAll === 'function') {
    try { return await sdk.approveAll(request, invocation) } catch { /* fall through */ }
  }
  return { kind: 'approve-once' }
}

const gitRepo = async () => {
  const root = await mkdtemp(join(tmpdir(), 'skraft standalone probe '))
  spawnSync('git', ['init', '--quiet', '--initial-branch=main', root])
  return root
}

/** The names of the session's current tools, polled until one of `wanted` is offered or the time is up. */
const offeredTools = async (session, wanted) => {
  const deadline = Date.now() + TOOLS_MS
  for (;;) {
    let names = []
    try {
      await withTimeout(session.rpc.tools.initializeAndValidate(), RPC_MS, 'tools.initializeAndValidate').catch(() => undefined)
      names = ((await withTimeout(session.rpc.tools.getCurrentMetadata(), RPC_MS, 'tools.getCurrentMetadata'))?.tools ?? []).map(({ name }) => name)
    } catch { /* retried */ }
    if (wanted.some((name) => names.includes(name)) || Date.now() >= deadline) return names.sort()
    await sleep(1000)
  }
}

const open = (sdk, client, workingDirectory, plugin, extra = {}) => withTimeout(client.createSession({
  workingDirectory, pluginDirectories: [join(REPO_ROOT, 'plugins', plugin)], onPermissionRequest: permissionHandler(sdk), ...extra,
}), RPC_MS, 'createSession')

/** One plugin's checks, each with what it expected and what the host gave. */
const pluginChecks = async ({ sdk, client }, plugin) => {
  const workingDirectory = await gitRepo()
  const agentsDir = join(REPO_ROOT, 'plugins', plugin, 'com.github.copilot', 'agents')
  const agentIds = readdirSync(agentsDir).filter((name) => name.endsWith('.agent.md')).map((name) => name.replace(/\.agent\.md$/, '')).sort()
  const expectedTools = await engineTools(plugin)
  const declared = declaredServerTools(agentsDir, plugin)
  const checks = []
  try {
    const session = await open(sdk, client, workingDirectory, plugin)
    try {
      checks.push(await serverCheck(session, plugin, expectedTools))
      checks.push(await sessionToolNames(session, plugin, expectedTools))
      checks.push(await agentsCheck(session, plugin, agentIds))
      checks.push(await skillsCheck(session, plugin))
    } finally {
      await session.disconnect?.().catch(() => undefined)
    }
    for (const tool of declared) checks.push(await declaredReach({ sdk, client }, workingDirectory, plugin, tool))
  } finally {
    await rm(workingDirectory, { recursive: true, force: true })
  }
  return checks
}

const serverCheck = async (session, plugin, expected) => {
  try {
    const servers = (await withTimeout(session.rpc.mcp.list(), RPC_MS, 'mcp.list'))?.servers ?? []
    const server = servers.find(({ name }) => name === plugin)
    if (!server) return { id: `${plugin}:mcp-server`, verdict: 'fail', expected: `the session lists the MCP server ${plugin}`, observed: { servers: servers.map(({ name, status }) => ({ name, status })) } }
    const tools = ((await withTimeout(session.rpc.mcp.listTools({ serverName: plugin }), RPC_MS, 'mcp.listTools'))?.tools ?? []).map(({ name }) => name).sort()
    const missing = expected.filter((name) => !tools.includes(name))
    return { id: `${plugin}:mcp-server`, verdict: missing.length === 0 ? 'pass' : 'fail', expected: `the MCP server ${plugin} lists every tool of its engine`, observed: { status: server.status ?? null, tools, missing } }
  } catch (error) {
    return { id: `${plugin}:mcp-server`, verdict: 'inconclusive', expected: `the session lists the MCP server ${plugin}`, observed: { error: messageOf(error) } }
  }
}

/** The name the host gives the main agent for each engine tool: the name a descriptor's `tools:` must match. */
const sessionToolNames = async (session, plugin, expected) => {
  const names = await offeredTools(session, expected.map((name) => `${plugin}-${name}`))
  const ours = names.filter((name) => expected.some((tool) => name.endsWith(tool)))
  return { id: `${plugin}:tool-names`, verdict: ours.length === expected.length ? 'pass' : 'fail', expected: 'the main agent is offered each engine tool, under a name the probe reports', observed: { offered: ours } }
}

const agentsCheck = async (session, plugin, ids) => {
  try {
    const listed = (await withTimeout(session.rpc.agent.list({}), RPC_MS, 'agent.list'))?.agents ?? []
    const names = listed.map(({ id, name }) => id ?? name)
    const found = ids.map((id) => ({ id, as: names.filter((name) => name === id || name.endsWith(`:${id}`) || name.endsWith(`/${id}`)) }))
    const missing = found.filter(({ as }) => as.length === 0).map(({ id }) => id)
    return { id: `${plugin}:agents`, verdict: missing.length === 0 ? 'pass' : 'fail', expected: `each agent of ${plugin}/com.github.copilot/agents/ is listed by the session`, observed: { found, missing } }
  } catch (error) {
    return { id: `${plugin}:agents`, verdict: 'inconclusive', expected: 'each plugin agent is listed', observed: { error: messageOf(error) } }
  }
}

const skillsCheck = async (session, plugin) => {
  const own = readdirSync(join(REPO_ROOT, 'plugins', plugin, 'skills')).sort()
  try {
    const listed = ((await withTimeout(session.rpc.skills.list(), RPC_MS, 'skills.list'))?.skills ?? []).map(({ name }) => name)
    const missing = own.filter((name) => !listed.some((one) => one === name || one.endsWith(`:${name}`)))
    return { id: `${plugin}:skills`, verdict: missing.length === 0 ? 'pass' : 'fail', expected: `each skill of ${plugin}/skills/ is listed by the session`, observed: { skills: own.length, missing, sample: listed.filter((name) => own.some((one) => name.endsWith(one))).slice(0, 4) } }
  } catch (error) {
    return { id: `${plugin}:skills`, verdict: 'inconclusive', expected: 'each plugin skill is listed', observed: { error: messageOf(error) } }
  }
}

/** Whether an agent whose `tools:` names a server tool as the descriptors do is offered it, and one that names another is not. */
const declaredReach = async (context, workingDirectory, plugin, declaredAs) => {
  const id = `${plugin}:reach ${declaredAs}`
  const offered = async (tools) => {
    const session = await open(context.sdk, context.client, workingDirectory, plugin, { customAgents: [{ name: 'reach', description: 'reach probe', prompt: 'probe', tools }], agent: 'reach' })
    try { return await offeredTools(session, [declaredAs.replace('/', '-')]) } finally { await session.disconnect?.().catch(() => undefined) }
  }
  try {
    const tool = declaredAs.split('/')[1]
    const [declared, control] = [await offered([declaredAs]), await offered(['view'])]
    const reached = declared.some((name) => name.endsWith(tool))
    const leaked = control.some((name) => name.endsWith(tool))
    return { id, verdict: reached && !leaked ? 'pass' : 'fail', expected: `an agent whose tools: names ${declaredAs} is offered it, one that names another tool is not`, observed: { declared: declared.filter((name) => name.endsWith(tool)), control: control.filter((name) => name.endsWith(tool)) } }
  } catch (error) {
    return { id, verdict: 'inconclusive', expected: `the reach of ${declaredAs}`, observed: { error: messageOf(error) } }
  }
}

const loadSdk = async (dir) => {
  const entry = join(resolve(dir), 'index.js')
  if (!existsSync(entry)) throw new Error(`no index.js in ${dir}`)
  const cli = join(dirname(resolve(dir)), 'index.js')
  if (!process.env.COPILOT_CLI_PATH && existsSync(cli)) process.env.COPILOT_CLI_PATH = cli
  return import(pathToFileURL(entry).href)
}

const main = async () => {
  const { values } = parseArgs({ options: { sdk: { type: 'string' }, out: { type: 'string', default: 'host-probe-results' } } })
  if (!values.sdk) throw new Error('pass --sdk <copilot-sdk dir>, for example ~/.cache/copilot/pkg/<platform>/<version>/copilot-sdk')
  const sdk = await loadSdk(values.sdk)
  const client = new sdk.CopilotClient({ logLevel: 'error' })
  await client.start()
  const checks = []
  try {
    for (const plugin of ['skraft-design', 'skraft-deliver']) checks.push(...await pluginChecks({ sdk, client }, plugin))
  } finally {
    await client.stop().catch(() => undefined)
  }
  const report = { date: new Date().toISOString(), cli: process.env.COPILOT_CLI_PATH ?? null, sdk: resolve(values.sdk), checks }
  mkdirSync(values.out, { recursive: true })
  writeFileSync(join(values.out, 'copilot-standalone.json'), `${JSON.stringify(report, null, 2)}\n`)
  for (const { id, verdict } of checks) console.log(`${verdict.padEnd(12)} ${id}`)
  process.exitCode = checks.some(({ verdict }) => verdict !== 'pass') ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
