#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_COPILOT_AGENTS = join(repoRoot, 'plugins/skraft-framework/com.github.copilot/agents')
export const DEFAULT_CLAUDE_AGENTS = join(repoRoot, 'plugins/skraft-framework/com.anthropic.claude-code/agents')

const posix = (value) => value.split('\\').join('/')

const walk = (directory, suffix, found = []) => {
  if (!existsSync(directory)) return found
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) walk(path, suffix, found)
    else if (entry.endsWith(suffix)) found.push(path)
  }
  return found
}

export const claudeRelativePath = (copilotRelativePath) => {
  if (!copilotRelativePath.endsWith('.agent.md')) {
    throw new Error(`Copilot agent path must end with .agent.md: ${copilotRelativePath}`)
  }
  return copilotRelativePath.slice(0, -'.agent.md'.length) + '.md'
}

export const mirrorDrift = ({
  copilotRoot = DEFAULT_COPILOT_AGENTS,
  claudeRoot = DEFAULT_CLAUDE_AGENTS,
} = {}) => {
  const expected = new Map(
    walk(copilotRoot, '.agent.md').map((path) => {
      const sourceRelative = posix(relative(copilotRoot, path))
      return [claudeRelativePath(sourceRelative), readFileSync(path, 'utf8')]
    }),
  )
  const actual = new Map(
    walk(claudeRoot, '.md').map((path) => [posix(relative(claudeRoot, path)), readFileSync(path, 'utf8')]),
  )

  const missing = [...expected.keys()].filter((path) => !actual.has(path))
  const stale = [...actual.keys()].filter((path) => !expected.has(path))
  const changed = [...expected.keys()].filter((path) => actual.has(path) && actual.get(path) !== expected.get(path))
  return { expected, actual, missing, stale, changed }
}

export const syncAgentMirrors = (options = {}) => {
  const copilotRoot = options.copilotRoot ?? DEFAULT_COPILOT_AGENTS
  const claudeRoot = options.claudeRoot ?? DEFAULT_CLAUDE_AGENTS
  const drift = mirrorDrift({ copilotRoot, claudeRoot })

  for (const path of drift.stale) rmSync(join(claudeRoot, path), { force: true })
  for (const [path, content] of drift.expected) {
    const destination = join(claudeRoot, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, content)
  }

  return { missing: drift.missing, stale: drift.stale, changed: drift.changed }
}

const usage = 'Usage: node scripts/sync-agent-mirrors.mjs --check|--apply'
const args = new Set(process.argv.slice(2))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (args.size !== 1 || (!args.has('--check') && !args.has('--apply'))) {
    console.error(usage)
    process.exit(1)
  }

  if (args.has('--apply')) {
    const changed = syncAgentMirrors()
    const count = changed.missing.length + changed.stale.length + changed.changed.length
    console.log(`synced Claude agent mirror (${count} drift item(s))`)
    process.exit(0)
  }

  const drift = mirrorDrift()
  const problems = [
    ...drift.missing.map((path) => `missing ${path}`),
    ...drift.stale.map((path) => `stale ${path}`),
    ...drift.changed.map((path) => `changed ${path}`),
  ]
  if (problems.length === 0) {
    console.log(`agent mirrors are in sync (${drift.expected.size} agents)`)
    process.exit(0)
  }
  for (const problem of problems) console.error(`drift: ${problem}`)
  process.exit(1)
}
