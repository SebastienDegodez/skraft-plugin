import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  MODEL_FAMILIES,
  copilotModelsForFamily,
  floorForRequirement,
  isModelFamily,
  meetsFloor,
} from '../../eng/lib/model-family-policy.mjs'

// User-invocable top-of-loop agents keep `inherit` (session model flows through them).
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
// A list is a PRIORITIZED fallback chain (documented VS Code agent-frontmatter convention:
// "the system tries each model in order until an available one is found") — not a policy
// violation on its own. Returns a string for the scalar form, an array for the list form,
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
  return items.length > 0 ? items : undefined
}

// Extract just the fields the policy needs — minimal, no YAML dependency.
export const parseAgentFrontmatter = (content) => {
  const block = frontmatterOf(content)
  return {
    name: field(block, /^name:\s*(.+?)\s*$/m),
    model: parseModelField(block),
    modelRequirement: field(block, /^\s*model_requirement:\s*"?(.+?)"?\s*$/m),
  }
}

// Rewrite the top-level `model:` field to a single scalar line; everything else stays
// byte-for-byte. Collapses a prior list form (its `- item` continuation lines) too, so
// --apply never leaves orphaned list items dangling under a rewritten scalar.
export const applyModel = (content, model) => {
  const lines = content.split('\n')
  const idx = lines.findIndex((line) => /^model:/.test(line))
  if (idx === -1) return content
  let end = idx + 1
  while (end < lines.length && /^\s+-\s*.+$/.test(lines[end])) end++
  lines.splice(idx, end - idx, `model: ${model}`)
  return lines.join('\n')
}

// A Claude Code agent file declares one family (`haiku|sonnet|opus`); an allow-listed
// top-of-loop agent may declare `inherit`. Returns the problems found, empty when compliant.
export const checkClaudeAgent = (content, { allowList = DEFAULT_ALLOW_LIST } = {}) => {
  const { name, model, modelRequirement } = parseAgentFrontmatter(content)
  if (allowList.has(name) && model === 'inherit') return []
  if (!isModelFamily(model)) {
    const shown = Array.isArray(model) ? model.join(', ') : model
    return [`${name} declares model '${shown}', expected one of: ${MODEL_FAMILIES.join(' | ')}`]
  }
  const floor = floorForRequirement(modelRequirement)
  if (!meetsFloor(model, floor)) return [`${name} declares model '${model}' below its model_requirement floor '${floor}'`]
  return []
}

// Compliant when the declared model is one the family accepts — and, for the prioritized list
// form, when any entry in the chain is accepted.
const modelAccepted = (model, accepted) =>
  Array.isArray(model) ? model.some((entry) => accepted.includes(entry)) : accepted.includes(model)

// Decide what should happen to one Copilot agent file, given the family its Claude Code pair
// declares. A Copilot file that names no model is left to the driver that spawns it.
export const planAgent = (content, { family, allowList = DEFAULT_ALLOW_LIST } = {}) => {
  const { name, model } = parseAgentFrontmatter(content)
  if (allowList.has(name)) return { name, skipped: true, reason: 'allow-list' }
  if (model === undefined) return { name, skipped: true, reason: 'no model' }
  if (!isModelFamily(family)) return { name, skipped: false, currentModel: model, family, unpaired: true, changed: true, accepted: [] }
  const accepted = copilotModelsForFamily(family)
  return { name, skipped: false, currentModel: model, family, resolvedModel: accepted[0], accepted, changed: !modelAccepted(model, accepted) }
}

const findAgentFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.md'))
    .map((entry) => join(dir, String(entry)))

// The Claude Code tree sits beside the Copilot tree in the same plugin root.
const claudeDirFor = (copilotDir) => resolve(copilotDir, '../../com.anthropic.claude-code/agents')

const familyOfPair = (claudeDir, copilotPath) => {
  const pair = join(claudeDir, `${basename(copilotPath).replace(/(?:\.agent)?\.md$/, '')}.md`)
  return existsSync(pair) ? parseAgentFrontmatter(readFileSync(pair, 'utf8')).model : undefined
}

const plansFor = (dir, claudeDir) =>
  findAgentFiles(dir).map((path) => ({
    path,
    ...planAgent(readFileSync(path, 'utf8'), { family: existsSync(claudeDir) ? familyOfPair(claudeDir, path) : undefined }),
  }))

const claudeProblems = (claudeDir) =>
  existsSync(claudeDir) ? findAgentFiles(claudeDir).flatMap((path) => checkClaudeAgent(readFileSync(path, 'utf8'))) : []

const forbiddenModels = (dir) =>
  findAgentFiles(dir)
    .map((path) => parseAgentFrontmatter(readFileSync(path, 'utf8')))
    .filter(({ name, model }) => model !== undefined && !DEFAULT_ALLOW_LIST.has(name))

const describeDrift = (p) => {
  const shown = Array.isArray(p.currentModel) ? p.currentModel.join(', ') : p.currentModel
  if (p.unpaired) return `drift: ${p.name} has '${shown}' but its Claude Code pair declares no model family`
  return `drift: ${p.name} has '${shown}', expected one of: ${p.accepted.join(' | ')}`
}

// Thin orchestration around the pure core; returns an exit code.
export const main = (argv, { log = console.log, error = console.error } = {}) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      check: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      emit: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      dir: { type: 'string', default: 'plugins/skraft-framework/com.github.copilot/agents' },
      'claude-dir': { type: 'string' },
      'forbid-model': { type: 'boolean', default: false },
    },
  })

  const claudeDir = values['claude-dir'] ?? claudeDirFor(values.dir)
  const active = plansFor(values.dir, claudeDir).filter((p) => !p.skipped)

  // A tree whose driver passes the model at spawn (the skraft engine) names none in its files.
  if (values['forbid-model']) {
    const named = forbiddenModels(values.dir)
    for (const { name, model } of named) error(`drift: ${name} names the model '${model}'; the engine passes the model family at spawn`)
    if (named.length > 0) return 1
  }

  if (values.emit) {
    const rows = active.map(({ name, family, currentModel, resolvedModel }) => ({ name, family, currentModel, resolvedModel }))
    if (values.json) log(JSON.stringify(rows, null, 2))
    else for (const row of rows) log(`${row.name}\t${row.family}\t${row.resolvedModel}`)
    return 0
  }

  if (values.apply) {
    const pinnable = active.filter((p) => p.changed && !p.unpaired)
    for (const p of pinnable) {
      writeFileSync(p.path, applyModel(readFileSync(p.path, 'utf8'), p.resolvedModel))
      log(`pinned ${p.name} → ${p.resolvedModel}`)
    }
    if (pinnable.length > 0) log('agent model sources changed — regenerate the guardrail config before committing')
    return 0
  }

  const problems = [...claudeProblems(claudeDir).map((line) => `drift: ${line}`), ...active.filter((p) => p.changed).map(describeDrift)]
  for (const line of problems) error(line)
  if (problems.length > 0) return 1
  log('all agent models match policy')
  return 0
}
