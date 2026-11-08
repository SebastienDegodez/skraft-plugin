import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseYaml } from '../../eng/lib/yaml-parser.mjs'
import { validateSkillDeclarations } from '../../eng/lib/skill-declaration-policy.mjs'

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
  const meta = fm.metadata && typeof fm.metadata === 'object' ? fm.metadata : {}
  return {
    id,
    name: fm.name,
    skills: asArray(fm.skills).map(String),
    onDemandSkills: asArray(meta.on_demand_skills).map(String),
    metadataKeys: Object.keys(meta),
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

// Thin orchestration around the pure core; returns an exit code.
// Validates the skill declarations and the metadata of the agents of `dir`.
export const main = (argv, { log = console.log, error = console.error } = {}) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string', default: 'plugins/skraft-framework/com.github.copilot/agents' },
    },
  })

  const violations = validateSkillDeclarations(descriptorsFrom(values.dir))
  if (violations.length > 0) {
    for (const v of violations) error(`agents: ${v.agent} — ${v.message} (${v.code})`)
    return 1
  }

  log(`skill declarations and metadata are valid (${values.dir})`)
  return 0
}
