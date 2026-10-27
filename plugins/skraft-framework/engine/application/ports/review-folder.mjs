/**
 * ReviewFolder — the working copy's `.copilot-tracking/skraft-reviews/`, where every pull request
 * review keeps its journal, files and lease.
 *
 * @typedef {{
 *   contained: () => Promise<boolean>,
 * }} ReviewFolder
 *   contained: true when each part of the folder that exists is a folder of the working copy,
 *   no link among them, so the folder resolves to `<working copy>/.copilot-tracking/skraft-reviews`;
 *   true when it does not exist yet; false otherwise, and when it cannot be checked.
 */
export {}
