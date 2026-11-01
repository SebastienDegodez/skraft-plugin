import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = fileURLToPath(new URL('../../../scripts/check-pr-title.mjs', import.meta.url))

/** Runs the check as the workflow does: the title in PR_TITLE, the changed files in a file. */
const check = (title, files) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-pr-title-'))
  try {
    const list = join(dir, 'files.txt')
    writeFileSync(list, `${files.join('\n')}\n`)
    const { PR_TITLE: _t, ...env } = process.env
    const run = spawnSync(process.execPath, [CHECK, '--files', list], { encoding: 'utf8', env: { ...env, PR_TITLE: title } })
    return { code: run.status, out: run.stdout + run.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const PLUGIN = 'plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
const CLI = ['cli/src/session.mjs', 'tests/cli/session/session.test.mjs', '.github/workflows/cli-ci.yml']

test('a pull request that changes the plugin may not be scoped cli: its squash commit would never release the plugin', () => {
  const refused = check('feat(cli): the skraft command', [...CLI, PLUGIN])

  assert.equal(refused.code, 1)
  assert.match(refused.out, /changes the plugin \(plugins\/skraft-framework\/engine\/drivers\/cli\/run-cli\.mjs…\): scope it for the plugin, not cli/)
  assert.equal(check('feat(engine): commands --json; @skraft/cli', [...CLI, PLUGIN]).code, 0)
})

test('a pull request that only changes the skraft command and releases it is scoped cli, so the plugin never releases it', () => {
  const refused = check('feat(engine): session help', CLI)

  assert.equal(refused.code, 1)
  assert.match(refused.out, /changes only the skraft command \(cli\/\): scope it cli/)
  assert.equal(check('feat(cli): session help', CLI).code, 0)
  assert.equal(check('fix(cli)!: drop the old flag', CLI).code, 0)
})

test('a title that releases nothing, or a pull request that only changes the documentation, passes whatever its scope', () => {
  assert.equal(check('docs(cli): typo', CLI).code, 0)
  assert.equal(check('chore: tidy', CLI).code, 0)
  assert.equal(check('feat(cli): words', ['docs/site/en/reference/cli.md', 'README.md']).code, 0)
})

test('a title that is not a conventional commit is refused: the squash commit would release nothing', () => {
  const refused = check('Add the skraft command', CLI)

  assert.equal(refused.code, 1)
  assert.match(refused.out, /not a conventional commit title/)
})
