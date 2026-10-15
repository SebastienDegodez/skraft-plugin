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
 *   entries, and the text of a file of that folder (null when absent)
 * @returns {Detected | null} null when the folder holds no project marker
 */
export const detectProject = ({ entries, read }) => {
  const files = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name)
  const dirs = entries.filter((entry) => entry.kind === 'dir').map((entry) => entry.name)
  const has = (/** @type {string} */ name) => files.includes(name)
  const folder = (/** @type {string[]} */ names) => names.filter((name) => dirs.includes(name)).map((name) => `${name}/`)

  if (files.some((name) => SOLUTION.test(name) || PROJECT.test(name))) {
    return {
      stack: 'dotnet',
      paths: { src: orRoot(folder(['src'])), tests: folder(['tests', 'test']) },
      commands: {
        build: 'dotnet build --nologo',
        test: 'dotnet test --nologo',
        format: 'dotnet format --verify-no-changes',
        mutation: 'dotnet stryker --since:{baseSha}',
      },
    }
  }
  if (JAVA_MARKERS.some(has)) {
    const maven = has('pom.xml')
    const modules = maven ? mavenModules(read('pom.xml') ?? '') : []
    const testModules = modules.filter((name) => /(^|-)(tests?|it)(-|$)/.test(name))
    return {
      stack: 'java',
      paths: modules.length > 0
        ? { src: modules.filter((name) => !testModules.includes(name)).map((name) => `${name}/`), tests: testModules.map((name) => `${name}/`) }
        : { src: ['src/main/'], tests: ['src/test/'] },
      commands: maven
        ? javaCommands(has('mvnw') ? './mvnw' : 'mvn', ['-B', '-q', '-DskipTests', 'package'], ['-B', '-q', 'test'])
        : javaCommands(has('gradlew') ? './gradlew' : 'gradle', ['build', '-x', 'test'], ['test']),
    }
  }
  if (PYTHON_MARKERS.some(has)) {
    const src = folder(['src'])
    return {
      stack: 'python',
      paths: { src: orRoot(src), tests: folder(['tests', 'test']) },
      commands: { build: `python -m compileall -q ${src.length > 0 ? 'src' : '.'}`, test: 'python -m pytest -q -p no:cacheprovider' },
    }
  }
  if (has('package.json')) return javascriptProject(parseJson(read('package.json')) ?? {}, { has, folder })
  return null
}

/**
 * @param {Record<string, any>} manifest
 * @param {{ has: (name: string) => boolean, folder: (names: string[]) => string[] }} folder
 * @returns {Detected}
 */
const javascriptProject = (manifest, { has, folder }) => {
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
  const scripts = manifest.scripts ?? {}
  const stack = 'react' in dependencies ? 'react' : has('tsconfig.json') || 'typescript' in dependencies ? 'typescript' : 'javascript'
  /** @type {Record<string, string>} */
  const commands = {}
  if (typeof scripts.build === 'string') commands.build = 'npm run build'
  else if (stack !== 'javascript') commands.build = 'npx tsc --noEmit'
  if (typeof scripts.lint === 'string') commands.lint = 'npm run lint'
  if (typeof scripts.test === 'string') commands.test = 'npm test'
  else if ('vitest' in dependencies) commands.test = 'npx vitest run'
  else if ('jest' in dependencies) commands.test = 'npx jest'
  const src = orRoot(folder(['src']))
  const tests = folder(['tests', 'test', '__tests__'])
  return { stack, paths: { src, tests: tests.length > 0 ? tests : src }, commands }
}

/** The project's own wrapper when it ships one (`./mvnw`, `./gradlew`). @param {string} tool @param {string[]} build @param {string[]} test */
const javaCommands = (tool, build, test) => ({ build: [tool, ...build].join(' '), test: [tool, ...test].join(' ') })

/** @param {string[]} paths */
const orRoot = (paths) => (paths.length > 0 ? paths : ['./'])

/** The `<module>` names a Maven parent POM lists. @param {string} pom */
const mavenModules = (pom) => [...pom.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)].map(([, name]) => name)

/** @param {string | null} text @returns {Record<string, any> | null} null when the text is not JSON */
const parseJson = (text) => {
  try {
    return JSON.parse(/** @type {string} */ (text))
  } catch {
    return null
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
    .replace(/^-+|-+$/g, '')
  return name === '' ? 'app' : name
}
