import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { expiredScheduledDates, sessionEntry, sessionSubDirectory, skillOf, slug, variantFromPath } from '../../eng/lib/replay-sessions.mjs'

describe('replay session naming', () => {
  it('derives the skill from the eval spec path', () => {
    strictEqual(skillOf('tests/skills/outside-in-tdd/eval.yaml'), 'outside-in-tdd')
    strictEqual(skillOf('tests\\skills\\outside-in-tdd\\eval.yaml'), 'outside-in-tdd')
    strictEqual(skillOf('tests/skills/outside-in-tdd'), 'outside-in-tdd')
    strictEqual(skillOf(''), 'unknown')
  })

  it('slugs a scenario name into something safe for a path', () => {
    strictEqual(slug('Drive a business rule from the outside'), 'drive-a-business-rule-from-the-outside')
    strictEqual(slug('  ***  '), 'unnamed')
  })

  it('separates scheduled runs by day and pull-request runs by number', () => {
    strictEqual(sessionSubDirectory({ source: 'scheduled', date: '2026-08-03' }), 'scheduled/2026-08-03')
    strictEqual(sessionSubDirectory({ source: 'pr', prNumber: 134, date: '2026-08-03' }), 'pr/134')
  })
})

describe('variant recovered from the output path', () => {
  it('reads the variant an isolated eval run did not stamp', () => {
    strictEqual(variantFromPath('eval-results/outside-in-tdd/baseline/run/executor-session-logs/a/metadata.json'), 'baseline')
    strictEqual(variantFromPath('eval-results\\outside-in-tdd\\skilled\\run\\metadata.json'), 'skilled')
  })

  it('takes the segment nearest the trial when the root repeats a variant name', () => {
    strictEqual(variantFromPath('/tmp/baseline/outside-in-tdd/skilled/run/metadata.json'), 'skilled')
  })

  it('reports no variant rather than inventing one', () => {
    strictEqual(variantFromPath('eval-results/_experiment/run/executor-session-logs/a/metadata.json'), '')
    strictEqual(variantFromPath(''), '')
  })

  it('never mistakes an inherited object property for a variant', () => {
    strictEqual(variantFromPath('eval-results/constructor/run/metadata.json'), '')
  })
})

describe('replay manifest entry', () => {
  const base = {
    skill: 'outside-in-tdd',
    stimulusName: 'Drive a business rule from the outside',
    role: 'skilled',
    trialIndex: '2',
    fileName: 'drive-a-business-rule-from-the-outside--skilled--run2.jsonl',
    date: '2026-08-03',
  }

  it('tags a scheduled session with its day, skill, role and scenario', () => {
    const entry = sessionEntry({ ...base, subDirectory: 'scheduled/2026-08-03', source: 'scheduled', mtime: 1 })

    deepStrictEqual(entry.tags, ['scheduled', 'outside-in-tdd', 'skilled', 'drive-a-business-rule-from-the-outside', '2026-08-03'])
    strictEqual(entry.url, 'sessions/scheduled/2026-08-03/outside-in-tdd/drive-a-business-rule-from-the-outside--skilled--run2.jsonl')
    ok(entry.name.includes('skilled'))
  })

  it('tags a pull-request session with its number instead of a day', () => {
    const entry = sessionEntry({ ...base, subDirectory: 'pr/134', source: 'pr', prNumber: 134, mtime: 1 })

    ok(entry.tags.includes('pr-134'))
    ok(!entry.tags.includes('2026-08-03'))
  })

  it('keeps the identifier free of the file extension so it reads as a session name', () => {
    const entry = sessionEntry({ ...base, subDirectory: 'pr/134', source: 'pr', prNumber: 134, mtime: 1 })

    ok(!entry.id.endsWith('.jsonl'))
  })
})

describe('replay retention', () => {
  it('keeps only the newest days', () => {
    const days = ['2026-07-30', '2026-08-01', '2026-07-31', '2026-08-02']

    deepStrictEqual(expiredScheduledDates(days, 2), ['2026-07-30', '2026-07-31'])
  })

  it('keeps everything when the window is wider than the history', () => {
    deepStrictEqual(expiredScheduledDates(['2026-08-01'], 14), [])
  })

  it('ignores directories that are not dated', () => {
    deepStrictEqual(expiredScheduledDates(['latest', '2026-08-01', '2026-08-02'], 1), ['2026-08-01'])
  })
})
