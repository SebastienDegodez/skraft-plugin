import {
  realpathSync, lstatSync, readFileSync, mkdirSync, openSync, writeFileSync,
  fsyncSync, closeSync, renameSync, unlinkSync, fstatSync,
} from 'node:fs'
import { resolve, relative, isAbsolute, dirname, join, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isRootReference } from '../../domain/reporting-presentation.mjs'

// An explicit tracking root is a separate authorized boundary; report inputs and
// source references always use the repository boundary instead.
export function createReportFiles(root) {
  const lexicalRoot = resolve(root)
  let boundary
  try { boundary = realpathSync(lexicalRoot) } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Existing initialized tracking state/root is required')
    throw error
  }
  const inside = (path) => {
    const remainder = relative(boundary, path)
    if (remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) {
      throw new Error('Path escapes the authorized root')
    }
  }

  function pathFor(path, { reference = false } = {}) {
    if (typeof path !== 'string' || !path || /[\u0000-\u001f\u007f\\]/.test(path)
      || path.split('/').includes('..') || (reference && !isRootReference(path))) {
      throw new Error('Invalid repository path or source reference')
    }
    // macOS /var and /private/var may name the same authorized root. Map only
    // descendants of the supplied root before checking canonical confinement.
    const lexicalRelative = relative(lexicalRoot, resolve(lexicalRoot, path))
    const underLexicalRoot = lexicalRelative !== '..'
      && !lexicalRelative.startsWith(`..${sep}`) && !isAbsolute(lexicalRelative)
    const absolute = underLexicalRoot ? resolve(boundary, lexicalRelative) : resolve(boundary, path)
    inside(absolute)
    const parts = relative(boundary, absolute).split(sep).filter(Boolean)
    let current = boundary
    for (const part of parts) {
      current = join(current, part)
      let entry
      try { entry = lstatSync(current) } catch (error) {
        if (error.code === 'ENOENT') break
        throw error
      }
      // A dangling symlink is an invalid path, not a missing source document.
      if (entry.isSymbolicLink()) {
        let resolved
        try { resolved = realpathSync(current) } catch {
          throw new Error('Invalid or dangling source/output symlink')
        }
        inside(resolved)
      }
    }
    return absolute
  }

  function readText(path, options) {
    return readFileSync(pathFor(path, options), 'utf8')
  }

  function readJson(path) {
    const text = readText(path)
    try { return JSON.parse(text) } catch {
      throw new Error('Invalid JSON document')
    }
  }

  function writeAtomic(path, text) {
    const target = pathFor(path)
    mkdirSync(dirname(target), { recursive: true })
    pathFor(path)
    const temporary = join(dirname(target), `.report-${randomUUID()}.tmp`)
    let descriptor
    let created = false
    try {
      descriptor = openSync(temporary, 'wx', 0o600)
      created = true
      writeFileSync(descriptor, text, 'utf8')
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
      pathFor(path)
      renameSync(temporary, target)
      created = false
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
      if (created) unlinkSync(temporary)
    }
  }

  function acquirePublicationLock(path) {
    const target = pathFor(path)
    mkdirSync(dirname(target), { recursive: true })
    pathFor(path)
    let descriptor
    try { descriptor = openSync(target, 'wx', 0o600) } catch (error) {
      if (error.code === 'EEXIST') throw new Error('Publication lock exists; manual recovery required, even if stale')
      throw error
    }
    const owned = fstatSync(descriptor)
    const release = () => {
      try {
        const current = lstatSync(pathFor(path))
        if (current.dev === owned.dev && current.ino === owned.ino) unlinkSync(target)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      } finally {
        if (descriptor !== undefined) closeSync(descriptor)
        descriptor = undefined
      }
    }
    try {
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }) + '\n')
      fsyncSync(descriptor)
    } catch (error) {
      release()
      throw error
    }
    return release
  }

  function remove(path) {
    unlinkSync(pathFor(path))
  }

  return { pathFor, readText, readJson, writeAtomic, acquirePublicationLock, remove }
}