import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, pipelineHost, prWriter, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

/** skraft-config.json as the developer edits it once the run is done: the consent given. */
const consent = async (host) => {
  const config = host.workspace.config()
  await host.workspace.write('skraft-config.json', JSON.stringify({ ...config, publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }))
}

test('skraft publish opens the pull request a run left local once the consent is given; again, it is up to date; with a new description, it is updated', async () => {
  const host = scripted({}, (it) => nominal(it))
  await host.start()
  assert.equal(eventsOf(host, 'step.recorded').at(-1).outcome, 'local')

  await consent(host)
  const opened = await host.publish()

  assert.deepEqual(opened, { ok: true, slug: SLUG, code: null, reason: 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42' })
  assert.deepEqual(host.codeHost.calls, ['push checkout', 'find checkout', 'create main <- checkout (draft): Pay by card at checkout'])
  assert.deepEqual(eventsOf(host, 'pull-request.opened').map(({ number, head, base }) => [number, head, base]), [[42, 'checkout', 'main']])
  assert.ok((await host.tracking.read(SLUG, 'pull-request-body.md')).includes('\n## Run summary\n\ndone: PUBLISH closed\n'))

  host.deps.agentCatalog.plugin.delete('pr-writer')
  assert.deepEqual(await host.publish(), { ok: true, slug: SLUG, code: null, reason: 'pull request #42 is up to date: https://github.example.com/acme/shop/pull/42' })
  assert.deepEqual(host.codeHost.calls.slice(3), ['push checkout', 'find checkout'])

  const prose = host.events().find((event) => event.type === 'step.started' && event.step === 'pr_writer').outputs[0]
  await host.tracking.write(SLUG, prose, (await host.tracking.read(SLUG, prose)).replace('Refunds are out of scope.', 'Refunds and partial captures are out of scope.'))
  assert.deepEqual(await host.publish(), { ok: true, slug: SLUG, code: null, reason: 'pull request #42 updated: https://github.example.com/acme/shop/pull/42' })
  assert.deepEqual(host.codeHost.calls.slice(5), ['push checkout', 'find checkout', `edit #42 ${TRACKING}/pull-request-body.md`])
  assert.deepEqual(eventsOf(host, 'pull-request.updated').map(({ number }) => number), [42])

  host.codeHost.fails.edit = 'gh could not update pull request #42'
  await host.tracking.write(SLUG, prose, (await host.tracking.read(SLUG, prose)).replace('partial captures', 'chargebacks'))
  assert.equal((await host.publish()).reason, 'pull request not opened: gh could not update pull request #42; pull-request.md holds its description, and skraft publish opens it once that is fixed')
})

test('skraft publish typed by the developer is the consent for that run: the stored answer stays as it is, the request is journaled', async () => {
  const declined = scripted({}, (it) => nominal(it))
  await declined.start()

  assert.deepEqual(await declined.publish(), { ok: true, slug: SLUG, code: null, reason: 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42' })

  assert.deepEqual(declined.workspace.config().publish, { pullRequest: false, visuals: false })
  const [requested] = eventsOf(declined, 'publish.requested')
  assert.deepEqual({ by: requested.by, consent: requested.consent }, { by: 'skraft publish', consent: false })
  assert.deepEqual(declined.types().slice(-2), ['publish.requested', 'pull-request.opened'])
})

test('skraft publish says why it opens nothing: no forge, a run not done, no active pipeline', async () => {

  const running = scripted({}, (it) => [agent()(it), () => ({ ok: false, unavailable: true, text: '' })])
  await running.start()
  assert.deepEqual(await running.publish(), { ok: false, slug: SLUG, code: 'not-done', reason: `${SLUG} has not completed; skraft publish opens the pull request of a completed run` })
  assert.deepEqual(running.codeHost.calls, [])
  const blocked = scripted({}, (it) => [agent({ fill: false })(it), agent({ fill: false })(it)])
  assert.equal((await blocked.start()).status, 'blocked')
  assert.equal((await blocked.publish()).code, 'not-done')

  assert.deepEqual(await pipelineHost().publish(), {
    ok: false, slug: null, code: 'no-active-pipeline',
    reason: 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug',
  })

  const broken = scripted({}, (it) => nominal(it))
  broken.prWriters.push(prWriter())
  await broken.start()
  await broken.deps.workspace.write('skraft-config.json', '{ "components": 3 }')
  assert.deepEqual(await broken.publish(), { ok: false, slug: SLUG, code: 'config-invalid', reason: 'skraft-config.json is invalid: components must be an array' })
  await broken.deps.workspace.write('skraft-config.json', JSON.stringify({ workflow: 'team.dot', components: [] }))
  assert.deepEqual(await broken.publish(), { ok: false, slug: SLUG, code: 'workflow-invalid', reason: 'team.dot is invalid: team.dot does not exist' })
})

test('skraft publish stops without breaking the chain when another run writes the journal meanwhile', async () => {
  const raced = scripted({}, (it) => nominal(it))
  await raced.start()
  await consent(raced)
  const create = raced.codeHost.create.bind(raced.codeHost)
  raced.codeHost.create = async (request) => {
    await raced.tracking.append(SLUG, JSON.stringify({ type: 'decision.recorded', prev: 'x' }))
    return create(request)
  }

  assert.deepEqual(await raced.publish(), { ok: false, slug: SLUG, code: 'journal-changed', reason: `${SLUG}: another run wrote events.jsonl meanwhile; run again once it stops` })

  const broken = scripted({}, (it) => nominal(it))
  await broken.start()
  await consent(broken)
  broken.codeHost.findPullRequest = async () => { throw new TypeError('a code host that breaks its contract') }
  await assert.rejects(broken.publish(), TypeError)
})
