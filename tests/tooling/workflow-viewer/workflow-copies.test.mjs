import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { writeWorkflowCopies } from '../../../eng/docs/workflow-copies.mjs'

const WORKFLOWS = join('plugins', 'skraft-framework', 'workflows')

const git = (cwd, ...args) => {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
}

const writeWorkflow = async (repo, file, text) => {
  await mkdir(join(repo, WORKFLOWS), { recursive: true })
  await writeFile(join(repo, WORKFLOWS, file), text)
}

/** A repo whose tag v2.0.0 holds the released workflows and whose working tree holds newer ones. */
const withRepo = async (run) => {
  const repo = await mkdtemp(join(tmpdir(), 'skraft-workflow-copies-'))
  try {
    git(repo, 'init', '-q')
    git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'config', 'user.name', 'test')
    await writeWorkflow(repo, 'pipeline.skraft.dot', 'digraph released {}\n')
    await writeWorkflow(repo, 'review.skraft.dot', 'digraph released_review {}\n')
    await writeFile(join(repo, WORKFLOWS, 'README.md'), 'not a workflow\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'release')
    git(repo, 'tag', 'v2.0.0')
    await writeWorkflow(repo, 'pipeline.skraft.dot', 'digraph working {}\n')
    await writeWorkflow(repo, 'triage.skraft.dot', 'digraph triage {}\n')
    await run(repo, join(repo, 'site', 'static'))
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}

const copies = async (staticDir, version) => (await readdir(join(staticDir, 'workflows', version))).sort()
const copy = (staticDir, version, file) => readFile(join(staticDir, 'workflows', version, file), 'utf8')

test('current is copied from the working tree, a released version from its ref', async () => {
  await withRepo(async (repo, staticDir) => {
    const written = writeWorkflowCopies({ repoRoot: repo, staticDir, versions: ['current', '2.x'], refs: { current: 'main', '2.x': 'v2.0.0' } })
    assert.deepEqual(written, { current: ['pipeline.skraft.dot', 'review.skraft.dot', 'triage.skraft.dot'], '2.x': ['pipeline.skraft.dot', 'review.skraft.dot'] })
    assert.deepEqual(await copies(staticDir, 'current'), ['pipeline.skraft.dot', 'review.skraft.dot', 'triage.skraft.dot'])
    assert.deepEqual(await copies(staticDir, '2.x'), ['pipeline.skraft.dot', 'review.skraft.dot'])
    assert.equal(await copy(staticDir, 'current', 'pipeline.skraft.dot'), 'digraph working {}\n')
    assert.equal(await copy(staticDir, '2.x', 'pipeline.skraft.dot'), 'digraph released {}\n')
  })
})

test('a second run replaces the copies, dropping a workflow that is gone', async () => {
  await withRepo(async (repo, staticDir) => {
    writeWorkflowCopies({ repoRoot: repo, staticDir, versions: ['current'], refs: {} })
    await rm(join(repo, WORKFLOWS, 'triage.skraft.dot'))
    writeWorkflowCopies({ repoRoot: repo, staticDir, versions: ['current'], refs: {} })
    assert.deepEqual(await copies(staticDir, 'current'), ['pipeline.skraft.dot', 'review.skraft.dot'])
  })
})

test('a released version without a ref, or with a ref git does not know, stops the build', async () => {
  await withRepo(async (repo, staticDir) => {
    assert.throws(() => writeWorkflowCopies({ repoRoot: repo, staticDir, versions: ['2.x'], refs: {} }), /2\.x has no workflow ref/)
    assert.throws(() => writeWorkflowCopies({ repoRoot: repo, staticDir, versions: ['2.x'], refs: { '2.x': 'v9.9.9' } }), /v9\.9\.9/)
  })
})
