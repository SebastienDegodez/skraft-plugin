import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, scripted, SLUG } from '../support/pipeline-host.mjs'

const PLAN = 'details/2026-10-11/test-plan-checkout.md'
const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const research = (it) => [agent()(it), agent()(it)]
const STORY = (...ids) => `# Acceptance criteria — checkout\n\n${ids.map((id) => `## AC-${id} — criterion ${id}\nGiven a basket\n`).join('\n')}`
/** The criteria as the backlog's story template writes them: `**AC-01:** <name>`, under a `### Acceptance Criteria` heading. */
const BACKLOG = (...ids) => `### Acceptance Criteria\n\n${ids.map((id) => `**AC-${id}:** criterion ${id}\nGiven a basket\n`).join('\n')}`
/** The criteria under third-level headings: `### AC-<n> — <name>`. */
const SUBHEADED = (...ids) => `## Acceptance criteria\n\n${ids.map((id) => `### AC-${id} — criterion ${id}\nGiven a basket\n`).join('\n')}`

/** The designer's pass: the story's criteria on disk, the one red of `count` acceptance tests. @param {Record<string, string>} documents @param {number} count */
const designing = (documents, count) => ({ tracking, git }) => {
  for (const [path, text] of Object.entries(documents)) tracking.write(SLUG, path, text)
  git.commit(`test(${SLUG}): acceptance tests S1–S${count}`, ['tests/Integration/WalkingSkeletonTests.cs', ...Array.from({ length: count }, (_, at) => `tests/Acceptance/S${at + 1}AcceptanceTests.cs`)])
}

/** A run whose designer lists the scenarios given, each `[title, tags]`, beside the documents given. */
const run = (rows, documents) => scripted({}, (it) => [...research(it), agent({ plan: rows.map(([title, tags]) => [title, undefined, tags]), work: designing(documents, rows.length) })(it), agent()(it), unavailable])

const distill = (host) => host.events().filter((event) => event.type === 'step.recorded' && event.step === 'distill' && event.group === undefined).map(({ outcome, code, failures }) => [outcome, code, failures])
const CRITERIA = 'plans/2026-10-11/ac-draft-checkout.md'

test('a criterion cited by no scenario, a criterion cited by two, and a scenario citing two criteria send the designer back, each named with what to correct', async () => {
  const cases = [
    [[['Pay', '@walking-skeleton @AC-1'], ['Refuse', '@AC-2']], BACKLOG('01', '02', '03'),
      `${PLAN}: AC-3 is cited by no scenario; give it one scenario of its own, tagged @AC-3 in the Tags column`],
    [[['Pay', '@walking-skeleton @AC-1'], ['Refuse', '@AC-2'], ['Refuse again', '@AC-2']], STORY(1, 2),
      `${PLAN}: AC-2 is cited by S2, S3; one scenario holds a criterion: merge them into one, an outline whose examples are the cases of AC-2`],
    [[['Pay', '@walking-skeleton @AC-1'], ['Refuse', '@AC-2 @AC-3']], SUBHEADED(1, 2, 3),
      `${PLAN}: S2 cites AC-2, AC-3; a scenario holds one criterion: give each criterion a scenario of its own`],
  ]
  for (const [rows, story, why] of cases) {
    const host = run(rows, { [CRITERIA]: story })
    await host.start()
    assert.deepEqual(distill(host).slice(0, 1), [['failed', 'scenarios', [why]]], why)
  }
})

test('a story whose scenarios each cite their own criterion goes on, whatever order the tags come in and however the criteria are numbered', async () => {
  for (const story of [STORY('01', 2), BACKLOG('01', '02')]) {
    const host = run([['Pay', '@AC-01 @walking-skeleton'], ['Refuse', '@happy-path @ac-2']], { [CRITERIA]: story })

    const outcome = await host.start()

    assert.equal(outcome.status, 'done', outcome.reason)
    assert.deepEqual(distill(host), [['done', null, []]])
  }
})

test('a story with no readable criterion identifier, or whose criteria are numbered twice across its documents, is not checked', async () => {
  const unreadable = run([['Pay', '@walking-skeleton'], ['Refuse', '@happy-path']], { [CRITERIA]: '# Acceptance criteria\n\n- a card is paid\n- a card is refused\n' })
  const twice = run([['Pay', '@walking-skeleton @AC-1'], ['Refuse', '@AC-1']], { [CRITERIA]: STORY(1), 'plans/2026-10-11/ac-draft-refund.md': STORY(1) })

  assert.equal((await unreadable.start()).status, 'done')
  assert.equal((await twice.start()).status, 'done')
})
