/**
 * ReviewFolder — the working copy's `.copilot-tracking/skraft-reviews/`, where every pull request
 * review keeps its journal, files and lease.
 *
 * @typedef {{
 *   contained: () => Promise<boolean>,
 *   holdsTracked: (paths: string[]) => Promise<boolean>,
 * }} ReviewFolder
 *   contained: true when each part of the folder that exists is a folder of the working copy,
 *   no link among them, so the folder resolves to `<working copy>/.copilot-tracking/skraft-reviews`;
 *   true when it does not exist yet; false otherwise, and when it cannot be checked.
 *   holdsTracked: whether any of these paths, relative to the working copy, opens there as the
 *   tracking folder, the review folder or a file under it, by the file each name opens rather
 *   than by its spelling; true when that cannot be checked.
 */
export {}
