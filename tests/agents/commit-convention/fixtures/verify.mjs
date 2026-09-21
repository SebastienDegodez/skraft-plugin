import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Loaded only after the spec authenticates its bytes. No target-agent helper,
// writable result receipt, or supplied "gate passed" flag is an oracle.
export function verify(mode, context, scenario, base, workspace = process.cwd()) {
  assert.ok(['sentinel', 'tree', 'message'].includes(mode), 'Unknown check')
  assert.ok(Object.hasOwn(context.cases, scenario), 'Unknown scenario')
  assert.match(base, /^[a-f0-9]{40}$/)
  const root = join(workspace, 'checkout')
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  for (const key of Object.keys(env)) {
    if (/^GIT_(?:AUTHOR_|COMMITTER_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$|CONFIG_(?:COUNT|KEY_|VALUE_))/.test(key)) delete env[key]
  }
  const git = (...args) => execFileSync('git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 10_000,
  }).trimEnd()
  assert.ok(lstatSync(join(root, '.git')).isDirectory(), 'Expected isolated Git repository')
  assert.equal(git('rev-parse', '--is-shallow-repository'), 'false', 'Shallow history')
  assert.equal(git('rev-list', '--max-parents=0', 'HEAD'), base, 'Fixture history rewritten')
  git('merge-base', '--is-ancestor', base, 'HEAD')
  const handoff = context.common + '\n\n' + context.cases[scenario] + '\n'
  const expected = {
    'handoff.txt': handoff,
    [context.guidePath]: context.after,
    [context.protectedPath]: context.protectedText,
  }
  const files = (directory, prefix = '') => readdirSync(directory).flatMap(name => {
    if (!prefix && name === '.git') return []
    const path = prefix + name
    const stat = lstatSync(join(directory, name))
    assert.ok(!stat.isSymbolicLink(), 'Unexpected symlink: ' + path)
    if (stat.isDirectory()) return files(join(directory, name), path + '/')
    assert.ok(stat.isFile(), 'Unexpected file type: ' + path)
    return [path]
  }).sort()
  const commits = git('rev-list', '--reverse', base + '..HEAD').split('\n').filter(Boolean)

  if (mode === 'sentinel' || mode === 'tree') {
    assert.deepEqual(files(root), Object.keys(expected).sort(), 'Unrelated or missing workspace files')
    for (const [path, text] of Object.entries(expected)) {
      assert.equal(readFileSync(join(root, path), 'utf8'), text, 'Content changed: ' + path)
    }
    // These are actual, applicable documentation checks, not code-quality proof.
    git('diff', '--check')
    git('diff', '--cached', '--check')
    git('diff', '--check', base, 'HEAD')
  }
  if (mode === 'sentinel') return
  assert.equal(commits.length, 1, 'Exactly one new commit required')
  const sha = commits[0]
  assert.equal(git('show', '-s', '--format=%P', sha), base, 'Unexpected parent(s)')
  if (mode === 'tree') {
    assert.equal(git('diff-tree', '--no-commit-id', '--name-only', '-r', sha), context.guidePath, 'Unrelated committed paths')
    assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '', 'Uncommitted work remains')
    for (const [path, text] of Object.entries(expected)) {
      assert.equal(git('show', sha + ':' + path), text.trimEnd(), 'Wrong committed content: ' + path)
      assert.match(git('ls-tree', sha, '--', path), /^100644 blob /, 'Unexpected file mode')
    }
    return
  }
  const message = git('show', '-s', '--format=%B', sha)
  assert.match(message.split('\n')[0], /^docs\(loyalty-discount\): [^\s].*$/, 'Feature scope, not a technical folder')
  const identity = context.identity.name + ' <' + context.identity.email + '>'
  assert.equal(git('show', '-s', '--format=%an <%ae>', sha), identity, 'Author identity changed')
  assert.equal(git('show', '-s', '--format=%cn <%ce>', sha), identity, 'Committer identity changed')
  const trailers = execFileSync('git', ['interpret-trailers', '--parse'], {
    input: message, cwd: root, env, encoding: 'utf8', timeout: 10_000,
  }).trimEnd().split('\n')
  assert.ok(trailers.includes('Signed-off-by: ' + identity), 'Missing identity sign-off')
  assert.ok(trailers.filter(line => /^Signed-off-by:/i.test(line)).every(line => line === 'Signed-off-by: ' + identity), 'Foreign sign-off')
  const refs = [...message.matchAll(/#\d+\b|\bGH-\d+\b|https?:\/\/\S+\/issues\/\d+\b/gi)].map(match => match[0])
  const closure = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?[ \t]+(?:\S*#\d+|GH-\d+|https?:\/\/\S+\/issues\/\d+)/i
  if (scenario === 'unknown') {
    assert.deepEqual(refs, [], 'Invented issue')
    assert.doesNotMatch(message, /\b(?:Refs|Closes)\s*:/i, 'Unknown reference must be omitted')
  } else {
    assert.deepEqual(refs, ['#42'], 'Exactly one known issue reference required')
    const reference = scenario === 'intermediate' ? 'Refs: #42' : 'Closes #42'
    const body = message.split('\n').slice(1).filter(line => line.trim())
    // Git may parse Refs itself as a trailer alongside an adjacent sign-off.
    // Keep the issue line; ignore only the actual trailing metadata block.
    while (body.length && body.at(-1) !== reference && trailers.includes(body.at(-1))) body.pop()
    assert.equal(body.at(-1), reference, 'Exact standalone issue reference must be the final body line')
    if (scenario === 'intermediate') {
      assert.doesNotMatch(message, closure, 'Premature issue closure')
    } else {
      assert.doesNotMatch(message, /\bRefs\s*:?[ \t]+#42\b/i, 'Completion reported as intermediate')
    }
  }
}