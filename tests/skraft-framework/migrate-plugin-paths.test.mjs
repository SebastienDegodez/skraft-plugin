import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obsoleteReferences, rewritePluginPaths } from '../../scripts/migrate-plugin-paths.mjs'

const legacyRoot = 'plugins/'
const frameworkRoot = `${legacyRoot}skraft-framework/`

test('migrate-plugin-paths rewrites every relocated plugin root', () => {
  const legacyPaths = [
    `${legacyRoot}src/cli/hook.mjs`,
    `${legacyRoot}agents/software-engineer.agent.md`,
    `${legacyRoot}skills/outside-in-tdd/SKILL.md`,
    `${legacyRoot}hooks/hooks.json`,
    `${legacyRoot}instructions/skraft-state.instructions.md`,
    `${legacyRoot}logs/audit.jsonl`,
    `${legacyRoot}.claude-plugin/plugin.json`,
    `${legacyRoot}skraft-framework.config.json`,
    `${legacyRoot}stryker.config.mjs`,
  ]

  const migrated = rewritePluginPaths(legacyPaths.join('\n'))

  assert.equal(obsoleteReferences(migrated).length, 0)
  assert.match(migrated, new RegExp(`${frameworkRoot}src/cli/hook\\.mjs`))
  assert.match(migrated, new RegExp(`${frameworkRoot}agents/software-engineer\\.agent\\.md`))
  assert.match(migrated, new RegExp(`${frameworkRoot}skills/outside-in-tdd/SKILL\\.md`))
  assert.match(migrated, new RegExp(`${frameworkRoot}com\\.anthropic\\.claude-code/hooks/hooks\\.json`))
  assert.match(migrated, new RegExp(`${frameworkRoot}instructions/skraft-state\\.instructions\\.md`))
  assert.match(migrated, new RegExp(`${frameworkRoot}logs/audit\.jsonl`))
  assert.match(migrated, new RegExp(`${frameworkRoot}\.claude-plugin/plugin\\.json`))
  assert.match(migrated, new RegExp(`${frameworkRoot}skraft-framework\\.config\\.json`))
  assert.match(migrated, new RegExp(`${frameworkRoot}src/stryker\\.config\\.mjs`))
})

test('migrate-plugin-paths is idempotent for canonical paths', () => {
  const canonical = `${frameworkRoot}src/cli/hook.mjs`

  assert.equal(rewritePluginPaths(canonical), canonical)
  assert.deepEqual(obsoleteReferences(canonical), [])
})