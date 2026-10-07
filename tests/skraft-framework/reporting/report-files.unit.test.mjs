import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync, rmSync, realpathSync, writeFileSync, readFileSync, mkdirSync,
  symlinkSync, readdirSync, existsSync, renameSync, unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createReportFiles } from '../../../plugins/skraft-framework/src/adapters/infrastructure/report-files.mjs'

// In-process unit tests for the confined report file adapter. Every test works
// in a fresh canonical temp directory (realpath, so no symlinked ancestors).

const withBase = (fn) => {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'skraft-report-files-'))
  try { return fn(base) } finally { rmSync(base, { recursive: true, force: true }) }
}

const withRoot = (fn) => withBase((base) => {
  const root = join(base, 'root')
  mkdirSync(root)
  return fn(root, base)
})

const openFds = () => {
  try { return readdirSync('/proc/self/fd').length } catch { return undefined }
}

const tmpLeftovers = (dir) => readdirSync(dir).filter((name) => name.startsWith('.report-'))

// ─── construction ────────────────────────────────────────────────────────────

test('createReportFiles: exposes the full port', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.deepEqual(Object.keys(files).sort(),
    ['acquirePublicationLock', 'pathFor', 'readJson', 'readText', 'remove', 'writeAtomic'])
  for (const fn of Object.values(files)) assert.equal(typeof fn, 'function')
}))

test('createReportFiles: a missing root is reported as uninitialized tracking state', () => withBase((base) => {
  assert.throws(() => createReportFiles(join(base, 'missing')), (error) => {
    assert.equal(error.message, 'Existing initialized tracking state/root is required')
    assert.equal(error.code, undefined)
    return true
  })
}))

test('createReportFiles: a non-ENOENT failure resolving the root is rethrown as is', () => withBase((base) => {
  writeFileSync(join(base, 'file.txt'), 'x')
  assert.throws(() => createReportFiles(join(base, 'file.txt', 'sub')), (error) => {
    assert.equal(error.code, 'ENOTDIR')
    assert.notEqual(error.message, 'Existing initialized tracking state/root is required')
    return true
  })
}))

// ─── pathFor: shape validation ───────────────────────────────────────────────

test('pathFor: resolves a relative path under the root', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.equal(files.pathFor('a/b.txt'), join(root, 'a', 'b.txt'))
  assert.equal(files.pathFor('top.txt'), join(root, 'top.txt'))
}))

test('pathFor: accepts an absolute path inside the root when not a reference', () => withRoot((root) => {
  writeFileSync(join(root, 'x.txt'), 'x')
  const files = createReportFiles(root)
  assert.equal(files.pathFor(join(root, 'x.txt')), join(root, 'x.txt'))
  assert.equal(files.pathFor(join(root, 'x.txt'), {}), join(root, 'x.txt'))
  assert.equal(files.pathFor(root), root)
}))

test('pathFor: a non-reference path need not be a root reference', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.equal(files.pathFor('with space.txt'), join(root, 'with space.txt'))
}))

test('pathFor: reference mode accepts root references and rejects anything else', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.equal(files.pathFor('docs/a.md', { reference: true }), join(root, 'docs', 'a.md'))
  for (const bad of ['with space.md', join(root, 'docs', 'a.md'), 'a/./b.md', 'a:b.md', 'q?x.md']) {
    assert.throws(() => files.pathFor(bad, { reference: true }),
      { message: 'Invalid repository path or source reference' }, bad)
  }
}))

test('pathFor: rejects non-string, empty, control-char, backslash and dot-dot paths', () => withRoot((root) => {
  const files = createReportFiles(root)
  const invalid = [42, undefined, null, {}, '', 'a\u0000b', 'a\u0001b', 'a\u001fb', 'a\u007fb',
    'a\nb', 'a\\b', '..', 'a/../b', '../x', 'a/..']
  for (const bad of invalid) {
    assert.throws(() => files.pathFor(bad), (error) => {
      assert.equal(error.message, 'Invalid repository path or source reference', String(bad))
      return true
    })
  }
}))

test('pathFor: names with dots that are not dot-dot segments are fine', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.equal(files.pathFor('a..b/c...d'), join(root, 'a..b', 'c...d'))
  assert.equal(files.pathFor('.hidden/x'), join(root, '.hidden', 'x'))
}))

