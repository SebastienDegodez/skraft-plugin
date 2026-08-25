import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Pins the release contract: documentation must never cut a tag, and the workflow must stay
// automatic on main. Both live in config that is easy to change by accident and whose breakage
// is only visible once a wrong version is already published and tagged.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')

const releaseRules = () => {
  const rc = JSON.parse(read('.releaserc.json'))
  const analyzer = rc.plugins.find((p) => Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer')
  assert.ok(analyzer, '.releaserc.json must configure @semantic-release/commit-analyzer')
  return analyzer[1].releaseRules
}

test('release-rules: no docs rule can trigger a release', () => {
  const docsRules = releaseRules().filter((rule) => rule.type === 'docs')

  assert.ok(docsRules.length > 0, 'docs must be ruled on explicitly, not left to preset defaults')
  for (const rule of docsRules) {
    assert.equal(
      rule.release,
      false,
      `docs rule ${JSON.stringify(rule)} would cut a tag — documentation must never publish a version`,
    )
  }
})

test('release-rules: the types that must still publish are untouched', () => {
  const rules = releaseRules()
  for (const type of ['refactor', 'perf']) {
    const rule = rules.find((r) => r.type === type)
    assert.equal(rule?.release, 'patch', `${type} must keep publishing a patch`)
  }
})

test('release-rules: the workflow releases automatically on main', () => {
  const workflow = read('.github/workflows/release.yml')

  assert.match(workflow, /^on:\s*$/m, 'release.yml must declare triggers')
  assert.match(workflow, /push:/, 'release must run automatically, not on demand only')
  assert.match(workflow, /branches:\s*\n\s*-\s*main/, 'the push trigger must target main')
  assert.match(workflow, /workflow_dispatch:/, 'a manual trigger must stay available as an escape hatch')
})

test('release-rules: documentation-only pushes never start the workflow', () => {
  const workflow = read('.github/workflows/release.yml')

  assert.match(workflow, /paths-ignore:/, 'docs-only pushes must be filtered out before the job starts')
  for (const pattern of ['docs/site/**', "docs/**/*.md"]) {
    assert.ok(workflow.includes(pattern), `paths-ignore must cover ${pattern}`)
  }
})

// Behavioural cross-check against the real analyzer. Skipped when semantic-release is not
// installed (the release workflow installs it on demand), so a slim checkout stays green.
let analyzeCommits
try { ({ analyzeCommits } = await import('@semantic-release/commit-analyzer')) } catch { /* not installed */ }

test('release-rules: the analyzer agrees — docs alone releases nothing', { skip: !analyzeCommits && 'semantic-release not installed' }, async () => {
  const rc = JSON.parse(read('.releaserc.json'))
  const [, config] = rc.plugins.find((p) => Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer')
  const commits = (...messages) => messages.map((message, i) => ({
    hash: `h${i}`, message, subject: message.split('\n')[0], body: message.split('\n').slice(1).join('\n'),
  }))
  const analyze = (...messages) => analyzeCommits(config, { commits: commits(...messages), logger: { log: () => {} }, cwd: repoRoot })

  assert.equal(await analyze('docs: rewrite the intro'), null)
  assert.equal(await analyze('docs(sync): regenerate pages', 'docs(gaps): refresh table'), null)
  // A docs commit riding along with a real change is still released by that change.
  assert.equal(await analyze('docs: a', 'feat: b'), 'minor')
  assert.equal(await analyze('fix: a'), 'patch')
  assert.equal(await analyze('feat!: drop legacy layout\n\nBREAKING CHANGE: paths moved'), 'major')
})
