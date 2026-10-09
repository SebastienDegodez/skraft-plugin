import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  asksForce, asksRefine, check, decide, gate, issueHash, main, parseArgs, parseMarker, renderMarker,
} from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/refine-marker.mjs'
import { VERSION } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/version.mjs'

const issue = { title: 'Eligibility check', body: 'As a driver…\r\nAC: fast' }
const hash = issueHash(issue.title, issue.body)
const proposalComment = (overrides = {}) => ({
  id: 7, html_url: 'https://github.com/a/b/issues/1#issuecomment-7', author_association: 'MEMBER',
  user: { type: 'User' }, body: `${renderMarker({ version: '1.10.2', hash })}\n## Refinement proposal`, ...overrides,
})

test('the hash ignores line endings and surrounding blanks, and changes with the text', () => {
  assert.equal(issueHash('Eligibility check ', 'As a driver…\nAC: fast\n\n'), hash)
  assert.match(hash, /^[0-9a-f]{16}$/)
  assert.notEqual(issueHash(issue.title, `${issue.body} — within 2 s`), hash)
  assert.notEqual(issueHash('Other title', issue.body), hash)
})

test('the marker is visible text, since gh-aw strips HTML comments, and parses back', () => {
  const marker = renderMarker({ version: '2.0.0', hash })
  assert.equal(marker, `<sub>skraft-refine v=2.0.0 hash=${hash}</sub>`)
  assert.doesNotMatch(marker, /<!--/)
  assert.deepEqual(parseMarker(`text\n${marker}\nmore`), { version: '2.0.0', hash })
  assert.deepEqual(parseMarker(`<!-- skraft-refine v=1.9.0 hash=${hash} -->`), { version: '1.9.0', hash })
  assert.equal(parseMarker('skraft-refine v=1 hash=xyz'), null)
  assert.equal(parseMarker(undefined), null)
})

test('a closed issue or a pull request is not refined; force reopens only the closed issue', () => {
  assert.deepEqual(decide({ issue: { ...issue, state: 'closed' }, comments: [], version: '1.10.2' }), { todo: false, reason: 'the issue is closed' })
  assert.equal(decide({ issue: { ...issue, state: 'closed' }, comments: [], version: '1.10.2', force: true }).todo, true)
  assert.equal(decide({ issue: { ...issue, pull_request: {} }, comments: [], version: '1.10.2', force: true }).todo, false)
})

test('a trusted proposal for the current text and version means the work is done', () => {
  const result = decide({ issue, comments: [proposalComment()], version: '1.10.2' })
  assert.equal(result.todo, false)
  assert.match(result.reason, /issuecomment-7/)
})

test('an edited issue, a new version, or no proposal means the work is to do', () => {
  assert.deepEqual(decide({ issue, comments: [], version: '1.10.2' }), { todo: true, reason: 'no proposal yet' })
  assert.match(decide({ issue: { ...issue, body: 'edited' }, comments: [proposalComment()], version: '1.10.2' }).reason, /changed/)
  assert.equal(decide({ issue, comments: [proposalComment()], version: '1.11.0' }).todo, true)
})

test('a marker posted by an outsider is ignored; a bot is trusted', () => {
  assert.equal(decide({ issue, comments: [proposalComment({ author_association: 'NONE' })], version: '1.10.2' }).todo, true)
  assert.equal(decide({ issue, comments: [proposalComment({ author_association: 'NONE', user: { type: 'Bot' } })], version: '1.10.2' }).todo, false)
})

test('force redoes the work whatever the comments say', () => {
  assert.deepEqual(decide({ issue, comments: [proposalComment()], version: '1.10.2', force: true }), { todo: true, reason: 'forced' })
})

test('only a comment whose first word is /skraft-refine asks; --force on that line forces', () => {
  assert.equal(asksRefine('/skraft-refine'), true)
  assert.equal(asksRefine('  /skraft-refine please'), true)
  assert.equal(asksRefine('thanks\n/skraft-refine'), false)
  assert.equal(asksRefine('/skraft-refined'), false)
  assert.equal(asksRefine('/skraft-refine-all'), false)
  assert.equal(asksForce('/skraft-refine --force'), true)
  assert.equal(asksForce('/skraft-refine please --force\nmore'), true)
  assert.equal(asksForce('/skraft-refine\n--force'), false)
  assert.equal(asksForce('use /skraft-refine --force next time'), false)
})

test('the gate reads the event: new issue, the skraft-refine label, a command comment, or a manual run', () => {
  const on = (payload) => ({ issue: { number: 4 }, ...payload })
  assert.deepEqual(gate({ eventName: 'issues', payload: on({ action: 'opened' }) }), { run: true, issue: '4', force: false })
  assert.deepEqual(gate({ eventName: 'issues', payload: on({ action: 'labeled', label: { name: 'skraft-refine' } }) }), { run: true, issue: '4', force: false })
  assert.equal(gate({ eventName: 'issues', payload: on({ action: 'labeled', label: { name: 'bug' } }) }).run, false)
  assert.equal(gate({ eventName: 'issues', payload: on({ action: 'edited' }) }).run, false)
  assert.deepEqual(gate({ eventName: 'issue_comment', payload: on({ action: 'created', comment: { body: '/skraft-refine --force' } }) }), { run: true, issue: '4', force: true })
  assert.match(gate({ eventName: 'issue_comment', payload: on({ comment: { body: 'looks good' } }) }).reason, /does not start/)
  assert.match(gate({ eventName: 'issue_comment', payload: { issue: { number: 4, pull_request: {} }, comment: { body: '/skraft-refine' } } }).reason, /pull request/)
  assert.deepEqual(gate({ eventName: 'workflow_dispatch', payload: { inputs: {} }, issue: ' 12 ', force: true }), { run: true, issue: '12', force: true })
  assert.deepEqual(gate({ eventName: undefined, issue: '3' }), { run: true, issue: '3', force: false })
  assert.equal(gate({ eventName: 'push' }).run, false)
})

