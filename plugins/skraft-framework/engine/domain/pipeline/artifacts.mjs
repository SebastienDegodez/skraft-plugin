/**
 * DISCUSS artefacts a backlog agent leaves under a pipeline's tracking folder before any run:
 * `plans/<date>/stories-<milestone>.md` and `plans/<date>/ac-draft-<story>.md`.
 */

const DISCUSS = /plans\/(?:[^/]+\/)*(?:stories|ac-draft)-[^/]+\.md$/

/** The phase a run starts in when DISCUSS already happened outside the pipeline. */
export const ENTRY_AFTER_DISCUSS = 'DESIGN'

/**
 * @param {string[]} paths under `plans/`, relative to the tracking folder `<slug>/`
 * @returns {string[]} the DISCUSS ones, in the order given
 */
export const discussArtifacts = (paths) => paths.filter((path) => DISCUSS.test(path))
