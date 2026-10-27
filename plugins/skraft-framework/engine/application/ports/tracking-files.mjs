/**
 * TrackingFiles — the files under a pipeline's tracking folder `<slug>/`.
 *
 * @typedef {{
 *   read: (slug: string, path: string) => Promise<string | null>,
 *   write: (slug: string, path: string, text: string) => Promise<void>,
 *   location: (slug: string, path: string) => string,
 *   list: (slug: string, folder: string) => Promise<string[]>,
 *   pipelines: () => Promise<string[]>,
 * }} TrackingFiles
 *   path is relative to `<slug>/`, `/`-separated. read: null when absent. write creates
 *   missing folders. location: the absolute path an agent is given. list: the files under
 *   `<slug>/<folder>/` at any depth, relative to `<slug>/`, sorted; [] when the folder is absent.
 *   pipelines: the kebab-case slugs whose folder holds at least one file, sorted.
 */
export {}
