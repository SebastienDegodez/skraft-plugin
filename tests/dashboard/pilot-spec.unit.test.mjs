import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

import { pilotSpec } from '../../eng/lib/pilot-spec.mjs'

const spec = [
  'name: outside-in-tdd',
  'type: capability',
  'defaults:',
  '  timeout: 3m',
  '  runs: 3',
  'stimuli:',
  '  - name: Resist a generic design',
  '    prompt: |',
  '      Decide what to deliver.',
  '    graders:',
  '      - type: prompt',
  '  - name: Preserve an approved expectation',
  '    prompt: |',
  '      What should we change?',
  '  - name: "Prove the first route"',
  '    prompt: |',
  '      Define completion.',
].join('\n')

describe('pilot spec', () => {
  it('preserves resolved aliases when the defining stimulus is removed', () => {
    const source = `name: synthetic-aliases
defaults:
  model: synthetic-model
  runs: 7
  timeout: 3m
stimuli:
  - name: Anchor owner
    prompt: &prompt |-
      Keep the approved result.
    environment: &environment
      files:
        - src: ./fixtures/input.txt
          dest: input.txt
    graders: &graders
      - type: text
        expected: &expected approved
  - name: Selected consumer
    prompt: *prompt
    environment: *environment
    graders: *graders
    tags: [*expected]
  - name: Other consumer
    prompt: *prompt
    environment: *environment
    graders: *graders
metadata:
  expected: *expected
`
    const original = parse(source)
    for (const selectors of [['Selected'], ['consumer']]) {
      const result = pilotSpec(source, selectors, 1)
      deepStrictEqual(parse(result.spec), {
        ...original,
        defaults: { ...original.defaults, runs: 1 },
        stimuli: original.stimuli.filter(({ name }) => selectors.some((selector) => name.includes(selector))),
      })
    }
  })

  it('filters YAML sequence items rather than name-like prompt lines or nested lists', () => {
    const source = `name: synthetic-shape
defaults: { model: pinned-model, runs: 4 }
stimuli:
  - prompt: |
      Example:
        - name: not a stimulus
    name: "Selected: quoted" # trailing comment
    graders:
      - name: nested grader
        type: text
  - name: Excluded
    prompt: Other
metadata: { runs: 9 }
`
    const original = parse(source)
    const result = pilotSpec(source, ['SELECTED: QUOTED'])
    deepStrictEqual(result.kept, ['Selected: quoted'])
    deepStrictEqual(parse(result.spec), { ...original, stimuli: [original.stimuli[0]] })
  })

  it('overrides only defaults.runs, adding it when absent', () => {
    for (const defaults of ['', 'defaults: { model: pinned-model }\n']) {
      const source = `${defaults}stimuli:\n  - name: Selected\n    runs: 9\n`
      deepStrictEqual(parse(pilotSpec(source, ['Selected'], 1).spec), {
        ...parse(source),
        defaults: { ...parse(source).defaults, runs: 1 },
      })
    }
  })

  it('does not mutate an aliased defaults mapping reused by a stimulus', () => {
    const source = `defaults: &settings { runs: 7, model: pinned-model }
stimuli:
  - name: Selected
    settings: *settings
`
    const original = parse(source)
    deepStrictEqual(parse(pilotSpec(source, ['Selected'], 1).spec), {
      ...original, defaults: { ...original.defaults, runs: 1 },
    })
  })

  it('rejects malformed YAML instead of emitting a broken pilot', () => {
    throws(() => pilotSpec('stimuli:\n  - name: Selected\n    prompt: *missing\n', ['Selected']), /alias/i)
  })

  it('keeps the header and only the selected stimulus', () => {
    const { spec: pilot, kept } = pilotSpec(spec, ['preserve an approved'])

    deepStrictEqual(kept, ['Preserve an approved expectation'])
    ok(pilot.includes('name: outside-in-tdd'))
    ok(pilot.includes('What should we change?'))
    ok(!pilot.includes('Decide what to deliver.'))
    ok(!pilot.includes('Define completion.'))
  })

  it('matches case-insensitively on a fragment so a caller need not copy exact wording', () => {
    const { kept } = pilotSpec(spec, ['RESIST'])

    deepStrictEqual(kept, ['Resist a generic design'])
  })

  it('reads a quoted stimulus name', () => {
    const { kept } = pilotSpec(spec, ['prove the first'])

    deepStrictEqual(kept, ['Prove the first route'])
  })

  it('keeps several stimuli in spec order', () => {
    const { kept } = pilotSpec(spec, ['prove the first', 'resist'])

    deepStrictEqual(kept, ['Resist a generic design', 'Prove the first route'])
  })

  it('overrides the declared runs without touching the stimuli', () => {
    const { spec: pilot } = pilotSpec(spec, ['resist'], 5)

    ok(pilot.includes('  runs: 5'))
    ok(!pilot.includes('  runs: 3'))
  })

  it('leaves the declared runs alone when no override is given', () => {
    const { spec: pilot } = pilotSpec(spec, ['resist'])

    ok(pilot.includes('  runs: 3'))
  })

  it('refuses a selector that matches nothing rather than running an empty arm', () => {
    throws(() => pilotSpec(spec, ['no such scenario']), /no stimulus matches/)
  })

  it('refuses an empty selector list', () => {
    throws(() => pilotSpec(spec, ['   ']), /no stimulus selector/)
  })

  it('refuses a spec with no stimuli', () => {
    throws(() => pilotSpec('name: empty\nstimuli:\n', ['anything']), /no stimuli/)
  })

  it('produces a spec the trial counter still reads correctly', async () => {
    const { summariseEvalSpec } = await import('../../eng/lib/skill-profile.mjs')
    const { spec: pilot } = pilotSpec(spec, ['resist'], 5)

    const summary = summariseEvalSpec(pilot)
    strictEqual(summary.stimuli, 1)
    strictEqual(summary.runs, 5)
    strictEqual(summary.trials, 5)
  })
})
