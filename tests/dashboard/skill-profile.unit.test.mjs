import { strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { profileSkill, skillTier, summariseEvalSpec } from '../../eng/lib/skill-profile.mjs'

describe('skill tier', () => {
  it('ranks a skill by its estimated context cost', () => {
    strictEqual(skillTier(399), 'compact')
    strictEqual(skillTier(400), 'detailed')
    strictEqual(skillTier(2500), 'detailed')
    strictEqual(skillTier(2501), 'standard')
    strictEqual(skillTier(5000), 'standard')
    strictEqual(skillTier(5001), 'comprehensive')
  })
})

describe('skill profile', () => {
  const body = ['# Title', '', '## When to use', '', '1. First step', '2. Second step', '', '```bash', 'dotnet test', '```', ''].join('\n')
  const content = `---\nname: demo\n---\n${body}`

  it('measures structure from the body, and cost from the whole file', () => {
    const profile = profileSkill(content, body)

    strictEqual(profile.estimatedTokens, Math.ceil(content.length / 4))
    strictEqual(profile.sectionCount, 2)
    strictEqual(profile.codeBlockCount, 1)
    strictEqual(profile.numberedStepCount, 2)
    strictEqual(profile.hasWhenToUse, true)
    strictEqual(profile.hasWhenNotToUse, false)
  })

  it('detects a "When not to use" section independently', () => {
    strictEqual(profileSkill('x', '## When NOT to use\n').hasWhenNotToUse, true)
  })
})

describe('eval spec summary', () => {
  it('multiplies stimuli by the declared runs', () => {
    const spec = [
      'name: demo',
      'defaults:',
      '  runs: 3',
      'stimuli:',
      '  - name: first',
      '    prompt: hello',
      '  - name: second',
      '    prompt: world',
      '',
    ].join('\n')

    strictEqual(summariseEvalSpec(spec).stimuli, 2)
    strictEqual(summariseEvalSpec(spec).runs, 3)
    strictEqual(summariseEvalSpec(spec).trials, 6)
  })

  it('defaults to a single run when the spec declares none', () => {
    const spec = ['stimuli:', '  - name: only', '    prompt: hello', ''].join('\n')

    strictEqual(summariseEvalSpec(spec).runs, 1)
    strictEqual(summariseEvalSpec(spec).trials, 1)
  })
})
