/**
 * What `skraft init` proposes for one project folder: its stack, its source and test paths,
 * and the default commands of that stack. The developer edits the result by hand.
 *
 * @typedef {import('./skraft-config.mjs').Stack} Stack
 * @typedef {{ name: string, kind: 'file' | 'dir' }} Entry
 * @typedef {{ stack: Stack, paths: { src: string[], tests: string[] }, commands: Record<string, string> }} Detected
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
  commands: {
    build: 'dotnet build --nologo',
    test: 'dotnet test --nologo',
    format: 'dotnet format --verify-no-changes',
    mutation: 'dotnet stryker --since:{baseSha} --reporter json --output StrykerOutput',
  },
})

/** Maven when the folder has a `pom.xml`, Gradle otherwise. @param {Project} project @returns {Detected} */
const javaProject = ({ has, read }) => {
  const maven = has('pom.xml')
  return {
    stack: 'java',
    paths: javaPaths(maven ? mavenModules(/** @type {string} */ (read('pom.xml'))) : []),
    commands: maven
      ? javaCommands(has('mvnw') ? './mvnw' : 'mvn', ['-B', '-q', '-DskipTests', 'package'], ['-B', '-q', 'test'], PIT_MAVEN)
      : javaCommands(has('gradlew') ? './gradlew' : 'gradle', ['build', '-x', 'test'], ['test'], ['pitest']),
  }
}

/** A Maven module named like `tests`, `it` or `app-it` holds tests. */
const TEST_MODULE = /(^|-)(tests?|it)(-|$)/

/**
 * The modules a parent POM lists, split into source and test modules; the Maven layout of a
 * single module otherwise.
 * @param {string[]} modules
 */
const javaPaths = (modules) => {
  if (modules.length === 0) return { src: ['src/main/'], tests: ['src/test/'] }
  const testModules = modules.filter((name) => TEST_MODULE.test(name))
  const src = modules.filter((name) => !testModules.includes(name))
  return { src: src.map((name) => `${name}/`), tests: testModules.map((name) => `${name}/`) }
}

/** @param {Project} project @returns {Detected} */
const pythonProject = ({ folder }) => {
  const src = folder(['src'])
  return {
    stack: 'python',
    paths: { src: orRoot(src), tests: folder(['tests', 'test']) },
    commands: { build: `python -m compileall -q ${src.length > 0 ? 'src' : '.'}`, test: 'python -m pytest -q -p no:cacheprovider', mutation: 'python -m mutmut run' },
  }
}

/**
 * @param {Record<string, any>} manifest
 * @param {{ has: (name: string) => boolean, folder: (names: string[]) => string[] }} folder
 * @returns {Detected}
 */
const javascriptProject = (manifest, { has, folder }) => {
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
  const stack = javascriptStack(dependencies, has)
  const commands = javascriptCommands({ scripts: manifest.scripts ?? {}, dependencies, stack })
  const src = orRoot(folder(['src']))
  const tests = folder(['tests', 'test', '__tests__'])
  return { stack, paths: { src, tests: tests.length > 0 ? tests : src }, commands }
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
 * @typedef {{ scripts: Record<string, unknown>, dependencies: Record<string, unknown>, stack: Stack }} Package
 */

/**
 * The line init proposes for each command of a package, first match wins: the package's own
 * script, then the tool its stack or dependencies imply. No match, no command.
 * @type {Readonly<Record<string, ReadonlyArray<{ when: (pkg: Package) => boolean, line: string }>>>}
 */
const JAVASCRIPT_COMMANDS = Object.freeze({
  build: [
    { when: ({ scripts }) => typeof scripts.build === 'string', line: 'npm run build' },
    { when: ({ stack }) => stack !== 'javascript', line: 'npx tsc --noEmit' },
  ],
  lint: [{ when: ({ scripts }) => typeof scripts.lint === 'string', line: 'npm run lint' }],
  test: [
    { when: ({ scripts }) => typeof scripts.test === 'string', line: 'npm test' },
    { when: ({ dependencies }) => 'vitest' in dependencies, line: 'npx vitest run' },
    { when: ({ dependencies }) => 'jest' in dependencies, line: 'npx jest' },
  ],
})

/** StrykerJS, writing `reports/mutation/mutation.json` where the engine reads it. */
const STRYKER_JS = 'npx stryker run --incremental --reporters json,clear-text'

/** @param {Package} pkg @returns {Record<string, string>} */
const javascriptCommands = (pkg) => {
  /** @type {Record<string, string>} */
  const commands = {}
  for (const [name, choices] of Object.entries(JAVASCRIPT_COMMANDS)) {
    const choice = choices.find(({ when }) => when(pkg))
    if (choice !== undefined) commands[name] = choice.line
  }
  return { ...commands, mutation: STRYKER_JS }
}

/**
 * The stacks a folder is checked for, first found wins: the marker that names each one, and
 * what init proposes for it.
 * @type {ReadonlyArray<{ marks: (project: Project) => boolean, propose: (project: Project) => Detected }>}
 */
const STACK_DETECTORS = Object.freeze([
  { marks: ({ files }) => files.some((name) => SOLUTION.test(name) || PROJECT.test(name)), propose: dotnetProject },
  { marks: ({ has }) => JAVA_MARKERS.some(has), propose: javaProject },
  { marks: ({ has }) => PYTHON_MARKERS.some(has), propose: pythonProject },
  { marks: ({ has }) => has('package.json'), propose: (project) => javascriptProject(manifestOf(project.read('package.json')), project) },
])

/**
 * The project's own wrapper when it ships one (`./mvnw`, `./gradlew`); PIT mutates.
 * @param {string} tool @param {readonly string[]} build @param {readonly string[]} test @param {readonly string[]} mutation
 */
const javaCommands = (tool, build, test, mutation) => ({ build: [tool, ...build].join(' '), test: [tool, ...test].join(' '), mutation: [tool, ...mutation].join(' ') })

/**
 * PIT's Maven goal, writing `target/pit-reports/mutations.xml` where the engine reads it; with
 * its history, a round of the mutation loop reanalyses only the classes and tests that changed.
 */
const PIT_MAVEN = Object.freeze(['-B', '-q', 'org.pitest:pitest-maven:mutationCoverage', '-DoutputFormats=XML', '-DtimestampedReports=false', '-DwithHistory'])

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
