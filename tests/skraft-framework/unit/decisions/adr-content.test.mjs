import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, scripted } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, afterDesign, architect, eventsOf } from '../support/decisions.mjs'

const designRecords = (host) => eventsOf(host, 'step.recorded').filter((event) => event.step === 'design').map(({ visit, attempt, outcome, code, failures }) => [visit, attempt, outcome, code, failures])
const pinned = (token) => `${ADR_1} names a version (${token}): name the technology or the capability it brings; versions live in the manifests`

test('a draft ADR that pins a version, an image tag or a package is refused, one line per pin; rewritten with families it passes', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ header: 'generator: skraft@1.15.3', body: 'We build on ubi8/ubi:8.9 and react-router@6, release 2.1.0, SDK v3, and again 2.1.0.' }) })(it),
    architect({ [ADR_1]: adrText({ body: 'We build on Red Hat UBI base images and a client-side router that loads data.' }) })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [pinned('ubi8/ubi:8.9'), pinned('react-router@6'), pinned('2.1.0'), pinned('v3')]],
    [1, 2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})
