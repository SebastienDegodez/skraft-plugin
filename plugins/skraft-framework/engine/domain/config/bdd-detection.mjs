/**
 * What `skraft init` reads to know where a project's scenarios and their bindings sit: the runner
 * a manifest names, and the folder names a project binds its steps in.
 *
 * A project names its runner in its manifest, never in skraft's configuration: the manifest is the
 * only file that says which runner reads the scenarios.
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

/**
 * The folder names a project binds its scenarios in, lowercase. Which of them a given runner reads
 * is the runner's own rule, and the walk decides nothing from it: it proposes the first folder it
 * meets, and `/skraft-init` has the developer confirm it.
 */
const BINDINGS = Object.freeze(['steps', 'stepdefinitions', 'step_definitions', 'step_defs', 'bindings', 'glue'])

/** The manifests a runner is named in. */
const MANIFESTS = Object.freeze(['package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'pyproject.toml', 'requirements.txt', 'setup.py'])
const PROJECT_FILE = /\.(csproj|fsproj|vbproj)$/i

/** Those of a folder's files that may name a runner. @param {string[]} files @returns {string[]} */
export const manifestsAmong = (files) => files.filter((name) => MANIFESTS.includes(name) || PROJECT_FILE.test(name))

/** The runner a manifest names, null when it names none. @param {string} text @returns {string | null} */
export const runnerNamed = (text) => RUNNERS.find(({ named }) => named.test(text))?.runner ?? null

/** Whether a folder of that name holds the bindings of a project's scenarios. @param {string} name */
export const bindsSteps = (name) => BINDINGS.includes(name.toLowerCase())
