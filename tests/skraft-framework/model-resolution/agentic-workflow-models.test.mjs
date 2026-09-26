import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')
const WORKFLOWS = ['skraft-docs-gaps', 'skraft-docs-sync']
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sourceModel = (name) => {
  const match = read(`.github/workflows/${name}.md`).match(/^model:\s*(.+?)\s*$/m)
  assert.ok(match, `${name}.md must declare a top-level model`)
  return match[1]
}

const lockMetadata = (name) => {
  const match = read(`.github/workflows/${name}.lock.yml`).match(/^# gh-aw-metadata:\s*(\{.+\})$/m)
  assert.ok(match, `${name}.lock.yml must carry gh-aw metadata`)
  return JSON.parse(match[1])
}

test('compiled lockfiles mirror the source workflow model', () => {
  for (const name of WORKFLOWS) {
    const model = sourceModel(name)
    const escapedModel = escapeRegExp(model)
    const lock = read(`.github/workflows/${name}.lock.yml`)
    const metadata = lockMetadata(name)

    assert.equal(metadata.agent_model, model, `${name}.lock.yml metadata must mirror source model`)
    assert.match(lock, new RegExp(`GH_AW_INFO_MODEL: "${escapedModel}"`), `${name}.lock.yml must pass source model into gh-aw info`)
    assert.match(lock, new RegExp(`COPILOT_MODEL: ${escapedModel}`), `${name}.lock.yml must pass source model into Copilot runtime`)
    assert.match(lock, new RegExp(`GH_AW_ENGINE_MODEL: "${escapedModel}"`), `${name}.lock.yml must expose source model in safe outputs`)
    assert.doesNotMatch(lock, /claude-sonnet-4\.6/, `${name}.lock.yml must not regress to retired claude-sonnet-4.6 pin`)
  }
})
