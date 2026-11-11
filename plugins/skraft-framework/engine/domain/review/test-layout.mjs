import { joinRelative, pathUnder } from '../config/relative-path.mjs'
import { isTestFile } from './patch-scan.mjs'

/**
 * What the engine reads for G11 in the test files a review's patch adds, given to the review as
 * findings of `testability#layout` (clean-architecture-testing puts a component's tests in two
 * places per language; each name in the singular or the plural, as the ecosystem spells it):
 *   dotnet     unit: a `<Context>.UnitTest(s)`, `<Context>.Unit.Test(s)` or `<Context>.Test(s)` folder
 *              integration: `<Context>.IntegrationTest(s)` or `<Context>.Integration.Test(s)`
 *   java       unit: a `<context>-unit-test(s)` folder   integration: `<context>-integration-test(s)`
 *   otherwise  unit: `unit/` under the test path         integration: `integration/` under it
 *   (python, typescript, javascript, react: `tests/unit/` and `tests/integration/`)
 * The test paths are those skraft-config.json gives the component (`paths.tests`), from its root:
 * a test counts only under one of them, and a test path that is itself a place counts as it
 * (`tests/unit`, `tests/MonAssurance.UnitTests`). A .NET or Java place is read on the whole
 * path, so it may sit anywhere under the test path. A folder that names both, such as
 * `<Context>.Integration.Tests`, is the integration place.
 * A test file added elsewhere under a component's test path is a blocker at its path. A story
 * built scenario by scenario may add its walking skeleton's acceptance test alone, in the
 * integration place: whether every new use case has a test in the unit place stays the lens's call.
 *
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {{ path: string, root: string, inner: string }} Placed
 *   path: relative to the working copy; root: the test path it is under; inner: path relative to root
 * @typedef {{ unit: (test: Placed) => boolean, integration: (test: Placed) => boolean, where: (root: string) => string }} Places
 */

/** The lens id the findings come under; its name is testability, whose gate G11 is. */
export const LAYOUT = 'testability#layout'
/** The lens whose review the check joins. */
export const LAID_OUT_WITH = 'testability'

const NEW_FILE = /^diff --git a\/(.+) b\/\1\nnew file mode /gm

/**
 * The places of a language from the folder names that mark them; a folder of the integration
 * place is never the unit one, though its name may end like it.
 * @param {RegExp} unit @param {RegExp} integration @param {string} where @returns {Places}
 */
const placesOf = (unit, integration, where) => ({ unit: ({ path }) => unit.test(path) && !integration.test(path), integration: ({ path }) => integration.test(path), where: () => where })

/** @type {Record<string, Places>} */
const PLACES = Object.freeze({
  dotnet: placesOf(/(^|\/)[^/]+\.(Unit\.?)?Tests?\//, /(^|\/)[^/]+\.Integration\.?Tests?\//, 'a <Context>.UnitTest, <Context>.UnitTests or <Context>.Tests project'),
  java: placesOf(/(^|\/)[^/]+-unit-tests?\//, /(^|\/)[^/]+-integration-tests?\//, 'a <context>-unit-test or <context>-unit-tests module'),
})

/**
 * A folder of that name right under the test path, or the test path itself when so named.
 * @param {string} name @returns {(test: Placed) => boolean}
 */
const named = (name) => ({ root, inner }) => root.split('/').at(-1) === name || inner.startsWith(`${name}/`)

/** The places of any other stack, under its test path. @type {Places} */
const UNDER_TESTS = Object.freeze({
  unit: named('unit'),
  integration: named('integration'),
  where: (root) => `${root.split('/').at(-1) === 'unit' ? root : joinRelative(root, 'unit')}/`,
})

/**
 * @param {string} patch a unified diff, paths relative to the working copy
 * @param {readonly Component[]} components
 * @returns {Finding[]} numbered F1, F2… in component order
 */
export const layoutFindings = (patch, components) => {
  const added = [...patch.matchAll(NEW_FILE)].map((match) => match[1]).filter(isTestFile)
  return components.flatMap((component) => componentFindings(component, added))
    .map((finding, index) => ({ id: `F${index + 1}`, gate: 'G11', severity: 'blocker', suggestion: null, ...finding }))
}

/** @param {Component} component @param {string[]} added @returns {Array<{ location: string, description: string }>} */
const componentFindings = (component, added) => {
  const roots = component.paths.tests.map((path) => joinRelative(component.root, path))
  const places = PLACES[component.stack] ?? UNDER_TESTS
  return added.flatMap((path) => placedUnder(roots, path))
    .filter((test) => !places.unit(test) && !places.integration(test))
    .map((test) => ({ location: test.path, description: `a test added outside ${places.where(test.root)} and the integration place of ${component.stack}, where clean-architecture-testing puts it` }))
}

/**
 * The added test under the first test path that holds it; none when no test path does.
 * @param {string[]} roots @param {string} path @returns {Placed[]}
 */
const placedUnder = (roots, path) => {
  const root = roots.find((candidate) => pathUnder(path, candidate) !== null)
  return root === undefined ? [] : [{ path, root, inner: /** @type {string} */ (pathUnder(path, root)) }]
}
