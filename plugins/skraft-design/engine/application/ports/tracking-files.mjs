/**
 * TrackingFiles — the files under a pipeline's tracking folder `<slug>/`.
 *
 * @typedef {{
 *   read: (slug: string, path: string) => Promise<string | null>,
 *   write: (slug: string, path: string, text: string) => Promise<void>,
 *   appendText: (slug: string, path: string, text: string) => Promise<void>,
 *   clearTemporary: (slug: string) => Promise<void>,
 *   forget: (slug: string) => Promise<void>,
 *   location: (slug: string, path: string) => string,
 *   list: (slug: string, folder: string) => Promise<string[]>,
 *   pipelines: () => Promise<string[]>,
 *   folder: string,
 * }} TrackingFiles
 *   path is relative to `<slug>/`, `/`-separated. read: null when absent. appendText: adds text at the end of the file. write and appendText create
 *   missing folders. location: the absolute path an agent is given. list: the files under
 *   `<slug>/<folder>/` at any depth, relative to `<slug>/`, sorted; [] when the folder is absent.
 *   pipelines: the kebab-case slugs whose folder holds at least one file, sorted.
 *   folder: where the runs' folders are, relative to the working copy, `/`-separated
 *   (`.copilot-tracking/skraft-design-runs`, a mutation run's `.copilot-tracking/skraft-design-mutation`).
 *   clearTemporary: empties the run's `.tmp/` directory and leaves it ready to use. forget: empties
 *   the run's folder, journal included.
 */
export {}
