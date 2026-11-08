// The two plugins share no code at runtime: the engineering pipeline reads the story files
// any producer writes, and skraft-backlog is one such producer. This test holds that file
// contract between the backlog agents' prompts, which the model follows, and the engine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readFrontMatter } from '../../../eng/lib/front-matter.mjs'
import { discussArtifacts } from '../../../plugins/skraft-framework/engine/domain/pipeline/artifacts.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url))

/** Every Copilot agent of a plugin: id, name, the agents it lists and its prompt. @param {string} plugin */
const agentsOf = (plugin) => {
  const dir = join(repo, 'plugins', plugin, 'com.github.copilot/agents')
  return readdirSync(dir).map((file) => {
    const { data, body } = readFrontMatter(readFileSync(join(dir, file), 'utf8'))
    return { id: file.replace(/\.agent\.md$/, ''), name: String(data.name ?? ''), children: Array.isArray(data.agents) ? data.agents.map(String) : [], prompt: body }
  })
}
const backlog = Object.fromEntries(agentsOf('skraft-backlog').map((agent) => [agent.id, agent]))
const engineering = agentsOf('skraft-framework')

const STORIES = '.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/stories-{milestone}.md'
const AC_DRAFT = '.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/ac-draft-{story}.md'

/** A planner output as it lands, relative to the pipeline's tracking folder. @param {string} path */
const landed = (path) => path
  .replace('.copilot-tracking/skraft-plans/{projectSlug}/', '')
  .replace('{date}', '2026-10-20').replace('{milestone}', 'm1').replace('{story}', 'pay-by-card')

test('the engine starts a run from the story files the backlog planner writes, at the same paths', () => {
  const planner = backlog['backlog-planner'].prompt
  assert.ok(planner.includes(STORIES), `backlog-planner no longer writes ${STORIES}`)
  assert.ok(planner.includes('.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/') && planner.includes('ac-draft-{story}.md'), `backlog-planner no longer writes ${AC_DRAFT}`)
  const written = [STORIES, AC_DRAFT].map(landed)
  assert.deepEqual(discussArtifacts(written), written, 'the engineering contract changed: update both plugins together')
})

test('the planner reads what the discoverer writes, and accepts an upstream triage instead', () => {
  assert.ok(backlog['backlog-discoverer'].prompt.includes('triage-{YYYY-MM-DD}.md'), 'backlog-discoverer writes a triage report')
  assert.ok(backlog['backlog-planner'].prompt.includes('/research/{date}/triage-{date}.md'))
  assert.ok(backlog['backlog-planner'].prompt.includes('triage-ingest-{date}.md'))
})

test('no engineering agent lists a backlog agent, and no backlog agent lists an engineering one', () => {
  const names = (agents) => new Set(agents.flatMap(({ id, name }) => [id, name]))
  const backlogNames = names(Object.values(backlog))
  const engineeringNames = names(engineering)
  for (const agent of engineering) assert.ok(!agent.children.some((child) => backlogNames.has(child)), agent.id)
  for (const agent of Object.values(backlog)) assert.ok(!agent.children.some((child) => engineeringNames.has(child)), agent.id)
})
