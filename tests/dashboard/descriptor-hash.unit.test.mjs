import { deepStrictEqual, notStrictEqual, strictEqual } from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { behaviourHash, isAgentDescriptor, withoutMetadata } from '../../eng/lib/descriptor-hash.mjs'
import { migrateHistory } from '../../eng/lib/descriptor-hash-migration.mjs'
import { withBehaviourBlobs } from '../../eng/lib/eval-reuse.mjs'
import { agentSkills } from '../../eng/vally-agent-executor/agent-descriptor.mjs'

const descriptor = ({ metadata = ['  dispatched_by: Skraft - Orchestrator'], body = '# Agent\n\nDo the work.\n', model = 'sonnet' } = {}) => [
  '---', 'name: software-engineer', 'description: "x"', `model: ${model}`, 'skills:', '  - outside-in-tdd',
  ...(metadata.length ? ['metadata:', ...metadata] : []), '---', '', body,
].join('\n')

const fileHash = (content) => createHash('sha256').update(content).digest('hex')

describe('behaviour hash of an agent descriptor', () => {
  it('does not move when only the metadata block changes', () => {
    strictEqual(
      behaviourHash(descriptor({ metadata: ['  dispatched_by: a', '  skills:', '    - outside-in-tdd', '  genesis_patterns:', '    - A3'] })),
      behaviourHash(descriptor({ metadata: [] })),
    )
  })

  it('moves when the prompt or a field the host reads changes', () => {
    notStrictEqual(behaviourHash(descriptor()), behaviourHash(descriptor({ body: '# Agent\n\nDo other work.\n' })))
    notStrictEqual(behaviourHash(descriptor()), behaviourHash(descriptor({ model: 'opus' })))
  })

  it('keeps a key after the metadata block and leaves a file without frontmatter as it is', () => {
    const later = '---\nname: a\nmetadata:\n  phase: X\ntools:\n  - read\n---\nbody'
    strictEqual(withoutMetadata(later), '---\nname: a\ntools:\n  - read\n---\nbody')
    strictEqual(withoutMetadata('# no fences'), '# no fences')
  })

  it('recognises the plugin agent trees only', () => {
    strictEqual(isAgentDescriptor('plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md'), true)
    strictEqual(isAgentDescriptor('plugins/skraft-framework/com.anthropic.claude-code/agents/software-engineer.md'), true)
    strictEqual(isAgentDescriptor('plugins/skraft-framework/skills/outside-in-tdd/SKILL.md'), false)
  })
})

describe('PR fingerprint tree', () => {
  it('names an agent descriptor by its behaviour hash and leaves other blobs alone', () => {
    const contents = { b1: descriptor(), b2: 'skill' }
    const tree = withBehaviourBlobs([
      { mode: '100644', blob: 'b1', path: 'plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md' },
      { mode: '100644', blob: 'b2', path: 'plugins/skraft-framework/skills/outside-in-tdd/SKILL.md' },
    ], (blob) => contents[blob])
    deepStrictEqual(tree.map(({ blob }) => blob), [`behaviour:${behaviourHash(descriptor())}`, 'b2'])
  })
})

describe('agent skills read by the evaluation tooling', () => {
  it('are the top-level skills, then the on-demand ones', () => {
    deepStrictEqual(agentSkills(descriptor({ metadata: ['  on_demand_skills:', '    - mutation-testing'] })), ['outside-in-tdd', 'mutation-testing'])
  })
})

describe('migration of published verdicts', () => {
  it('re-keys a verdict whose descriptor matches its file hash, and keeps the others', () => {
    const measured = descriptor()
    const history = {
      schemaVersion: 1,
      agents: {
        'software-engineer': [
          { commit: 'c1', descriptorSha: fileHash(measured) },
          { commit: 'c2', descriptorSha: 'not-this-content' },
          { commit: 'c3', descriptorSha: null },
        ],
        gone: [{ commit: 'c1', descriptorSha: 'old' }],
      },
    }
    const { history: migrated, moved, kept } = migrateHistory(history, (commit, agent) => (agent === 'gone' ? null : measured))
    strictEqual(moved, 1)
    deepStrictEqual(migrated.agents['software-engineer'].map(({ descriptorSha }) => descriptorSha), [behaviourHash(measured), 'not-this-content', null])
    deepStrictEqual(kept.map(({ agent, commit }) => `${agent}@${commit}`), ['software-engineer@c2', 'gone@c1'])
  })
})
