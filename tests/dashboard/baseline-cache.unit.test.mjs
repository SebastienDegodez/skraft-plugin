import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  ambientSkills,
  isPairable,
  mergeArm,
  partition,
  provenance,
  stimulusFixtures,
  stimulusKeys,
  store,
} from '../../eng/lib/baseline-cache.mjs'

const ENV = { specDir: '/nowhere', model: 'm', judgeModel: 'j', runs: undefined, vally: 'v0.12.0' }

const SPEC = `name: demo
defaults:
  runs: 4
stimuli:
  - name: Alpha
    prompt: |
      first
  - name: Beta
    prompt: |
      second
`

const record = (stimulus, trialIndex, extra = {}) => ({ stimulus, trialIndex, ...extra })

describe('stimulusKeys', () => {
  it('gives every stimulus its own key', () => {
    const keys = stimulusKeys(SPEC, ENV)
    deepStrictEqual([...keys.keys()], ['Alpha', 'Beta'])
    ok(keys.get('Alpha') !== keys.get('Beta'))
  })

  it('leaves an untouched stimulus alone when a sibling changes', () => {
    const before = stimulusKeys(SPEC, ENV)
    const after = stimulusKeys(SPEC.replace('second', 'second, reworded'), ENV)
    strictEqual(after.get('Alpha'), before.get('Alpha'))
    ok(after.get('Beta') !== before.get('Beta'))
  })

  // `defaults.runs` sets the trial count the pairing keys on, so it is the one
  // header field that has to evict every block.
  it('evicts every stimulus when the trial depth changes', () => {
    const before = stimulusKeys(SPEC, ENV)
    const after = stimulusKeys(SPEC.replace('runs: 4', 'runs: 3'), ENV)
    ok(after.get('Alpha') !== before.get('Alpha'))
    ok(after.get('Beta') !== before.get('Beta'))
  })

  // The unit is the `- name:` block. Spec-level metadata the agent never sees
  // must not cost a single re-run.
  it('keeps every block when only the spec name or description changes', () => {
    const before = stimulusKeys(SPEC, ENV)
    const renamed = stimulusKeys(SPEC.replace('name: demo', 'name: demo-renamed'), ENV)
    strictEqual(renamed.get('Alpha'), before.get('Alpha'))
    strictEqual(renamed.get('Beta'), before.get('Beta'))

    const described = stimulusKeys(SPEC.replace('name: demo\n', 'name: demo\ndescription: a longer explanation\n'), ENV)
    strictEqual(described.get('Alpha'), before.get('Alpha'))
    strictEqual(described.get('Beta'), before.get('Beta'))
  })

  it('separates keys by model, judge model, trial override and vally version', () => {
    const base = stimulusKeys(SPEC, ENV).get('Alpha')
    for (const patch of [{ model: 'other' }, { judgeModel: 'other' }, { runs: '7' }, { vally: 'v0.13.0' }]) {
      ok(stimulusKeys(SPEC, { ...ENV, ...patch }).get('Alpha') !== base, `${Object.keys(patch)[0]} must change the key`)
    }
  })

  it('refuses a spec with no stimuli', () => {
    throws(() => stimulusKeys('name: demo\n', ENV), /declares no stimuli/)
  })
})

describe('stimulusFixtures', () => {
  it('reads the staged source paths, not the destinations', () => {
    const lines = [
      '    environment:',
      '      files:',
      '        - src: fixtures/one/App.csproj',
      '          dest: App.csproj',
      '        - src: fixtures/one/Program.cs',
      '          dest: Program.cs',
    ]
    deepStrictEqual(stimulusFixtures(lines), ['fixtures/one/App.csproj', 'fixtures/one/Program.cs'])
  })
})

describe('stimulusKeys with fixtures on disk', () => {
  it('changes only the stimulus whose fixture content moved', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bc-fix-'))
    writeFileSync(join(dir, 'a.txt'), 'one')
    const spec = `name: demo
stimuli:
  - name: Alpha
    environment:
      files:
        - src: a.txt
          dest: a.txt
  - name: Beta
    prompt: |
      second
`
    const env = { ...ENV, specDir: dir }
    const before = stimulusKeys(spec, env)
    writeFileSync(join(dir, 'a.txt'), 'two')
    const after = stimulusKeys(spec, env)
    ok(after.get('Alpha') !== before.get('Alpha'), 'fixture edit must evict its stimulus')
    strictEqual(after.get('Beta'), before.get('Beta'), 'and only its stimulus')
  })
})

