/**
 * ActivePipeline — `.copilot-tracking/skraft-plans/.active-slug` of the working copy.
 *
 * @typedef {{
 *   current: () => Promise<string | null>,
 *   activate: (slug: string) => Promise<void>,
 * }} ActivePipeline
 *   current: the slug the file names, null when the file is absent or names no kebab-case slug.
 */
export {}
