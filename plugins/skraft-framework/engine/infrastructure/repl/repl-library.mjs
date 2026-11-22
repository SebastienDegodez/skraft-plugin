import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The project's REPL library: each `.repl/lib/<name>.mjs` of the working copy, imported by the
 * kernel when it starts, in the alphabetical order of the names, and given to every cell as
 * `lib.<name>`, its named exports. A module that throws on load, or takes longer than ten
 * seconds, is left out; the kernel goes on without it.
 *
 * @typedef {{ lib: Record<string, unknown>, loaded: string[], failed: string[] }} Library
 */

/** How long one module may take to load, and the whole library: the server ends a kernel whose start takes 30 s. */
const LOAD_MS = 10_000
const LIBRARY_MS = 20_000

/** @param {string} folder the absolute `.repl/lib` folder @returns {Promise<Library>} */
export const loadLibrary = async (folder) => {
  /** @type {Library} */
  const library = { lib: {}, loaded: [], failed: [] }
  const until = Date.now() + LIBRARY_MS
  for (const name of await modulesIn(folder)) await loadOne(library, folder, { file: name, ms: Math.min(LOAD_MS, until - Date.now()) })
  return library
}

/** @param {string} folder @returns {Promise<string[]>} the module file names, sorted; none when the folder is absent */
const modulesIn = (folder) => readdir(folder).then((names) => names.filter((name) => name.endsWith('.mjs')).sort(), () => [])

/** A module past the library's time is not loaded. @param {Library} library @param {string} folder @param {{ file: string, ms: number }} module */
const loadOne = async (library, folder, { file, ms }) => {
  const name = file.slice(0, -'.mjs'.length)
  const loaded = ms <= 0 ? null : await withinLimit(import(pathToFileURL(join(folder, file)).href), ms)
  if (loaded === null) library.failed.push(name)
  else Object.assign(library, { lib: { ...library.lib, [name]: loaded } }, { loaded: [...library.loaded, name] })
}

/** The module's namespace, null when it threw or took too long. @param {Promise<unknown>} loading @param {number} ms */
const withinLimit = (loading, ms) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), ms)
  timer.unref()
  loading.then((namespace) => { clearTimeout(timer); resolve(namespace) }, () => { clearTimeout(timer); resolve(null) })
})
