import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { planReuse, recordLedger, stampReused } from '../../eng/lib/eval-reuse.mjs'

const cell = (kind, name) => ({
  kind,
  name,
  args: `${kind === 'skill' ? 'skills' : 'agents'} ${name}`,
  artifact: `eval-part-${kind}-${name}`,
})

const OUTSIDE_IN = cell('skill', 'outside-in-tdd')
const BDD = cell('skill', 'bdd-methodology')
const COMMITS = cell('agent', 'commit-convention')

const EARLIER = { measuredSha: 'aaaaaaa1', headSha: 'bbbbbbb1', runId: '101', runUrl: 'https://example.test/runs/101', measuredAt: '2026-10-20T10:00:00.000Z' }
const NOW = { measuredSha: 'ccccccc2', headSha: 'ddddddd2', runId: '202', runUrl: 'https://example.test/runs/202', measuredAt: '2026-10-22T10:00:00.000Z' }
const TODAY = new Date('2026-10-22T12:00:00.000Z')

const ledger = (subjects) => ({ schemaVersion: 1, subjects })

const verdict = (overrides = {}) => ({
  subject: { kind: 'skill', name: 'outside-in-tdd' },
  conclusive: true,
  underpowered: false,
  passed: true,
  ...overrides,
})

describe('planReuse', () => {
  it('runs only the subjects whose fingerprint moved since the last evaluation of this PR', () => {
    const { run, reused } = planReuse({
      now: TODAY,
      include: [BDD, OUTSIDE_IN, COMMITS],
      fingerprints: { 'skill:bdd-methodology': 'sha256:b2', 'skill:outside-in-tdd': 'sha256:o1', 'agent:commit-convention': 'sha256:c1' },
      ledger: ledger({
        'skill:bdd-methodology': { fingerprint: 'sha256:b1', ...EARLIER },
        'skill:outside-in-tdd': { fingerprint: 'sha256:o1', ...EARLIER },
        'agent:commit-convention': { fingerprint: 'sha256:c1', ...EARLIER },
      }),
    })
    deepStrictEqual(run, [BDD])
    deepStrictEqual(reused, [
      { ...OUTSIDE_IN, key: 'skill:outside-in-tdd', fingerprint: 'sha256:o1', from: { fingerprint: 'sha256:o1', ...EARLIER } },
      { ...COMMITS, key: 'agent:commit-convention', fingerprint: 'sha256:c1', from: { fingerprint: 'sha256:c1', ...EARLIER } },
    ])
  })

  it('runs everything when no earlier evaluation of this PR could be read', () => {
    const include = [OUTSIDE_IN, COMMITS]
    const fingerprints = { 'skill:outside-in-tdd': 'sha256:o1', 'agent:commit-convention': 'sha256:c1' }
    const unknownSchema = { schemaVersion: 2, subjects: { 'skill:outside-in-tdd': { fingerprint: 'sha256:o1', ...EARLIER } } }
    for (const previous of [null, undefined, {}, unknownSchema, ledger(null)]) {
      const { run, reused } = planReuse({ include, fingerprints, ledger: previous, now: TODAY })
      deepStrictEqual(run, include, JSON.stringify(previous))
      deepStrictEqual(reused, [])
    }
  })

  it('runs a subject with no fingerprint of its own rather than matching a missing one', () => {
    const { run } = planReuse({
      now: TODAY,
      include: [OUTSIDE_IN],
      fingerprints: {},
      ledger: ledger({ 'skill:outside-in-tdd': { ...EARLIER } }),
    })
    deepStrictEqual(run, [OUTSIDE_IN])
  })

  it('keeps a skill and an agent suite that share a name apart', () => {
    const sameSkill = cell('skill', 'same')
    const sameSuite = cell('agent', 'same')
    const { run, reused } = planReuse({
      now: TODAY,
      include: [sameSkill, sameSuite],
      fingerprints: { 'skill:same': 'sha256:s', 'agent:same': 'sha256:a' },
      ledger: ledger({ 'skill:same': { fingerprint: 'sha256:a', ...EARLIER }, 'agent:same': { fingerprint: 'sha256:a', ...EARLIER } }),
    })
    deepStrictEqual(run, [sameSkill])
    deepStrictEqual(reused.map(({ key }) => key), ['agent:same'])
  })
})

