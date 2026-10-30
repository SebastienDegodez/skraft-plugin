#!/usr/bin/env node
// Claude Code trial for #400: whether a mod's code calls an MCP tool and reads its result, without
// the model. A throwaway mod hooks `prompt.submit`, calls `$.mcp.call` on the probe's MCP server
// (the one eng/host-probe/copilot-probe.mjs runs), writes what it got and drops the prompt, so no
// turn starts; the model named is one no provider has, so a hook that failed reaches no model either.
// Run three times: with the probe's read-only tools granted (`--allowedTools`), with nothing granted,
// and with the server granted by a project rule (`permissions.allow` in `.claude/settings.json`).
// It also records the raw shape of what `$.tool.list()` returns.
// A manual trial, not a check: it prints what it saw for docs/v2/host-verification.md.
//
//   node eng/host-probe/claude-mod-mcp-trial.mjs [--claude <claude binary>] [--keep]
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROBE_MCP, writeProbeMcpServers } from './fixtures.mjs'

const UNKNOWN_MODEL = 'skraft-probe-no-such-model'
const RESULT_FILE = 'mcp-trial-result.json'
const GRANTED = [`mcp__${PROBE_MCP.server}__echo`, `mcp__${PROBE_MCP.server}__fail`]

/** The mod's hooks module: each call's value or error, written to RESULT_FILE, then the prompt dropped. */
const registerSource = `import type { Register } from 'claude-code'

const shapeOf = (tool: unknown) => (typeof tool === 'string' ? { type: 'string', name: tool } : { type: typeof tool, keys: Object.keys(tool as object).sort(), name: (tool as any)?.name, mcp: (tool as any)?.mcp })

const attempt = async (call: () => Promise<unknown>) => {
  try { return { value: await call() } } catch (error) { return { error: String((error as Error)?.message ?? error) } }
}

export const register: Register = (on) => {
  on('prompt.submit', async ($) => {
    const seen = {
      tools: await attempt(async () => (await $.tool.list()).filter((tool: any) => String(tool?.name ?? tool).startsWith('mcp__${PROBE_MCP.server}__')).map(shapeOf)),
      listed: await attempt(async () => { const all = await $.tool.list(); return { count: all.length, mcpCount: all.filter((tool: any) => tool?.mcp === true).length } }),
      echo: await attempt(() => $.mcp.call('${PROBE_MCP.server}', 'echo', { text: '${PROBE_MCP.sentinel}' })),
      touch: await attempt(() => $.mcp.call('${PROBE_MCP.server}', 'touch', {})),
      fail: await attempt(() => $.mcp.call('${PROBE_MCP.server}', 'fail', {})),
      unknownTool: await attempt(() => $.mcp.call('${PROBE_MCP.server}', 'no-such-tool', {})),
      failingServer: await attempt(() => $.mcp.call('${PROBE_MCP.failing}', 'echo', {})),
      absentServer: await attempt(() => $.mcp.call('${PROBE_MCP.absent}', 'echo', {})),
    }
    await $.fs.write('${RESULT_FILE}', JSON.stringify(seen, null, 2))
    return { drop: 'skraft probe: measured, no model call' }
  })
}
`

const json = (value) => `${JSON.stringify(value, null, 2)}\n`

/** The mod, the MCP configuration and the working folder of one trial, under root. */
const writeTrial = async (root) => {
  const mod = join(root, 'skraft-mcp-trial')
  await mkdir(join(mod, '.claude-plugin'), { recursive: true })
  await mkdir(join(mod, 'hooks'), { recursive: true })
  await writeFile(join(mod, '.claude-plugin', 'plugin.json'), json({ name: 'skraft-mcp-trial', version: '0.0.0', description: 'skraft host probe: an MCP call from a mod hook (throwaway)' }))
  await writeFile(join(mod, 'hooks', 'hooks.json'), json({ modules: ['./register.ts'] }))
  await writeFile(join(mod, 'hooks', 'register.ts'), registerSource)
  const config = join(root, 'mcp.json')
  await writeFile(config, json({ mcpServers: await writeProbeMcpServers(root, process.execPath) }))
  return { mod, config }
}

/** The project settings of one trial: what a person would write to allow the server. */
const writeSettings = async (cwd, settings) => {
  await mkdir(join(cwd, '.claude'), { recursive: true })
  await writeFile(join(cwd, '.claude', 'settings.json'), json(settings))
}

/** One `claude -p` run in its own working folder; what the mod wrote, or why there is nothing. */
const runTrial = async ({ claude, root, mod, config }, name, allowed, settings) => {
  const cwd = join(root, name)
  await mkdir(cwd, { recursive: true })
  if (settings) await writeSettings(cwd, settings)
  const args = ['-p', 'skraft probe', '--model', UNKNOWN_MODEL, '--plugin-dir', mod, '--mcp-config', config, '--strict-mcp-config', ...(allowed.length > 0 ? ['--allowedTools', allowed.join(',')] : [])]
  const run = spawnSync(claude, args, { cwd, encoding: 'utf8', timeout: 180_000 })
  const file = join(cwd, RESULT_FILE)
  return existsSync(file) ? { allowed, seen: JSON.parse(readFileSync(file, 'utf8')) } : { allowed, status: run.status, stdout: (run.stdout ?? '').slice(-400), stderr: (run.stderr ?? '').slice(-400) }
}

const claudeVersion = (claude) => {
  const run = spawnSync(claude, ['--version'], { encoding: 'utf8' })
  return run.status === 0 ? run.stdout.trim() : null
}

const main = async () => {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--claude')
  const claude = at >= 0 ? resolve(argv[at + 1]) : platform() === 'win32' ? 'claude.cmd' : 'claude'
  const root = await mkdtemp(join(tmpdir(), 'skraft-claude-mcp-trial-'))
  try {
    const trial = { claude, root, ...await writeTrial(root) }
    const report = {
      claude: claudeVersion(claude), node: process.version, os: platform(),
      granted: await runTrial(trial, 'granted', GRANTED),
      ungranted: await runTrial(trial, 'ungranted', []),
      settings: await runTrial(trial, 'settings', [], { permissions: { allow: [`mcp__${PROBE_MCP.server}`] } }),
    }
    console.log(JSON.stringify(report, null, 2))
  } finally {
    if (!argv.includes('--keep')) await rm(root, { recursive: true, force: true })
    else console.error(`trial kept in ${root}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(String(error?.message ?? error))
    process.exitCode = 1
  })
}
