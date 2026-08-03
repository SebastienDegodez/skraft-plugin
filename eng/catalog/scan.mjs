#!/usr/bin/env node
// Deterministic catalogue scan of the shipped SKRAFT plugin.
//
// Reads the source tree only — no model, no network, no eval run — and produces
// the static half of the dashboard: what the plugin ships (skills, agents,
// workers, review lenses), how heavy each skill is, and which ones carry a Vally
// eval spec. The runtime half (did the skill actually help?) comes from the
// Vally experiment and lands in dashboard-data/history.json.
//
//   node eng/catalog/scan.mjs [--root dir] [--out artifacts/catalog/report.json]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { readFrontMatter } from '../lib/front-matter.mjs'
import { profileSkill, summariseEvalSpec } from '../lib/skill-profile.mjs'

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    out: { type: 'string', default: 'artifacts/catalog/report.json' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help) {
  console.log('Usage: node eng/catalog/scan.mjs [--root dir] [--out file]')
  process.exit(0)
}

const repoRoot = resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '../..'))
const posix = (value) => value.split('\\').join('/')
const fromRoot = (path) => posix(relative(repoRoot, path))

const walk = (directory, matches, found = []) => {
  if (!existsSync(directory)) return found
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) walk(path, matches, found)
    else if (matches(entry)) found.push(path)
  }
  return found
}

const findings = []
const warn = (code, path, message) => findings.push({ severity: 'warning', code, path, message })

// ── Skills ─────────────────────────────────────────────────────────
const skillsRoot = join(repoRoot, 'plugins/skills')
const evalsRoot = join(repoRoot, 'tests/skills')


const skills = readdirSync(skillsRoot)
  .filter((name) => existsSync(join(skillsRoot, name, 'SKILL.md')))
  .sort()
  .map((directory) => {
    const skillPath = join(skillsRoot, directory, 'SKILL.md')
    const content = readFileSync(skillPath, 'utf8')
    const { data, body } = readFrontMatter(content)
    const profile = profileSkill(content, body)
    const description = String(data.description ?? '')

    if (!description) warn('SKILL_DESCRIPTION_MISSING', fromRoot(skillPath), 'Skill has no description in its front matter')
    else if (!profile.hasWhenToUse && !/^use\b/i.test(description)) {
      warn('SKILL_ACTIVATION_GUIDANCE', fromRoot(skillPath), 'Skill states no activation guidance ("Use when …")')
    }

    const evalPath = join(evalsRoot, directory, 'eval.yaml')
    const evaluation = existsSync(evalPath)
      ? { path: fromRoot(evalPath), ...summariseEvalSpec(readFileSync(evalPath, 'utf8')) }
      : { path: null, stimuli: 0, runs: 0, trials: 0 }

    return { name: String(data.name || directory), directory, description, path: fromRoot(skillPath), profile, evaluation }
  })

// ── Agents, workers, review lenses ─────────────────────────────────────────
const agentsRoot = join(repoRoot, 'plugins/agents')
const agentKind = (path) => {
  const relativePath = posix(relative(agentsRoot, path))
  if (relativePath.startsWith('workers/')) return 'worker'
  if (relativePath.startsWith('reviewer-lenses/')) return 'lens'
  return 'agent'
}

const agents = walk(agentsRoot, (entry) => entry.endsWith('.agent.md')).map((path) => {
  const { data } = readFrontMatter(readFileSync(path, 'utf8'))
  const description = String(data.description ?? '')
  // The file stem is the stable identity: it is what `copilot --agent` takes and
  // what an evaluation result is keyed on. The front-matter name is a label.
  const id = posix(relative(agentsRoot, path)).replace(/\.agent\.md$/, '').split('/').at(-1)
  if (!description) warn('AGENT_DESCRIPTION_MISSING', fromRoot(path), 'Agent has no description in its front matter')

  return {
    id,
    name: String(data.name || id),
    description,
    path: fromRoot(path),
    kind: agentKind(path),
    model: data.model ? String(data.model) : null,
  }
})

// An eval spec that targets no shipped skill is dead weight — surface it.
if (existsSync(evalsRoot)) {
  for (const directory of readdirSync(evalsRoot).sort()) {
    const evalPath = join(evalsRoot, directory, 'eval.yaml')
    if (!existsSync(evalPath)) continue
    if (skills.some((skill) => skill.directory === directory)) continue
    warn('EVAL_ORPHAN', fromRoot(evalPath), `Eval spec targets '${directory}', which the plugin does not ship`)
  }
}

const manifest = JSON.parse(readFileSync(join(repoRoot, 'plugins/.claude-plugin/plugin.json'), 'utf8'))
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  plugin: {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    path: 'plugins',
  },
  summary: {
    skills: skills.length,
    agents: agents.filter((agent) => agent.kind === 'agent').length,
    workers: agents.filter((agent) => agent.kind === 'worker').length,
    lenses: agents.filter((agent) => agent.kind === 'lens').length,
    evaluatedSkills: skills.filter((skill) => skill.evaluation.path).length,
    warnings: findings.length,
  },
  skills,
  agents,
  findings,
}

const outputPath = resolve(repoRoot, values.out)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `Catalogue: ${report.summary.skills} skills (${report.summary.evaluatedSkills} with an eval spec), ` +
    `${report.summary.agents} agents, ${report.summary.workers} workers, ${report.summary.lenses} lenses → ${fromRoot(outputPath)}`,
)
