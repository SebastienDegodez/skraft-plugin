import { createHash } from 'node:crypto'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

import { readFrontMatter } from '../lib/front-matter.mjs'

const AGENT_PATHS = new Map([
  ['skraft-orchestrator', 'plugins/skraft-framework/agents/skraft-orchestrator.agent.md'],
  ['solution-researcher', 'plugins/skraft-framework/agents/solution-researcher.agent.md'],
  ['solution-architect', 'plugins/skraft-framework/agents/solution-architect.agent.md'],
  ['solution-architect-reviewer', 'plugins/skraft-framework/agents/solution-architect-reviewer.agent.md'],
  ['acceptance-designer', 'plugins/skraft-framework/agents/acceptance-designer.agent.md'],
  ['acceptance-designer-reviewer', 'plugins/skraft-framework/agents/acceptance-designer-reviewer.agent.md'],
  ['software-engineer', 'plugins/skraft-framework/agents/software-engineer.agent.md'],
  ['software-engineer-reviewer', 'plugins/skraft-framework/agents/software-engineer-reviewer.agent.md'],
  ['architecture-boundaries-lens', 'plugins/skraft-framework/agents/reviewer-lenses/architecture-boundaries-lens.agent.md'],
  ['cold-reader-lens', 'plugins/skraft-framework/agents/reviewer-lenses/cold-reader-lens.agent.md'],
  ['quality-gates-lens', 'plugins/skraft-framework/agents/reviewer-lenses/quality-gates-lens.agent.md'],
  ['test-integrity-lens', 'plugins/skraft-framework/agents/reviewer-lenses/test-integrity-lens.agent.md'],
  // DELIVER-phase workers. Internal subagents (`user-invocable: false`), dispatched
  // by software-engineer; a suite selects one directly to grade the wiring it emits
  // without paying for the lead's whole TDD loop around it.
  ['contract-testing-worker', 'plugins/skraft-framework/agents/workers/contract-testing/contract-testing-worker.agent.md'],
  ['mock-integration-worker', 'plugins/skraft-framework/agents/workers/mocking/mock-integration-worker.agent.md'],
  // The handbook reconciler chain. It lives under .github/agents/ rather than
  // plugins/: it maintains the documentation of the plugin and is not itself part
  // of what ships to a consumer repository. The four specialists are here so a
  // stimulus can name them in `tags.subagents` — the orchestrator's whole job is
  // dispatching them, so a suite that could not register them would grade a
  // monologue.
  ['skraft-docs-orchestrator', '.github/agents/skraft-docs-orchestrator.agent.md'],
  ['skraft-docs-placement-architect', '.github/agents/skraft-docs-placement-architect.agent.md'],
  ['skraft-docs-derived-writer', '.github/agents/skraft-docs-derived-writer.agent.md'],
  ['skraft-docs-editorial-writer', '.github/agents/skraft-docs-editorial-writer.agent.md'],
  ['skraft-docs-reviewer', '.github/agents/skraft-docs-reviewer.agent.md'],
])

const posix = (value) => value.split('\\').join('/')

const metadataSequence = (content, key) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) return []

  const lines = match[1].split(/\r?\n/)
  const metadataStart = lines.findIndex((line) => /^metadata:\s*$/.test(line))
  if (metadataStart < 0) return []

  let keyStart = -1
  for (let index = metadataStart + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index])) break
    if (new RegExp(`^  ${key}:\\s*$`).test(lines[index])) {
      keyStart = index
      break
    }
  }
  if (keyStart < 0) return []

  const values = []
  for (let index = keyStart + 1; index < lines.length; index += 1) {
    const item = /^    -\s+(.+?)\s*$/.exec(lines[index])
    if (item) {
      values.push(item[1])
      continue
    }
    if (/^\s*$/.test(lines[index])) continue
    break
  }
  return values
}

const assertInside = (repoRoot, path, label) => {
  const rel = relative(repoRoot, path)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${label} escapes repository root`)
}

const configuredSkills = (repoRoot, agentName) => {
  const configPath = join(repoRoot, 'plugins/skraft-framework/skraft-framework.config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  return (config.agentSkills?.[agentName] ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.name))
}

const sameValues = (left, right) => left.length === right.length && left.every((value, index) => value === right[index])

export const loadAgentDescriptor = (repoRoot, id) => {
  const relativePath = AGENT_PATHS.get(id)
  if (!relativePath) throw new Error(`Agent is not allowlisted: ${id || '<missing>'}`)

  const normalizedRoot = resolve(repoRoot)
  const path = resolve(normalizedRoot, relativePath)
  assertInside(normalizedRoot, path, 'Agent path')

  const content = readFileSync(path, 'utf8')
  const { data, body } = readFrontMatter(content)
  const name = String(data.name ?? '')
  if (!name) throw new Error(`Agent has no name: ${relativePath}`)

  const sourceSkills = metadataSequence(content, 'skills')
  const skills = configuredSkills(normalizedRoot, name)
  if (!sameValues(sourceSkills, skills)) throw new Error(`Agent skill declarations drift from framework config: ${id}`)

  const instructionPaths = metadataSequence(content, 'instructions')
  const instructions = instructionPaths.map((instructionPath) => {
    const instructionFile = resolve(normalizedRoot, instructionPath)
    assertInside(normalizedRoot, instructionFile, 'Instruction path')
    return {
      path: posix(relative(normalizedRoot, instructionFile)),
      content: readFileSync(instructionFile, 'utf8'),
    }
  })

  return {
    id,
    name,
    path: posix(relative(normalizedRoot, path)),
    sha256: createHash('sha256').update(content).digest('hex'),
    description: String(data.description ?? ''),
    declaredModel: String(data.model ?? ''),
    tools: Array.isArray(data.tools) ? data.tools : [],
    skills,
    instructions,
    prompt: body,
  }
}
