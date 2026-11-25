/**
 * What `skraft init` detects for one project folder: its stack and its source and test paths.
 * It holds no command line: a command is the developer's, proposed by `/skraft-init` from the
 * stack's skill.
 *
 * @typedef {import('./skraft-config.mjs').Stack} Stack
 * @typedef {{ name: string, kind: 'file' | 'dir' }} Entry
 * @typedef {{ stack: Stack, paths: { src: string[], tests: string[] } }} Detected
 */

const SOLUTION = /\.(sln|slnx)$/i
const PROJECT = /\.(csproj|fsproj|vbproj)$/i
const PYTHON_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt']
const JAVA_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts']

/**
 * @param {{ entries: Entry[], read: (name: string) => string | null }} folder the folder's own
 *   entries, and the text of a file of that folder (read only for a file the entries list)
 * @returns {Detected | null} null when the folder holds no project marker
 */
export const detectProject = ({ entries, read }) => {
  const project = projectOf(entries, read)
  const stack = STACK_DETECTORS.find(({ marks }) => marks(project))
  return stack === undefined ? null : stack.propose(project)
}

/**
 * @typedef {{
 *   files: string[],
 *   has: (name: string) => boolean,
 *   folder: (names: string[]) => string[],
 *   read: (name: string) => string | null,
 * }} Project
 *   folder: those of the names that are folders of the project, as `name/`.
 */

/** @param {Entry[]} entries @param {(name: string) => string | null} read @returns {Project} */
const projectOf = (entries, read) => {
  const files = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name)
  const dirs = entries.filter((entry) => entry.kind === 'dir').map((entry) => entry.name)
  return {
    files,
    has: (name) => files.includes(name),
    folder: (names) => names.filter((name) => dirs.includes(name)).map((name) => `${name}/`),
    read,
  }
}

/** @param {Project} project @returns {Detected} */
const dotnetProject = ({ folder }) => ({
  stack: 'dotnet',
  paths: { src: orRoot(folder(['src'])), tests: folder(['tests', 'test']) },
})

/** Maven modules read from a `pom.xml`; the Maven layout otherwise. @param {Project} project @returns {Detected} */
const javaProject = ({ has, read }) => ({
  stack: 'java',
  paths: javaPaths(has('pom.xml') ? mavenModules(/** @type {string} */ (read('pom.xml'))) : []),
})

/** A Maven module named like `tests`, `it` or `app-it` holds tests. */
const TEST_MODULE = /(^|-)(tests?|it)(-|$)/

/**
 * The modules a parent POM lists, split into source and test modules, each source module's
 * `src/test/` a test path too (the Maven convention); the Maven layout of a single module otherwise.
 * @param {string[]} modules
 */
const javaPaths = (modules) => {
  if (modules.length === 0) return { src: ['src/main/'], tests: ['src/test/'] }
  const testModules = modules.filter((name) => TEST_MODULE.test(name))
  const src = modules.filter((name) => !testModules.includes(name))
  return { src: src.map((name) => `${name}/`), tests: [...testModules.map((name) => `${name}/`), ...src.map((name) => `${name}/src/test/`)] }
}

/** @param {Project} project @returns {Detected} */
const pythonProject = ({ folder }) => ({
  stack: 'python',
  paths: { src: orRoot(folder(['src'])), tests: folder(['tests', 'test']) },
})

/**
 * @param {Record<string, any>} manifest
 * @param {{ has: (name: string) => boolean, folder: (names: string[]) => string[] }} folder
 * @returns {Detected}
 */
const javascriptProject = (manifest, { has, folder }) => {
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
  const stack = javascriptStack(dependencies, has)
  const src = orRoot(folder(['src']))
  const tests = folder(['tests', 'test', '__tests__'])
  return { stack, paths: { src, tests: tests.length > 0 ? tests : src } }
}

/**
 * react when the package depends on it, typescript when it has a tsconfig or depends on
 * typescript, javascript otherwise.
 * @param {Record<string, unknown>} dependencies @param {(name: string) => boolean} has
 * @returns {Stack}
 */
const javascriptStack = (dependencies, has) => {
  if ('react' in dependencies) return 'react'
  return has('tsconfig.json') || 'typescript' in dependencies ? 'typescript' : 'javascript'
}

/**
 * The stacks a folder is checked for, first found wins: the marker that names each one, and
 * what init detects for it.
 * @type {ReadonlyArray<{ marks: (project: Project) => boolean, propose: (project: Project) => Detected }>}
 */
const STACK_DETECTORS = Object.freeze([
  { marks: ({ files }) => files.some((name) => SOLUTION.test(name) || PROJECT.test(name)), propose: dotnetProject },
  { marks: ({ has }) => JAVA_MARKERS.some(has), propose: javaProject },
  { marks: ({ has }) => PYTHON_MARKERS.some(has), propose: pythonProject },
  { marks: ({ has }) => has('package.json'), propose: (project) => javascriptProject(manifestOf(project.read('package.json')), project) },
])

/** @param {string[]} paths */
const orRoot = (paths) => (paths.length > 0 ? paths : ['./'])

/** The `<module>` names a Maven parent POM lists. @param {string} pom */
const mavenModules = (pom) => [...pom.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)].map(([, name]) => name)

/** @param {string | null} text @returns {Record<string, any>} empty when the text is not JSON or is `null` */
const manifestOf = (text) => {
  try {
    return JSON.parse(/** @type {string} */ (text)) ?? {}
  } catch {
    return {}
  }
}

/**
 * A component name from a folder name: kebab-case, `app` when nothing is left.
 * @param {string} folderName
 */
export const componentName = (folderName) => {
  const name = folderName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return name === '' ? 'app' : name
}
