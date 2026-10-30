import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseYaml } from '../../eng/lib/yaml-parser.mjs'
import { buildFrameworkConfig, validateSkillDeclarations } from '../../eng/lib/framework-config-policy.mjs'
import { validateDispatch } from '../../eng/lib/dispatch-policy.mjs'

// Pull the frontmatter block (between the first two `---` fences).
const frontmatterOf = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  return match ? match[1] : ''
}

const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value])

// Map one agent file's frontmatter to the descriptor the domain policy expects.
// Reuses the repo's hand-rolled YAML parser — no runtime dependency.
export const parseAgentDescriptor = (content, { id } = {}) => {
  const block = frontmatterOf(content)
  const fm = block === '' ? {} : parseYaml(block)
  const meta = fm.metadata ?? {}
  return {
    id,
    name: fm.name,
    phase: meta.phase,
    dispatchedBy: meta.dispatched_by,
    phases: asArray(meta.phases),
    userInvocable: fm['user-invocable'] === true,
    skills: asArray(meta.skills).map(String),
    preloadedSkills: fm.skills === undefined ? undefined : asArray(fm.skills).map(String),
    onDemandSkills: asArray(meta.on_demand_skills).map(String),
    inputs: asArray(meta.inputs?.required).map(String),
    context: [...asArray(meta.inputs?.context), ...asArray(meta.inputs?.recommended)].map(String),
    outputs: asArray(meta.outputs).map(String),
  }
}

const findAgentFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.md'))
    .map((entry) => join(dir, String(entry)))
    .sort()

export const descriptorsFrom = (dir) =>
  findAgentFiles(dir).map((path) => parseAgentDescriptor(readFileSync(path, 'utf8'), {
    id: basename(path).replace(/(?:\.agent)?\.md$/, ''),
  }))

// The framework config as the descriptors of `dir` define it, built in memory.
export const frameworkConfigFrom = (dir) => buildFrameworkConfig(descriptorsFrom(dir))

const serialize = (config) => JSON.stringify(config, null, 2) + '\n'

// Thin orchestration around the pure core; returns an exit code.
// Validates the dispatch tree and skill declarations of `dir`; `--emit` also prints the config.
// `--preload` (Claude Code trees) requires the top-level `skills` the host preloads to equal `metadata.skills`.
export const main = (argv, { log = console.log, error = console.error } = {}) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      emit: { type: 'boolean', default: false },
      preload: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      dir: { type: 'string', default: 'plugins/skraft-framework/com.github.copilot/agents' },
    },
  })

  const descriptors = descriptorsFrom(values.dir)

  // Presence invariant guard: bad agent data must never produce a config.
  const violations = validateDispatch(descriptors)
  if (violations.length > 0) {
    for (const v of violations) error(`dispatch: ${v.agent} — ${v.message} (${v.code})`)
    return 1
  }
  const skillViolations = validateSkillDeclarations(descriptors, { requirePreload: values.preload })
  if (skillViolations.length > 0) {
    for (const v of skillViolations) error(`skills: ${v.agent} — ${v.message} (${v.code})`)
    return 1
  }

  if (values.emit) {
    log(serialize(buildFrameworkConfig(descriptors)).trimEnd())
    return 0
  }

  log(`dispatch tree and skill declarations are valid (${values.dir})`)
  return 0
}
