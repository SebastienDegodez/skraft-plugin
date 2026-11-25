/**
 * Where a design run writes the architecture (#669): what lasts, by bounded context, what a run
 * leaves for delivery, by run.
 * - `docs/architecture/context-map.md`, the map and its glossary;
 * - `docs/architecture/contexts/<context>/tactical-design.md` and
 *   `docs/architecture/contexts/<context>/event-model/<slice>.md`, rewritten in place, never deleted;
 * - `docs/architecture/runs/<run>/<issue>-<slug>.md`, the briefs, removed whole once delivered.
 * A document an earlier run left elsewhere keeps its path.
 */
const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*'
const LAID_OUT = new RegExp(`^docs/architecture/(?:context-map\\.md|contexts/${KEBAB}/(?:tactical-design\\.md|event-model/${KEBAB}\\.md)|runs/${KEBAB}/\\d+-${KEBAB}\\.md)$`)
const ARCHITECTURE_DOCUMENT = /^docs\/(?:architecture|domain\/event-model)\/.+\.md$/

/** Whether a document the run writes is one of the architecture's, and where it belongs. @param {string} path */
export const laidOut = (path) => !ARCHITECTURE_DOCUMENT.test(path) || LAID_OUT.test(path)

/** Why a document the run created is refused. @param {string} path */
export const layoutProblem = (path) => `${path}: write it under docs/architecture/contexts/<context>/, as tactical-design.md or event-model/<slice>.md.`

const CONTEXT_FOLDER = new RegExp(`^docs/architecture/contexts/(${KEBAB})/`)

/** The bounded context a document belongs to; null for one outside a context folder. @param {string} path */
export const contextOf = (path) => CONTEXT_FOLDER.exec(path)?.[1] ?? null

/** The contexts a set of documents touches, once each, in their order. @param {string[]} paths */
export const contextsOf = (paths) => [...new Set(paths.map(contextOf).filter((name) => name !== null))]
