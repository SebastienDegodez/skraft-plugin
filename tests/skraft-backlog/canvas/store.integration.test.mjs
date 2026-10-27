// The files the canvas reads — what the workflow left under .copilot-tracking — and the two it
// writes beside them: review.json and published.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { backlogDir, handoffDir, isSlug, listBacklogs, loadBacklog, signatureOf, writePublished, writeReviews } from '../../../plugins/skraft-backlog/prd-backlog/canvas/store.mjs'
import { sha256 } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { REPO, SLUG, makeWorkspace, writeJson } from './workspace.mjs'

const tempDir = async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-store-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  return cwd
}
const handoffPath = (cwd) => join(handoffDir(cwd, SLUG), 'handoff.md')

test('a slug is lowercase words joined by dashes', () => {
  for (const slug of ['eligibilite-prd', 'a', 'prd-2']) assert.ok(isSlug(slug), slug)
  for (const slug of ['Eligibilite', '../etc', 'a--b', '-a', 'a_b', '', 42, null]) assert.ok(!isSlug(slug), String(slug))
  assert.equal(backlogDir('/w', 'x'), join('/w', '.copilot-tracking', 'skraft-plans', 'x', 'backlog'))
  assert.equal(handoffDir('/w', 'x'), join('/w', '.copilot-tracking', 'github-issues', 'prds', 'x'))
})

test('the backlogs of a workspace are the slugs with a story map, the most recent first', async (t) => {
  const cwd = await tempDir(t)
  assert.deepEqual(await listBacklogs(cwd), [], 'a workspace without .copilot-tracking has no backlog')
  await makeWorkspace(cwd)
  await writeJson(join(backlogDir(cwd, 'older-prd'), 'story-map.json'), { milestones: [], epics: [] })
  await writeJson(join(backlogDir(cwd, 'Not_A_Slug'), 'story-map.json'), { milestones: [], epics: [] })
  await mkdir(backlogDir(cwd, 'no-map-yet'), { recursive: true })
  const past = new Date('2026-01-01T00:00:00Z')
  await utimes(join(backlogDir(cwd, 'older-prd'), 'story-map.json'), past, past)
  const backlogs = await listBacklogs(cwd)
  assert.deepEqual(backlogs.map((b) => b.slug), [SLUG, 'older-prd'])
  assert.equal(backlogs[1].updatedAt, past.getTime())
  await utimes(join(backlogDir(cwd, SLUG), 'story-map.json'), past, past)
  assert.deepEqual((await listBacklogs(cwd)).map((b) => b.slug), [SLUG, 'older-prd'].sort(), 'equal dates read in slug order')
})

