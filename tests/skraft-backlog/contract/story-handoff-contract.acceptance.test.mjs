// The two plugins share no code at runtime: the engineering pipeline reads the story files
// any producer writes, and skraft-backlog is one such producer. This test holds that file
// contract between the shipped descriptors of both plugins.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseAgentDescriptor } from '../../../plugins/skraft-framework/src/cli/build-config.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const coreConfig = JSON.parse(readFileSync(join(repo, 'plugins/skraft-framework/skraft-framework.config.json'), 'utf8'))
const backlogAgents = join(repo, 'plugins/skraft-backlog/com.github.copilot/agents')
const backlog = Object.fromEntries(readdirSync(backlogAgents).map((file) => {
  const descriptor = parseAgentDescriptor(readFileSync(join(backlogAgents, file), 'utf8'), { id: file.replace(/\.agent\.md$/, '') })
  return [descriptor.id, descriptor]
}))

const STORIES = '.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/stories-{milestone}.md'
const AC_DRAFT = '.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/ac-draft-{story}.md'

test('the design phase reads the story files the backlog planner writes, at the same paths', () => {
  const architect = coreConfig.agentArtifacts['Skraft - Solution Architect'].inputs
  assert.ok(architect.includes(STORIES) && architect.includes(AC_DRAFT), 'the engineering contract changed: update both plugins together')
  for (const path of [STORIES, AC_DRAFT]) assert.ok(backlog['backlog-planner'].outputs.includes(path), `backlog-planner no longer writes ${path}`)
})

test('the research phase reads the stories file the backlog planner writes', () => {
  assert.ok(coreConfig.agentContext['Skraft - Solution Researcher'].includes(STORIES))
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
