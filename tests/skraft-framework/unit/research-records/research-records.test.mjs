import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const RESEARCH = 'research/2026-10-11/checkout-research.md'

/** A solution researcher that leaves `text` as its research document. @param {string} text */
const researcher = (text) => agent({
  fill: false,
  work: ({ tracking }) => tracking.write(SLUG, RESEARCH, text),
})

/** A research document that cites `paths`, one per line under File analysis. @param {string[]} paths */
const citing = (paths) => [
  '# Research: the card payment',
  '',
  '## Research executed',
  '### File analysis',
  ...paths.map((path) => `- ${path}`),
  '',
].join('\n')

const research = (host) => host.events().filter((event) => event.type === 'step.recorded' && event.step === 'research')

test('a research document that cites a path the working copy has not sends the researcher back, and the run goes on once every path exists', async () => {
  const host = scripted({}, (it) => [
    researcher(citing(['src/Pricing/Discount.cs']))(it),
    researcher(citing(['docs/architecture/context-map.md']))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(research(host).map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures]), [
    [1, 'failed', 'research-records', [`${RESEARCH} cites src/Pricing/Discount.cs, which is no file of the working copy (#517)`]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a line range cited past the end of its file sends the researcher back, and the file it names is read once', async () => {
  const host = scripted({}, (it) => [
    researcher(citing(['docs/architecture/context-map.md:1-9']))(it),
    researcher(citing(['docs/architecture/context-map.md:1']))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(research(host).map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures]), [
    [1, 'failed', 'research-records', [`${RESEARCH} cites docs/architecture/context-map.md:1-9, past the end of a 1-line file (#517)`]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a range on a path the working copy has not is reported once, as a path it has not', async () => {
  const host = scripted({}, (it) => [
    researcher(citing(['src/Pricing/Discount.cs:120-160']))(it),
    researcher(citing([]))(it),
    ...nominal(it).slice(1),
  ])

  await host.start()

  assert.deepEqual(research(host)[0].failures, [`${RESEARCH} cites src/Pricing/Discount.cs, which is no file of the working copy (#517)`])
})
