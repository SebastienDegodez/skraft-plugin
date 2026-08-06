import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { loadEvalSpec } from '@microsoft/vally'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const specPath = join(repoRoot, 'tests/agents/agent-behavior/eval.yaml')
const requiredSkills = [
  'outside-in-tdd',
  'craft-discipline',
  'red-synthesize-green',
]

describe('Software Engineer agent eval spec', () => {
  it('uses the real-agent executor for a neutral, read-only missing-precondition pilot', async () => {
    const spec = await loadEvalSpec(specPath)

    strictEqual(spec.defaults.executor, 'skraft-agent-runner')
    strictEqual(spec.defaults.model, 'gpt-5.6-luna')
    strictEqual(spec.defaults.runs, 1)
    strictEqual(spec.stimuli.length, 1)

    const stimulus = spec.stimuli[0]
    strictEqual(stimulus.tags.agent, 'software-engineer')
    deepStrictEqual(stimulus.supported_executors, ['skraft-agent-runner'])
    strictEqual(/(?:en tant que|as (?:a |the )?software engineer)/i.test(stimulus.prompt), false)
    strictEqual(stimulus.prompt.includes('Implement the requested behavior'), true)
    strictEqual(stimulus.environment.files[0].dest, 'README.md')
    strictEqual(stimulus.environment.skills, undefined)

    const graderTypes = stimulus.graders.map(({ type }) => type)
    deepStrictEqual(graderTypes, ['completed', 'output-matches', 'output-matches', 'skill-invocation', 'output-not-matches', 'diff-empty'])
    strictEqual(stimulus.graders[1].config.pattern.includes('"status"'), true)
    strictEqual(stimulus.graders[2].config.pattern.includes('clarification_needed'), true)
    deepStrictEqual(stimulus.graders[3].config.required, requiredSkills)
    strictEqual(stimulus.graders[4].config.pattern.includes('SKILL MISSING'), true)
  })
})
