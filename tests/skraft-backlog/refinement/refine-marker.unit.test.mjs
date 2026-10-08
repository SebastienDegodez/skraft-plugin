import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  asksForce, check, decide, issueHash, main, parseArgs, parseMarker, renderMarker,
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

test('the marker renders hidden and parses back', () => {
  const marker = renderMarker({ version: '2.0.0', hash })
  assert.equal(marker, `<!-- skraft-refine v=2.0.0 hash=${hash} -->`)
  assert.deepEqual(parseMarker(`text\n${marker}\nmore`), { version: '2.0.0', hash })
  assert.equal(parseMarker('<!-- skraft-refine v=1 hash=xyz -->'), null)
  assert.equal(parseMarker(undefined), null)
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

test('only a comment starting with /skraft-refine and carrying --force asks for force', () => {
  assert.equal(asksForce('/skraft-refine --force'), true)
  assert.equal(asksForce('thanks\n  /skraft-refine please --force'), true)
  assert.equal(asksForce('/skraft-refine'), false)
  assert.equal(asksForce('use /skraft-refine --force next time'), false)
  assert.equal(asksForce('/skraft-refined --force'), false)
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

test('check takes the issue number and the force request from the aw_context of a slash command', () => {
  const gh = fakeGh({
    'repos/a/b/issues/9': issue,
    'repos/a/b/issues/9/comments?per_page=100': [[proposalComment()]],
    'repos/a/b/issues/comments/55': { body: '/skraft-refine --force' },
  })
  const result = check({ repo: 'a/b', version: '1.10.2', awContext: JSON.stringify({ item_number: '9', comment_id: '55' }) }, { run: gh.run })
  assert.deepEqual(result, { issue: '9', todo: true, reason: 'forced' })
})

test('check runs anyway when it cannot tell: bad input or a failed lookup', () => {
  assert.equal(check({ repo: 'nope', issue: '1', version: 'v' }).todo, true)
  assert.equal(check({ repo: 'a/b', version: 'v' }).reason, 'no issue number')
  assert.equal(check({ repo: 'a/b', issue: '1' }).reason, 'no version given')
  assert.equal(check({ repo: 'a/b', issue: '1', version: 'v', awContext: '{oops' }, { run: () => { throw new Error('gh: not logged in\nmore') } }).reason,
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
  assert.equal(await main(['hash', '--title', issue.title, '--body-file', 'b.txt'], { ...io, read: () => issue.body }), 0)
  assert.deepEqual(logs, [hash])
  assert.equal(await main(['nope'], io), 2)
})

test('arguments are parsed strictly', () => {
  assert.deepEqual(parseArgs(['check', '--repo', 'a/b', '--issue', '3', '--force', '--version', '1']), { mode: 'check', repo: 'a/b', issue: '3', force: true, version: '1' })
  assert.throws(() => parseArgs(['check', '--what']), /unknown argument/)
  assert.throws(() => parseArgs(['check', '--repo']), /needs a value/)
  assert.throws(() => parseArgs(['other']), /usage/)
})
