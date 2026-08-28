import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveModel } from '../application/resolve-model.mjs'

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
    costRoleClass: field(block, /^\s*cost_role_class:\s*(\w+)/m),
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

// Compliant when the declared model is one the tier accepts — and, for the prioritized list
// form, when any entry in the chain is accepted. A tier that accepts several models never
// forces a rewrite of an agent already sitting on one of them.
const modelAccepted = (model, accepted) =>
  Array.isArray(model) ? model.some((entry) => accepted.includes(entry)) : accepted.includes(model)

// Decide what should happen to one agent file, purely from its content.
export const planAgent = (content, { allowList = DEFAULT_ALLOW_LIST } = {}) => {
  const { name, model, costRoleClass, modelRequirement } = parseAgentFrontmatter(content)
  if (allowList.has(name)) return { name, skipped: true, reason: 'allow-list' }
  if (costRoleClass === undefined) return { name, skipped: true, reason: 'no cost_role_class' }
  const { model: resolvedModel, accepted } = resolveModel({ costRoleClass, modelRequirement })
  return { name, skipped: false, currentModel: model, resolvedModel, accepted, changed: !modelAccepted(model, accepted) }
}

const findAgentFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.agent.md'))
    .map((entry) => join(dir, String(entry)))

const plansFor = (dir, options) =>
  findAgentFiles(dir).map((path) => ({ path, ...planAgent(readFileSync(path, 'utf8'), options) }))

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
    },
  })

  const plans = plansFor(values.dir, {})
  const active = plans.filter((p) => !p.skipped)

  if (values.emit) {
    if (values.json) {
      log(JSON.stringify(active.map(({ name, currentModel, resolvedModel }) => ({ name, currentModel, resolvedModel })), null, 2))
    } else {
      for (const p of active) log(`${p.name}\t${p.resolvedModel}`)
    }
    return 0
  }

  if (values.apply) {
    for (const p of active.filter((p) => p.changed)) {
      writeFileSync(p.path, applyModel(readFileSync(p.path, 'utf8'), p.resolvedModel))
      log(`pinned ${p.name} → ${p.resolvedModel}`)
    }
    if (active.some((p) => p.changed)) {
      log('agent model sources changed — run npm run agents:sync before committing')
    }
    return 0
  }

  const drift = active.filter((p) => p.changed)
  if (drift.length > 0) {
    for (const p of drift) {
      const shown = Array.isArray(p.currentModel) ? p.currentModel.join(', ') : p.currentModel
      error(`drift: ${p.name} has '${shown}', expected one of: ${p.accepted.join(' | ')}`)
    }
    return 1
  }
  log('all agent models match policy')
  return 0
}
