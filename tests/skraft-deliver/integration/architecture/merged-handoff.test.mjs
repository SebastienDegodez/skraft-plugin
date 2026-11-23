import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createNodeAdapters } from '../../../../plugins/skraft-deliver/engine/infrastructure/node-adapters.mjs'
import { createMergedRepository } from '../../../../plugins/skraft-deliver/engine/infrastructure/architecture/merged-repository.mjs'
import { createArchitectureReader } from '../../../../plugins/skraft-deliver/engine/application/architecture/read-architecture.mjs'

test('a design brief is refused before merge, consumed after merge, and insulated from the working copy', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'skraft merged handoff '))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const origin = join(directory, 'origin.git'), cwd = join(directory, 'project with spaces')
  await mkdir(cwd)
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git('init', '--bare', origin)
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', join(directory, 'no-hooks'))
  await writeFile(join(cwd, 'README.md'), '# Store\n')
  git('add', 'README.md')
  git('commit', '-m', 'test: initial base')
  git('remote', 'add', 'origin', origin)
  git('push', 'origin', 'main')
  git('switch', '-c', 'design/issue-42')
  const issue = { number: 42, forge: 'github', repository: 'shop/checkout', body: 'AC-1: receipt visible.\n' }
  const path = 'docs/architecture/stories/42-card-checkout.md', adr = 'docs/adr/adr-001-card-checkout.md'
  const brief = { version: 1, issue: 42, forge: issue.forge, repository: issue.repository,
    bodySha256: createHash('sha256').update(issue.body).digest('hex'), components: ['api'],
    criteria: [{ id: 'AC-1', components: ['api'], adrs: [adr] }], adrs: [adr], documents: [] }
  await mkdir(join(cwd, 'docs/architecture/stories'), { recursive: true })
  await mkdir(join(cwd, 'docs/adr'), { recursive: true })
  await writeFile(join(cwd, path), `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
  await writeFile(join(cwd, adr), '---\nstatus: Accepted\n---\n# Card payment\n')
  git('add', 'docs')
  git('commit', '-m', 'docs: architecture brief')
  git('switch', 'main')
  const adapters = createNodeAdapters({ cwd })
  const architectureRepository = createMergedRepository({ ...adapters, base: 'main' })
  const reader = createArchitectureReader({ ...adapters, architectureRepository })
  assert.equal((await reader.find(issue)).code, 'architecture-unmerged')
  git('merge', '--no-edit', 'design/issue-42')
  git('push', 'origin', 'main')
  await writeFile(join(cwd, path), 'Uncommitted invalid brief\n')
  await writeFile(join(cwd, adr), '---\nstatus: Rejected\n---\n')
  const found = await reader.find(issue)
  assert.equal(found.status, 'current', found.reason)
  assert.match(found.documents[0].text, /skraft-architecture-brief:v1/)
  assert.match(found.documents[1].text, /status: Accepted/)
  assert.equal((await reader.find({ ...issue, body: 'New acceptance criterion.\n' })).status, 'changed')
})
