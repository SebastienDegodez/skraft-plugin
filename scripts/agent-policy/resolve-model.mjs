import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { CLAUDE_ALIASES, isClaudeAgentModel } from '../../eng/lib/model-family-policy.mjs'

// User-invocable top-of-loop agents keep `inherit` in their Copilot file (session model flows through them).
const DEFAULT_ALLOW_LIST = new Set(['skraft-orchestrator', 'Skraft - Orchestrator'])

// Pull the frontmatter block (between the first two `---` fences).
const frontmatterOf = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  return match ? match[1] : ''
}

const field = (block, re) => {
  const m = block.match(re)
  return m ? m[1].trim() : undefined
}

// `model:` accepts either a scalar (`model: X`) or a YAML block list (`model:\n  - X\n  - Y`).
// A list is a PRIORITIZED fallback chain (VS Code agent-frontmatter convention). Returns a
// string for the scalar form, an array for the list form, '' when the line carries no value,
// or undefined when the field is absent.
const parseModelField = (block) => {
  const lines = block.split('\n')
  const idx = lines.findIndex((line) => /^model:/.test(line))
  if (idx === -1) return undefined
  const inline = lines[idx].match(/^model:\s*(.+?)\s*$/)
  const inlineValue = inline ? inline[1].trim() : ''
  if (inlineValue !== '') return inlineValue
  const items = []
  for (let i = idx + 1; i < lines.length; i++) {
    const item = lines[i].match(/^\s*-\s*(.+?)\s*$/)
    if (!item) break
    items.push(item[1].trim())
  }
  return items.length > 0 ? items : ''
}

// Extract just the fields the policy needs — minimal, no YAML dependency.
export const parseAgentFrontmatter = (content) => {
  const block = frontmatterOf(content)
  return {
    name: field(block, /^name:\s*(.+?)\s*$/m),
    model: parseModelField(block),
  }
}

const shown = (model) => (Array.isArray(model) ? model.join(', ') : model)

// A Claude Code agent file names a Claude Code alias or `inherit`: its model when skraft passes
// none. Returns the problems found, empty when compliant.
export const checkClaudeAgent = (content) => {
  const { name, model } = parseAgentFrontmatter(content)
  if (isClaudeAgentModel(model)) return []
  return [`${name} declares model '${shown(model)}', expected a Claude Code alias (${CLAUDE_ALIASES.join(', ')}) or inherit; the model family lives in the skraft configuration`]
}

// A Copilot agent file either names no model (its host or driver chooses) or names a non-empty
// one; any name is accepted, since Copilot model names change faster than this check could.
export const checkCopilotAgent = (content) => {
  const { name, model } = parseAgentFrontmatter(content)
  return model === '' ? [`${name} declares an empty model`] : []
}

const findAgentFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.md'))
    .map((entry) => join(dir, String(entry)))

// The Claude Code tree sits beside the Copilot tree in the same plugin root.
const claudeDirFor = (copilotDir) => resolve(copilotDir, '../../com.anthropic.claude-code/agents')

const problemsIn = (dir, check) =>
  existsSync(dir) ? findAgentFiles(dir).flatMap((path) => check(readFileSync(path, 'utf8'))) : []

const forbiddenModels = (dir) =>
  findAgentFiles(dir)
    .map((path) => parseAgentFrontmatter(readFileSync(path, 'utf8')))
    .filter(({ name, model }) => model !== undefined && !DEFAULT_ALLOW_LIST.has(name))

// Thin orchestration around the pure core; returns an exit code.
export const main = (argv, { log = console.log, error = console.error } = {}) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      check: { type: 'boolean', default: false },
      dir: { type: 'string', default: 'plugins/skraft-framework/com.github.copilot/agents' },
      'claude-dir': { type: 'string' },
      'forbid-model': { type: 'boolean', default: false },
    },
  })

  const claudeDir = values['claude-dir'] ?? claudeDirFor(values.dir)

  // A tree whose driver passes the model at spawn (the skraft engine) names none in its files.
  if (values['forbid-model']) {
    const named = forbiddenModels(values.dir)
    for (const { name, model } of named) error(`drift: ${name} names the model '${shown(model)}'; the engine passes the model family at spawn`)
    if (named.length > 0) return 1
  }

  const problems = [...problemsIn(claudeDir, checkClaudeAgent), ...problemsIn(values.dir, checkCopilotAgent)].map((line) => `drift: ${line}`)
  for (const line of problems) error(line)
  if (problems.length > 0) return 1
  log('all agent models match policy')
  return 0
}
