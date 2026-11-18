import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createForgeHuman } from '../../../../plugins/skraft-framework/engine/drivers/forge-ci/forge-human.mjs'
import { InMemoryCodeHost, InMemoryTracking } from '../../unit/support/in-memory-host.mjs'

const SLUG = 'checkout'

const QUESTION = Object.freeze({
  key: 'adr-1',
  kind: 'adr-ratification',
  text: 'Ratify the Proposed ADRs docs/adr/adr-001-x.md?',
  options: ['RATIFIED', 'REJECTED'],
  refusals: ['REJECTED'],
  header: 'ADR',
  step: 'adr',
  visit: 1,
  subjects: ['docs/adr/adr-001-x.md'],
})

const wiredHost = () => {
  const tracking = new InMemoryTracking()
  const codeHost = new InMemoryCodeHost()
  codeHost.read = (file) => tracking.files.get(file.slice(`${tracking.root}/`.length)) ?? ''
  return { tracking, codeHost }
}

test('on ask, forge-human posts a comment on the issue whose body marks it with the question key, and returns null so the engine ends `waiting`', async () => {
  const { tracking, codeHost } = wiredHost()
  const forgeHuman = createForgeHuman({ codeHost, files: tracking, slug: SLUG, issueNumber: 42 })

  const answer = await forgeHuman.ask(QUESTION)

  assert.equal(answer, null)
  assert.equal(codeHost.comments.length, 1, 'one issue comment is posted')
  const [comment] = codeHost.comments
  assert.equal(comment.number, 42)
  assert.match(comment.body, /^<sub>skraft-ask key=adr-1 run=checkout step=adr<\/sub>/, 'first line carries the marker')
  assert.match(comment.body, /Ratify the Proposed ADRs/, 'includes the question text')
  assert.match(comment.body, /\/skraft-answer adr-1 /, 'includes the reply template')
})

test('on ask, forge-human also adds the needs-clarification label on the issue', async () => {
  const { tracking, codeHost } = wiredHost()
  const forgeHuman = createForgeHuman({ codeHost, files: tracking, slug: SLUG, issueNumber: 42 })

  await forgeHuman.ask(QUESTION)

  assert.deepEqual(codeHost.labels[42], ['needs-clarification'])
})

test('forge-human persists the comment URL under forge/asks/<key>.json so a later dispatch addresses the same comment directly', async () => {
  const { tracking, codeHost } = wiredHost()
  const forgeHuman = createForgeHuman({ codeHost, files: tracking, slug: SLUG, issueNumber: 42 })

  await forgeHuman.ask(QUESTION)

  const saved = await tracking.read(SLUG, 'forge/asks/adr-1.json')
  assert.ok(saved, 'the ask record file is written')
  assert.equal(JSON.parse(saved).url, codeHost.comments[0].url)
})

test('on a second ask with the same key, forge-human updates the same comment rather than duplicating it', async () => {
  const { tracking, codeHost } = wiredHost()
  const forgeHuman = createForgeHuman({ codeHost, files: tracking, slug: SLUG, issueNumber: 42 })

  await forgeHuman.ask(QUESTION)
  await forgeHuman.ask({ ...QUESTION, text: 'Ratify (clarified) the Proposed ADRs?' })

  assert.equal(codeHost.comments.length, 1, 'still one comment on the issue')
  assert.equal(codeHost.comments[0].edits, 1, 'the existing comment was updated once')
  assert.match(codeHost.comments[0].body, /clarified/)
})
