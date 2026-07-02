import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { main } from '../../plugins/src/cli/build-config.mjs'

// Boundary-to-boundary against the REAL repo state (not a temp fixture): fails the
// build if plugins/skraft-framework.config.json drifts from plugins/agents/**/*.agent.md
// frontmatter. Mirrors the `config-policy` CI job (build-config-bin.mjs --check) as an
// executable test so drift is caught by `node --test` locally, not only in CI.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const agentsDir = join(repoRoot, 'plugins/agents')
const configPath = join(repoRoot, 'plugins/skraft-framework.config.json')

const capture = () => {
  const out = []
  const errs = []
  return { io: { log: (...a) => out.push(a.join(' ')), error: (...a) => errs.push(a.join(' ')) }, out, errs }
}

test('config-in-sync: committed skraft-framework.config.json matches the agent frontmatter', () => {
  const { io, out, errs } = capture()
  const code = main(['--check', '--dir', agentsDir, '--out', configPath], io)
  assert.equal(
    code,
    0,
    `plugins/skraft-framework.config.json is out of sync with plugins/agents/**/*.agent.md — run npm run config:build (plugins/src). Details: ${errs.join('\n')}`
  )
  assert.ok(out.some((l) => /in sync/.test(l)))
})