describe('planReuse — when an unchanged subject still runs', () => {
  const fingerprints = { 'skill:outside-in-tdd': 'sha256:o1', 'agent:commit-convention': 'sha256:c1' }
  const unchanged = ledger({
    'skill:outside-in-tdd': { fingerprint: 'sha256:o1', ...EARLIER },
    'agent:commit-convention': { fingerprint: 'sha256:c1', ...EARLIER },
  })

  it('runs every subject on a re-run of the workflow, which is a deliberate re-roll', () => {
    const { run, reused } = planReuse({ include: [OUTSIDE_IN, COMMITS], fingerprints, ledger: unchanged, now: TODAY, rerun: true })
    deepStrictEqual(run, [OUTSIDE_IN, COMMITS])
    deepStrictEqual(reused, [])
  })

  it('runs a cell measured more than 14 days ago, or with no date, and keeps one measured 14 days ago', () => {
    const at = (measuredAt) => ({ ...EARLIER, measuredAt })
    const { run, reused } = planReuse({
      now: TODAY,
      include: [OUTSIDE_IN, BDD, COMMITS],
      fingerprints: { ...fingerprints, 'skill:bdd-methodology': 'sha256:b1' },
      ledger: ledger({
        'skill:outside-in-tdd': { fingerprint: 'sha256:o1', ...at('2026-10-08T11:59:59.000Z') },
        'skill:bdd-methodology': { fingerprint: 'sha256:b1', ...at(undefined) },
        'agent:commit-convention': { fingerprint: 'sha256:c1', ...at('2026-10-08T12:00:00.000Z') },
      }),
    })
    deepStrictEqual(run, [OUTSIDE_IN, BDD])
    deepStrictEqual(reused.map(({ key }) => key), ['agent:commit-convention'])
  })
})

describe('recordLedger', () => {
  const planned = [
    { ...OUTSIDE_IN, fingerprint: 'sha256:o1' },
    { ...BDD, fingerprint: 'sha256:b2' },
    { ...COMMITS, fingerprint: 'sha256:c1' },
  ]

  it('records each fresh cell at this run and carries a reused cell with the run that measured it', () => {
    const recorded = recordLedger({
      planned,
      reused: [{ key: 'agent:commit-convention', from: { fingerprint: 'sha256:c1', ...EARLIER } }],
      fresh: {
        'skill:outside-in-tdd': { verdicts: [verdict()] },
        'skill:bdd-methodology': { verdicts: [verdict({ subject: { kind: 'skill', name: 'bdd-methodology' }, passed: false, regressed: true })] },
      },
      run: NOW,
    })
    deepStrictEqual(recorded, ledger({
      'skill:outside-in-tdd': { fingerprint: 'sha256:o1', ...NOW },
      'skill:bdd-methodology': { fingerprint: 'sha256:b2', ...NOW },
      'agent:commit-convention': { fingerprint: 'sha256:c1', ...EARLIER },
    }))
  })

  it('leaves out a cell that produced no verdict or could not decide, so the next push runs it again', () => {
    const recorded = recordLedger({
      planned,
      reused: [],
      fresh: {
        'skill:outside-in-tdd': { verdicts: [verdict({ conclusive: false })] },
        'skill:bdd-methodology': { verdicts: [] },
        'agent:commit-convention': { verdicts: [verdict({ subject: { kind: 'agent', name: 'x' } }), verdict({ subject: { kind: 'agent', name: 'y' }, underpowered: true })] },
      },
      run: NOW,
    })
    deepStrictEqual(recorded, ledger({}))
  })

  it('records nothing for a planned subject whose cell never reported', () => {
    deepStrictEqual(recordLedger({ planned, reused: [], fresh: {}, run: NOW }), ledger({}))
  })
})

describe('stampReused', () => {
  it('says which run measured a reused cell, without touching its verdicts', () => {
    const result = { runner: 'vally', verdicts: [verdict()] }
    const stamped = stampReused(result, { fingerprint: 'sha256:o1', ...EARLIER })
    deepStrictEqual(stamped, { ...result, reuse: { ...EARLIER } })
    strictEqual(result.reuse, undefined)
  })
})
