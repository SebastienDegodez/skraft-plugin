import { pathUnder } from '../config/relative-path.mjs'
import { isAbsolute } from './mutation-report.mjs'

/**
 * The bar a mutation run must meet: the score of each scope, core and boundary, judged apart.
 * The skraft-quality-bar skill states it; no configuration lowers it.
 *
 * @typedef {import('./mutation-report.mjs').Mutant} Mutant
 * @typedef {import('./mutation-report.mjs').Survivor} Survivor
 * @typedef {'core' | 'boundary'} MutationScope
 *   core: Domain and Application; boundary: everything else (API, Infrastructure, UI).
 * @typedef {{ scope: MutationScope, bar: number, detected: number, survivors: Survivor[] }} ScopeScore
 *   bar: the score the scope must reach, in percent.
 */

/** The score each scope must reach, in percent, core first. */
export const MUTATION_BARS = Object.freeze({ core: 100, boundary: 80 })

/** The last word of a folder or file name that makes it core. */
const CORE_LAYERS = Object.freeze(['domain', 'application'])

/**
 * Whether the story changed the file a mutant sits in. A file PIT names relative to a source
 * folder is changed when a changed file ends with it, wherever its source folder is.
 * @param {string} file @param {string[]} changed relative to the working copy
 * @param {boolean} inSources the file is relative to a source folder
 */
export const isChanged = (file, changed, inSources) => changed.some((path) => path === file || (inSources && path.endsWith(`/${file}`)))

/**
 * Core when a segment of the path inside the component root ends with the word `domain` or
 * `application`, the segment cut on `.`, `-` and `_`, whatever its case: `Checkout.Domain`,
 * `checkout-domain`, `src/cart/application`. The root's own folders and a file outside the
 * root never make it core.
 * @param {string} file relative to the working copy, absolute outside it @param {string} root
 * @returns {MutationScope}
 */
const scopeOf = (file, root) => {
  const inner = isAbsolute(file) ? null : pathUnder(file, root)
  return inner !== null && inner.split('/').some(isCoreSegment) ? 'core' : 'boundary'
}

/** @param {string} segment */
const isCoreSegment = (segment) => CORE_LAYERS.includes(/** @type {string} */ (segment.split(/[.\-_]/).at(-1)).toLowerCase())

/**
 * The scopes whose score misses their bar, core first. A scope's score is its detected mutants
 * over its detected and alive ones; a scope with no counted mutant meets its bar.
 * @param {Mutant[]} mutants the mutants judged @param {string} root the component's root
 * @returns {ScopeScore[]}
 */
export const missedBars = (mutants, root) => /** @type {MutationScope[]} */ (Object.keys(MUTATION_BARS))
  .map((scope) => scoreOf(scope, mutants.filter((mutant) => scopeOf(mutant.file, root) === scope)))
  .filter((score) => !meetsBar(score))

/** @param {MutationScope} scope @param {Mutant[]} mutants @returns {ScopeScore} */
const scoreOf = (scope, mutants) => ({
  scope,
  bar: MUTATION_BARS[scope],
  detected: mutants.filter((mutant) => !mutant.alive).length,
  survivors: mutants.filter((mutant) => mutant.alive).map(survivorOf),
})

/** @param {Mutant} mutant @returns {Survivor} */
const survivorOf = ({ file, line, mutator, replacement, covered }) => ({ file, line, mutator, replacement, covered })

/** @param {ScopeScore} score */
const meetsBar = ({ bar, detected, survivors }) => 100 * detected >= bar * (detected + survivors.length)

/**
 * A score that misses its bar, rounded down so that it never reads as the bar: `core 92% < 100%`.
 * @param {ScopeScore} score
 */
export const missedText = ({ scope, bar, detected, survivors }) => `${scope} ${Math.floor((100 * detected) / (detected + survivors.length))}% < ${bar}%`