const fakeGh = (responses) => {
  const calls = []
  return {
    calls,
    run: (command, args) => {
      calls.push([command, ...args])
      const path = args.at(-1)
      if (!(path in responses)) throw new Error(`HTTP 404: ${path}`)
      return JSON.stringify(responses[path])
    },
  }
}

test('check reads the issue and every comment page through gh api', () => {
  const gh = fakeGh({
    'repos/a/b/issues/1': issue,
    'repos/a/b/issues/1/comments?per_page=100': [[{ body: 'hi', author_association: 'NONE' }], [proposalComment()]],
  })
  const result = check({ repo: 'a/b', issue: '1', version: '1.10.2' }, { run: gh.run })
  assert.equal(result.todo, false)
  assert.deepEqual(gh.calls[1].slice(0, 4), ['gh', 'api', '--paginate', '--slurp'])
})

test('check stops at the gate without calling gh, and takes force from the command comment', () => {
  const quiet = fakeGh({})
  assert.deepEqual(check({ repo: 'a/b', version: '1.10.2', eventName: 'issue_comment', payload: { issue: { number: 9 }, comment: { body: 'nice' } } }, { run: quiet.run }),
    { todo: false, reason: 'the comment does not start with /skraft-refine' })
  assert.equal(quiet.calls.length, 0)

  const gh = fakeGh({ 'repos/a/b/issues/9': issue, 'repos/a/b/issues/9/comments?per_page=100': [[proposalComment()]] })
  const result = check({ repo: 'a/b', version: '1.10.2', eventName: 'issue_comment', payload: { issue: { number: 9 }, comment: { body: '/skraft-refine --force' } } }, { run: gh.run })
  assert.deepEqual(result, { issue: '9', todo: true, reason: 'forced' })
})

test('check runs anyway when it cannot tell: bad input or a failed lookup', () => {
  assert.equal(check({ repo: 'nope', issue: '1', version: 'v' }).todo, true)
  assert.deepEqual(check({ repo: 'a/b', version: 'v' }), { todo: false, reason: 'no issue number' })
  assert.equal(check({ repo: 'a/b', issue: '1' }).reason, 'no version given')
  assert.equal(check({ repo: 'a/b', issue: '1', version: 'v' }, { run: () => { throw new Error('gh: not logged in\nmore') } }).reason,
    'lookup failed, running anyway: gh: not logged in')
})

test('main prints todo, writes it to GITHUB_OUTPUT, honours SKRAFT_REFINE_FORCE and defaults to the shipped version', async () => {
  const logs = []
  const outputs = []
  const gh = fakeGh({ 'repos/a/b/issues/1': issue, 'repos/a/b/issues/1/comments?per_page=100': [[proposalComment({ body: `${renderMarker({ version: VERSION, hash })}` })]] })
  const io = { run: gh.run, log: (line) => logs.push(line), append: (path, text) => outputs.push([path, text]), env: { GITHUB_OUTPUT: '/tmp/out' } }
  assert.equal(await main(['check', '--repo', 'a/b', '--issue', '1'], io), 0)
  assert.deepEqual(logs.slice(0, 1), ['todo=false'])
  assert.deepEqual(outputs, [['/tmp/out', 'todo=false\nissue=1\n']])

  logs.length = 0
  assert.equal(await main(['check', '--repo', 'a/b', '--issue', '1'], { ...io, env: { SKRAFT_REFINE_FORCE: 'true' } }), 0)
  assert.deepEqual(logs, ['todo=true', 'reason=forced'])

  logs.length = 0
  const event = { action: 'created', issue: { number: 1 }, comment: { body: 'thanks' } }
  const fromEvent = { ...io, read: () => JSON.stringify(event), env: { GITHUB_EVENT_NAME: 'issue_comment', GITHUB_EVENT_PATH: '/event.json' } }
  assert.equal(await main(['check', '--repo', 'a/b'], fromEvent), 0)
  assert.deepEqual(logs, ['todo=false', 'reason=the comment does not start with /skraft-refine'])

  logs.length = 0
  assert.equal(await main(['check', '--repo', 'a/b', '--issue', '1'], { ...io, read: () => '{oops', env: { GITHUB_EVENT_PATH: '/event.json' } }), 0)
  assert.match(logs[0], /unreadable event payload/)

  logs.length = 0
  assert.equal(await main(['hash', '--title', issue.title, '--body-file', 'b.txt'], { ...io, read: () => issue.body }), 0)
  assert.deepEqual(logs, [hash])
  assert.equal(await main(['nope'], io), 2)
})

test('arguments are parsed strictly', () => {
  assert.deepEqual(parseArgs(['check', '--repo', 'a/b', '--issue', '3', '--force', '--version', '1', '--event-name', 'issues', '--event-path', 'e.json']),
    { mode: 'check', repo: 'a/b', issue: '3', force: true, version: '1', eventName: 'issues', eventPath: 'e.json' })
  assert.throws(() => parseArgs(['check', '--what']), /unknown argument/)
  assert.throws(() => parseArgs(['check', '--repo']), /needs a value/)
  assert.throws(() => parseArgs(['other']), /usage/)
})
