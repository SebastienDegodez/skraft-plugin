// What an agent reads must resolve where the plugin is installed: every relative link in
// a descriptor, rule or skill points at a file of the plugin, and nothing names a path of
// this development repository or a variable the harness does not export to agents.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))

const markdownUnder = (dir) => readdirSync(join(PLUGIN, dir), { recursive: true })
  .map(String)
  .filter((path) => path.endsWith('.md'))
  .map((path) => join(PLUGIN, dir, path))

const agentFacingFiles = () => [
  ...markdownUnder('com.github.copilot/agents'),
  ...markdownUnder('com.anthropic.claude-code/agents'),
  ...markdownUnder('skills'),
  ...markdownUnder('assets'),
]

// Markdown link targets outside fenced blocks and inline code (examples, not links).
const linksOf = (text) => {
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
}

const isLocalFileLink = (target) =>
  !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('#') && !target.includes('{') && !target.includes('{{')

test('every relative link an agent can follow resolves inside the plugin', () => {
  const broken = []
  for (const file of agentFacingFiles()) {
    for (const target of linksOf(readFileSync(file, 'utf8')).filter(isLocalFileLink)) {
      const path = resolve(dirname(file), decodeURI(target.split('#')[0]))
      if (!path.startsWith(PLUGIN) || !existsSync(path)) broken.push(`${relative(PLUGIN, file)} → ${target}`)
    }
  }
  assert.deepEqual(broken, [])
})

test('agent-facing text names no development-repository path and no harness-only variable', () => {
  const offences = []
  for (const file of agentFacingFiles()) {
    const text = readFileSync(file, 'utf8')
    const frontmatterLines = text.startsWith('---\n') ? text.slice(0, text.indexOf('\n---\n', 4) + 5).split('\n').length - 1 : 0
    text.split('\n').forEach((line, index) => {
      if (index < frontmatterLines) return
      const where = `${relative(PLUGIN, file)}:${index + 1}`
      if (line.includes('#file:plugins/')) offences.push(`${where} — #file: path of this repository`)
      if (/(?:^|[\s`"'(])plugins\/skraft-framework\//.test(line)) offences.push(`${where} — path of this repository`)
      if (line.includes('CLAUDE_PLUGIN_ROOT')) offences.push(`${where} — $CLAUDE_PLUGIN_ROOT is exported to hooks only; use $SKRAFT_PLUGIN_ROOT`)
    })
  }
  assert.deepEqual(offences, [])
})