test('a backlog loads with its inventory, map, story files and their fingerprints, reviews, plan and handoff', async (t) => {
  const cwd = await tempDir(t)
  const { dir } = await makeWorkspace(cwd)
  const loaded = await loadBacklog(cwd, SLUG)
  assert.ok('raw' in loaded)
  const { raw } = loaded
  assert.equal(raw.slug, SLUG)
  assert.equal(raw.inventory.language, 'fr')
  assert.deepEqual(raw.map.epics.map((e) => e.id), ['EP-001', 'EP-002'])
  assert.deepEqual([...raw.files.keys()], ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01'])
  assert.equal(raw.files.get('EP-001-S02').persona, 'utilisateur')
  assert.equal(raw.fingerprints.get('EP-001-S01'), sha256(await readFile(join(dir, 'stories', 'EP-001-S01.json'), 'utf8')))
  assert.deepEqual([...raw.reviews].map(([epic, r]) => [epic, r.attempt, r.review.verdict]), [['EP-001', 2, 'APPROVED'], ['EP-002', 1, 'REJECTED']])
  assert.deepEqual(raw.plan.notReady, { 'EP-001-S02': ['DoR 2: persona "utilisateur" names no role (Vague Persona)'], 'EP-002-S01': ['DoR item 7: technical notes do not name the licence registry the check calls'] })
  assert.equal(raw.repo, REPO)
  assert.deepEqual(raw.handoff, { exists: true, reviewed: false })
  assert.deepEqual([raw.published, raw.reviewed], [{}, {}])
})

test('a slug that is no slug, a missing map and a map that cannot be walked are refused', async (t) => {
  const cwd = await tempDir(t)
  assert.deepEqual(await loadBacklog(cwd, '../secrets'), { error: '../secrets is not a backlog slug' })
  assert.deepEqual(await loadBacklog(cwd, SLUG), { error: `${SLUG}: story-map.json is missing or cannot be read` })
  const mapPath = join(backlogDir(cwd, SLUG), 'story-map.json')
  for (const map of [{ milestones: [] }, { milestones: [], epics: [{ id: 'EP-001' }] }, { milestones: [], epics: [{ id: 'EP-001', stories: [{ id: 'EP-001-S01', after: [] }] }] }, [1, 2]]) {
    await writeJson(mapPath, map)
    assert.match((await loadBacklog(cwd, SLUG)).error, /story-map\.json is missing or cannot be read/, JSON.stringify(map))
  }
  await writeFile(mapPath, '{ not json', 'utf8')
  assert.match((await loadBacklog(cwd, SLUG)).error, /cannot be read/)
})

test('a story file that is not JSON, or whose id could leave the folder, is left unread', async (t) => {
  const cwd = await tempDir(t)
  const { dir, map } = await makeWorkspace(cwd)
  await writeFile(join(dir, 'stories', 'EP-001-S03.json'), '{ "id": "EP-001-S03", ', 'utf8')
  map.epics[1].stories.push({ ...map.epics[1].stories[0], id: '../inventory', tracer: false })
  await writeJson(join(dir, 'story-map.json'), map)
  const { raw } = /** @type {any} */ (await loadBacklog(cwd, SLUG))
  assert.deepEqual([...raw.files.keys()], ['EP-001-S01', 'EP-001-S02', 'EP-002-S01'])
  assert.ok(!raw.fingerprints.has('EP-001-S03'))
})

test('the latest readable review of each epic is the one read; other files of the folder are ignored', async (t) => {
  const cwd = await tempDir(t)
  const { dir } = await makeWorkspace(cwd)
  await writeFile(join(dir, 'reviews', 'EP-001', 'discuss-review-3.json'), '{ "verdict": ', 'utf8')
  await writeFile(join(dir, 'reviews', 'EP-001', 'notes.md'), '# notes', 'utf8')
  await writeJson(join(dir, 'reviews', 'EP-002', 'discuss-review-10.json'), { verdict: 'APPROVED', lenses: {} })
  await writeJson(join(dir, 'reviews', 'EP-002', 'discuss-review-9.json'), { verdict: 'NEEDS_REWORK', lenses: {} })
  await mkdir(join(dir, 'reviews', 'EP-003'), { recursive: true })
  const { raw } = /** @type {any} */ (await loadBacklog(cwd, SLUG))
  assert.deepEqual([...raw.reviews].map(([epic, r]) => [epic, r.attempt, r.review.verdict]).sort(), [['EP-001', 2, 'APPROVED'], ['EP-002', 10, 'APPROVED']])
})

test('the repository is plan.json’s, else the Project line of the handoff, else none when it reads unresolved', async (t) => {
  const cwd = await tempDir(t)
  const { dir } = await makeWorkspace(cwd)
  const plan = JSON.parse(await readFile(join(dir, 'plan.json'), 'utf8'))
  const repoOf = async () => (/** @type {any} */ (await loadBacklog(cwd, SLUG))).raw.repo
  await writeFile(handoffPath(cwd), '# Handoff\n\n* **Project**: other/repo\n', 'utf8')
  assert.equal(await repoOf(), REPO, 'plan.json wins over the handoff')
  await writeJson(join(dir, 'plan.json'), { ...plan, repo: undefined })
  assert.equal(await repoOf(), 'other/repo')
  await writeFile(handoffPath(cwd), '# Handoff\n\n* **Project**: unresolved\n', 'utf8')
  assert.equal(await repoOf(), null)
  await rm(handoffPath(cwd))
  assert.equal(await repoOf(), null)
  assert.deepEqual((/** @type {any} */ (await loadBacklog(cwd, SLUG))).raw.handoff, { exists: false, reviewed: false })
})

test('the handoff reads reviewed once its box is checked', async (t) => {
  const cwd = await tempDir(t)
  await makeWorkspace(cwd)
  const text = await readFile(handoffPath(cwd), 'utf8')
  await writeFile(handoffPath(cwd), text.replace('- [ ] Reviewed', '- [x] Reviewed'), 'utf8')
  assert.deepEqual((/** @type {any} */ (await loadBacklog(cwd, SLUG))).raw.handoff, { exists: true, reviewed: true })
})

test('a plan.json without issues, and canvas files of the wrong shape, read as nothing', async (t) => {
  const cwd = await tempDir(t)
  const { dir } = await makeWorkspace(cwd, { plan: false })
  await writeJson(join(dir, 'plan.json'), { repo: REPO, issues: 'none' })
  await writeJson(join(dir, 'published.json'), { version: 1, stories: ['EP-001-S01'] })
  await writeFile(join(dir, 'review.json'), 'not json', 'utf8')
  await rm(join(dir, 'inventory.json'))
  const { raw } = /** @type {any} */ (await loadBacklog(cwd, SLUG))
  assert.equal(raw.plan, null)
  assert.equal(raw.repo, REPO)
  assert.deepEqual([raw.published, raw.reviewed, raw.inventory], [{}, {}, null])
  assert.deepEqual(raw.handoff, { exists: false, reviewed: false })
})

test('reviews are recorded with the fingerprint read, and withdrawn, without a temporary file left behind', async (t) => {
  const cwd = await tempDir(t)
  const { dir } = await makeWorkspace(cwd)
  const first = await writeReviews(cwd, SLUG, [{ id: 'EP-001-S01', fingerprint: 'f1' }, { id: 'EP-001-S03', fingerprint: 'f3' }], { reviewed: true, now: '2026-10-20T10:00:00.000Z' })
  assert.deepEqual(first, { 'EP-001-S01': { at: '2026-10-20T10:00:00.000Z', fingerprint: 'f1' }, 'EP-001-S03': { at: '2026-10-20T10:00:00.000Z', fingerprint: 'f3' } })
  await writeReviews(cwd, SLUG, [{ id: 'EP-001-S03', fingerprint: 'f3' }], { reviewed: false, now: '2026-10-20T11:00:00.000Z' })
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'review.json'), 'utf8')), { version: 1, stories: { 'EP-001-S01': { at: '2026-10-20T10:00:00.000Z', fingerprint: 'f1' } } })
  assert.deepEqual((/** @type {any} */ (await loadBacklog(cwd, SLUG))).raw.reviewed, { 'EP-001-S01': { at: '2026-10-20T10:00:00.000Z', fingerprint: 'f1' } })
  assert.deepEqual((await readdir(dir)).filter((name) => name.endsWith('.tmp')), [])
})

