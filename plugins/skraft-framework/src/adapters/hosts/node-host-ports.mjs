import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname, relative, sep } from 'node:path'
import { createJsonStateReader } from '../infrastructure/json-state-reader.mjs'
import { createJsonStateWriter } from '../infrastructure/state/json-state-writer.mjs'
import { resolveTrackingRoot } from '../infrastructure/tracking-root-resolver.mjs'

// The Node half of a host: state, files, git and commands as the CLI already does them.
// A Copilot extension runs in Node, so its adapter is this plus ctx.agent/ctx.pause.
// What stays host-specific (agents, interaction, progress) is passed in.

const listFiles = async (root) => {
  const out = []
  const walk = async (dir) => {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) out.push(relative(root, path).split(sep).join('/'))
    }
  }
  await walk(root)
  return out
}

export const runCommand = (argv, { cwd, timeoutMs = 600_000, signal } = {}) => new Promise((resolve) => {
  const [command, ...args] = argv[0] === 'node' ? [process.execPath, ...argv.slice(1)] : argv
  let stdout = ''
  let stderr = ''
  let settled = false
  const done = (result) => { if (!settled) { settled = true; resolve(result) } }
  const child = spawn(command, args, { cwd, signal, stdio: ['ignore', 'pipe', 'pipe'] })
  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', (error) => { clearTimeout(timer); done({ exitCode: 127, stdout, stderr: `${stderr}${error.message}` }) })
  child.on('close', (code, killed) => { clearTimeout(timer); done({ exitCode: code ?? (killed ? 124 : 1), stdout, stderr }) })
})

export const loadPipelineConfig = (pluginRoot) =>
  JSON.parse(readFileSync(join(pluginRoot, 'skraft-framework.config.json'), 'utf8'))

export const createNodeHostPorts = ({ cwd, env = process.env, pluginRoot, agents, interaction, progress, signal }) => {
  const trackingRoot = resolveTrackingRoot({ env, cwd })
  const trackingPrefix = (slug) => `${relative(cwd, join(trackingRoot, slug)).split(sep).join('/')}/`
  return {
    config: loadPipelineConfig(pluginRoot),
    pluginRoot,
    trackingPrefix,
    stateReader: createJsonStateReader(trackingRoot),
    stateWriter: createJsonStateWriter(trackingRoot),
    trackingFiles: {
      exists: async (slug, rel) => { try { return (await stat(join(trackingRoot, slug, rel))).isFile() } catch { return false } },
      read: (slug, rel) => readFile(join(trackingRoot, slug, rel), 'utf8'),
      list: (slug) => listFiles(join(trackingRoot, slug)),
      write: async (slug, rel, text) => {
        const path = join(trackingRoot, slug, rel)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, text, 'utf8')
      },
    },
    repositoryFiles: { read: async (rel) => { try { return await readFile(join(cwd, rel), 'utf8') } catch { return null } } },
    git: {
      headSha: async () => {
        const { exitCode, stdout } = await runCommand(['git', 'rev-parse', 'HEAD'], { cwd, timeoutMs: 10_000 })
        return exitCode === 0 ? stdout.trim() || null : null
      },
    },
    agents,
    commands: { run: (argv, opts = {}) => runCommand(argv, { cwd, signal, ...opts }) },
    interaction,
    progress,
    clock: { today: () => new Date().toISOString().slice(0, 10), now: () => new Date().toISOString() },
  }
}
