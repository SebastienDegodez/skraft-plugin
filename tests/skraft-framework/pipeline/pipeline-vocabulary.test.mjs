// The engineering pipeline descriptors and the orchestrator's rules must speak the
// pipeline the state CLI implements: phases from skraft-framework.config.json, every
// state write through state.mjs, one tracking layout. A retired term here is an
// instruction the runtime can no longer honour.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const ENGINEERING_AGENTS = [
  'skraft-orchestrator',
  'solution-researcher',
  'solution-architect',
  'solution-architect-reviewer',
  'acceptance-designer',
  'acceptance-designer-reviewer',
  'software-engineer',
  'software-engineer-reviewer',
]

const sources = () => [
  ...ENGINEERING_AGENTS.flatMap((id) => [
    `com.github.copilot/agents/${id}.agent.md`,
    `com.anthropic.claude-code/agents/${id}.md`,
  ]),
  ...readdirSync(`${PLUGIN}com.github.copilot/rules`).map((file) => `com.github.copilot/rules/${file}`),
]

const RETIRED = [
  [/\bDISCOVER\b/, 'DISCOVER is a product workflow, not an engineering phase'],
  [/\bbare layout\b/i, 'the tracking layout is always .copilot-tracking/skraft-plans'],
  [/state\.mjs"?\s+migrate\b|\|\s*`migrate`\s*\|/, 'state.mjs has no migrate subcommand'],
  [/\bdirect-edit/i, 'state.json is written through state.mjs only'],
  [/skipPhases|entry-point-routing/, 'upstream entry-point routing is retired'],
]

test('engineering descriptors and rules name no retired pipeline mechanism', () => {
  const offences = []
  for (const relative of sources()) {
    const lines = readFileSync(`${PLUGIN}${relative}`, 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const [pattern, why] of RETIRED) {
        if (pattern.test(line)) offences.push(`${relative}:${index + 1} — ${why}`)
      }
    })
  }
  assert.deepEqual(offences, [])
})

test('the orchestrator names every published phase in order', () => {
  const { phaseOrder } = JSON.parse(readFileSync(`${PLUGIN}skraft-framework.config.json`, 'utf8'))
  for (const relative of ['com.github.copilot/agents/skraft-orchestrator.agent.md', 'com.anthropic.claude-code/agents/skraft-orchestrator.md']) {
    const text = readFileSync(`${PLUGIN}${relative}`, 'utf8')
    assert.ok(text.includes(phaseOrder.join(' → ')), `${relative} must state ${phaseOrder.join(' → ')}`)
  }
})
