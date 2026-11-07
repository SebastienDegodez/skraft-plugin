// DISTILL's G7 judges each test-plan row against the use case boundaries DESIGN fixed. Those
// boundaries are the Commands and Queries of the event model: no other DESIGN document lists
// them, and none may come back as a second source that drifts from it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const read = (path) => readFileSync(join(PLUGIN, path), 'utf8')
const EVENT_MODEL = 'event model'

const g7Row = (text) => text.split('\n').find((line) => /^\|[^|]*\|\s*G7\s*\||^\|\s*G7\s*\|/.test(line))
const g7Section = (text) => text.slice(text.indexOf('### G7'), text.indexOf('\n### ', text.indexOf('### G7') + 1))

test('DISTILL G7 takes its use case boundaries from the event model, in the lens of both hosts and in the criteria it applies', () => {
  const criteria = {
    'com.anthropic.claude-code/agents/boundary-enforcement-lens.md G7 row': g7Row(read('com.anthropic.claude-code/agents/boundary-enforcement-lens.md')),
    'com.github.copilot/agents/boundary-enforcement-lens.agent.md G7 row': g7Row(read('com.github.copilot/agents/boundary-enforcement-lens.agent.md')),
    'skills/acceptance-review-criteria/SKILL.md G7 row': g7Row(read('skills/acceptance-review-criteria/SKILL.md')),
    'skills/acceptance-review-criteria/references/gate-definitions.md G7 section': g7Section(read('skills/acceptance-review-criteria/references/gate-definitions.md')),
  }
  const wrong = Object.entries(criteria)
    .filter(([, text]) => !text || !text.includes(EVENT_MODEL) || /contracts?[-\s](?:document|file|\{)|contracts-/i.test(text))
    .map(([where]) => where)
  assert.deepEqual(wrong, [])
})

test('no agent, skill or template of the framework writes or reads a contracts document', () => {
  const files = ['com.anthropic.claude-code/agents', 'com.github.copilot/agents', 'skills', 'assets']
    .flatMap((dir) => readdirSync(join(PLUGIN, dir), { recursive: true }).map(String).map((path) => join(PLUGIN, dir, path)))
    .filter((path) => path.endsWith('.md'))
  const offences = files.flatMap((path) => readFileSync(path, 'utf8').split('\n')
    .map((line, index) => /contracts[-][{\w]/i.test(line) ? `${relative(PLUGIN, path)}:${index + 1}` : null)
    .filter(Boolean))
  assert.deepEqual(offences, [])
})

test('the event model gives every Command, Query, Domain Event and Read Model its fields, on both hosts', () => {
  for (const path of ['com.anthropic.claude-code/agents/solution-architect.md', 'com.github.copilot/agents/solution-architect.agent.md']) {
    const step = read(path).split('\n').find((line) => line.includes('**Event model**'))
    assert.ok(step && /\| Fields \|/.test(step), `${path}: the event model step names no Fields column`)
  }
})