// ─── pathFor: confinement ────────────────────────────────────────────────────

test('pathFor: an absolute path outside the root escapes', () => withRoot((root, base) => {
  writeFileSync(join(base, 'outside.txt'), 'x')
  const files = createReportFiles(root)
  assert.throws(() => files.pathFor(join(base, 'outside.txt')), { message: 'Path escapes the authorized root' })
}))

test('pathFor: the parent of the root escapes', () => withRoot((root, base) => {
  const files = createReportFiles(root)
  assert.throws(() => files.pathFor(base), { message: 'Path escapes the authorized root' })
}))

test('pathFor: a sibling whose name starts with the root name escapes', () => withRoot((root, base) => {
  mkdirSync(join(base, 'root-sibling'))
  const files = createReportFiles(root)
  assert.throws(() => files.pathFor(join(base, 'root-sibling', 'x')), { message: 'Path escapes the authorized root' })
}))

test('pathFor: a symlink inside the root pointing inside is allowed', () => withRoot((root) => {
  mkdirSync(join(root, 'real'))
  writeFileSync(join(root, 'real', 'f.txt'), 'inside')
  symlinkSync(join(root, 'real'), join(root, 'alias'))
  const files = createReportFiles(root)
  assert.equal(files.pathFor('alias/f.txt'), join(root, 'alias', 'f.txt'))
  assert.equal(files.readText('alias/f.txt'), 'inside')
}))

test('pathFor: a symlink inside the root pointing outside escapes', () => withRoot((root, base) => {
  mkdirSync(join(base, 'elsewhere'))
  writeFileSync(join(base, 'elsewhere', 'secret.txt'), 'secret')
  symlinkSync(join(base, 'elsewhere'), join(root, 'link'))
  const files = createReportFiles(root)
  assert.throws(() => files.pathFor('link/secret.txt'), { message: 'Path escapes the authorized root' })
  assert.throws(() => files.pathFor('link'), { message: 'Path escapes the authorized root' })
}))

test('pathFor: a dangling symlink is invalid, not missing', () => withRoot((root) => {
  symlinkSync(join(root, 'nowhere'), join(root, 'dangling'))
  const files = createReportFiles(root)
  assert.throws(() => files.pathFor('dangling'), (error) => {
    assert.equal(error.message, 'Invalid or dangling source/output symlink')
    return true
  })
}))

test('pathFor: missing components stop the walk without error', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.equal(files.pathFor('missing/deeper/x.txt'), join(root, 'missing', 'deeper', 'x.txt'))
}))

test('pathFor: a non-ENOENT lstat failure is rethrown', () => withRoot((root) => {
  writeFileSync(join(root, 'file.txt'), 'x')
  const files = createReportFiles(root)
  assert.throws(() => files.pathFor('file.txt/sub'), { code: 'ENOTDIR' })
}))

test('pathFor: a root given through a symlink maps lexical descendants to the canonical root', () => withBase((base) => {
  const real = join(base, 'real')
  mkdirSync(real)
  writeFileSync(join(real, 'f.txt'), 'via-link')
  mkdirSync(join(base, 'a', 'b'), { recursive: true })
  const link = join(base, 'a', 'b', 'link')
  symlinkSync(real, link)
  const files = createReportFiles(link)
  assert.equal(files.pathFor('f.txt'), join(real, 'f.txt'))
  assert.equal(files.pathFor(join(link, 'f.txt')), join(real, 'f.txt'))
  assert.equal(files.pathFor(link), real)
  // A canonical absolute path is not under the lexical root, yet inside the boundary.
  assert.equal(files.pathFor(join(real, 'f.txt')), join(real, 'f.txt'))
  assert.equal(files.readText(join(link, 'f.txt')), 'via-link')
  assert.throws(() => files.pathFor(join(base, 'a', 'b')), { message: 'Path escapes the authorized root' })
}))

// ─── readText / readJson ─────────────────────────────────────────────────────

test('readText: returns the UTF-8 string content', () => withRoot((root) => {
  writeFileSync(join(root, 'doc.md'), 'héllo wörld')
  const files = createReportFiles(root)
  const text = files.readText('doc.md')
  assert.equal(typeof text, 'string')
  assert.equal(text, 'héllo wörld')
}))

