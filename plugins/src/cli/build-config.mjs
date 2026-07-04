import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseYaml } from '../../../scripts/lib/book.mjs'
import { buildFrameworkConfig } from '../domain/framework-config-policy.mjs'
import { validateDispatch } from '../domain/dispatch-policy.mjs'

// Pull the frontmatter block (between the first two `---` fences).
const frontmatterOf = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  return match ? match[1] : ''
}

const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value])

// Map one agent file's frontmatter to the descriptor the domain policy expects.
// Reuses the repo's hand-rolled YAML parser — no runtime dependency.
export const parseAgentDescriptor = (content) => {
  const block = frontmatterOf(content)
  const fm = block === '' ? {} : parseYaml(block)
  const meta = fm.metadata ?? {}
  return {
    name: fm.name,
    phase: meta.phase,
    dispatchedBy: meta.dispatched_by,
    phases: asArray(meta.phases),
    skills: asArray(meta.skills).map(String),
    inputs: asArray(meta.inputs?.required).map(String),
    outputs: asArray(meta.outputs).map(String),
  }
}

const findAgentFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.agent.md'))
    .map((entry) => join(dir, String(entry)))
    .sort()

const descriptorsFrom = (dir) =>
  findAgentFiles(dir).map((path) => parseAgentDescriptor(readFileSync(path, 'utf8')))

const serialize = (config) => JSON.stringify(config, null, 2) + '\n'

// Provenance stamp: which plugin version generated this config. Deliberately
// byte-stable (no timestamp) so the --check byte comparison keeps working.
// The check-freshness gate compares it against plugin.json (version SSOT).
const generatorVersionFrom = (manifestPath) => {
  try { return JSON.parse(readFileSync(manifestPath, 'utf8')).version } catch { return undefined }
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
      dir: { type: 'string', default: 'plugins/agents' },
      out: { type: 'string', default: 'plugins/skraft-framework.config.json' },
      'plugin-manifest': { type: 'string', default: 'plugins/.claude-plugin/plugin.json' },
    },
  })

  const descriptors = descriptorsFrom(values.dir)

  // Presence invariant guard: bad agent data must never produce a config.
  const violations = validateDispatch(descriptors)
  if (violations.length > 0) {
    for (const v of violations) error(`dispatch: ${v.agent} — ${v.message} (${v.code})`)
    return 1
  }

  const generatorVersion = generatorVersionFrom(values['plugin-manifest'])
  const rendered = serialize({
    ...(generatorVersion ? { _meta: { generatorVersion } } : {}),
    ...buildFrameworkConfig(descriptors),
  })

  if (values.emit) {
    log(rendered.trimEnd())
    return 0
  }

  if (values.apply) {
    writeFileSync(values.out, rendered)
    log(`wrote ${values.out}`)
    return 0
  }

  // Default action (and --check): the committed config must match a fresh build.
  const committed = existsSync(values.out) ? readFileSync(values.out, 'utf8') : null
  if (committed === rendered) {
    log(`guardrail configuration is in sync (${values.out})`)
    return 0
  }
  error(`drift: ${values.out} is out of sync with the agent descriptors — run config:build`)
  return 1
}