test('published issues are merged with those recorded before', async (t) => {
  const cwd = await tempDir(t)
  const { dir } = await makeWorkspace(cwd)
  await writePublished(cwd, SLUG, { 'EP-001-S01': { number: 102, url: 'https://github.com/acme/permis/issues/102' } })
  const merged = await writePublished(cwd, SLUG, { 'EP-001-S03': { number: 103, url: 'https://github.com/acme/permis/issues/103' } })
  assert.deepEqual(Object.keys(merged), ['EP-001-S01', 'EP-001-S03'])
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'published.json'), 'utf8')).stories, merged)
  assert.deepEqual((/** @type {any} */ (await loadBacklog(cwd, SLUG))).raw.published, merged)
})

test('the canvas writes its files even where the workflow has not written yet', async (t) => {
  const cwd = await tempDir(t)
  await writePublished(cwd, 'fresh-prd', { 'EP-001-S01': { number: 1 } })
  assert.deepEqual(JSON.parse(await readFile(join(backlogDir(cwd, 'fresh-prd'), 'published.json'), 'utf8')), { version: 1, stories: { 'EP-001-S01': { number: 1 } } })
})

test('the signature changes when a file of the backlog or of the handoff changes, not for a temporary file', async (t) => {
  const cwd = await tempDir(t)
  const { dir } = await makeWorkspace(cwd)
  const before = await signatureOf(cwd, SLUG)
  assert.equal(await signatureOf(cwd, SLUG), before, 'reading twice gives the same signature')
  await writeFile(join(dir, 'review.json.123.tmp'), 'partial', 'utf8')
  assert.equal(await signatureOf(cwd, SLUG), before)
  await writeFile(join(dir, 'stories', 'EP-001-S01.json'), `${await readFile(join(dir, 'stories', 'EP-001-S01.json'), 'utf8')}\n`, 'utf8')
  const afterStory = await signatureOf(cwd, SLUG)
  assert.notEqual(afterStory, before)
  await writeFile(handoffPath(cwd), '# Handoff\n\n- [x] Reviewed and validated by a qualified human reviewer\n', 'utf8')
  assert.notEqual(await signatureOf(cwd, SLUG), afterStory)
  assert.equal(await signatureOf(cwd, 'absent-prd'), sha256(''), 'a backlog without files signs as empty')
})