test('readText: passes the reference option through', () => withRoot((root) => {
  writeFileSync(join(root, 'with space.md'), 'x')
  const files = createReportFiles(root)
  assert.equal(files.readText('with space.md'), 'x')
  assert.throws(() => files.readText('with space.md', { reference: true }),
    { message: 'Invalid repository path or source reference' })
}))

test('readJson: parses a JSON document', () => withRoot((root) => {
  writeFileSync(join(root, 'data.json'), JSON.stringify({ a: [1, 2], b: 'ç' }))
  const files = createReportFiles(root)
  assert.deepEqual(files.readJson('data.json'), { a: [1, 2], b: 'ç' })
}))

test('readJson: malformed JSON is reported as an invalid document', () => withRoot((root) => {
  writeFileSync(join(root, 'bad.json'), '{ nope')
  const files = createReportFiles(root)
  assert.throws(() => files.readJson('bad.json'), (error) => {
    assert.equal(error.message, 'Invalid JSON document')
    assert.ok(!(error instanceof SyntaxError))
    return true
  })
}))

test('readJson: a missing document propagates ENOENT', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.throws(() => files.readJson('missing.json'), { code: 'ENOENT' })
}))

// ─── writeAtomic ─────────────────────────────────────────────────────────────

test('writeAtomic: creates missing parent directories and writes the text', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.equal(files.writeAtomic('deep/nested/out.md', 'contenü'), undefined)
  assert.equal(readFileSync(join(root, 'deep', 'nested', 'out.md'), 'utf8'), 'contenü')
  assert.deepEqual(tmpLeftovers(join(root, 'deep', 'nested')), [])
}))

test('writeAtomic: overwrites an existing file in an existing directory', () => withRoot((root) => {
  mkdirSync(join(root, 'dir'))
  writeFileSync(join(root, 'dir', 'out.md'), 'old')
  const files = createReportFiles(root)
  files.writeAtomic('dir/out.md', 'new')
  files.writeAtomic('top.md', 'top')
  assert.equal(readFileSync(join(root, 'dir', 'out.md'), 'utf8'), 'new')
  assert.equal(readFileSync(join(root, 'top.md'), 'utf8'), 'top')
  assert.deepEqual(tmpLeftovers(join(root, 'dir')), [])
  assert.deepEqual(tmpLeftovers(root), [])
}))

test('writeAtomic: does not leak file descriptors', () => withRoot((root) => {
  const files = createReportFiles(root)
  const before = openFds()
  for (let i = 0; i < 5; i += 1) files.writeAtomic(`f${i}.md`, 'x')
  if (before !== undefined) assert.equal(openFds(), before)
}))

test('writeAtomic: a failed rename removes the temporary file', () => withRoot((root) => {
  mkdirSync(join(root, 'target'))
  writeFileSync(join(root, 'target', 'keep.txt'), 'k')
  const files = createReportFiles(root)
  assert.throws(() => files.writeAtomic('target', 'text'), (error) => {
    assert.ok(['EISDIR', 'ENOTEMPTY', 'EEXIST', 'EPERM'].includes(error.code), error.code)
    return true
  })
  assert.deepEqual(tmpLeftovers(root), [])
  assert.equal(readFileSync(join(root, 'target', 'keep.txt'), 'utf8'), 'k')
}))

test('writeAtomic: refuses an escaping output path before writing', () => withRoot((root, base) => {
  mkdirSync(join(base, 'outside'))
  symlinkSync(join(base, 'outside'), join(root, 'out'))
  const files = createReportFiles(root)
  assert.throws(() => files.writeAtomic('out/x.md', 'x'), { message: 'Path escapes the authorized root' })
  assert.deepEqual(readdirSync(join(base, 'outside')), [])
}))

// ─── acquirePublicationLock ──────────────────────────────────────────────────

test('acquirePublicationLock: creates the lock with pid metadata and release removes it', () => withRoot((root) => {
  const files = createReportFiles(root)
  const before = openFds()
  const release = files.acquirePublicationLock('locks/nested/publish.lock')
  assert.equal(typeof release, 'function')
  const lockPath = join(root, 'locks', 'nested', 'publish.lock')
  const raw = readFileSync(lockPath, 'utf8')
  assert.ok(raw.endsWith('}\n'), JSON.stringify(raw))
  const meta = JSON.parse(raw)
  assert.equal(meta.pid, process.pid)
  assert.equal(typeof meta.createdAt, 'string')
  assert.ok(!Number.isNaN(Date.parse(meta.createdAt)))
  assert.equal(release(), undefined)
  assert.equal(existsSync(lockPath), false)
  if (before !== undefined) assert.equal(openFds(), before)
}))

