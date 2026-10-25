// What an evaluation subject reads besides its own spec folder, read from a
// commit: the companion skills its sidecar mounts, the files its spec stages,
// and — for an agent suite — the agent ids its stimuli exercise and the skills
// their descriptors load. Shared by the
// matrix planner (which subjects a PR changed) and the reuse planner (what a
// subject's fingerprint hashes), so the two never disagree.
//
// `yaml` is loaded on first use: listing every subject (--all, --subject) never
// needs it. A spec that cannot be parsed throws.
import { spawnSync } from 'node:child_process'

import { exercisedAgents } from './lib/changed-skills.mjs'
import { parseCompanions, stagedSources } from './lib/eval-reuse.mjs'
import { agentPathOf, metadataSequence } from './vally-agent-executor/agent-descriptor.mjs'

const show = (rev, path, cwd) => {
  const result = spawnSync('git', ['show', `${rev}:${path}`], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return result.status === 0 ? result.stdout : null
}

// The skills the exercised agents load, read from the descriptor the executor
// registers for each (its allowlist), the way it reads them.
const loadedSkills = (rev, agents, cwd) => {
  const skills = agents.flatMap((id) => {
    const path = agentPathOf(id)
    const content = path ? show(rev, path, cwd) : null
    return content === null ? [] : [...metadataSequence(content, 'skills'), ...metadataSequence(content, 'on_demand_skills')]
  })
  return [...new Set(skills)].sort()
}

let parse
const parseYaml = async (text) => {
  parse ??= (await import('yaml')).parse
  return parse(text)
}

/**
 * @param {string} rev the commit to read from
 * @param {{ kind: 'skill' | 'agent', name: string }} entry
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<{ companions: string[], staged: string[], agents?: string[] | null, skills?: string[] }>}
 */
export async function subjectInputsAt(rev, entry, { cwd } = {}) {
  const specDir = `tests/${entry.kind === 'agent' ? 'agents' : 'skills'}/${entry.name}`
  const text = show(rev, `${specDir}/eval.yaml`, cwd)
  const spec = text === null ? null : await parseYaml(text)
  const staged = stagedSources(spec, specDir)
  if (entry.kind === 'agent') {
    const agents = exercisedAgents(spec)
    return { companions: [], staged, agents, skills: loadedSkills(rev, agents ?? [], cwd) }
  }
  const sidecar = show(rev, `${specDir}/eval.skill-dir.yaml`, cwd)
  return { companions: sidecar === null ? [] : parseCompanions(sidecar), staged }
}
