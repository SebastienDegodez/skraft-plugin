// Unit tests: the ReportPublication use case (application/report-publication-service.mjs)
// with hand-written in-memory ports — TrackingStore, SourceControl, Hasher and a simulated
// GitHub behind ReportTransport. Every pending path, unchanged vs published, the authorized
// update carried over a retry, the files written and the PR-before-issue order.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReportPublication } from '../../../plugins/skraft-framework/src/application/report-publication-service.mjs'

const SLUG = 'checkout'
const STORY = 'checkout'
const PENDING = 'reporting/pending.json'
const PUBLICATION = 'reporting/publication.json'
const RECEIPT = 'reporting/forecast/checkout.json'
const VIEWER = 'skraft-bot'
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const PREFS = Object.freeze({
  confirmed: true, provider: 'github', host: 'github.com', repo: 'acme/shop', branch: 'feature/checkout',
  prNumber: 12, issueNumber: 42, destinations: { pr: true, issue: 'none', chat: false }, maxMedia: 0, allowDraftPr: false,
})
const prefs = (overrides = {}) => ({ ...PREFS, ...overrides, destinations: { ...PREFS.destinations, ...overrides.destinations } })
const PR_TARGET = { provider: 'github', host: 'github.com', repo: 'acme/shop', type: 'pr', number: 12 }
const ISSUE_TARGET = { ...PR_TARGET, type: 'issue', number: 42 }
const prUrl = (id) => `https://github.com/acme/shop/pull/12#issuecomment-${id}`
const issueUrl = (id) => `https://github.com/acme/shop/issues/42#issuecomment-${id}`

const createStore = () => {
  const files = new Map()
  const writes = []
  return {
    files,
    writes,
    port: {
      read: async (slug, path) => files.get(`${slug}::${path}`),
      write: async (slug, path, text) => { writes.push([path, text]); files.set(`${slug}::${path}`, text) },
    },
    seed: (path, value) => files.set(`${SLUG}::${path}`, JSON.stringify(value)),
    text: (path) => files.get(`${SLUG}::${path}`),
    json: (path) => JSON.parse(files.get(`${SLUG}::${path}`)),
    pendingWrites: () => writes.filter(([path]) => path === PENDING).map(([, text]) => JSON.parse(text)),
  }
}

// A simulated GitHub: comments per target; observe() and publish() as a host agent would answer.
const createRemote = () => {
  const threads = new Map()
  const calls = []
  let next = 100
  const key = (target) => `${target.type}#${target.number}`
  const remote = {
    threads,
    calls,
    observeMode: 'up', // 'up' | 'down'
    publishMode: 'up', // 'up' | 'lost' (the write happens, its readback never comes)
    snapshot: (value) => value,
    readback: (value) => value,
    comments: (target) => threads.get(key(target)) ?? [],
    port: {
      observe: async ({ packet }) => {
        calls.push(['observe', packet.destination])
        if (remote.observeMode === 'down') return null
        return remote.snapshot({
          target: packet.target, branch: packet.branch, viewer: VIEWER, complete: true,
          comments: structuredClone(remote.comments(packet.target)),
          capabilities: { read: true, create: true, update: true },
          provenance: { server: 'github', tool: 'issue_read' },
        })
      },
      publish: async ({ packet, decision }) => {
        calls.push([decision.action, packet.destination])
        const { target } = packet
        const comments = remote.comments(target)
        let comment = comments.find((c) => c.id === decision.commentId)
        if (decision.action === 'create') {
          next += 1
          const url = target.type === 'pr' ? prUrl(next) : issueUrl(next)
          comment = { id: next, body: packet.body, author: VIEWER, url }
          threads.set(key(target), [...comments, comment])
        } else if (decision.action === 'update') {
          comment.body = packet.body
        }
        if (remote.publishMode === 'lost') return null
        return remote.readback({
          target, branch: packet.branch, viewer: VIEWER,
          provenance: { server: 'github', tool: 'issue_read' },
          comment: structuredClone(comment),
          ...(decision.action === 'unchanged' ? {} : { writeResult: { id: comment.id } }),
        })
      },
    },
  }
  return remote
}

const setup = ({ branch = 'feature/checkout' } = {}) => {
  const store = createStore()
  const remote = createRemote()
  const branchCalls = []
  const service = createReportPublication({
    trackingStore: store.port,
    sourceControl: { currentBranch: async () => { branchCalls.push(true); return branch } },
    hasher: { sha256Sync: sha },
    reportTransport: remote.port,
  })
  const publish = (body, overrides = {}) => service.publish({
    slug: SLUG, preferences: overrides.preferences ?? PREFS, story: overrides.story ?? STORY, kind: overrides.kind ?? 'forecast', body,
  })
  return { store, remote, service, publish, branchCalls }
}

