import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveModel } from '../application/resolve-model.mjs'

// User-invocable top-of-loop agents keep `inherit` (session model flows through them).
const DEFAULT_ALLOW_LIST = new Set(['skraft-orchestrator'])

// Pull the frontmatter block (between the first two `---` fences).
const frontmatterOf = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  return match ? match[1] : ''
}

const field = (block, re) => {
  const m = block.match(re)
  return m ? m[1].trim() : undefined
}

// Extract just the fields the policy needs — minimal, no YAML dependency.
export const parseAgentFrontmatter = (content) => {
  const block = frontmatterOf(content)
  return {
    name: field(block, /^name:\s*(.+?)\s*$/m),
    model: field(block, /^model:\s*(.+?)\s*$/m),
    costRoleClass: field(block, /^\s*cost_role_class:\s*(\w+)/m),
    modelRequirement: field(block, /^\s*model_requirement:\s*"?(.+?)"?\s*$/m),
  }
}

// Rewrite only the top-level `model:` line; everything else stays byte-for-byte.
export const applyModel = (content, model) => content.replace(/^model:.*$/m, `model: ${model}`)

// Decide what should happen to one agent file, purely from its content.
export const planAgent = (content, { allowList = DEFAULT_ALLOW_LIST } = {}) => {
  const { name, model, costRoleClass, modelRequirement } = parseAgentFrontmatter(content)
  if (allowList.has(name)) return { name, skipped: true, reason: 'allow-list' }
  if (costRoleClass === undefined) return { name, skipped: true, reason: 'no cost_role_class' }
  const { model: resolvedModel } = resolveModel({ costRoleClass, modelRequirement })
  return { name, skipped: false, currentModel: model, resolvedModel, changed: model !== resolvedModel }
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
      dir: { type: 'string', default: 'plugins/agents' },
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
    return 0
  }

  const drift = active.filter((p) => p.changed)
  if (drift.length > 0) {
    for (const p of drift) error(`drift: ${p.name} has '${p.currentModel}', expected '${p.resolvedModel}'`)
    return 1
  }
  log('all agent models match policy')
  return 0
}
