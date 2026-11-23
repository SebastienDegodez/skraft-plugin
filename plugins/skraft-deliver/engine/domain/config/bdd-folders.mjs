import { joinRelative } from './relative-path.mjs'

/**
 * Where the components of a run keep their Gherkin. One resolution, read by everything that needs
 * it: the brief that tells the designer where to write, the write scope that admits what it wrote,
 * the folders the engine creates before the attempt, and the check that reads the scenarios back.
 * Two readers of their own would drift, and the pipeline would write its scenarios where no runner
 * reads them.
 *
 * @typedef {import('./skraft-config.mjs').Component} Component
 */

/**
 * The folders the components declare for their scenarios, relative to the working copy, each once
 * and in the order their file names them. A component that declines Gherkin, or that nobody
 * answered for, names none.
 * @param {readonly Component[]} components @returns {string[]}
 */
export const featuresFolders = (components) => [...new Set(components
  .flatMap(({ root, bddPaths }) => bddPaths.map(({ features }) => joinRelative(root, features))))]
