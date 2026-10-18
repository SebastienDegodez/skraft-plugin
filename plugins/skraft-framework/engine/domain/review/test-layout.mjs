import { joinRelative, pathUnder } from '../config/relative-path.mjs'
import { isTestFile } from './patch-scan.mjs'

/**
 * What the engine reads for G11 in the test files a review's patch adds, given to the review as
 * findings of `testability#layout` (clean-architecture-testing puts a component's tests in two
 * places per language):
 *   dotnet     unit: a `<Context>.UnitTest` folder       integration: `<Context>.IntegrationTest`
 *   java       unit: a `<context>-unit-test` folder      integration: `<context>-integration-test`
 *   otherwise  unit: `unit/` under the test path         integration: `integration/` under it
 * A test file added elsewhere under a component's test path is a blocker at its path; a
 * component that gains test files and none in its unit place is a blocker too: the acceptance
 * test of a new use case goes there. Whether every new use case has one stays the lens's call.
 *
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {{ unit: (path: string) => boolean, integration: (path: string) => boolean, where: string }} Places
 *   path relative to the component's test path
 */

/** The lens id the findings come under; its name is testability, whose gate G11 is. */
export const LAYOUT = 'testability#layout'
/** The lens whose review the check joins. */
export const LAID_OUT_WITH = 'testability'

const NEW_FILE = /^diff --git a\/(.+) b\/\1\nnew file mode /gm

/** @type {Record<string, Places>} */
const PLACES = Object.freeze({
  dotnet: { unit: (path) => /(^|\/)[^/]+\.UnitTest\//.test(path), integration: (path) => /(^|\/)[^/]+\.IntegrationTest\//.test(path), where: 'a <Context>.UnitTest project' },
  java: { unit: (path) => /(^|\/)[^/]+-unit-test\//.test(path), integration: (path) => /(^|\/)[^/]+-integration-test\//.test(path), where: 'a <context>-unit-test module' },
})

/** @param {string} root the component's test path, relative to the working copy @returns {Places} */
const underTests = (root) => ({ unit: (path) => path.startsWith('unit/'), integration: (path) => path.startsWith('integration/'), where: `${joinRelative(root, 'unit')}/` })

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
  const placed = roots.flatMap((root) => added.flatMap((path) => {
    const inner = pathUnder(path, root)
    return inner === null ? [] : [{ path, inner, places: PLACES[component.stack] ?? underTests(root) }]
  }))
  if (placed.length === 0) return []
  const astray = placed.filter(({ inner, places }) => !places.unit(inner) && !places.integration(inner))
    .map(({ path, places }) => ({ location: path, description: `a test added outside ${places.where} and the integration place of ${component.stack}, where clean-architecture-testing puts it` }))
  const unit = placed.some(({ inner, places }) => places.unit(inner))
  return unit ? astray : [...astray, { location: roots[0], description: `${component.name} gains tests and none in ${placed[0].places.where}: the acceptance test of a new use case goes there` }]
}
