// The two plugins share no code at runtime: the engineering pipeline reads the story files
// any producer writes, and skraft-backlog is one such producer. This test holds that file
// contract between the backlog descriptors and the engine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { frameworkConfigFrom, parseAgentDescriptor } from '../../../scripts/agent-policy/build-config.mjs'
import { discussArtifacts } from '../../../plugins/skraft-framework/engine/domain/pipeline/artifacts.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const coreConfig = frameworkConfigFrom(join(repo, 'plugins/skraft-framework/com.github.copilot/agents'))
const backlogAgents = join(repo, 'plugins/skraft-backlog/com.github.copilot/agents')
const backlog = Object.fromEntries(readdirSync(backlogAgents).map((file) => {
  const descriptor = parseAgentDescriptor(readFileSync(join(backlogAgents, file), 'utf8'), { id: file.replace(/\.agent\.md$/, '') })
  return [descriptor.id, descriptor]
}))

const STORIES = '.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/stories-{milestone}.md'
const AC_DRAFT = '.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/ac-draft-{story}.md'

/** A planner output as it lands, relative to the pipeline's tracking folder. @param {string} path */
const landed = (path) => path
  .replace('.copilot-tracking/skraft-plans/{projectSlug}/', '')
  .replace('{date}', '2026-10-20').replace('{milestone}', 'm1').replace('{story}', 'pay-by-card')

test('the engine starts a run from the story files the backlog planner writes, at the same paths', () => {
  for (const path of [STORIES, AC_DRAFT]) assert.ok(backlog['backlog-planner'].outputs.includes(path), `backlog-planner no longer writes ${path}`)
  const written = [STORIES, AC_DRAFT].map(landed)
  assert.deepEqual(discussArtifacts(written), written, 'the engineering contract changed: update both plugins together')
})

test('the planner reads what the discoverer writes, and accepts an upstream triage instead', () => {
  const triage = backlog['backlog-discoverer'].outputs.find((path) => /\/triage-\{YYYY-MM-DD\}\.md$/.test(path))
  assert.ok(triage, 'backlog-discoverer writes a triage report')
  assert.ok(backlog['backlog-planner'].inputs.some((path) => path.endsWith('/research/{date}/triage-{date}.md')))
  assert.ok(backlog['backlog-planner'].context.some((path) => path.includes('triage-ingest-{date}.md')))
})

test('no engineering agent declares a backlog agent, and no backlog agent declares an engineering one', () => {
  const backlogNames = new Set(Object.values(backlog).flatMap((d) => [d.id, d.name]))
  for (const [agent, dispatcher] of Object.entries(coreConfig.agentDispatchers)) {
    assert.ok(!backlogNames.has(agent) && !backlogNames.has(dispatcher), `${agent} ← ${dispatcher}`)
  }
  const engineering = new Set(Object.keys(coreConfig.agentAliases))
  for (const descriptor of Object.values(backlog)) {
    if (descriptor.dispatchedBy) assert.ok(!engineering.has(descriptor.dispatchedBy), descriptor.id)
  }
})
