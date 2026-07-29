import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseAgentDescriptor } from '../../plugins/src/cli/build-config.mjs'

// Boundary-to-boundary against the REAL repo state: every skill declared in an agent's
// frontmatter must resolve to plugins/skills/<name>/SKILL.md. A declared-but-missing skill
// is a phantom dependency — the agent would announce `[SKILL MISSING] <name>` at runtime.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const agentsDir = join(repoRoot, 'plugins/agents')

const agentFiles = readdirSync(agentsDir, { recursive: true })
  .map(String)
  .filter((entry) => entry.endsWith('.agent.md'))
  .sort()

test('every skill declared by an agent has a SKILL.md file', () => {
  const missing = []

  for (const file of agentFiles) {
    const descriptor = parseAgentDescriptor(readFileSync(join(agentsDir, file), 'utf8'))
    for (const skill of descriptor.skills) {
      if (!existsSync(join(repoRoot, 'plugins/skills', skill, 'SKILL.md'))) {
        missing.push(`${descriptor.name ?? file} → plugins/skills/${skill}/SKILL.md`)
      }
    }
  }

  assert.deepEqual(missing, [], `declared skills without a SKILL.md file:\n${missing.join('\n')}`)
})
