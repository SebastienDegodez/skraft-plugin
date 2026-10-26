import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { agent, pipelineHost, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { edit } from '../workflow/support.mjs'

const STORIES = 'plans/2026-10-01/stories-v1.md'

test('DISCUSS stories present without a run: init --from-artifacts starts in DESIGN', async () => {
  const host = scripted({}, (it) => [agent()(it), () => ({ ok: false, unavailable: true, text: '' })])
  await host.tracking.write(SLUG, STORIES, '# Stories\n')
  await host.tracking.write(SLUG, 'plans/2026-10-01/ac-draft-us-1.md', '# AC\n')

  const initialised = await host.init({ fromArtifacts: true })
  const outcome = await host.run()

  assert.deepEqual(initialised, { ok: true, slug: SLUG, created: true, code: null, reason: `${SLUG} is the active pipeline` })
  assert.equal(outcome.code, 'agent-unavailable')
  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.agent), ['solution-architect', 'acceptance-designer'])
  const [started, closed] = host.events()
  assert.deepEqual([started.start, started.artifacts], ['design', ['plans/2026-10-01/ac-draft-us-1.md', STORIES]])
  assert.deepEqual([closed.type, closed.phase, closed.skipped], ['phase.closed', 'RESEARCH', 'from-artifacts'])
  assert.ok(host.agentRunner.dispatches[0].prompt.includes(`- Read first:\n- ${TRACKING}/plans/2026-10-01/ac-draft-us-1.md\n- ${TRACKING}/${STORIES}\n- ${TRACKING}/details/2026-10-11/structural-scan.json\n- Fill each output`))
  assert.deepEqual((await host.view()).phases, [
    { phase: 'RESEARCH', state: 'closed' }, { phase: 'DESIGN', state: 'closed' }, { phase: 'DISTILL', state: 'open' }, { phase: 'DELIVER', state: 'pending' }, { phase: 'PUBLISH', state: 'pending' },
  ])
})

test('init --from-artifacts without DISCUSS stories, or on a slug already started, is refused', async () => {
  const empty = pipelineHost()
  await empty.tracking.write(SLUG, 'plans/2026-10-01/ac-draft-us-1.md', '# AC only\n')
  assert.deepEqual(await empty.init({ fromArtifacts: true }), {
    ok: false, slug: SLUG, created: false, code: 'no-artifacts', reason: `${SLUG} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`,
  })
  assert.deepEqual(empty.events(), [])

  const started = pipelineHost()
  await started.tracking.write(SLUG, STORIES, '# Stories\n')
  await started.init()
  assert.deepEqual(await started.init({ fromArtifacts: true }), {
    ok: false, slug: SLUG, created: false, code: 'already-started', reason: `${SLUG} already has a journal; resume it without --from-artifacts`,
  })
})

test('a workflow without a DESIGN phase cannot start from DISCUSS artefacts', async () => {
  const renamed = edit(BUILT_IN_WORKFLOW, ['agent="solution-architect", phase="DESIGN"', 'agent="solution-architect", phase="ARCHITECTURE"'])
  const host = pipelineHost({ workflow: renamed })
  await host.tracking.write(SLUG, STORIES, '# Stories\n')

  assert.deepEqual(await host.init({ fromArtifacts: true }), {
    ok: false, slug: SLUG, created: false, code: 'workflow-invalid', reason: 'skraft has no DESIGN phase to start from',
  })
})

test('a story file nested deeper in plans/ counts too, a file outside plans/ or not ending in .md does not', async () => {
  const host = pipelineHost()
  await host.tracking.write(SLUG, 'plans/2026-10-01/sprint-1/stories-v1.md', '# Stories\n')
  await host.tracking.write(SLUG, 'notes/stories-v2.md', '# Not DISCUSS\n')
  await host.tracking.write(SLUG, 'plans/2026-10-01/stories-v1.md.orig', '# Merge leftover\n')

  await host.init({ fromArtifacts: true })

  assert.deepEqual(host.events()[0].artifacts, ['plans/2026-10-01/sprint-1/stories-v1.md'])
})