describe('isPairable', () => {
  // 11 of 14 baseline arms archived in this repo carry no trialIndex; replaying
  // one produces zero pairs and a silent `inconclusive`, never an error.
  it('rejects a record with no trialIndex', () => {
    strictEqual(isPairable({ stimulus: 'Alpha' }), false)
  })

  it('rejects a non-integer trialIndex and a missing stimulus', () => {
    strictEqual(isPairable({ stimulus: 'Alpha', trialIndex: '0' }), false)
    strictEqual(isPairable({ trialIndex: 0 }), false)
  })

  it('accepts trial zero', () => {
    strictEqual(isPairable(record('Alpha', 0)), true)
  })
})

describe('partition', () => {
  const seed = (entries) => {
    const dir = mkdtempSync(join(tmpdir(), 'bc-part-'))
    for (const [key, records] of entries) {
      writeFileSync(join(dir, `${key}.jsonl`), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`)
    }
    return dir
  }

  it('serves a stimulus whose key is on disk and misses the rest', () => {
    const keys = new Map([['Alpha', 'k1'], ['Beta', 'k2']])
    const dir = seed([['k1', [record('Alpha', 0), record('Alpha', 1)]]])
    const { hits, misses } = partition(keys, dir)
    deepStrictEqual(misses, ['Beta'])
    strictEqual(hits.length, 1)
    strictEqual(hits[0].records.length, 2)
  })

  it('misses a cached entry whose records cannot be paired', () => {
    const keys = new Map([['Alpha', 'k1']])
    const dir = seed([['k1', [{ stimulus: 'Alpha' }]]])
    deepStrictEqual(partition(keys, dir).misses, ['Alpha'])
  })

  it('misses when a cached entry holds a different stimulus', () => {
    const keys = new Map([['Alpha', 'k1']])
    const dir = seed([['k1', [record('Beta', 0)]]])
    deepStrictEqual(partition(keys, dir).misses, ['Alpha'])
  })

  it('misses on corrupt json rather than throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bc-bad-'))
    writeFileSync(join(dir, 'k1.jsonl'), '{not json\n')
    deepStrictEqual(partition(new Map([['Alpha', 'k1']]), dir).misses, ['Alpha'])
  })
})

describe('store', () => {
  it('writes one file per stimulus and drops unpairable records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bc-store-'))
    const keys = new Map([['Alpha', 'k1'], ['Beta', 'k2']])
    const stored = store([record('Alpha', 0), record('Alpha', 1), { stimulus: 'Beta' }], keys, dir)
    deepStrictEqual(stored, ['Alpha'])
    strictEqual(readFileSync(join(dir, 'k1.jsonl'), 'utf8').trim().split('\n').length, 2)
  })

  it('ignores a stimulus the spec no longer declares', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bc-store2-'))
    deepStrictEqual(store([record('Ghost', 0)], new Map([['Alpha', 'k1']]), dir), [])
  })
})

describe('mergeArm', () => {
  it('orders by stimulus then trial so the arm reads like one run', () => {
    const merged = mergeArm([record('Beta', 1), record('Beta', 0)], [record('Alpha', 1), record('Alpha', 0)])
    deepStrictEqual(merged.map((r) => `${r.stimulus}${r.trialIndex}`), ['Alpha0', 'Alpha1', 'Beta0', 'Beta1'])
  })

  it('drops anything that could not be paired', () => {
    strictEqual(mergeArm([{ stimulus: 'Alpha' }], [record('Alpha', 0)]).length, 1)
  })
})

describe('ambientSkills', () => {
  it('collects the host skills the baseline loaded despite an empty skill dir', () => {
    const records = [
      { trajectory: { metadata: { skillsLoaded: ['github-pr-media', 'customize-cloud-agent'] } } },
      { trajectory: { metadata: { skillsLoaded: ['github-pr-media'] } } },
    ]
    deepStrictEqual(ambientSkills(records), ['customize-cloud-agent', 'github-pr-media'])
  })

  it('survives records with no trajectory metadata', () => {
    deepStrictEqual(ambientSkills([{}, null]), [])
  })
})

describe('provenance', () => {
  it('marks a fully fresh arm publishable', () => {
    const stamp = provenance({ hits: [], misses: ['Alpha'], ambient: [] })
    strictEqual(stamp.publishable, true)
    deepStrictEqual(stamp.freshStimuli, ['Alpha'])
  })

  // Any cached pair makes the comparison a frozen-draw comparison, which is
  // fine locally and must never reach the dashboard or a merge gate.
  it('marks any cached stimulus unpublishable', () => {
    const stamp = provenance({ hits: [{ name: 'Alpha' }], misses: [], ambient: ['github-pr-media'] })
    strictEqual(stamp.publishable, false)
    deepStrictEqual(stamp.cachedStimuli, ['Alpha'])
    deepStrictEqual(stamp.ambientSkills, ['github-pr-media'])
  })
})
