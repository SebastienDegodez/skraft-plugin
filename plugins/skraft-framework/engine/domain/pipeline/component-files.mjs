import { joinRelative, pathUnder } from '../config/relative-path.mjs'

/**
 * Which component a file of the working copy belongs to, and whether it is code: a file of its
 * source or test paths. Files of the tracking folder belong to none.
 *
 * @typedef {{ name: string, root: string, paths: { src: readonly string[], tests: readonly string[] } }} CodeComponent
 */

const TRACKING = '.copilot-tracking'

/**
 * The component a file belongs to: the deepest root holding it, and among components sharing that
 * root the one whose source or test path holds it most closely; null for none, or for a file of
 * the tracking folder.
 * @template {CodeComponent} C
 * @param {string} file relative to the working copy @param {readonly C[]} components @returns {C | null}
 */
export const ownerOf = (file, components) => {
  if (pathUnder(file, TRACKING) !== null) return null
  const holding = components.filter(({ root }) => pathUnder(file, root) !== null)
  return holding.sort((a, b) => b.root.length - a.root.length || pathDepth(file, b) - pathDepth(file, a))[0] ?? null
}

/** How deep the component's path closest to the file is; 0 when none holds it. @param {string} file @param {CodeComponent} component */
const pathDepth = (file, component) => Math.max(0, ...[...component.paths.src, ...component.paths.tests].filter((path) => holds(component, path, file)).map((path) => joinRelative(component.root, path).length))

/** @param {CodeComponent} component @param {string} path @param {string} file */
const holds = (component, path, file) => pathUnder(file, joinRelative(component.root, path)) !== null

/**
 * Whether a file of a component is source or test code: the kind of its closest path, a test
 * path winning a tie, so that a source path that is the whole root leaves the tests apart; null
 * for a file under no path of the component.
 * @param {string} file @param {CodeComponent} component @returns {'src' | 'tests' | null}
 */
const kindOf = (file, component) => {
  const closest = (/** @type {'src' | 'tests'} */ kind) => Math.max(-1, ...component.paths[kind].filter((path) => holds(component, path, file)).map((path) => joinRelative(component.root, path).length))
  const [src, tests] = [closest('src'), closest('tests')]
  if (src < 0 && tests < 0) return null
  return tests >= src ? 'tests' : 'src'
}

/**
 * The components the files belong to, each once, in the order the files name them.
 * @template {CodeComponent} C
 * @param {readonly C[]} components @param {readonly string[]} files relative to the working copy @returns {C[]}
 */
export const ownersOf = (components, files) => [...new Set(files.map((file) => ownerOf(file, components)).filter((owner) => owner !== null))]

/**
 * Whether a file is a test report its component's tests write, as its `testReports` patterns
 * name it: the run's output, never a change of the story.
 * @param {string} file relative to the working copy @param {readonly (CodeComponent & { testReports?: readonly string[] })[]} components
 */
export const isTestReport = (file, components) => {
  const owner = ownerOf(file, components)
  return owner !== null && /** @type {readonly string[]} */ (owner.testReports).some((pattern) => globPattern(pattern).test(/** @type {string} */ (pathUnder(file, owner.root))))
}

/**
 * A pattern of paths as a regular expression: `**` any folders, `*` and `?` within a name.
 * @param {string} glob
 */
export const globPattern = (glob) => new RegExp(`^${glob.split('/').map(globPart).join('').replace(/\/$/, '')}$`)

/** @param {string} part a name of a pattern, `**` included @returns {string} */
const globPart = (part) => (part === '**' ? '(?:.+/)?' : `${part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]')}/`)

/**
 * Whether a file is code of the component it belongs to, under one of its paths of that kind.
 * @param {string} file @param {readonly CodeComponent[]} components @param {ReadonlyArray<'src' | 'tests'>} [kinds]
 */
export const isCode = (file, components, kinds = ['src', 'tests']) => {
  const owner = ownerOf(file, components)
  return owner !== null && kinds.some((kind) => kind === kindOf(file, owner))
}
