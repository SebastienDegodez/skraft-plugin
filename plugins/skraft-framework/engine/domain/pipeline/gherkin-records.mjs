/**
 * The DISTILL records the engine checks when the acceptance designer finishes, instead of a lens:
 *   scenarios  every `.feature` its test plan names is a file of the working copy, under the
 *              features folder (#524)
 *
 * The plan declares what the story's scenarios are; a row that names none writes `—`, as the
 * coverage matrix of `test-design-mandates` does for a domain invariant or an adapter test. So a
 * repository whose components describe nothing in Gherkin is asked for nothing, and one that does
 * is held to the files its own plan names.
 *
 * @typedef {{ path: string, text: string }} Document the test plan of the story, as the engine read it
 * @typedef {{ plans: Document[], present: readonly string[] }} Records
 *   plans: the test plans of the tracking folder; present: the `.feature` paths the working copy holds.
 */

/** Where the scenarios of a story live: a `.feature` under the features folder of a repository. */
const FEATURE = /(^|\/)docs\/features\/.+\.feature$/
/** A test plan names its scenarios' file in a cell of its coverage matrix, as a path or in backticks. */
const CITED = /(?<=^|[\s,`'"(|])([\w.-]+(?:\/[\w.-]+)*\.feature)/g

/** @param {string} path relative to the working copy */
export const isFeature = (path) => FEATURE.test(path)

/**
 * The `.feature` files a test plan names, each once, back slashes read as separators.
 * @param {string} text
 * @returns {string[]}
 */
export const namedFeatures = (text) => [...new Set([...text.replaceAll('\\', '/').matchAll(CITED)].map(([, path]) => path))]

/**
 * Why the Gherkin of the story sends the acceptance designer back; empty when it holds.
 * @param {Records} records
 * @returns {string[]}
 */
export const gherkinFailures = ({ plans, present }) => plans.flatMap(({ path, text }) => namedFeatures(text)
  .filter((named) => !present.some((held) => held === named || held.endsWith(`/${named}`)))
  .map((named) => `${path} names ${named}, which is no .feature of the working copy (#524)`))
