#!/usr/bin/env node
import {
  constants, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPairProjection } from './lib/agent-pair-projection.mjs'

export const defaultPluginRoot = fileURLToPath(new URL('../plugins/skraft-framework/', import.meta.url))

const baselinePath = '.agent-sync.json'
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0

function statIfPresent(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

// Check every component, including the supplied root, without following links.
function inspectPath(path, kind, optional = false) {
  const absolute = resolve(path)
  let current = parse(absolute).root
  const parts = relative(current, absolute).split(sep).filter(Boolean)
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index])
    const stat = statIfPresent(current)
    if (!stat) {
      if (optional) return undefined
      throw new Error(`Missing ${kind}: ${path}`)
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${current}`)
    const expected = index === parts.length - 1 ? kind : 'directory'
    if (expected === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Expected ${expected}: ${current}`)
    }
  }
  return lstatSync(absolute)
}

function containedPath(root, path) {
  const absolute = resolve(root, path)
  const local = relative(root, absolute)
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`Path escapes plugin root: ${path}`)
  }
  return absolute
}

function readSource(root, path) {
  const absolute = containedPath(root, path)
  if (inspectPath(absolute, 'file').nlink !== 1) throw new Error(`Hard-linked file rejected: ${path}`)
  return readFileSync(absolute, { flag: constants.O_RDONLY | constants.O_NOFOLLOW })
}

/** Compute shared-field sync between two flat, explicitly authored runtime trees. */
export function buildProjection(pluginRoot = defaultPluginRoot, { layout = 'flat' } = {}) {
  if (layout !== 'flat') throw new Error('Only flat runtime pairs are supported')
  const pairRoot = resolve(pluginRoot)
  inspectPath(pairRoot, 'directory')
  if (realpathSync(pairRoot) !== pairRoot) throw new Error(`Plugin root is not canonical: ${pairRoot}`)
  for (const retired of ['com.anthropic.claude-code/agent-sources', 'com.anthropic.claude-code/native-agents']) {
    if (statIfPresent(containedPath(pairRoot, retired))) throw new Error(`Retired third agent tree must not exist: ${retired}`)
  }
  const observations = new Map()
  const inventories = new Map()
  const list = (directory, optional = false) => {
    const absolute = containedPath(pairRoot, directory)
    if (!inspectPath(absolute, 'directory', optional)) return []
    const names = readdirSync(absolute).sort(compare)
    inventories.set(directory, names)
    return names.flatMap((name) => {
      const path = `${directory}/${name}`
      const stat = lstatSync(containedPath(pairRoot, path))
      if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${path}`)
      if (stat.isDirectory()) return [path, ...list(path)]
      readSource(pairRoot, path)
      return [path]
    })
  }
  const projection = buildPairProjection({ root: pairRoot, list,
    read: (path) => {
      const bytes = inspectPath(containedPath(pairRoot, path), 'file', true) ? readSource(pairRoot, path) : undefined
      observations.set(path, bytes)
      return bytes
    },
    exists: (path) => Boolean(inspectPath(containedPath(pairRoot, path), 'file', true)),
  })
  return { ...projection, observations, inventories }
}

/** Check by default. Apply refuses unknown work and skips already-identical files. */
export function projectPluginAdapters({ pluginRoot = defaultPluginRoot, mode = 'check', layout = 'flat' } = {}) {
  if (mode === 'sync') mode = 'apply'
  if (mode !== 'check' && mode !== 'apply') throw new Error(`Unknown mode: ${mode}`)
  const { root, observations, inventories, writes, conflicts, missing, stale, extra } = buildProjection(pluginRoot, { layout })
  const differences = { missing, stale, extra }
  const written = []
  if (mode === 'apply') {
    if (extra.length) throw new Error(`Unexpected output: ${extra.join(', ')}`)
    if (conflicts.length) throw new Error(conflicts.join('\n'))
    // Preflight entire plan before touching anything. Baseline commits LAST.
    for (const [directory, names] of inventories) {
      const absolute = containedPath(root, directory)
      inspectPath(absolute, 'directory')
      if (JSON.stringify(readdirSync(absolute).sort(compare)) !== JSON.stringify(names)) throw new Error(`Concurrent inventory edit: ${directory}`)
    }
    for (const [path, previous] of observations) {
      const stat = inspectPath(containedPath(root, path), 'file', true)
      const current = stat ? readSource(root, path) : undefined
      if (previous ? !current?.equals(previous) : current) throw new Error(`Concurrent edit: ${path}`)
    }
    for (const { target, previous } of writes) {
      const absolute = containedPath(root, target)
      const stat = inspectPath(absolute, 'file', true)
      if (stat && stat.nlink !== 1) throw new Error(`Hard-linked file rejected: ${target}`)
      const current = stat ? readSource(root, target) : undefined
      if (previous ? !current?.equals(previous) : current) throw new Error(`Concurrent edit: ${target}`)
    }
    for (const { target, content } of writes.sort((a, b) => (a.target === baselinePath) - (b.target === baselinePath) || compare(a.target, b.target))) {
      const absolute = containedPath(root, target)
      inspectPath(dirname(absolute), 'directory', true)
      mkdirSync(dirname(absolute), { recursive: true })
      const stat = inspectPath(absolute, 'file', true)
      if (stat && stat.nlink !== 1) throw new Error(`Hard-linked output rejected: ${target}`)
      writeFileSync(absolute, content, {
        flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
      })
      written.push(target)
    }
  }
  return {
    ...differences,
    ...(conflicts.length ? { conflicts } : {}),
    written: written.sort(compare),
    ok: mode === 'apply' || !conflicts.length && Object.values(differences).every((paths) => paths.length === 0),
  }
}

export function parseArgs(args) {
  let mode
  let pluginRoot
  let layout
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--check' || arg === '--apply' || arg === '--sync') {
      if (mode) throw new Error('Choose one mode: --check, --apply or --sync')
      mode = arg === '--sync' ? 'apply' : arg.slice(2)
    } else if (arg === '--layout') {
      const value = args[++index]
      if (layout !== undefined || value !== 'flat') {
        throw new Error('--layout supports only flat runtime pairs')
      }
      layout = value
    } else if (arg === '--plugin-root') {
      const value = args[++index]
      if (pluginRoot !== undefined || !value || value.startsWith('--')) {
        throw new Error('--plugin-root requires one directory')
      }
      pluginRoot = resolve(value)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return { mode: mode ?? 'check', pluginRoot: pluginRoot ?? defaultPluginRoot, layout: layout ?? 'flat' }
}

export function main(args = process.argv.slice(2), logger = console) {
  try {
    const options = parseArgs(args)
    const result = projectPluginAdapters(options)
    if (!result.ok) {
      for (const kind of ['missing', 'stale', 'extra', 'conflicts']) {
        for (const path of result[kind] ?? []) logger.error(`${kind}: ${path}`)
      }
      return 1
    }
    logger.log(options.mode === 'apply'
      ? `Plugin adapters: ${result.written.length} file(s) written`
      : 'Plugin adapters: up to date')
    return 0
  } catch (error) {
    logger.error(`Plugin adapters: ${error.message}`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}