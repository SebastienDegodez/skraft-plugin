/**
 * What `skraft init` reads to know where a project's scenarios and their bindings sit: the runner
 * a manifest names, and the folder names that runner binds its steps in.
 *
 * A project names its runner in its manifest, never in skraft's configuration: the folders follow
 * from the runner, because it is the runner that decides where it looks.
 */

/** What names each runner in a manifest, most specific first: jest-cucumber names no Cucumber package. */
const RUNNERS = Object.freeze([
  { runner: 'reqnroll', named: /reqnroll/i },
  { runner: 'specflow', named: /specflow/i },
  { runner: 'jest-cucumber', named: /jest-cucumber/i },
  { runner: 'cucumber-jvm', named: /io\.cucumber/i },
  { runner: 'cucumber-js', named: /@cucumber\/cucumber/i },
  { runner: 'pytest-bdd', named: /pytest-bdd/i },
  { runner: 'behave', named: /(^|[^\w-])behave([^\w-]|$)/i },
])

/** The folder names each runner binds its steps in, lowercase. */
const BINDINGS = Object.freeze({
  reqnroll: ['steps', 'stepdefinitions', 'bindings'],
  specflow: ['steps', 'stepdefinitions', 'bindings'],
  'cucumber-jvm': ['steps', 'stepdefinitions', 'glue'],
  'cucumber-js': ['step_definitions', 'steps'],
  'jest-cucumber': ['steps', 'step_definitions'],
  'pytest-bdd': ['steps', 'step_defs'],
  behave: ['steps'],
})

/** The manifests a runner is named in. */
const MANIFESTS = Object.freeze(['package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'pyproject.toml', 'requirements.txt', 'setup.py'])
const PROJECT_FILE = /\.(csproj|fsproj|vbproj)$/i

/** Those of a folder's files that may name a runner. @param {string[]} files @returns {string[]} */
export const manifestsAmong = (files) => files.filter((name) => MANIFESTS.includes(name) || PROJECT_FILE.test(name))

/** The runner a manifest names, null when it names none. @param {string} text @returns {string | null} */
export const runnerNamed = (text) => RUNNERS.find(({ named }) => named.test(text))?.runner ?? null

/** Whether a folder of that name holds the bindings of that runner. @param {string} runner @param {string} name */
export const bindsSteps = (runner, name) => (BINDINGS[/** @type {keyof BINDINGS} */ (runner)] ?? []).includes(name.toLowerCase())