test('ReportPublication: a first publication creates the PR comment, writes the receipt twice and clears the pending attempt', async () => {
  const { store, remote, publish } = setup()
  const results = await publish('Forecast A')

  assert.deepEqual(results, [{ destination: 'pr', status: 'published', url: prUrl(101) }])
  assert.deepEqual(remote.calls, [['observe', 'pr'], ['create', 'pr']])
  const [comment] = remote.comments(PR_TARGET)
  assert.match(comment.body, /^<!-- skraft-report:forecast:[0-9a-f]+ -->\n\nForecast A$/)
  const receipt = store.json(RECEIPT)
  assert.deepEqual(receipt, {
    story: STORY, kind: 'forecast',
    targets: {
      pr: {
        target: PR_TARGET, status: 'published', id: 101, url: prUrl(101), renderedBodyDigest: sha(comment.body),
        verification: 'host-mcp-readback', localValidation: 'body-target-match',
        provenance: { server: 'github', tool: 'issue_read' },
      },
    },
  })
  assert.equal(store.text(RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`)
  assert.equal(store.text(PUBLICATION), store.text(RECEIPT))
  assert.equal(store.text(PENDING), '{}\n')
  // the attempt was saved before the transport ran, then with its decision
  const [prepared, decided, cleared] = store.pendingWrites()
  assert.equal(prepared.packet.status, 'ready')
  assert.equal(prepared.packet.digest, sha(comment.body))
  assert.deepEqual(Object.keys(prepared), ['packet'])
  assert.deepEqual(Object.keys(decided), ['packet', 'decision'])
  assert.equal(decided.decision.action, 'create')
  assert.deepEqual(cleared, {})
})

test('ReportPublication: the same report published again is unchanged remotely, never a second comment', async () => {
  const { remote, publish, store } = setup()
  await publish('Forecast A')
  const results = await publish('Forecast A')

  assert.deepEqual(results, [{ destination: 'pr', status: 'unchanged', url: prUrl(101) }])
  assert.equal(remote.comments(PR_TARGET).length, 1)
  assert.deepEqual(remote.calls.slice(-2), [['observe', 'pr'], ['unchanged', 'pr']])
  assert.equal(store.text(PENDING), '{}\n')
})

test('ReportPublication: a changed report updates the owned comment and is published', async () => {
  const { remote, publish, store } = setup()
  await publish('Forecast A')
  const results = await publish('Forecast B')

  assert.deepEqual(results, [{ destination: 'pr', status: 'published', url: prUrl(101) }])
  assert.deepEqual(remote.calls.slice(-2), [['observe', 'pr'], ['update', 'pr']])
  assert.match(remote.comments(PR_TARGET)[0].body, /\n\nForecast B$/)
  assert.equal(store.json(RECEIPT).targets.pr.renderedBodyDigest, sha(remote.comments(PR_TARGET)[0].body))
})

test('ReportPublication: preparation refused (branch differs) is pending before anything is written or observed', async () => {
  const { store, remote, publish } = setup({ branch: 'main' })
  const results = await publish('Forecast A')

  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'Current branch differs from confirmed PR scope' }])
  assert.deepEqual(remote.calls, [])
  assert.equal(store.text(PENDING), undefined)
  assert.deepEqual(store.writes, [])
})

test('ReportPublication: a packet that is not ready is saved as pending and never observed', async () => {
  const { store, remote, publish } = setup()
  const results = await publish('Forecast A', { preferences: prefs({ prNumber: null }) })

  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'Confirmed target number is missing' }])
  assert.deepEqual(remote.calls, [])
  assert.deepEqual(store.json(PENDING), { packet: { status: 'pending', reason: 'Confirmed target number is missing' } })
})

test('ReportPublication: no trustworthy snapshot leaves the ready packet pending, nothing is written remotely', async () => {
  const { store, remote, publish } = setup()
  remote.observeMode = 'down'
  const results = await publish('Forecast A')

  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'no trustworthy snapshot of the target' }])
  assert.deepEqual(remote.calls, [['observe', 'pr']])
  const pending = store.json(PENDING)
  assert.deepEqual(Object.keys(pending), ['packet'])
  assert.equal(pending.packet.status, 'ready')
  assert.equal(pending.packet.destination, 'pr')
  assert.equal(store.text(RECEIPT), undefined)
})

test('ReportPublication: a pending decision is saved with its reason and nothing is published', async () => {
  const { store, remote, publish } = setup()
  remote.snapshot = (value) => ({ ...value, complete: false })
  const results = await publish('Forecast A')

  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'Complete comment pagination is required' }])
  assert.deepEqual(remote.calls, [['observe', 'pr']])
  const pending = store.json(PENDING)
  assert.deepEqual(Object.keys(pending), ['packet', 'decision'])
  assert.deepEqual(pending.decision, { action: 'pending', reason: 'Complete comment pagination is required' })
  assert.equal(store.text(RECEIPT), undefined)
})

test('ReportPublication: a write without a fresh readback stays pending, its decision saved', async () => {
  const { store, remote, publish } = setup()
  remote.publishMode = 'lost'
  const results = await publish('Forecast A')

  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'create: no fresh readback' }])
  const pending = store.json(PENDING)
  assert.deepEqual(Object.keys(pending), ['packet', 'decision'])
  assert.equal(pending.decision.action, 'create')
  assert.equal(store.text(RECEIPT), undefined)
  assert.equal(store.text(PUBLICATION), undefined)
})

test('ReportPublication: a readback that does not attest the write is refused and stays pending', async () => {
  const { store, remote, publish } = setup()
  remote.readback = (value) => ({ ...value, viewer: 'mallory' })
  const results = await publish('Forecast A')

  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'readback refused: Readback viewer identity differs from decision' }])
  assert.equal(store.json(PENDING).decision.action, 'create')
  assert.equal(store.text(RECEIPT), undefined)
  assert.equal(store.text(PUBLICATION), undefined)
})

test('ReportPublication: an authorized update whose readback was lost is recovered on retry, as unchanged', async () => {
  const { store, remote, publish } = setup()
  await publish('Forecast A')
  remote.publishMode = 'lost'
  const lost = await publish('Forecast B')
  assert.deepEqual(lost, [{ destination: 'pr', status: 'pending', reason: 'update: no fresh readback' }])
  const saved = store.json(PENDING)
  assert.equal(saved.decision.action, 'update')
  assert.equal(saved.decision.commentId, 101)
  assert.deepEqual(saved.previousAuthorizedDecision, saved.decision)

  remote.publishMode = 'up'
  store.writes.length = 0
  const retried = await publish('Forecast B')
  assert.deepEqual(retried, [{ destination: 'pr', status: 'unchanged', url: prUrl(101) }])
  assert.deepEqual(remote.calls.slice(-2), [['observe', 'pr'], ['unchanged', 'pr']])
  const [prepared, decided, cleared] = store.pendingWrites()
  assert.deepEqual(prepared.previousAuthorizedDecision, saved.decision)
  assert.equal(decided.decision.action, 'unchanged')
  assert.deepEqual(decided.previousAuthorizedDecision, saved.decision)
  assert.deepEqual(cleared, {})
  assert.equal(store.json(RECEIPT).targets.pr.renderedBodyDigest, sha(remote.comments(PR_TARGET)[0].body))
})

test('ReportPublication: without the saved authorization, a remote that changed since the receipt is a conflict', async () => {
  const { store, remote, publish } = setup()
  await publish('Forecast A')
  remote.publishMode = 'lost'
  await publish('Forecast B')
  store.seed(PENDING, {}) // the saved attempt is gone
  remote.publishMode = 'up'
  const results = await publish('Forecast B')
  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'Remote digest changed; preserve manual edits and reconcile conflict' }])
})

const UPDATE = { action: 'update', commentId: 7, viewer: VIEWER }
const OTHER = { action: 'update', commentId: 8, viewer: VIEWER }

test('ReportPublication: a prior attempt of the same report and destination carries its authorized update', async () => {
  for (const [label, prior, expected] of [
    ['an update decision', { decision: UPDATE, previousAuthorizedDecision: OTHER }, UPDATE],
    ['a create decision', { decision: { action: 'create' }, previousAuthorizedDecision: OTHER }, OTHER],
    ['no decision', { previousAuthorizedDecision: OTHER }, OTHER],
  ]) {
    const { store, remote, publish } = setup()
    store.seed(PENDING, { packet: { status: 'ready', story: STORY, kind: 'forecast', destination: 'pr' }, ...prior })
    remote.observeMode = 'down'
    await publish('Forecast A')
    const pending = store.json(PENDING)
    assert.deepEqual(Object.keys(pending), ['packet', 'previousAuthorizedDecision'], label)
    assert.deepEqual(pending.previousAuthorizedDecision, expected, label)
  }
})

test('ReportPublication: a prior attempt of another story, kind or destination carries nothing', async () => {
  for (const [label, packet] of [
    ['story', { story: 'billing', kind: 'forecast', destination: 'pr' }],
    ['kind', { story: STORY, kind: 'outcome', destination: 'pr' }],
    ['destination', { story: STORY, kind: 'forecast', destination: 'issue' }],
  ]) {
    const { store, remote, publish } = setup()
    store.seed(PENDING, { packet: { status: 'ready', ...packet }, decision: UPDATE, previousAuthorizedDecision: OTHER })
    remote.observeMode = 'down'
    await publish('Forecast A')
    const pending = store.json(PENDING)
    assert.deepEqual(Object.keys(pending), ['packet'], label)
    assert.equal(pending.packet.story, STORY, label)
    assert.equal(pending.packet.kind, 'forecast', label)
    assert.equal(pending.packet.destination, 'pr', label)
  }
})

test('ReportPublication: a pending decision keeps the prior authorization, a create decision drops it', async () => {
  {
    const { store, remote, publish } = setup()
    store.seed(PENDING, { packet: { story: STORY, kind: 'forecast', destination: 'pr' }, decision: UPDATE })
    remote.snapshot = (value) => ({ ...value, complete: false })
    await publish('Forecast A')
    const pending = store.json(PENDING)
    assert.equal(pending.decision.action, 'pending')
    assert.deepEqual(pending.previousAuthorizedDecision, UPDATE)
  }
  {
    const { store, remote, publish } = setup()
    store.seed(PENDING, { packet: { story: STORY, kind: 'forecast', destination: 'pr' }, decision: UPDATE })
    remote.publishMode = 'lost'
    await publish('Forecast A')
    const pending = store.json(PENDING)
    assert.equal(pending.decision.action, 'create')
    assert.deepEqual(Object.keys(pending), ['packet', 'decision'])
  }
})

test('ReportPublication: an unreadable or empty saved attempt is no prior attempt, even for a report without identity', async () => {
  // story missing: preparation refuses, whatever the saved attempt holds
  for (const saved of [undefined, '{}', 'not json']) {
    const { store, remote, service } = setup()
    if (saved !== undefined) store.files.set(`${SLUG}::${PENDING}`, saved)
    const results = await service.publish({ slug: SLUG, preferences: PREFS, story: undefined, kind: 'forecast', body: 'Forecast A' })
    assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'Report requires a story and forecast or outcome kind' }], String(saved))
    assert.deepEqual(remote.calls, [])
  }
})

test('ReportPublication: the PR is published first, then the issue link to it; the receipt keeps both targets', async () => {
  const { store, remote, publish } = setup()
  const results = await publish('Forecast A', { preferences: prefs({ destinations: { issue: 'link' } }) })

  assert.deepEqual(results, [
    { destination: 'pr', status: 'published', url: prUrl(101) },
    { destination: 'issue', status: 'published', url: issueUrl(102) },
  ])
  assert.deepEqual(remote.calls, [['observe', 'pr'], ['create', 'pr'], ['observe', 'issue'], ['create', 'issue']])
  assert.ok(remote.comments(ISSUE_TARGET)[0].body.endsWith(`\n\nReport: ${prUrl(101)}\n`))
  const receipt = store.json(RECEIPT)
  assert.deepEqual(Object.keys(receipt.targets), ['pr', 'issue'])
  assert.equal(receipt.targets.pr.url, prUrl(101))
  assert.equal(receipt.targets.issue.url, issueUrl(102))
  assert.deepEqual(store.json(PUBLICATION), receipt)
})

test('ReportPublication: an unselected destination is skipped; an issue alone gets the full report', async () => {
  const { remote, publish } = setup()
  const results = await publish('Forecast A', { preferences: prefs({ destinations: { pr: false, issue: 'full' } }) })
  assert.deepEqual(results, [{ destination: 'issue', status: 'published', url: issueUrl(101) }])
  assert.deepEqual(remote.calls, [['observe', 'issue'], ['create', 'issue']])
  assert.match(remote.comments(ISSUE_TARGET)[0].body, /\n\nForecast A$/)

  const none = setup()
  assert.deepEqual(await none.publish('Forecast A', { preferences: prefs({ destinations: { pr: false, issue: 'none' } }) }), [])
  assert.deepEqual(none.remote.calls, [])
})