test('acquirePublicationLock: works in an existing directory', () => withRoot((root) => {
  const files = createReportFiles(root)
  const release = files.acquirePublicationLock('top.lock')
  assert.equal(existsSync(join(root, 'top.lock')), true)
  release()
  assert.equal(existsSync(join(root, 'top.lock')), false)
}))

test('acquirePublicationLock: an existing lock requires manual recovery', () => withRoot((root) => {
  writeFileSync(join(root, 'publish.lock'), 'stale')
  const files = createReportFiles(root)
  assert.throws(() => files.acquirePublicationLock('publish.lock'), (error) => {
    assert.equal(error.message, 'Publication lock exists; manual recovery required, even if stale')
    assert.equal(error.code, undefined)
    return true
  })
  assert.equal(readFileSync(join(root, 'publish.lock'), 'utf8'), 'stale')
}))

test('acquirePublicationLock: a second acquire while held fails, release frees it', () => withRoot((root) => {
  const files = createReportFiles(root)
  const release = files.acquirePublicationLock('publish.lock')
  assert.throws(() => files.acquirePublicationLock('publish.lock'),
    { message: 'Publication lock exists; manual recovery required, even if stale' })
  release()
  const again = files.acquirePublicationLock('publish.lock')
  again()
  assert.equal(existsSync(join(root, 'publish.lock')), false)
}))

test('acquirePublicationLock: release never deletes a lock file it does not own', () => withRoot((root) => {
  const files = createReportFiles(root)
  const lockPath = join(root, 'publish.lock')
  const release = files.acquirePublicationLock('publish.lock')
  writeFileSync(join(root, 'other'), 'someone else')
  renameSync(join(root, 'other'), lockPath)
  const before = openFds()
  release()
  assert.equal(readFileSync(lockPath, 'utf8'), 'someone else')
  if (before !== undefined) assert.equal(openFds(), before - 1)
}))

test('acquirePublicationLock: release tolerates an already removed lock and repeated calls', () => withRoot((root) => {
  const files = createReportFiles(root)
  const release = files.acquirePublicationLock('publish.lock')
  unlinkSync(join(root, 'publish.lock'))
  const before = openFds()
  assert.doesNotThrow(() => release())
  if (before !== undefined) assert.equal(openFds(), before - 1)
  assert.doesNotThrow(() => release())
  if (before !== undefined) assert.equal(openFds(), before - 1)
}))

test('acquirePublicationLock: release surfaces a non-ENOENT failure but still closes', () => withRoot((root, base) => {
  mkdirSync(join(base, 'outside'))
  const files = createReportFiles(root)
  const lockPath = join(root, 'publish.lock')
  const release = files.acquirePublicationLock('publish.lock')
  unlinkSync(lockPath)
  symlinkSync(join(base, 'outside'), lockPath)
  const before = openFds()
  assert.throws(() => release(), { message: 'Path escapes the authorized root' })
  if (before !== undefined) assert.equal(openFds(), before - 1)
  assert.throws(() => release(), { message: 'Path escapes the authorized root' })
  if (before !== undefined) assert.equal(openFds(), before - 1)
}))

test('acquirePublicationLock: refuses invalid paths before creating anything', () => withRoot((root) => {
  const files = createReportFiles(root)
  assert.throws(() => files.acquirePublicationLock('../x.lock'),
    { message: 'Invalid repository path or source reference' })
  assert.deepEqual(readdirSync(dirname(join(root, 'x'))), [])
}))

// ─── remove ──────────────────────────────────────────────────────────────────

test('remove: deletes a confined file and propagates ENOENT', () => withRoot((root) => {
  writeFileSync(join(root, 'gone.txt'), 'x')
  const files = createReportFiles(root)
  assert.equal(files.remove('gone.txt'), undefined)
  assert.equal(existsSync(join(root, 'gone.txt')), false)
  assert.throws(() => files.remove('gone.txt'), { code: 'ENOENT' })
  assert.throws(() => files.remove('../gone.txt'), { message: 'Invalid repository path or source reference' })
}))
